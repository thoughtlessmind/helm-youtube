/**
 * custom-dashboards — Create named "dashboard" views, assign channels to each,
 * and filter the YouTube homepage feed to only show videos from those channels.
 *
 * Behavior:
 *  1. On the homepage (`/`), inject a shadow-DOM chip bar near the top of the
 *     feed: "All" + one chip per dashboard + a "Manage" button. Selecting a
 *     dashboard filters visible homepage video cards to only channels in that
 *     dashboard. "All" clears the filter.
 *  2. Re-filters on `ctx.observer.onChange` as YouTube lazy-loads cards on scroll.
 *  3. "Manage" opens a shadow-DOM panel: create / rename / delete dashboards;
 *     assign channels (discovered from currently-rendered feed cards + any
 *     channels already saved in dashboards). Export / import all dashboards
 *     as JSON.
 *  4. Persists immediately; storage watcher keeps all tabs in sync. Active
 *     dashboard selection is in-memory (resets on reload) — default "All".
 *  5. UI is active only on the homepage route; navigating away tears down the
 *     bar and restores hidden cards via the shared feed-cards coordinator.
 *
 * Storage key : local:ytpro:custom-dashboards
 * Schema      : Dashboard[]  where Dashboard = { id, name, channelIds: string[] }
 *
 * FeatureConfig: none — all data lives in local: storage.
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import {
  enumerateVideoCards,
  cardChannel,
  hideCard,
  unhideCard,
  unhideAllCards,
} from '../lib/yt/feed-cards';

// =============================================================================
// Types & constants
// =============================================================================

export interface Dashboard {
  id: string;
  name: string;
  channelIds: string[];
}

/** wxt storage key — local: so bulky channel lists don't bloat sync storage. */
const STORAGE_KEY = 'local:ytpro:custom-dashboards' as const;

/** Feature id used for multi-feature card-hide coordination. */
const FEATURE_ID = 'custom-dashboards' as const;

/** Shadow-DOM host id for the chip bar (inserted inline before the grid). */
const BAR_HOST_ID = 'yt-pro-cd-bar-host' as const;

/** Shadow-DOM host id for the manage panel modal (appended to document.body). */
const MODAL_HOST_ID = 'yt-pro-cd-modal-host' as const;

/**
 * Anchor selectors — tried in order, first match wins. We insert the bar
 * host immediately before the anchor element so it sits above the grid.
 */
const ANCHOR_SELECTORS = [
  'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer',
  'ytd-rich-grid-renderer',
  '#contents.ytd-rich-grid-renderer',
  'ytd-browse[page-subtype="home"] #contents',
] as const;

// =============================================================================
// CSS — bar (inside bar shadow root)
// =============================================================================

const BAR_CSS = `
  :host { all: initial; display: block; }

  /* ---- Chip bar ---- */
  .cd-bar {
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

// =============================================================================
// CSS — manage panel modal (inside modal shadow root)
// =============================================================================

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
    width: min(680px, 96vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 14px;
    overflow: hidden;
    box-sizing: border-box;
  }
  .modal * { box-sizing: border-box; }

  /* Modal header */
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

  /* Modal body — two-column layout */
  .modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Left column: dashboard list */
  .dashboard-list-col {
    width: 210px;
    flex-shrink: 0;
    border-right: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .dashboard-list-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
  }
  .dashboard-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s;
  }
  .dashboard-item:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.04)); }
  .dashboard-item.selected {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.08));
    font-weight: 600;
  }
  .dashboard-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-actions { display: flex; gap: 2px; flex-shrink: 0; }
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

  /* New dashboard input row */
  .new-dashboard-row {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    flex-shrink: 0;
  }
  .new-dashboard-row input {
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
  .new-dashboard-row input:focus { border-color: #c00; }
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
    flex-shrink: 0;
  }
  .add-btn:hover { background: #a00; }

  /* Right column: channel assignment */
  .channel-col {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .channel-col-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    text-align: center;
  }
  .channel-col-inner {
    padding: 12px 16px;
    flex: 1;
    overflow-y: auto;
  }
  .channel-col-inner h4 {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--yt-spec-text-secondary, #606060);
    text-transform: uppercase;
    letter-spacing: 0.06em;
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
  .channel-row input[type="checkbox"] { accent-color: #c00; cursor: pointer; flex-shrink: 0; }
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
    flex-shrink: 0;
  }
  .no-channels-note {
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    padding: 8px 0;
    font-style: italic;
  }

  /* Rename inline input */
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

  /* Export / import section */
  .export-section {
    border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    padding: 12px 16px;
    flex-shrink: 0;
  }
  .export-section h4 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--yt-spec-text-secondary, #606060);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .export-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .json-textarea {
    flex: 1;
    min-height: 64px;
    padding: 6px 8px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 6px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 12px;
    font-family: monospace;
    resize: vertical;
    outline: none;
  }
  .json-textarea:focus { border-color: #c00; }
  .export-btns {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }
  .export-btn, .import-btn {
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    white-space: nowrap;
  }
  .export-btn {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.08));
    color: var(--yt-spec-text-primary, #0f0f0f);
  }
  .export-btn:hover { background: rgba(0,0,0,0.14); }
  .import-btn { background: #c00; color: #fff; }
  .import-btn:hover { background: #a00; }
`;

// =============================================================================
// Helpers
// =============================================================================

/** Generate a short random id for new dashboards. */
function genId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** HTML-escape a string for safe insertion into innerHTML. */
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

// =============================================================================
// Storage layer
// =============================================================================

/** Load all dashboards from local storage. Returns [] if nothing saved yet. */
async function loadDashboards(): Promise<Dashboard[]> {
  const data = await storage.getItem<Dashboard[]>(STORAGE_KEY);
  return data ?? [];
}

/** Persist all dashboards to local storage. */
async function saveDashboards(dashboards: Dashboard[]): Promise<void> {
  await storage.setItem(STORAGE_KEY, dashboards);
}

/**
 * Validate a parsed JSON payload and return a clean Dashboard[] if valid,
 * or null if the shape is wrong.
 */
function parseDashboardsJson(raw: unknown): Dashboard[] | null {
  if (!Array.isArray(raw)) return null;
  const result: Dashboard[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).id !== 'string' ||
      typeof (item as Record<string, unknown>).name !== 'string' ||
      !Array.isArray((item as Record<string, unknown>).channelIds) ||
      !(item as { channelIds: unknown[] }).channelIds.every((c) => typeof c === 'string')
    ) {
      return null;
    }
    result.push({
      id: (item as Dashboard).id,
      name: (item as Dashboard).name,
      channelIds: (item as Dashboard).channelIds,
    });
  }
  return result;
}

// =============================================================================
// Filter logic
// =============================================================================

/**
 * Apply or clear the dashboard filter on homepage video cards.
 * Only operates when on the homepage route (`/`) to avoid touching
 * watch-page sidebar cards or search results.
 *
 * @param activeDashboard null means "All" — unhide everything.
 */
function applyFilter(activeDashboard: Dashboard | null): void {
  if (location.pathname !== '/') return;

  const cards = enumerateVideoCards();

  if (!activeDashboard) {
    // "All" — restore every card this feature hid
    cards.forEach((card) => unhideCard(card, FEATURE_ID));
    return;
  }

  const allowed = new Set(activeDashboard.channelIds);
  for (const card of cards) {
    const { id } = cardChannel(card);
    if (!id) {
      // Channel id not yet rendered — leave visible (e.g. shelf headers)
      unhideCard(card, FEATURE_ID);
    } else if (allowed.has(id)) {
      unhideCard(card, FEATURE_ID);
    } else {
      hideCard(card, FEATURE_ID);
    }
  }
}

// =============================================================================
// Channel discovery
// =============================================================================

/**
 * Build a channelId → display name map from:
 *  1. Cards currently visible in the homepage feed (via feed-cards helpers)
 *  2. Channel ids already saved in any dashboard (covers channels that scrolled
 *     away or were added on another device — shown by id as fallback name)
 */
function discoverChannels(dashboards: Dashboard[]): Map<string, string> {
  const map = new Map<string, string>();

  // Channels visible in the DOM right now
  if (location.pathname === '/') {
    for (const card of enumerateVideoCards()) {
      const { id, name } = cardChannel(card);
      if (id && !map.has(id)) {
        map.set(id, name || id);
      }
    }
  }

  // Channels already referenced in any dashboard (may not be on screen)
  for (const dashboard of dashboards) {
    for (const id of dashboard.channelIds) {
      if (!map.has(id)) map.set(id, id); // fallback: display the id itself
    }
  }

  return map;
}

// =============================================================================
// HTML rendering — chip bar
// =============================================================================

/**
 * Build the innerHTML for the chip bar shadow root container.
 * Renders "All" chip + one chip per dashboard + Manage button.
 */
function barHTML(dashboards: Dashboard[], activeId: string | null): string {
  const allActive = activeId === null ? 'active' : '';

  const chips = dashboards
    .map((d) => {
      const active = d.id === activeId ? 'active' : '';
      return `<button class="chip ${active}" data-dashboard-id="${esc(d.id)}" type="button">${esc(d.name)}</button>`;
    })
    .join('');

  return `
    <div class="cd-bar" id="cd-bar">
      <button class="chip ${allActive}" data-dashboard-id="" type="button">All</button>
      ${chips}
      <button class="manage-btn" data-act="manage" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
        </svg>
        Manage
      </button>
    </div>
  `;
}

// =============================================================================
// HTML rendering — manage panel
// =============================================================================

/**
 * Build the innerHTML for the manage panel modal shadow root container.
 *
 * Left column: list of dashboards with rename/delete controls + add-new row.
 * Right column: channel checklist for the selected dashboard.
 * Bottom of right column: export/import JSON textarea.
 */
function managePanelHTML(
  dashboards: Dashboard[],
  selectedDashboardId: string | null,
  channelMap: Map<string, string>,
  exportJson: string,
): string {
  // ---- Left column: dashboard list ----------------------------------------
  const dashboardListHTML = dashboards
    .map((d) => {
      const sel = d.id === selectedDashboardId ? 'selected' : '';
      return `
        <div class="dashboard-item ${sel}" data-manage-dashboard="${esc(d.id)}">
          <span class="dashboard-name">${esc(d.name)}</span>
          <span class="dashboard-actions">
            <button class="icon-btn" data-act="rename" data-dashboard-id="${esc(d.id)}" title="Rename" type="button">✏️</button>
            <button class="icon-btn" data-act="delete" data-dashboard-id="${esc(d.id)}" title="Delete" type="button">🗑️</button>
          </span>
        </div>
      `;
    })
    .join('');

  // ---- Right column: channel checklist + export/import --------------------
  let channelColHTML: string;

  if (!selectedDashboardId) {
    channelColHTML = `
      <div class="channel-col">
        <div class="channel-col-empty">← Select a dashboard to assign channels</div>
        ${exportImportHTML(exportJson)}
      </div>
    `;
  } else {
    const dashboard = dashboards.find((d) => d.id === selectedDashboardId);
    const assigned = new Set(dashboard?.channelIds ?? []);

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

    const emptyNote = rows
      ? ''
      : `<p class="no-channels-note">No channels discovered yet — scroll the feed to load cards, then re-open Manage.</p>`;

    channelColHTML = `
      <div class="channel-col">
        <div class="channel-col-inner">
          <h4>Channels in "${esc(dashboard?.name ?? '')}"</h4>
          ${emptyNote}
          ${rows}
        </div>
        ${exportImportHTML(exportJson)}
      </div>
    `;
  }

  return `
    <div class="modal-overlay" id="cd-manage-overlay">
      <div class="modal" id="cd-manage-modal">
        <div class="modal-header">
          <span class="modal-title">Custom Dashboards</span>
          <button class="close-btn" data-act="close-modal" type="button" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="dashboard-list-col">
            <div class="dashboard-list-scroll">
              ${dashboardListHTML || '<div style="padding:12px 14px;font-size:13px;color:var(--yt-spec-text-secondary,#606060)">No dashboards yet — create one below.</div>'}
            </div>
            <div class="new-dashboard-row">
              <input id="new-dashboard-input" type="text" placeholder="New dashboard name…" maxlength="60" />
              <button class="add-btn" data-act="add-dashboard" type="button">Add</button>
            </div>
          </div>
          ${channelColHTML}
        </div>
      </div>
    </div>
  `;
}

/** Render the export/import section that appears at the bottom of the right column. */
function exportImportHTML(exportJson: string): string {
  return `
    <div class="export-section">
      <h4>Export / Import</h4>
      <div class="export-row">
        <textarea class="json-textarea" id="cd-json-textarea" spellcheck="false" placeholder="Paste JSON here to import…">${esc(exportJson)}</textarea>
        <div class="export-btns">
          <button class="export-btn" data-act="export-json" type="button">Export</button>
          <button class="import-btn" data-act="import-json" type="button">Import</button>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// Feature definition
// =============================================================================

const feature: Feature = {
  id: FEATURE_ID,

  async setup(ctx) {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /** All saved dashboards. */
    let dashboards: Dashboard[] = await loadDashboards();

    /** Currently active dashboard id for the chip bar filter (null = "All"). */
    let activeChipDashboardId: string | null = null;

    /** Dashboard selected inside the manage panel left column. */
    let managePanelDashboardId: string | null = null;

    /** Shadow-DOM host for the chip bar (inserted before the grid). */
    let barHost: HTMLDivElement | null = null;
    let barShadow: ShadowRoot | null = null;

    /** Separate shadow-DOM host for the manage panel modal (appended to body). */
    let modalHost: HTMLDivElement | null = null;
    let modalShadow: ShadowRoot | null = null;

    /** Whether the manage panel is currently open. */
    let managePanelOpen = false;

    /** Teardown collectors: storage watchers + observer subscriptions. */
    const unsubs: Array<() => void> = [];

    // -------------------------------------------------------------------------
    // Route check
    // -------------------------------------------------------------------------

    const isHomePage = () => location.pathname === '/';

    // -------------------------------------------------------------------------
    // Anchor finding — where we insert the bar host
    // -------------------------------------------------------------------------

    function findAnchor(): Element | null {
      for (const sel of ANCHOR_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    // -------------------------------------------------------------------------
    // Bar injection / removal
    // -------------------------------------------------------------------------

    function injectBar(): void {
      if (!isHomePage()) return;

      // Already present and in the DOM — just re-render
      if (barHost && document.contains(barHost)) {
        renderBar();
        return;
      }

      const anchor = findAnchor();
      if (!anchor) return;

      barHost = document.createElement('div');
      barHost.id = BAR_HOST_ID;
      Object.assign(barHost.style, {
        display: 'block',
        width: '100%',
      } as Partial<CSSStyleDeclaration>);

      barShadow = barHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = BAR_CSS;
      barShadow.appendChild(style);

      const container = document.createElement('div');
      container.id = 'cd-root';
      barShadow.appendChild(container);

      // Insert immediately before the grid renderer
      anchor.parentElement?.insertBefore(barHost, anchor);

      renderBar();

      // Re-apply filter immediately in case we're returning to the homepage
      // after navigating away (unhideAllCards was called on departure, but the
      // active dashboard selection is kept in-memory).
      if (activeChipDashboardId) {
        const active = dashboards.find((d) => d.id === activeChipDashboardId) ?? null;
        applyFilter(active);
      }
    }

    function removeBar(): void {
      barHost?.remove();
      barHost = null;
      barShadow = null;
      // Also close any open modal
      removeModal();
    }

    function removeModal(): void {
      modalHost?.remove();
      modalHost = null;
      modalShadow = null;
      managePanelOpen = false;
    }

    // -------------------------------------------------------------------------
    // Render helpers
    // -------------------------------------------------------------------------

    function getBarRoot(): HTMLElement | null {
      return barShadow?.getElementById('cd-root') ?? null;
    }

    function getModalRoot(): HTMLElement | null {
      return modalShadow?.getElementById('cd-modal-root') ?? null;
    }

    /**
     * (Re-)render the chip bar. This is the primary render entry point — it
     * also triggers a modal re-render when the panel is open.
     */
    function renderBar(): void {
      const root = getBarRoot();
      if (!root) return;
      root.innerHTML = barHTML(dashboards, activeChipDashboardId);
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
      container.id = 'cd-modal-root';
      modalShadow.appendChild(container);

      document.body.appendChild(modalHost);
    }

    function renderModal(): void {
      if (!managePanelOpen) {
        // Remove the modal host entirely when not in use
        removeModal();
        return;
      }
      ensureModalHost();
      const root = getModalRoot();
      if (!root) return;

      const channelMap = discoverChannels(dashboards);
      // Build export JSON from current dashboards state
      const exportJson = JSON.stringify(dashboards, null, 2);

      root.innerHTML = managePanelHTML(dashboards, managePanelDashboardId, channelMap, exportJson);
      wireModalEvents(root);
    }

    // -------------------------------------------------------------------------
    // Event wiring — chip bar
    // -------------------------------------------------------------------------

    function wireBarEvents(root: HTMLElement): void {
      // Chip clicks: select dashboard or "All"
      root.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const did = chip.dataset.dashboardId || null;
          activeChipDashboardId = did === '' ? null : did;
          const active = activeChipDashboardId
            ? (dashboards.find((d) => d.id === activeChipDashboardId) ?? null)
            : null;
          applyFilter(active);
          renderBar();
        });
      });

      // Manage button: open the manage panel
      root.querySelector<HTMLButtonElement>('[data-act="manage"]')?.addEventListener('click', () => {
        managePanelOpen = true;
        managePanelDashboardId = dashboards[0]?.id ?? null;
        renderModal();
      });
    }

    // -------------------------------------------------------------------------
    // Event wiring — manage panel modal
    // -------------------------------------------------------------------------

    function wireModalEvents(root: HTMLElement): void {
      // ---- Close controls ---------------------------------------------------

      root.querySelector<HTMLButtonElement>('[data-act="close-modal"]')?.addEventListener('click', () => {
        managePanelOpen = false;
        managePanelDashboardId = null;
        renderBar(); // also removes modal via renderModal()
      });

      // Click outside the modal dialog to dismiss
      root.querySelector<HTMLElement>('#cd-manage-overlay')?.addEventListener('click', (e) => {
        const modal = root.querySelector<HTMLElement>('#cd-manage-modal');
        if (modal && !modal.contains(e.target as Node)) {
          managePanelOpen = false;
          managePanelDashboardId = null;
          renderBar();
        }
      });

      // ---- Dashboard selection (left column) --------------------------------

      root.querySelectorAll<HTMLElement>('[data-manage-dashboard]').forEach((item) => {
        item.addEventListener('click', (e) => {
          // Don't steal clicks on rename/delete icon buttons inside the item
          const target = e.target as HTMLElement;
          if (target.closest('[data-act="rename"],[data-act="delete"]')) return;
          managePanelDashboardId = item.dataset.manageDashboard ?? null;
          renderModal();
        });
      });

      // ---- Delete dashboard -------------------------------------------------

      root.querySelectorAll<HTMLButtonElement>('[data-act="delete"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const did = btn.dataset.dashboardId;
          if (!did) return;
          dashboards = dashboards.filter((d) => d.id !== did);
          if (managePanelDashboardId === did) managePanelDashboardId = dashboards[0]?.id ?? null;
          if (activeChipDashboardId === did) {
            activeChipDashboardId = null;
            applyFilter(null);
          }
          await saveDashboards(dashboards);
          flashToast('Dashboard deleted');
          renderBar();
        });
      });

      // ---- Rename dashboard (inline edit) -----------------------------------

      root.querySelectorAll<HTMLButtonElement>('[data-act="rename"]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const did = btn.dataset.dashboardId;
          if (!did) return;
          const dashboard = dashboards.find((d) => d.id === did);
          if (!dashboard) return;

          const item = root.querySelector<HTMLElement>(`[data-manage-dashboard="${CSS.escape(did)}"]`);
          if (!item) return;
          const nameSpan = item.querySelector<HTMLElement>('.dashboard-name');
          if (!nameSpan) return;

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'rename-input';
          input.value = dashboard.name;
          input.maxLength = 60;
          nameSpan.replaceWith(input);
          input.focus();
          input.select();

          const commit = async () => {
            const newName = input.value.trim();
            if (newName && newName !== dashboard.name) {
              dashboard.name = newName;
              await saveDashboards(dashboards);
              flashToast('Dashboard renamed');
            }
            renderModal();
          };
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              void commit();
            }
            if (ke.key === 'Escape') {
              ke.preventDefault();
              renderModal();
            }
          });
        });
      });

      // ---- Add dashboard ----------------------------------------------------

      const addBtn = root.querySelector<HTMLButtonElement>('[data-act="add-dashboard"]');
      const newInput = root.querySelector<HTMLInputElement>('#new-dashboard-input');
      const doAdd = async () => {
        const name = newInput?.value.trim() ?? '';
        if (!name) return;
        const dashboard: Dashboard = { id: genId(), name, channelIds: [] };
        dashboards = [...dashboards, dashboard];
        managePanelDashboardId = dashboard.id;
        await saveDashboards(dashboards);
        flashToast(`Dashboard "${name}" created`);
        renderBar();
      };
      addBtn?.addEventListener('click', () => void doAdd());
      newInput?.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          void doAdd();
        }
      });

      // ---- Toggle channel in selected dashboard ------------------------------

      root.querySelectorAll<HTMLInputElement>('[data-act="toggle-channel"]').forEach((cb) => {
        cb.addEventListener('change', async () => {
          const channelId = cb.dataset.channelId;
          if (!channelId || !managePanelDashboardId) return;
          const dashboard = dashboards.find((d) => d.id === managePanelDashboardId);
          if (!dashboard) return;

          if (cb.checked) {
            if (!dashboard.channelIds.includes(channelId)) {
              dashboard.channelIds = [...dashboard.channelIds, channelId];
            }
          } else {
            dashboard.channelIds = dashboard.channelIds.filter((id) => id !== channelId);
          }
          await saveDashboards(dashboards);

          // Live-update filter if this is the currently active dashboard
          if (activeChipDashboardId === managePanelDashboardId) {
            applyFilter(dashboard);
          }
        });
      });

      // ---- Export JSON -------------------------------------------------------

      root.querySelector<HTMLButtonElement>('[data-act="export-json"]')?.addEventListener('click', () => {
        const textarea = root.querySelector<HTMLTextAreaElement>('#cd-json-textarea');
        if (!textarea) return;
        textarea.value = JSON.stringify(dashboards, null, 2);
        textarea.select();
        flashToast('Dashboard JSON ready — copy from the textarea');
      });

      // ---- Import JSON -------------------------------------------------------

      root.querySelector<HTMLButtonElement>('[data-act="import-json"]')?.addEventListener('click', async () => {
        const textarea = root.querySelector<HTMLTextAreaElement>('#cd-json-textarea');
        if (!textarea) return;
        const raw = textarea.value.trim();
        if (!raw) {
          flashToast('Paste JSON first');
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          flashToast('Invalid JSON — could not parse');
          return;
        }
        const imported = parseDashboardsJson(parsed);
        if (!imported) {
          flashToast('Import failed — unexpected shape (need Dashboard[])');
          return;
        }
        dashboards = imported;
        // Revalidate active chip in case an imported set no longer includes it
        if (activeChipDashboardId && !dashboards.find((d) => d.id === activeChipDashboardId)) {
          activeChipDashboardId = null;
          applyFilter(null);
        }
        await saveDashboards(dashboards);
        flashToast(`Imported ${dashboards.length} dashboard${dashboards.length !== 1 ? 's' : ''}`);
        renderBar();
      });
    }

    // -------------------------------------------------------------------------
    // Keyboard: Escape closes modal (document-level, always active while mounted)
    // -------------------------------------------------------------------------

    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && managePanelOpen) {
        managePanelOpen = false;
        managePanelDashboardId = null;
        renderBar();
      }
    };
    document.addEventListener('keydown', onDocKey, true);

    // -------------------------------------------------------------------------
    // Storage watcher — keep UI in sync across tabs / devices
    // -------------------------------------------------------------------------

    unsubs.push(
      storage.watch<Dashboard[]>(STORAGE_KEY, (updated) => {
        dashboards = updated ?? [];

        // Revalidate active chip (the active dashboard may have been deleted)
        const activeFound = activeChipDashboardId
          ? (dashboards.find((d) => d.id === activeChipDashboardId) ?? null)
          : null;
        if (activeChipDashboardId && !activeFound) {
          activeChipDashboardId = null;
        }
        applyFilter(activeFound);

        if (isHomePage()) renderBar();
      }),
    );

    // -------------------------------------------------------------------------
    // Observer: re-filter on lazy-loaded cards; re-inject bar if YouTube
    // rebuilds the grid DOM (navigations within the SPA can evict the bar).
    // -------------------------------------------------------------------------

    unsubs.push(
      ctx.observer.onChange(() => {
        if (!isHomePage()) return;

        if (!barHost || !document.contains(barHost)) {
          // Bar was evicted by YouTube's rendering — re-inject
          injectBar();
        }

        // Re-apply current filter to any newly-loaded cards
        const active = activeChipDashboardId
          ? (dashboards.find((d) => d.id === activeChipDashboardId) ?? null)
          : null;
        if (active) applyFilter(active);
      }),
    );

    // -------------------------------------------------------------------------
    // Navigation: inject/remove UI when the route changes
    // -------------------------------------------------------------------------

    unsubs.push(
      ctx.navigation.onNavigate((url) => {
        if (new URL(url).pathname === '/') {
          injectBar();
        } else {
          // Left homepage — tear down UI and restore all hidden cards
          removeBar();
          unhideAllCards(FEATURE_ID);
        }
      }),
    );

    // -------------------------------------------------------------------------
    // Initial injection (feature may be enabled while already on the homepage)
    // -------------------------------------------------------------------------

    if (isHomePage()) {
      injectBar();
    }

    // -------------------------------------------------------------------------
    // Teardown — called when the user disables the feature
    // -------------------------------------------------------------------------

    return () => {
      // Unsubscribe storage watchers and observer subscriptions
      unsubs.forEach((off) => off());

      // Remove document-level keyboard listener
      document.removeEventListener('keydown', onDocKey, true);

      // Remove bar and any open modal
      removeBar();

      // Restore all cards hidden by this feature (multi-feature safe)
      unhideAllCards(FEATURE_ID);
    };
  },
};

export default feature;
