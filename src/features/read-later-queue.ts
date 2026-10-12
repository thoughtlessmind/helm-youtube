import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { getVideoId, isWatchPage } from '../lib/yt/video';

/**
 * Read Later Queue — a personal watch queue separate from Watch Later.
 *
 * • Press `Q` on any watch page to add the current video to the queue.
 * • Press `Shift+Q` (or click the floating ☰ button) to open / close the
 *   queue panel.
 * • On watch pages a small "+ Queue" button is injected next to the video
 *   actions row so mouse users can add without a keyboard.
 *
 * Queue items are ordered newest-first in the panel. Clicking an item opens
 * the video; × removes it; "Clear all" wipes the queue.
 *
 * Persisted in `local:ytpro:read-later-queue` as `QueueItem[]`.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  videoId: string;
  title: string;
  url: string;
  channelName: string;
  addedAt: number; // ms timestamp
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'local:ytpro:read-later-queue' as const;

async function loadQueue(): Promise<QueueItem[]> {
  return (await storage.getItem<QueueItem[]>(STORAGE_KEY)) ?? [];
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  await storage.setItem(STORAGE_KEY, items);
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

/**
 * Scrape the currently-playing video's metadata from the watch page DOM.
 * Returns null if not on a watch page or the DOM hasn't rendered yet.
 */
function scrapeCurrentVideo(): Omit<QueueItem, 'addedAt'> | null {
  if (!isWatchPage()) return null;
  const videoId = getVideoId();
  if (!videoId) return null;

  const titleEl = document.querySelector<HTMLElement>(
    'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, ' +
    '#above-the-fold #title h1 yt-formatted-string, ' +
    'ytd-watch-metadata h1',
  );
  const title = titleEl?.textContent?.trim() ?? document.title.replace(' - YouTube', '');

  const channelEl = document.querySelector<HTMLElement>(
    'ytd-watch-metadata ytd-channel-name a, ' +
    'ytd-video-owner-renderer a.yt-simple-endpoint, ' +
    '#owner ytd-channel-name a',
  );
  const channelName = channelEl?.textContent?.trim() ?? '';

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    channelName,
  };
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const PANEL_HOST_ID = 'yt-pro-rlq-host';
const FLOAT_BTN_ID = 'yt-pro-rlq-float';
const INJECT_BTN_ID = 'yt-pro-rlq-add-btn';
const INJECT_STYLE_ID = 'yt-pro-rlq-style';

const PANEL_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

:host {
  all: initial;
  font-family: 'Roboto', -apple-system, sans-serif;
}

.panel {
  width: 360px;
  max-height: 80vh;
  background: var(--yt-spec-brand-background-solid, #0f0f0f);
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.12));
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  color: var(--yt-spec-text-primary, #f1f1f1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
  flex-shrink: 0;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--yt-spec-text-primary, #f1f1f1);
}

.panel-count {
  font-size: 12px;
  color: var(--yt-spec-text-secondary, #aaa);
  margin-left: 6px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-clear,
.btn-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 4px;
  transition: background 120ms, color 120ms;
}
.btn-clear:hover { background: rgba(255,50,50,0.15); color: #ff6b6b; }
.btn-close:hover { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.08)); color: var(--yt-spec-text-primary, #f1f1f1); }

.btn-close { font-size: 18px; padding: 2px 6px; }

.list {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.list::-webkit-scrollbar { width: 6px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

.empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 13px;
  line-height: 1.6;
}

.empty-icon { font-size: 28px; display: block; margin-bottom: 8px; }

.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 14px;
  transition: background 100ms;
  cursor: pointer;
  border-radius: 0;
}
.item:hover { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.06)); }

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--yt-spec-text-primary, #f1f1f1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: none;
  display: block;
}

.item-meta {
  font-size: 11px;
  color: var(--yt-spec-text-secondary, #aaa);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--yt-spec-text-secondary, #888);
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 120ms, background 120ms;
  align-self: center;
}
.item-remove:hover { color: #ff6b6b; background: rgba(255,50,50,0.12); }
`;

const FLOAT_CSS = `
#${FLOAT_BTN_ID} {
  position: fixed;
  bottom: 200px;
  right: 20px;
  z-index: 9999;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: var(--yt-spec-brand-button-background, #ff0000);
  color: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  transition: transform 150ms, box-shadow 150ms;
}
#${FLOAT_BTN_ID}:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 18px rgba(0,0,0,0.5);
}
#${FLOAT_BTN_ID}[data-count]:not([data-count="0"])::after {
  content: attr(data-count);
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #fff;
  color: #ff0000;
  font-size: 10px;
  font-weight: 700;
  font-family: 'Roboto', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  line-height: 18px;
  text-align: center;
}
`;

const ADD_BTN_CSS = `
#${INJECT_BTN_ID} {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px 12px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.12));
  border-radius: 18px;
  background: transparent;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 13px;
  font-family: 'Roboto', sans-serif;
  line-height: 1;
  transition: background 150ms, color 150ms;
  vertical-align: middle;
  flex-shrink: 0;
}
#${INJECT_BTN_ID}:hover {
  background: var(--yt-spec-badge-chip-background, rgba(255,255,255,0.08));
  color: var(--yt-spec-text-primary, #f1f1f1);
}
`;

/** Selectors for the watch-page action row where we inject "+ Queue". */
const WATCH_ACTION_ANCHORS = [
  'ytd-watch-metadata #actions-inner',
  'ytd-watch-metadata #actions',
  '#above-the-fold #actions',
];

function findWatchActionsAnchor(): HTMLElement | null {
  for (const sel of WATCH_ACTION_ANCHORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Panel controller ─────────────────────────────────────────────────────────

function createPanelController(
  getQueue: () => QueueItem[],
  onRemove: (videoId: string) => void,
  onClear: () => void,
) {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let open = false;

  const panelHTML = (items: QueueItem[]): string => {
    const sorted = [...items].sort((a, b) => b.addedAt - a.addedAt);
    const listHTML =
      sorted.length === 0
        ? `<div class="empty">
             <span class="empty-icon">📋</span>
             No videos in queue yet.<br>
             Press <strong>Q</strong> on a video to add it.
           </div>`
        : sorted
            .map(
              (item) => `
          <div class="item" data-vid="${esc(item.videoId)}">
            <div class="item-body">
              <a class="item-title" href="${esc(item.url)}" target="_blank" rel="noopener" title="${esc(item.title)}">${esc(item.title)}</a>
              <span class="item-meta">${esc(item.channelName)}${item.channelName && item.addedAt ? ' · ' : ''}${item.addedAt ? formatDate(item.addedAt) : ''}</span>
            </div>
            <button class="item-remove" data-remove="${esc(item.videoId)}" aria-label="Remove from queue" title="Remove">×</button>
          </div>`,
            )
            .join('');

    return `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Watch Queue <span class="panel-count">${sorted.length}</span></span>
          <div class="panel-actions">
            ${sorted.length > 0 ? '<button class="btn-clear" data-act="clear">Clear all</button>' : ''}
            <button class="btn-close" data-act="close" aria-label="Close panel">✕</button>
          </div>
        </div>
        <div class="list">${listHTML}</div>
      </div>`;
  };

  const ensureHost = () => {
    if (host && document.contains(host)) return;
    host = document.createElement('div');
    host.id = PANEL_HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '2147483647',
      display: 'none',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'panel-root';
    shadow.appendChild(panel);
    document.body.appendChild(host);
  };

  const positionPanel = () => {
    if (!host) return;
    const btn = document.getElementById(FLOAT_BTN_ID);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const PANEL_W = 360;
    const top = Math.max(8, rect.top - 400);
    const left = Math.max(8, rect.right - PANEL_W);
    Object.assign(host.style, {
      top: `${top}px`,
      left: `${left}px`,
    });
  };

  const render = () => {
    if (!shadow) return;
    const root = shadow.getElementById('panel-root');
    if (!root) return;
    root.innerHTML = panelHTML(getQueue());
    wireEvents(root);
  };

  const wireEvents = (root: HTMLElement) => {
    root.querySelector('[data-act="close"]')?.addEventListener('click', () => close());
    root.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      onClear();
      render();
    });
    root.querySelectorAll<HTMLElement>('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const vid = btn.dataset.remove!;
        onRemove(vid);
        render();
      });
    });
    // Click on item body navigates
    root.querySelectorAll<HTMLElement>('.item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-remove]')) return;
        const vid = item.dataset.vid!;
        window.location.href = `https://www.youtube.com/watch?v=${vid}`;
      });
    });
  };

  const onOutside = (e: MouseEvent) => {
    if (!open || !host) return;
    const floatBtn = document.getElementById(FLOAT_BTN_ID);
    const t = e.target as Node;
    if (host.contains(t) || floatBtn?.contains(t)) return;
    close();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) close();
  };

  const openPanel = () => {
    ensureHost();
    open = true;
    if (host) {
      host.style.display = 'block';
      host.style.pointerEvents = 'auto';
    }
    render();
    positionPanel();
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKeydown, true);
  };

  const close = () => {
    open = false;
    if (host) {
      host.style.display = 'none';
      host.style.pointerEvents = 'none';
    }
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKeydown, true);
  };

  const toggle = () => (open ? close() : openPanel());

  const refresh = () => { if (open) render(); };

  const destroy = () => {
    close();
    host?.remove();
    host = null;
    shadow = null;
  };

  return { toggle, refresh, destroy };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;',
  );
}

// ─── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'read-later-queue',

  async setup(ctx) {
    let queue = await loadQueue();
    const cleanups: Array<() => void> = [];

    // ── Styles ──
    const floatStyle = document.createElement('style');
    floatStyle.id = INJECT_STYLE_ID + '-float';
    floatStyle.textContent = FLOAT_CSS;
    document.head.appendChild(floatStyle);

    const addBtnStyle = document.createElement('style');
    addBtnStyle.id = INJECT_STYLE_ID + '-add';
    addBtnStyle.textContent = ADD_BTN_CSS;
    document.head.appendChild(addBtnStyle);

    cleanups.push(() => {
      document.getElementById(INJECT_STYLE_ID + '-float')?.remove();
      document.getElementById(INJECT_STYLE_ID + '-add')?.remove();
    });

    // ── Panel ──
    const panel = createPanelController(
      () => queue,
      (videoId) => {
        queue = queue.filter((i) => i.videoId !== videoId);
        void saveQueue(queue);
        updateFloatBadge();
      },
      () => {
        queue = [];
        void saveQueue(queue);
        updateFloatBadge();
      },
    );
    cleanups.push(panel.destroy);

    // ── Floating toggle button ──
    function injectFloatButton(): void {
      if (document.getElementById(FLOAT_BTN_ID)) return;
      const btn = document.createElement('button');
      btn.id = FLOAT_BTN_ID;
      btn.setAttribute('aria-label', 'Toggle Watch Queue');
      btn.textContent = '☰';
      btn.addEventListener('click', () => panel.toggle());
      document.body.appendChild(btn);
      updateFloatBadge();
    }

    function updateFloatBadge(): void {
      const btn = document.getElementById(FLOAT_BTN_ID);
      if (btn) btn.setAttribute('data-count', String(queue.length));
      panel.refresh();
    }

    // ── Watch-page "+ Queue" button ──
    function injectAddButton(): void {
      if (!isWatchPage()) {
        document.getElementById(INJECT_BTN_ID)?.remove();
        return;
      }
      if (document.getElementById(INJECT_BTN_ID)) return;

      const anchor = findWatchActionsAnchor();
      if (!anchor) return;

      const btn = document.createElement('button');
      btn.id = INJECT_BTN_ID;
      btn.textContent = '＋ Queue';
      btn.setAttribute('aria-label', 'Add to Watch Queue');
      btn.addEventListener('click', () => addCurrentVideo());
      anchor.appendChild(btn);
    }

    // ── Add current video ──
    function addCurrentVideo(): void {
      const meta = scrapeCurrentVideo();
      if (!meta) {
        flashToast('Open a video first');
        return;
      }
      if (queue.some((i) => i.videoId === meta.videoId)) {
        flashToast('Already in queue');
        return;
      }
      const item: QueueItem = { ...meta, addedAt: Date.now() };
      queue = [item, ...queue];
      void saveQueue(queue);
      updateFloatBadge();
      flashToast(`Added to queue: ${meta.title.slice(0, 40)}${meta.title.length > 40 ? '…' : ''}`);
    }

    // ── Keyboard shortcuts ──
    //   Q → add current video to queue
    //   Shift+Q is not handled by onKey (it only fires on bare keys), so we
    //   wire a separate listener for Shift+Q to open/close the panel.
    const stopQKey = onKey('q', () => addCurrentVideo());
    cleanups.push(stopQKey);

    const shiftQHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Q') return; // uppercase Q = Shift+Q
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      panel.toggle();
    };
    document.addEventListener('keydown', shiftQHandler, true);
    cleanups.push(() => document.removeEventListener('keydown', shiftQHandler, true));

    // ── Storage watch (other tabs) ──
    const stopStorageWatch = storage.watch<QueueItem[]>(STORAGE_KEY, (val) => {
      queue = val ?? [];
      updateFloatBadge();
    });
    cleanups.push(stopStorageWatch);

    // ── Observer: re-inject buttons on DOM changes ──
    const stopObserver = ctx.observer.onChange(() => {
      injectFloatButton();
      injectAddButton();
    });
    cleanups.push(stopObserver);

    // ── Navigation: remove + re-inject add button on SPA nav ──
    const stopNav = ctx.navigation.onNavigate(() => {
      document.getElementById(INJECT_BTN_ID)?.remove();
      setTimeout(() => injectAddButton(), 600);
    });
    cleanups.push(stopNav);

    // ── Initial inject ──
    injectFloatButton();
    injectAddButton();

    return () => {
      cleanups.forEach((fn) => fn());
      document.getElementById(FLOAT_BTN_ID)?.remove();
      document.getElementById(INJECT_BTN_ID)?.remove();
    };
  },
};

export default feature;
