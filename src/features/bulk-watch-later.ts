/**
 * bulk-watch-later — power-user management toolbar for the Watch Later
 * playlist (/playlist?list=WL).
 *
 * Toolbar actions (shadow-DOM, injected above the playlist list):
 *  • Sort  – by duration, channel name, or reset to original DOM order
 *  • Randomize – Fisher-Yates shuffle of visible DOM nodes
 *  • Bulk delete – Remove watched / Longer than X min / Oldest N items
 *    (all with an in-panel confirmation step)
 *  • Export – download visible items as JSON or CSV
 *
 * Only operates on currently-rendered DOM nodes; a note reminds the user to
 * scroll to load all items first. Full teardown removes every DOM node,
 * listener, observer subscription, and timer injected by this feature.
 */

import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import {
  isWatchLaterPage,
  PLAYLIST_LIST_SEL,
  PLAYLIST_ITEM_SEL,
  readAllItems,
  readPlaylistItem,
  removeItemViaMenu,
  parseDuration,
  type PlaylistItemData,
} from '../lib/yt/playlist';

// ---------------------------------------------------------------------------
// DOM ids / classes — all prefixed yt-pro-
// ---------------------------------------------------------------------------

const TOOLBAR_HOST_ID = 'yt-pro-bwl-host';
const STYLE_ID = 'yt-pro-bwl-style';

// ---------------------------------------------------------------------------
// Toolbar CSS (rendered inside shadow root)
// ---------------------------------------------------------------------------

const TOOLBAR_CSS = `
  :host { all: initial; }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    margin-bottom: 10px;
    background: var(--yt-spec-menu-background, #fff);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    border-radius: 10px;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
    color: var(--yt-spec-text-primary, #0f0f0f);
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
    box-sizing: border-box;
  }
  .toolbar * { box-sizing: border-box; }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.12));
    margin: 0 2px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 18px;
    background: transparent;
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .btn:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.06)); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn.danger { color: #c00; border-color: rgba(204,0,0,0.25); }
  .btn.danger:hover { background: rgba(204,0,0,0.06); }
  .btn.primary { background: #c00; color: #fff; border-color: #c00; }
  .btn.primary:hover { background: #a00; border-color: #a00; }
  select, input[type="number"] {
    padding: 4px 6px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 6px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 12px;
    font-family: inherit;
  }
  input[type="number"] { width: 60px; }
  label.inline { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .count {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    white-space: nowrap;
  }
  .note {
    width: 100%;
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    padding-top: 4px;
  }
  /* Confirmation strip */
  .confirm-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: rgba(204,0,0,0.06);
    border: 1px solid rgba(204,0,0,0.2);
    border-radius: 6px;
    font-size: 12px;
  }
  .confirm-strip .msg { flex: 1; color: #c00; font-weight: 500; }
  /* Progress */
  .progress-strip {
    width: 100%;
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #606060);
    padding: 4px 0;
  }
`;

// ---------------------------------------------------------------------------
// Toolbar state
// ---------------------------------------------------------------------------

type SortKey = 'original' | 'duration' | 'channel';
type DeleteMode = 'watched' | 'longer' | 'oldest';

interface ToolbarState {
  /** Currently-rendered item count. */
  count: number;
  /** Active sort order. */
  sortKey: SortKey;
  /** Threshold (minutes) for "remove longer than X". */
  longerMinutes: number;
  /** Number of oldest (highest-index) items to remove. */
  oldestN: number;
  /**
   * Pending confirmation — set when the user clicks a destructive action,
   * cleared on confirm/cancel.
   */
  pendingDelete: { mode: DeleteMode; targets: PlaylistItemData[] } | null;
  /** Deletion in progress. */
  busy: boolean;
  progressText: string;
  /** Saved original order (element references) for "reset to original". */
  originalOrder: HTMLElement[];
}

// ---------------------------------------------------------------------------
// HTML builder — minimal inline HTML, events wired imperatively after render
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}

function buildHTML(s: ToolbarState): string {
  const dis = s.busy ? 'disabled' : '';

  const sortSelect = `
    <label class="inline">
      Sort:
      <select id="bwl-sort" ${dis}>
        <option value="original" ${s.sortKey === 'original' ? 'selected' : ''}>Original order</option>
        <option value="duration" ${s.sortKey === 'duration' ? 'selected' : ''}>Duration</option>
        <option value="channel"  ${s.sortKey === 'channel'  ? 'selected' : ''}>Channel</option>
      </select>
    </label>`;

  const randomBtn = `<button class="btn" id="bwl-randomize" ${dis}>&#x1f500; Randomize</button>`;

  const longerInput = `
    <label class="inline">
      &gt;
      <input type="number" id="bwl-longer-mins" min="1" max="600" value="${s.longerMinutes}" ${dis} />
      min
    </label>`;

  const oldestInput = `
    <label class="inline">
      Oldest
      <input type="number" id="bwl-oldest-n" min="1" max="9999" value="${s.oldestN}" ${dis} />
      items
    </label>`;

  const deleteGroup = `
    <div class="group">
      <button class="btn danger" id="bwl-del-watched" ${dis}>Remove watched</button>
      <button class="btn danger" id="bwl-del-longer" ${dis}>Remove longer than</button>
      ${longerInput}
      <button class="btn danger" id="bwl-del-oldest" ${dis}>Remove</button>
      ${oldestInput}
    </div>`;

  const exportGroup = `
    <div class="group">
      <button class="btn" id="bwl-export-json" ${dis}>&#x2193; JSON</button>
      <button class="btn" id="bwl-export-csv"  ${dis}>&#x2193; CSV</button>
    </div>`;

  const confirmStrip = s.pendingDelete
    ? `<div class="confirm-strip">
         <span class="msg">Remove ${s.pendingDelete.targets.length} item(s)? This cannot be undone.</span>
         <button class="btn danger primary" id="bwl-confirm">Confirm</button>
         <button class="btn" id="bwl-cancel">Cancel</button>
       </div>`
    : '';

  const progressStrip = s.progressText
    ? `<div class="progress-strip">${esc(s.progressText)}</div>`
    : '';

  return `
    <div class="toolbar">
      <div class="group">
        ${sortSelect}
        <div class="sep"></div>
        ${randomBtn}
        <div class="sep"></div>
        <span class="count">${s.count} item(s) visible</span>
      </div>
      <div class="sep"></div>
      ${deleteGroup}
      <div class="sep"></div>
      ${exportGroup}
      ${confirmStrip}
      ${progressStrip}
      <div class="note">Tip: scroll to load all items before sorting, deleting, or exporting.</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function toCSVRow(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(',');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function exportJSON(items: PlaylistItemData[]): void {
  const data = items.map((it) => ({
    title: it.title,
    channel: it.channel,
    duration: it.durationText,
    url: it.url,
  }));
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    'watch-later.json',
  );
}

function exportCSV(items: PlaylistItemData[]): void {
  const header = toCSVRow(['Title', 'Channel', 'Duration', 'URL']);
  const rows = items.map((it) =>
    toCSVRow([it.title, it.channel, it.durationText, it.url]),
  );
  downloadBlob(
    new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }),
    'watch-later.csv',
  );
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

/**
 * Re-order the `ytd-playlist-video-renderer` elements inside `containerEl`
 * according to the supplied sorted array. Uses `appendChild` which moves
 * existing nodes rather than cloning.
 */
function applyOrder(containerEl: HTMLElement, ordered: HTMLElement[]): void {
  for (const el of ordered) {
    containerEl.appendChild(el);
  }
}

function sortItems(
  items: PlaylistItemData[],
  key: SortKey,
): PlaylistItemData[] {
  const copy = [...items];
  if (key === 'duration') {
    copy.sort((a, b) => {
      // Items with no parseable duration sort to the end.
      if (a.durationSecs < 0 && b.durationSecs < 0) return 0;
      if (a.durationSecs < 0) return 1;
      if (b.durationSecs < 0) return -1;
      return a.durationSecs - b.durationSecs;
    });
  } else if (key === 'channel') {
    copy.sort((a, b) => a.channel.localeCompare(b.channel));
  } else {
    // 'original' — sort by saved index
    copy.sort((a, b) => a.index - b.index);
  }
  return copy;
}

/** Fisher-Yates in-place shuffle. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Main feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'bulk-watch-later',

  setup(ctx) {
    // Cleanup registry — holds all unsubscribe / teardown fns.
    const cleanups: Array<() => void> = [];

    let toolbarHost: HTMLElement | null = null;
    let shadow: ShadowRoot | null = null;
    let abortCtrl: AbortController | null = null;

    // -------------------------------------------------------------------------
    // Toolbar state
    // -------------------------------------------------------------------------
    const state: ToolbarState = {
      count: 0,
      sortKey: 'original',
      longerMinutes: 20,
      oldestN: 10,
      pendingDelete: null,
      busy: false,
      progressText: '',
      originalOrder: [],
    };

    // -------------------------------------------------------------------------
    // Find the playlist list container
    // -------------------------------------------------------------------------
    function findListEl(): HTMLElement | null {
      return document.querySelector<HTMLElement>(PLAYLIST_LIST_SEL);
    }

    function findContentsEl(listEl: HTMLElement): HTMLElement | null {
      return listEl.querySelector<HTMLElement>('#contents') ?? listEl;
    }

    // -------------------------------------------------------------------------
    // Render / wire toolbar
    // -------------------------------------------------------------------------
    function render(): void {
      if (!shadow) return;
      const inner = shadow.querySelector<HTMLElement>('.toolbar-wrap');
      if (!inner) return;
      inner.innerHTML = buildHTML(state);
      wireEvents(inner);
    }

    function wireEvents(root: HTMLElement): void {
      // Sort
      root.querySelector<HTMLSelectElement>('#bwl-sort')?.addEventListener('change', (e) => {
        const key = (e.target as HTMLSelectElement).value as SortKey;
        state.sortKey = key;
        applySort(key);
        render();
      });

      // Randomize
      root.querySelector('#bwl-randomize')?.addEventListener('click', () => {
        applyRandomize();
        render();
      });

      // Number inputs — live update state
      const longerInput = root.querySelector<HTMLInputElement>('#bwl-longer-mins');
      longerInput?.addEventListener('input', () => {
        state.longerMinutes = parseInt(longerInput.value, 10) || 20;
      });
      const oldestInput = root.querySelector<HTMLInputElement>('#bwl-oldest-n');
      oldestInput?.addEventListener('input', () => {
        state.oldestN = parseInt(oldestInput.value, 10) || 10;
      });

      // Bulk delete triggers (go to confirm step)
      root.querySelector('#bwl-del-watched')?.addEventListener('click', () => {
        if (state.busy) return;
        const listEl = findListEl();
        if (!listEl) return;
        const items = readAllItems(findContentsEl(listEl)!);
        const targets = items.filter((it) => it.watched);
        if (!targets.length) { flashToast('No watched items visible'); return; }
        state.pendingDelete = { mode: 'watched', targets };
        render();
      });

      root.querySelector('#bwl-del-longer')?.addEventListener('click', () => {
        if (state.busy) return;
        const listEl = findListEl();
        if (!listEl) return;
        const thresholdSecs = state.longerMinutes * 60;
        const items = readAllItems(findContentsEl(listEl)!);
        const targets = items.filter(
          (it) => it.durationSecs > 0 && it.durationSecs > thresholdSecs,
        );
        if (!targets.length) {
          flashToast(`No items longer than ${state.longerMinutes} min visible`);
          return;
        }
        state.pendingDelete = { mode: 'longer', targets };
        render();
      });

      root.querySelector('#bwl-del-oldest')?.addEventListener('click', () => {
        if (state.busy) return;
        const listEl = findListEl();
        if (!listEl) return;
        const items = readAllItems(findContentsEl(listEl)!);
        // "Oldest" = highest original index in Watch Later (Watch Later is
        // newest-first). If user has sorted/randomized, re-read original
        // positions via the saved originalOrder array.
        const sorted = [...items].sort((a, b) => b.index - a.index);
        const targets = sorted.slice(0, state.oldestN);
        if (!targets.length) { flashToast('No items visible'); return; }
        state.pendingDelete = { mode: 'oldest', targets };
        render();
      });

      // Confirm / cancel
      root.querySelector('#bwl-confirm')?.addEventListener('click', () => {
        if (!state.pendingDelete) return;
        const targets = state.pendingDelete.targets;
        state.pendingDelete = null;
        void runDeletion(targets);
      });
      root.querySelector('#bwl-cancel')?.addEventListener('click', () => {
        state.pendingDelete = null;
        render();
      });

      // Export
      root.querySelector('#bwl-export-json')?.addEventListener('click', () => {
        const listEl = findListEl();
        if (!listEl) return;
        const items = readAllItems(findContentsEl(listEl)!);
        exportJSON(items);
        flashToast(`Exported ${items.length} items to JSON`);
      });
      root.querySelector('#bwl-export-csv')?.addEventListener('click', () => {
        const listEl = findListEl();
        if (!listEl) return;
        const items = readAllItems(findContentsEl(listEl)!);
        exportCSV(items);
        flashToast(`Exported ${items.length} items to CSV`);
      });
    }

    // -------------------------------------------------------------------------
    // Sort / shuffle
    // -------------------------------------------------------------------------
    function applySort(key: SortKey): void {
      const listEl = findListEl();
      if (!listEl) return;
      const contentsEl = findContentsEl(listEl)!;
      const items = readAllItems(contentsEl);
      const sorted = sortItems(items, key);
      applyOrder(contentsEl, sorted.map((it) => it.el));
      flashToast(`Sorted by ${key === 'duration' ? 'duration' : key === 'channel' ? 'channel' : 'original order'}`);
    }

    function applyRandomize(): void {
      const listEl = findListEl();
      if (!listEl) return;
      const contentsEl = findContentsEl(listEl)!;
      const items = readAllItems(contentsEl);
      const shuffled = shuffle([...items]);
      applyOrder(contentsEl, shuffled.map((it) => it.el));
      flashToast('Playlist randomized');
    }

    // -------------------------------------------------------------------------
    // Bulk deletion
    // -------------------------------------------------------------------------
    async function runDeletion(targets: PlaylistItemData[]): Promise<void> {
      if (state.busy) return;
      state.busy = true;
      state.progressText = `Preparing to remove ${targets.length} item(s)…`;
      render();

      // Create a fresh AbortController for this run.
      abortCtrl?.abort();
      abortCtrl = new AbortController();
      const { signal } = abortCtrl;

      let removed = 0;
      let skipped = 0;

      for (let i = 0; i < targets.length; i++) {
        if (signal.aborted) break;

        const item = targets[i];
        // The item may have already been removed by a previous iteration.
        if (!document.contains(item.el)) { skipped++; continue; }

        state.progressText = `Removing ${i + 1}/${targets.length} — ${item.title.slice(0, 40) || '(untitled)'}`;
        render();

        const result = await removeItemViaMenu(item.el, signal);
        if (result === 'removed') removed++;
        else if (result === 'aborted') break;
        else skipped++;
      }

      state.busy = false;
      state.progressText = '';

      // Refresh count after deletions.
      const listEl = findListEl();
      if (listEl) {
        state.count = findContentsEl(listEl)!.querySelectorAll(PLAYLIST_ITEM_SEL).length;
      }

      render();

      const msg =
        signal.aborted
          ? `Stopped. Removed ${removed}, skipped ${skipped}.`
          : `Done. Removed ${removed}${skipped ? `, skipped ${skipped}` : ''}.`;
      flashToast(msg, 2500);
    }

    // -------------------------------------------------------------------------
    // Toolbar injection
    // -------------------------------------------------------------------------
    function refreshCount(): void {
      const listEl = findListEl();
      if (!listEl) return;
      const n = findContentsEl(listEl)!.querySelectorAll(PLAYLIST_ITEM_SEL).length;
      if (n !== state.count) {
        state.count = n;
        render();
      }
    }

    function inject(): void {
      if (!isWatchLaterPage()) return;

      const listEl = findListEl();
      if (!listEl) return;

      // Avoid double-injection.
      if (document.getElementById(TOOLBAR_HOST_ID)) {
        refreshCount();
        return;
      }

      // Save original DOM order for "reset" sort.
      const contentsEl = findContentsEl(listEl)!;
      const rows = contentsEl.querySelectorAll<HTMLElement>(PLAYLIST_ITEM_SEL);
      state.originalOrder = Array.from(rows);

      // Count
      state.count = rows.length;

      // Build shadow host, insert before the list.
      toolbarHost = document.createElement('div');
      toolbarHost.id = TOOLBAR_HOST_ID;
      shadow = toolbarHost.attachShadow({ mode: 'open' });

      // Style node.
      const styleEl = document.createElement('style');
      styleEl.textContent = TOOLBAR_CSS;
      shadow.appendChild(styleEl);

      // Wrapper so innerHTML re-render doesn't nuke the style.
      const wrap = document.createElement('div');
      wrap.className = 'toolbar-wrap';
      shadow.appendChild(wrap);

      listEl.parentElement?.insertBefore(toolbarHost, listEl);

      render();
    }

    function eject(): void {
      abortCtrl?.abort();
      abortCtrl = null;
      toolbarHost?.remove();
      toolbarHost = null;
      shadow = null;
    }

    // -------------------------------------------------------------------------
    // Navigation + observer wiring
    // -------------------------------------------------------------------------

    // Initial mount on the page we're already on.
    inject();

    // Re-mount / unmount on SPA route changes.
    const offNav = ctx.navigation.onNavigate(() => {
      if (isWatchLaterPage()) {
        // Small rAF so the playlist DOM has a chance to appear.
        requestAnimationFrame(() => inject());
      } else {
        eject();
      }
    });
    cleanups.push(offNav);

    // Re-inject if YouTube re-renders the playlist list, and refresh the count
    // as the user scrolls to lazy-load more items.
    const offObs = ctx.observer.onChange(() => {
      if (!isWatchLaterPage()) return;
      inject();       // idempotent — bails if already injected
      refreshCount(); // update count display as items load
    });
    cleanups.push(offObs);

    // -------------------------------------------------------------------------
    // Teardown
    // -------------------------------------------------------------------------
    return () => {
      eject();
      for (const off of cleanups) off();
      cleanups.length = 0;
      // Remove any light-DOM style tag (we don't inject one, but belt-and-suspenders).
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
