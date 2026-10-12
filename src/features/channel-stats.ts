/**
 * channel-stats.ts
 *
 * Displays a compact stats panel on YouTube channel pages derived entirely
 * from the video cards already rendered on screen — no API calls needed.
 *
 * Stats computed:
 *   • Total visible videos
 *   • Average video duration
 *   • Upload frequency — estimated videos-per-week/month from relative dates
 *
 * The panel is injected into a shadow DOM host placed above the video grid
 * (or into the channel header area when the grid is not yet visible).
 * Data refreshes on `ctx.observer.onChange` as more videos lazy-load.
 *
 * The user is nudged to open the channel's "Videos" tab when fewer than 3
 * datable cards are available, to avoid misleading frequency numbers.
 */

import type { Feature } from '../lib/features';
import {
  enumerateVideoCards,
  cardDurationSeconds,
} from '../lib/yt/feed-cards';
import { cardUploadDaysAgo } from '../lib/yt/relative-date';

// ─── Selectors / IDs ─────────────────────────────────────────────────────────

/** Shadow host element id. */
const HOST_ID = 'yt-pro-channel-stats-host';

/**
 * Routes that constitute a channel page (handle, id, legacy /c/ and /user/).
 * The /videos sub-tab is also matched because the pathname is still one of these.
 */
const CHANNEL_PATH_RE = /^\/((@[\w.-]+)|channel\/UC[\w-]+|c\/[\w-]+|user\/[\w-]+)(\/videos)?\/?$/;

/**
 * Ordered candidates for placing the stats strip.
 * Each entry is [cssSelector, insertMode].
 *
 * YouTube channel/videos tab DOM (current layout):
 *   ytd-browse
 *     ytd-two-column-browse-results-renderer
 *       ytd-rich-grid-renderer   ← best anchor: prepend into here
 *         #header
 *         #contents              (the video cards)
 *
 * Older / section-list layout:
 *   ytd-section-list-renderer > #header
 *
 * 'prepend' inserts the host as first child of the selected element.
 * 'before'  inserts the host immediately before the selected element.
 */
const GRID_ANCHOR_SELECTORS: Array<[string, 'before' | 'prepend']> = [
  // Current layout: top of the rich-grid container, above all card rows
  ['#primary ytd-rich-grid-renderer', 'prepend'],
  // Current layout: the #header slot inside the grid (if rendered)
  ['#primary ytd-rich-grid-renderer > #header', 'before'],
  // Older section-list layout
  ['#primary ytd-section-list-renderer > #header', 'before'],
  ['#primary ytd-section-list-renderer', 'prepend'],
  // Fallback: top of the two-column layout or the browse root
  ['ytd-two-column-browse-results-renderer', 'prepend'],
  ['#primary ytd-browse', 'prepend'],
];

/** CSS applied inside the shadow root. */
const PANEL_CSS = `
  :host { all: initial; display: block; }

  .yt-pro-stats-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    align-items: center;
    padding: 10px 16px;
    margin: 8px 0 4px;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    border-radius: 8px;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
    color: var(--yt-spec-text-primary, #0f0f0f);
    box-sizing: border-box;
  }

  .yt-pro-stats-label {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--yt-spec-text-secondary, #606060);
    margin-right: 4px;
  }

  .yt-pro-stats-item {
    display: flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }

  .yt-pro-stats-value {
    font-weight: 500;
  }

  .yt-pro-stats-hint {
    width: 100%;
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    font-style: italic;
    margin-top: 2px;
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True when the current page is a YouTube channel page. */
function isChannelPage(): boolean {
  return CHANNEL_PATH_RE.test(location.pathname);
}

/** Formats seconds as "Xh Ym" or "Xm Ys". */
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  return `${s}s`;
}

/**
 * Gathers stats from the currently rendered video cards.
 * Caps processing at 200 cards to avoid blocking the main thread.
 */
function computeStats(): {
  total: number;
  avgDurationSec: number | null;
  freqPerWeek: number | null;
  datedCount: number;
} {
  const cards = enumerateVideoCards().slice(0, 200);
  const total = cards.length;

  // Duration
  const durations: number[] = [];
  for (const card of cards) {
    const d = cardDurationSeconds(card);
    if (d !== null && d > 0) durations.push(d);
  }
  const avgDurationSec =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

  // Upload frequency — estimate from upload date spread
  const daysAgoList: number[] = [];
  for (const card of cards) {
    const d = cardUploadDaysAgo(card);
    if (d !== null) daysAgoList.push(d);
  }

  let freqPerWeek: number | null = null;
  if (daysAgoList.length >= 3) {
    // Sort ascending (oldest last since higher days = older)
    daysAgoList.sort((a, b) => a - b);
    const newest = daysAgoList[0];
    const oldest = daysAgoList[daysAgoList.length - 1];
    const spanDays = oldest - newest;
    if (spanDays > 0) {
      // Videos per day over the span, converted to per week
      freqPerWeek = (daysAgoList.length / spanDays) * 7;
    } else {
      // All appear same day — insufficient span
      freqPerWeek = null;
    }
  }

  return { total, avgDurationSec, freqPerWeek, datedCount: daysAgoList.length };
}

/** Generates the inner HTML for the stats panel. Uses no external HTML. */
function renderHTML(stats: ReturnType<typeof computeStats>): string {
  const { total, avgDurationSec, freqPerWeek, datedCount } = stats;

  const totalItem = `
    <span class="yt-pro-stats-item">
      <span class="yt-pro-stats-label">Videos loaded</span>
      <span class="yt-pro-stats-value">${total}</span>
    </span>`;

  const avgItem =
    avgDurationSec !== null
      ? `<span class="yt-pro-stats-item">
           <span class="yt-pro-stats-label">Avg length</span>
           <span class="yt-pro-stats-value">${fmtDuration(avgDurationSec)}</span>
         </span>`
      : '';

  let freqItem = '';
  if (freqPerWeek !== null) {
    const perMonth = freqPerWeek * 4;
    const freqLabel =
      freqPerWeek < 1
        ? `~${(perMonth).toFixed(1)}/mo`
        : freqPerWeek < 7
        ? `~${freqPerWeek.toFixed(1)}/wk`
        : `~${freqPerWeek.toFixed(0)}/wk`;
    freqItem = `<span class="yt-pro-stats-item">
      <span class="yt-pro-stats-label">Upload freq</span>
      <span class="yt-pro-stats-value">${freqLabel}</span>
    </span>`;
  }

  const needMoreHint =
    datedCount < 3
      ? `<span class="yt-pro-stats-hint">Open the Videos tab and scroll to load more videos for frequency stats.</span>`
      : '';

  return `<div class="yt-pro-stats-panel">${totalItem}${avgItem}${freqItem}${needMoreHint}</div>`;
}

// ─── Feature ─────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'channel-stats',

  setup(ctx) {
    /** Shadow host element, null when not injected. */
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;

    /** Cleanup callbacks returned by ctx subscriptions. */
    const unsubs: Array<() => void> = [];

    // ── Panel lifecycle ────────────────────────────────────────────────────

    const removePanel = () => {
      host?.remove();
      host = null;
      shadow = null;
    };

    const ensurePanel = (): ShadowRoot | null => {
      if (host && document.contains(host)) return shadow;

      // Find best anchor + insertion mode
      let anchor: Element | null = null;
      let insertMode: 'before' | 'prepend' = 'before';
      for (const [sel, mode] of GRID_ANCHOR_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) {
          anchor = el;
          insertMode = mode;
          break;
        }
      }
      if (!anchor) return null;

      host = document.createElement('div');
      host.id = HOST_ID;
      shadow = host.attachShadow({ mode: 'open' });

      const styleEl = document.createElement('style');
      styleEl.textContent = PANEL_CSS;
      shadow.appendChild(styleEl);

      const panelEl = document.createElement('div');
      panelEl.id = 'yt-pro-stats-inner';
      shadow.appendChild(panelEl);

      if (insertMode === 'prepend') {
        // Insert as first child of the anchor (e.g. top of the grid container)
        anchor.insertAdjacentElement('afterbegin', host);
      } else {
        // Insert immediately before the anchor element
        anchor.parentElement?.insertBefore(host, anchor);
      }

      return shadow;
    };

    const refresh = () => {
      if (!isChannelPage()) return;
      const sr = ensurePanel();
      if (!sr) return;
      const inner = sr.getElementById('yt-pro-stats-inner');
      if (inner) inner.innerHTML = renderHTML(computeStats());
    };

    // ── Navigation wiring ──────────────────────────────────────────────────

    // Re-inject / remove on SPA navigation
    unsubs.push(
      ctx.navigation.onNavigate((url) => {
        const path = new URL(url).pathname;
        if (CHANNEL_PATH_RE.test(path)) {
          // Channel page — refresh after brief delay so cards start loading
          refresh();
        } else {
          removePanel();
        }
      }),
    );

    // Re-run when DOM changes (lazy-loaded cards, re-renders)
    unsubs.push(ctx.observer.onChange(() => refresh()));

    // Initial run — user may already be on a channel page
    if (isChannelPage()) refresh();

    // ── Teardown ───────────────────────────────────────────────────────────
    return () => {
      unsubs.forEach((off) => off());
      removePanel();
    };
  },
};

export default feature;
