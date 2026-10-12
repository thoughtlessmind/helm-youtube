/**
 * subscription-folders — Group subscriptions into named folders/categories,
 * then filter the Subscriptions feed to show only videos from channels in
 * the selected folder.
 *
 * Behavior:
 *  1. On /feed/subscriptions, inject a shadow-DOM folder bar (chip row)
 *     above the video grid. Chips: "All" + one per folder. Selecting a
 *     folder hides cards whose channel is not in that folder.
 *  2. A "Manage folders" button opens a shadow-DOM management panel:
 *     create / rename / delete folders, check/uncheck channels per folder.
 *     Channel list is populated from currently-visible feed cards + any
 *     channels already referenced in saved folders.
 *  3. All mutations persist immediately to
 *     `local:ytpro:subscription-folders`.
 *  4. UI is active only on the subscriptions route; navigating away tears
 *     down the shadow host and restores all hidden cards.
 *
 * Storage key : local:ytpro:subscription-folders
 * Schema      : Folder[]   where Folder = { id, name, channelIds: string[] }
 *
 * FeatureConfig: none — all data lives in local: storage, not sync config.
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { channelIdFromHref } from '../lib/yt/video';
import { flashToast } from '../lib/yt/toast';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface Folder {
  id: string;
  name: string;
  channelIds: string[];
}

const STORAGE_KEY = 'local:ytpro:subscription-folders' as const;

/** CSS class toggled on hidden feed cards (light DOM — must live in document.head). */
const HIDDEN_CLASS = 'yt-pro-sf-hidden';

/** ID of the `<style>` injected to document.head for the filter rule. */
const FILTER_STYLE_ID = 'yt-pro-sf-filter';

/** ID of the shadow-DOM host for the chip bar. */
const BAR_HOST_ID = 'yt-pro-sf-bar-host';

/** ID of the shadow-DOM host for the management panel modal (appended to document.body). */
const MODAL_HOST_ID = 'yt-pro-sf-modal-host';

/**
 * Feed card selectors for the subscriptions grid.
 * Covers standard rich-grid items and any compact variants YouTube serves.
 * Ordered from most specific to least — the first match wins per-card.
 */
const CARD_SELECTORS = [
  'ytd-rich-item-renderer',
] as const;

/**
 * Within a card, link elements that point to the channel.
 * We try these in order and take the first non-null channelId.
 */
const CHANNEL_LINK_SELECTORS = [
  'ytd-channel-name a',
  '#channel-name a',
  'a.yt-simple-endpoint[href^="/@"]',
  'a.yt-simple-endpoint[href^="/channel/"]',
] as const;

/** CSS for the bar + management panel (inside shadow root). */
const BAR_CSS = `
  :host { all: initial; display: block; }

  /* ---- Chip bar ---- */
  .sf-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 0 8px;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 14px;
    position: relative;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 14px;
    border: 1.5px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.12));
    border-radius: 8px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s;
    outline: none;
    line-height: 1;
  }
  .chip:hover {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.07));
    border-color: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.2));
  }
  .chip.active {
    background: var(--yt-spec-text-primary, #0f0f0f);
    color: var(--yt-spec-general-background-a, #fff);
    border-color: transparent;
  }

  .manage-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.12s;
    outline: none;
    line-height: 1;
    margin-left: auto;
  }
  .manage-btn:hover {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    color: var(--yt-spec-text-primary, #0f0f0f);
  }

`;

/** CSS for the management panel modal — lives in its own shadow root attached to document.body. */
const MODAL_CSS = `
  :host { all: initial; }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 2147483640;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    background: var(--yt-spec-menu-background, #fff);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border-radius: 12px;
    box-shadow: 0 8px 48px rgba(0,0,0,0.28);
    width: min(600px, 96vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 14px;
    overflow: hidden;
    box-sizing: border-box;
  }
  .modal * { box-sizing: border-box; }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    flex-shrink: 0;
  }
  .modal-title { font-size: 17px; font-weight: 600; }
  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: 24px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .close-btn:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.06)); }

  .modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Left column — folder list */
  .folder-list-col {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    overflow-y: auto;
    padding: 10px 0;
  }
  .folder-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s;
  }
  .folder-item:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.04)); }
  .folder-item.selected {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.08));
    font-weight: 600;
  }
  .folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder-actions { display: flex; gap: 2px; }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 15px;
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
  }
  .icon-btn:hover { background: rgba(0,0,0,0.06); color: var(--yt-spec-text-primary, #0f0f0f); }

  /* New folder row */
  .new-folder-row {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    margin-top: 6px;
  }
  .new-folder-row input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 6px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
  .new-folder-row input:focus {
    border-color: #c00;
  }
  .add-btn {
    padding: 6px 10px;
    background: #c00;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
  }
  .add-btn:hover { background: #a00; }

  /* Right column — channel assignment */
  .channel-col {
    flex: 1;
    overflow-y: auto;
    padding: 10px 16px;
  }
  .channel-col-empty {
    padding: 20px 16px;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    text-align: center;
  }
  .channel-col h4 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--yt-spec-text-secondary, #606060);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .channel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.1s;
  }
  .channel-row:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.04)); }
  .channel-row input[type="checkbox"] { accent-color: #c00; cursor: pointer; }
  .channel-display-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .channel-id-hint {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .rename-input {
    flex: 1;
    padding: 3px 6px;
    border: 1px solid #c00;
    border-radius: 4px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

// ---------------------------------------------------------------------------
// Storage layer
// ---------------------------------------------------------------------------

async function loadFolders(): Promise<Folder[]> {
  const data = await storage.getItem<Folder[]>(STORAGE_KEY);
  return data ?? [];
}

async function saveFolders(folders: Folder[]): Promise<void> {
  await storage.setItem(STORAGE_KEY, folders);
}

// ---------------------------------------------------------------------------
// Feed card utilities (light DOM — operates on YouTube's own elements)
// ---------------------------------------------------------------------------

/** Discover all `ytd-rich-item-renderer` cards currently in the feed. */
function getAllFeedCards(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(CARD_SELECTORS[0]),
  );
}

/** Extract a channel id from a single feed card, or null. */
function getCardChannelId(card: HTMLElement): string | null {
  for (const sel of CHANNEL_LINK_SELECTORS) {
    const a = card.querySelector<HTMLAnchorElement>(sel);
    if (!a) continue;
    const id = channelIdFromHref(a.getAttribute('href'));
    if (id) return id;
  }
  return null;
}

/** Extract a human-readable channel name from a feed card, or empty string. */
function getCardChannelName(card: HTMLElement): string {
  for (const sel of CHANNEL_LINK_SELECTORS) {
    const a = card.querySelector<HTMLAnchorElement>(sel);
    if (a?.textContent?.trim()) return a.textContent.trim();
  }
  return '';
}

/**
 * Build a map of channelId → display name from all currently rendered
 * feed cards, merged with any channel ids already stored in folders (to
 * handle channels that scrolled away or were added on another device).
 */
function discoverChannels(folders: Folder[]): Map<string, string> {
  const map = new Map<string, string>();

  // Channels from the DOM
  for (const card of getAllFeedCards()) {
    const id = getCardChannelId(card);
    if (!id) continue;
    const name = getCardChannelName(card);
    if (!map.has(id)) map.set(id, name);
  }

  // Channels already referenced in folders (may not be on screen)
  for (const folder of folders) {
    for (const id of folder.channelIds) {
      if (!map.has(id)) map.set(id, id); // display id as fallback
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Filter layer (applied to light DOM cards)
// ---------------------------------------------------------------------------

/** Ensure the hidden-class CSS rule exists in document.head. */
function ensureFilterStyle(): void {
  if (document.getElementById(FILTER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FILTER_STYLE_ID;
  style.textContent = `.${HIDDEN_CLASS} { display: none !important; }`;
  document.head.appendChild(style);
}

/** Remove the filter style and strip the class from every card. */
function removeFilterStyle(): void {
  document.getElementById(FILTER_STYLE_ID)?.remove();
  document.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}`).forEach((el) => {
    el.classList.remove(HIDDEN_CLASS);
  });
}

/**
 * Apply/update the folder filter on all feed cards.
 * @param activeFolder null means "All" — show everything.
 */
function applyFilter(activeFolder: Folder | null): void {
  ensureFilterStyle();
  const cards = getAllFeedCards();

  if (!activeFolder) {
    // Show all
    cards.forEach((c) => c.classList.remove(HIDDEN_CLASS));
    return;
  }

  const allowed = new Set(activeFolder.channelIds);
  for (const card of cards) {
    const id = getCardChannelId(card);
    if (!id) {
      // No channel id detected → show it (e.g. Shorts shelf headers)
      card.classList.remove(HIDDEN_CLASS);
    } else if (allowed.has(id)) {
      card.classList.remove(HIDDEN_CLASS);
    } else {
      card.classList.add(HIDDEN_CLASS);
    }
  }
}

// ---------------------------------------------------------------------------
// Folder bar HTML rendering (inside shadow root)
// ---------------------------------------------------------------------------

function barHTML(folders: Folder[], activeId: string | null): string {
  const allActive = activeId === null ? 'active' : '';
  const chips = folders
    .map((f) => {
      const active = f.id === activeId ? 'active' : '';
      return `<button class="chip ${active}" data-folder-id="${esc(f.id)}" type="button">${esc(f.name)}</button>`;
    })
    .join('');

  return `
    <div class="sf-bar" id="sf-bar">
      <button class="chip ${allActive}" data-folder-id="" type="button">All</button>
      ${chips}
      <button class="manage-btn" data-act="manage" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
        </svg>
        Manage folders
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Management panel HTML rendering (inside shadow root)
// ---------------------------------------------------------------------------

function managePanelHTML(
  folders: Folder[],
  selectedFolderId: string | null,
  channelMap: Map<string, string>,
): string {
  const folderListHTML = folders
    .map((f) => {
      const sel = f.id === selectedFolderId ? 'selected' : '';
      return `
        <div class="folder-item ${sel}" data-manage-folder="${esc(f.id)}">
          <span class="folder-name">${esc(f.name)}</span>
          <span class="folder-actions">
            <button class="icon-btn" data-act="rename" data-folder-id="${esc(f.id)}" title="Rename" type="button">✏️</button>
            <button class="icon-btn" data-act="delete" data-folder-id="${esc(f.id)}" title="Delete" type="button">🗑️</button>
          </span>
        </div>
      `;
    })
    .join('');

  let channelColHTML: string;
  if (!selectedFolderId) {
    channelColHTML = `<div class="channel-col-empty">← Select a folder to assign channels</div>`;
  } else {
    const folder = folders.find((f) => f.id === selectedFolderId);
    const assigned = new Set(folder?.channelIds ?? []);
    const rows = [...channelMap.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([id, name]) => {
        const checked = assigned.has(id) ? 'checked' : '';
        const displayName = name && name !== id ? name : '';
        return `
          <label class="channel-row">
            <input type="checkbox" data-act="toggle-channel" data-channel-id="${esc(id)}" ${checked} />
            <span class="channel-display-name">${esc(displayName || id)}</span>
            ${displayName ? `<span class="channel-id-hint">${esc(id)}</span>` : ''}
          </label>
        `;
      })
      .join('');

    channelColHTML = `
      <div class="channel-col" id="channel-col">
        <h4>Channels in "${esc(folder?.name ?? '')}"</h4>
        ${rows || '<div style="color:var(--yt-spec-text-secondary,#606060);font-size:13px;padding:8px 0">No channels discovered yet — scroll the feed to load cards.</div>'}
      </div>
    `;
  }

  return `
    <div class="modal-overlay" id="manage-overlay">
      <div class="modal" id="manage-modal">
        <div class="modal-header">
          <span class="modal-title">Manage subscription folders</span>
          <button class="close-btn" data-act="close-modal" type="button" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="folder-list-col">
            ${folderListHTML}
            <div class="new-folder-row">
              <input id="new-folder-input" type="text" placeholder="New folder name…" maxlength="60" />
              <button class="add-btn" data-act="add-folder" type="button">Add</button>
            </div>
          </div>
          ${channelColHTML}
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Feature definition
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'subscription-folders',

  async setup(ctx) {
    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let folders: Folder[] = await loadFolders();

    /** Currently selected folder id for the chip bar filter (null = All). */
    let activeChipFolderId: string | null = null;

    /** Folder selected inside the management panel left column. */
    let managePanelFolderId: string | null = null;

    /** The shadow host / shadow root for the chip bar (inline in feed). */
    let barHost: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;

    /** Separate modal host appended to document.body to avoid fixed-positioning traps. */
    let modalHost: HTMLDivElement | null = null;
    let modalShadow: ShadowRoot | null = null;

    /** Whether the management panel is open. */
    let managePanelOpen = false;

    // Teardown collectors
    const unsubs: Array<() => void> = [];

    // -----------------------------------------------------------------------
    // Route check
    // -----------------------------------------------------------------------
    const isSubsPage = () => location.pathname === '/feed/subscriptions';

    // -----------------------------------------------------------------------
    // Inject / remove bar host
    // -----------------------------------------------------------------------

    const ANCHOR_SELECTORS = [
      'ytd-rich-grid-renderer',
      '#contents.ytd-section-list-renderer',
      'ytd-section-list-renderer #contents',
      'ytd-browse[page-subtype="subscriptions"] #contents',
    ] as const;

    function findAnchor(): Element | null {
      for (const sel of ANCHOR_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function injectBar(): void {
      if (!isSubsPage()) return;
      if (barHost && document.contains(barHost)) {
        // Already injected — just re-render to reflect state
        renderBar();
        return;
      }

      const anchor = findAnchor();
      if (!anchor) return;

      barHost = document.createElement('div');
      barHost.id = BAR_HOST_ID;
      // Minimal host styles so it sits inline above the grid
      Object.assign(barHost.style, {
        display: 'block',
        width: '100%',
      } as Partial<CSSStyleDeclaration>);

      shadow = barHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = BAR_CSS;
      shadow.appendChild(style);

      const container = document.createElement('div');
      container.id = 'sf-root';
      shadow.appendChild(container);

      anchor.parentElement?.insertBefore(barHost, anchor);

      renderBar();
    }

    function removeBar(): void {
      barHost?.remove();
      barHost = null;
      shadow = null;
      modalHost?.remove();
      modalHost = null;
      modalShadow = null;
      managePanelOpen = false;
    }

    // -----------------------------------------------------------------------
    // Render helpers
    // -----------------------------------------------------------------------

    function getRoot(): HTMLElement | null {
      return shadow?.getElementById('sf-root') ?? null;
    }

    function renderBar(): void {
      const root = getRoot();
      if (!root) return;
      root.innerHTML = barHTML(folders, activeChipFolderId);
      wireBarEvents(root);
      renderModal();
    }

    function ensureModalHost(): void {
      if (modalHost && document.contains(modalHost)) return;
      modalHost = document.createElement('div');
      modalHost.id = MODAL_HOST_ID;
      modalShadow = modalHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = MODAL_CSS;
      modalShadow.appendChild(style);
      const container = document.createElement('div');
      container.id = 'sf-modal-root';
      modalShadow.appendChild(container);
      document.body.appendChild(modalHost);
    }

    function getModalRoot(): HTMLElement | null {
      return modalShadow?.getElementById('sf-modal-root') ?? null;
    }

    function renderModal(): void {
      if (!managePanelOpen) {
        // Remove the modal host entirely when not in use
        modalHost?.remove();
        modalHost = null;
        modalShadow = null;
        return;
      }
      ensureModalHost();
      const root = getModalRoot();
      if (!root) return;
      const channelMap = discoverChannels(folders);
      root.innerHTML = managePanelHTML(folders, managePanelFolderId, channelMap);
      wireModalEvents(root);
    }

    // -----------------------------------------------------------------------
    // Event wiring — bar (chip bar only)
    // -----------------------------------------------------------------------

    function wireBarEvents(root: HTMLElement): void {
      // Chip clicks
      root.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const fid = chip.dataset.folderId || null;
          activeChipFolderId = fid === '' ? null : fid;
          const folder = activeChipFolderId
            ? folders.find((f) => f.id === activeChipFolderId) ?? null
            : null;
          applyFilter(folder);
          renderBar();
        });
      });

      // Manage button
      root.querySelector<HTMLButtonElement>('[data-act="manage"]')?.addEventListener('click', () => {
        managePanelOpen = true;
        managePanelFolderId = folders[0]?.id ?? null;
        renderModal();
      });
    }

    // -----------------------------------------------------------------------
    // Event wiring — management panel (rendered in separate modal shadow root)
    // -----------------------------------------------------------------------

    function wireModalEvents(root: HTMLElement): void {
      // Close modal
      root.querySelector<HTMLButtonElement>('[data-act="close-modal"]')?.addEventListener('click', () => {
        managePanelOpen = false;
        managePanelFolderId = null;
        renderBar(); // also removes modal host via renderModal()
      });

      // Click outside modal
      root.querySelector<HTMLElement>('#manage-overlay')?.addEventListener('click', (e) => {
        const modal = root.querySelector<HTMLElement>('#manage-modal');
        if (modal && !modal.contains(e.target as Node)) {
          managePanelOpen = false;
          managePanelFolderId = null;
          renderBar();
        }
      });

      // Escape key — handled at document level while modal is open (see below)

      // Folder item selection
      root.querySelectorAll<HTMLElement>('[data-manage-folder]').forEach((item) => {
        item.addEventListener('click', (e) => {
          // Don't steal clicks meant for rename/delete buttons inside the item
          const target = e.target as HTMLElement;
          if (target.closest('[data-act="rename"], [data-act="delete"]')) return;
          managePanelFolderId = item.dataset.manageFolder ?? null;
          renderModal();
        });
      });

      // Delete folder
      root.querySelectorAll<HTMLButtonElement>('[data-act="delete"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fid = btn.dataset.folderId;
          if (!fid) return;
          folders = folders.filter((f) => f.id !== fid);
          if (managePanelFolderId === fid) managePanelFolderId = folders[0]?.id ?? null;
          if (activeChipFolderId === fid) {
            activeChipFolderId = null;
            applyFilter(null);
          }
          await saveFolders(folders);
          flashToast('Folder deleted');
          renderBar();
        });
      });

      // Rename folder (click pencil → replace span with input in-place)
      root.querySelectorAll<HTMLButtonElement>('[data-act="rename"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fid = btn.dataset.folderId;
          if (!fid) return;
          const folder = folders.find((f) => f.id === fid);
          if (!folder) return;

          // Find the folder-name span and swap it for an input
          const item = root.querySelector<HTMLElement>(`[data-manage-folder="${CSS.escape(fid)}"]`);
          if (!item) return;
          const nameSpan = item.querySelector<HTMLElement>('.folder-name');
          if (!nameSpan) return;

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'rename-input';
          input.value = folder.name;
          input.maxLength = 60;
          nameSpan.replaceWith(input);
          input.focus();
          input.select();

          const commit = async () => {
            const newName = input.value.trim();
            if (newName && newName !== folder.name) {
              folder.name = newName;
              await saveFolders(folders);
              flashToast('Folder renamed');
            }
            renderModal();
          };
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') { ke.preventDefault(); void commit(); }
            if (ke.key === 'Escape') { ke.preventDefault(); renderModal(); }
          });
        });
      });

      // Add folder
      const addBtn = root.querySelector<HTMLButtonElement>('[data-act="add-folder"]');
      const newInput = root.querySelector<HTMLInputElement>('#new-folder-input');
      const doAdd = async () => {
        const name = newInput?.value.trim() ?? '';
        if (!name) return;
        const folder: Folder = { id: genId(), name, channelIds: [] };
        folders = [...folders, folder];
        managePanelFolderId = folder.id;
        await saveFolders(folders);
        flashToast(`Folder "${name}" created`);
        renderBar();
      };
      addBtn?.addEventListener('click', () => void doAdd());
      newInput?.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); void doAdd(); }
      });

      // Toggle channel in selected folder
      root.querySelectorAll<HTMLInputElement>('[data-act="toggle-channel"]').forEach((cb) => {
        cb.addEventListener('change', async () => {
          const channelId = cb.dataset.channelId;
          if (!channelId || !managePanelFolderId) return;
          const folder = folders.find((f) => f.id === managePanelFolderId);
          if (!folder) return;
          if (cb.checked) {
            if (!folder.channelIds.includes(channelId)) {
              folder.channelIds = [...folder.channelIds, channelId];
            }
          } else {
            folder.channelIds = folder.channelIds.filter((id) => id !== channelId);
          }
          await saveFolders(folders);
          // Re-apply filter if this folder is active
          if (activeChipFolderId === managePanelFolderId) {
            applyFilter(folder);
          }
        });
      });
    }

    // -----------------------------------------------------------------------
    // Escape key handler for modal (document-level, only while modal open)
    // -----------------------------------------------------------------------
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && managePanelOpen) {
        managePanelOpen = false;
        managePanelFolderId = null;
        renderBar();
      }
    };
    document.addEventListener('keydown', onDocKey, true);

    // -----------------------------------------------------------------------
    // Storage watcher — sync across tabs / devices
    // -----------------------------------------------------------------------
    unsubs.push(
      storage.watch<Folder[]>(STORAGE_KEY, (updated) => {
        folders = updated ?? [];
        // Revalidate active chip filter
        const activeFolder = activeChipFolderId
          ? (folders.find((f) => f.id === activeChipFolderId) ?? null)
          : null;
        if (activeChipFolderId && !activeFolder) {
          activeChipFolderId = null;
        }
        applyFilter(activeFolder);
        renderBar();
      }),
    );

    // -----------------------------------------------------------------------
    // Observer: re-filter on lazy-loaded cards, re-inject bar if YouTube
    // rebuilds the grid DOM.
    // -----------------------------------------------------------------------
    unsubs.push(
      ctx.observer.onChange(() => {
        if (!isSubsPage()) return;
        if (!barHost || !document.contains(barHost)) {
          // Bar was evicted — re-inject
          injectBar();
        }
        // Re-apply the current filter to newly-loaded cards
        const activeFolder = activeChipFolderId
          ? (folders.find((f) => f.id === activeChipFolderId) ?? null)
          : null;
        if (activeFolder) applyFilter(activeFolder);
      }),
    );

    // -----------------------------------------------------------------------
    // Navigation: inject/remove bar on route changes
    // -----------------------------------------------------------------------
    unsubs.push(
      ctx.navigation.onNavigate((url) => {
        if (new URL(url).pathname === '/feed/subscriptions') {
          injectBar();
        } else {
          // Navigated away — hide bar, restore all cards
          removeBar();
          removeFilterStyle();
        }
      }),
    );

    // -----------------------------------------------------------------------
    // Initial injection (we may already be on the subs page)
    // -----------------------------------------------------------------------
    if (isSubsPage()) {
      injectBar();
      // Also ensure filter style is present in case we're resuming
      ensureFilterStyle();
    }

    // -----------------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------------
    return () => {
      // Unsubscribe all watchers / observer subscriptions
      unsubs.forEach((off) => off());
      // Remove keyboard listener
      document.removeEventListener('keydown', onDocKey, true);
      // Remove bar host (shadow DOM + modal)
      removeBar();
      // Remove filter style and restore all hidden cards
      removeFilterStyle();
    };
  },
};

export default feature;
