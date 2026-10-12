/**
 * history-search.ts
 *
 * Injects a rich client-side filter bar into YouTube's watch history page
 * (/feed/history), offering controls that YouTube's native search box lacks:
 *
 *   • Keyword search  — filters by video title
 *   • Channel filter  — filters by channel name (substring match)
 *   • Min/max length  — duration range in minutes
 *   • Date range      — "uploaded within the last N days" slider
 *   • Match count     — live feedback on how many videos pass
 *   • "Clear" button  — resets all filters in one click
 *
 * Filtering is purely client-side — it hides/shows `ytd-video-renderer`
 * elements already in the DOM and re-runs on `ctx.observer.onChange` as
 * history entries lazy-load on scroll.
 *
 * Uses the shared hide-coordination from feed-cards.ts so it composes
 * cleanly with other features (e.g. hide-shorts) that also hide cards.
 */

import type { Feature } from '../lib/features';
import { hideCard, unhideCard, unhideAllCards } from '../lib/yt/feed-cards';
import { cardUploadDaysAgo } from '../lib/yt/relative-date';

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURE_ID = 'history-search';
const HOST_ID = 'yt-pro-history-search-host';

/** The history page path. */
const HISTORY_PATH = '/feed/history';

/**
 * Selector for individual video entries in the history list.
 * YouTube renders each history video as `ytd-video-renderer` inside
 * `ytd-item-section-renderer` sections (one per day).
 */
const HISTORY_VIDEO_SELECTOR = 'ytd-video-renderer';

/** Selectors tried in order for the video title on a history card. */
const HISTORY_TITLE_SELECTORS = [
  '#video-title',
  'a#video-title',
  'yt-formatted-string#video-title',
  '#video-title-link',
];

/** Selectors tried in order for the channel name on a history card. */
const HISTORY_CHANNEL_SELECTORS = [
  'ytd-channel-name a',
  '#channel-name a',
  'ytd-channel-name yt-formatted-string',
];

/** Selectors for the duration badge on a history card. */
const HISTORY_DURATION_SELECTORS = [
  'ytd-thumbnail-overlay-time-status-renderer span#text',
  'ytd-thumbnail-overlay-time-status-renderer #text',
  '#time-status',
];

/** Anchor where the filter bar is inserted — just before the content list. */
const BAR_ANCHOR_SELECTORS = [
  '#primary ytd-section-list-renderer > #header',
  '#primary ytd-section-list-renderer',
  '#primary ytd-browse',
  '#primary',
];

// ─── Shadow DOM CSS ───────────────────────────────────────────────────────────

const BAR_CSS = `
  :host { all: initial; display: block; }

  .yt-pro-hbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    margin: 8px 0 6px;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    border-radius: 8px;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
    color: var(--yt-spec-text-primary, #0f0f0f);
    box-sizing: border-box;
  }

  .yt-pro-hbar * { box-sizing: border-box; }

  .yt-pro-hbar-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--yt-spec-text-secondary, #606060);
    white-space: nowrap;
  }

  .yt-pro-hbar-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .yt-pro-hbar input[type="text"],
  .yt-pro-hbar input[type="number"] {
    background: var(--yt-spec-general-background-a, #fff);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .yt-pro-hbar input[type="text"]:focus,
  .yt-pro-hbar input[type="number"]:focus {
    border-color: #c00;
  }

  .yt-pro-hbar input[type="text"].wide { width: 180px; }
  .yt-pro-hbar input[type="text"].narrow { width: 140px; }
  .yt-pro-hbar input[type="number"].short { width: 72px; }

  .yt-pro-hbar-divider {
    width: 1px;
    height: 22px;
    background: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.12));
    margin: 0 2px;
  }

  .yt-pro-hbar-count {
    font-size: 12px;
    color: var(--yt-spec-text-secondary, #606060);
    margin-left: auto;
    white-space: nowrap;
  }

  .yt-pro-hbar-clear {
    background: transparent;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.2));
    border-radius: 4px;
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    padding: 4px 10px;
    white-space: nowrap;
    transition: background 0.12s;
  }

  .yt-pro-hbar-clear:hover {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.08));
  }

  .yt-pro-hbar-hint {
    width: 100%;
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    font-style: italic;
    margin-top: 2px;
  }
`;

// ─── Bar HTML ─────────────────────────────────────────────────────────────────

const BAR_HTML = `
  <div class="yt-pro-hbar">
    <div class="yt-pro-hbar-group">
      <span class="yt-pro-hbar-label">Title</span>
      <input id="yt-pro-h-title" type="text" class="wide" placeholder="Filter by title…" autocomplete="off" />
    </div>

    <div class="yt-pro-hbar-divider"></div>

    <div class="yt-pro-hbar-group">
      <span class="yt-pro-hbar-label">Channel</span>
      <input id="yt-pro-h-channel" type="text" class="narrow" placeholder="Channel name…" autocomplete="off" />
    </div>

    <div class="yt-pro-hbar-divider"></div>

    <div class="yt-pro-hbar-group">
      <span class="yt-pro-hbar-label">Length (min)</span>
      <input id="yt-pro-h-minlen" type="number" class="short" placeholder="Min" min="0" step="1" />
      <span style="color:var(--yt-spec-text-secondary,#606060)">–</span>
      <input id="yt-pro-h-maxlen" type="number" class="short" placeholder="Max" min="0" step="1" />
    </div>

    <div class="yt-pro-hbar-divider"></div>

    <div class="yt-pro-hbar-group">
      <span class="yt-pro-hbar-label">Uploaded within</span>
      <input id="yt-pro-h-days" type="number" class="short" placeholder="Days" min="1" step="1" />
      <span class="yt-pro-hbar-label">days</span>
    </div>

    <button class="yt-pro-hbar-clear" id="yt-pro-h-clear">Clear filters</button>
    <span class="yt-pro-hbar-count" id="yt-pro-h-count"></span>

    <span class="yt-pro-hbar-hint">Scroll down to load more history entries.</span>
  </div>
`;

// ─── Filter state ─────────────────────────────────────────────────────────────

interface FilterState {
  title: string;
  channel: string;
  minLenMin: number | null;
  maxLenMin: number | null;
  withinDays: number | null;
}

const emptyFilter = (): FilterState => ({
  title: '',
  channel: '',
  minLenMin: null,
  maxLenMin: null,
  withinDays: null,
});

// ─── Per-card helpers ─────────────────────────────────────────────────────────

/** Extracts the title text from a history video entry. */
function historyTitle(card: HTMLElement): string {
  for (const sel of HISTORY_TITLE_SELECTORS) {
    const el = card.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return '';
}

/** Extracts the channel name from a history video entry. */
function historyChannel(card: HTMLElement): string {
  for (const sel of HISTORY_CHANNEL_SELECTORS) {
    const el = card.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return '';
}

/**
 * Parses the thumbnail duration badge and returns seconds.
 * Returns null for live/shorts/unparseable.
 */
function historyDurationSec(card: HTMLElement): number | null {
  // Shorts check
  const thumbLink = card.querySelector<HTMLAnchorElement>('a#thumbnail, a.ytd-thumbnail');
  if (thumbLink?.href?.includes('/shorts/')) return null;

  for (const sel of HISTORY_DURATION_SELECTORS) {
    const el = card.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const raw = (el.getAttribute('aria-label') || el.textContent || '').trim().toUpperCase();
    if (!raw || raw.startsWith('LIVE') || raw.startsWith('PREMIERE') || raw.startsWith('UPCOMING')) continue;
    const text = (el.textContent || '').trim();
    const parts = text.split(':').map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) continue;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return null;
}

/** Returns true when the card matches all active filters. */
function cardMatches(card: HTMLElement, f: FilterState): boolean {
  if (f.title) {
    const title = historyTitle(card).toLowerCase();
    if (!title.includes(f.title.toLowerCase())) return false;
  }

  if (f.channel) {
    const ch = historyChannel(card).toLowerCase();
    if (!ch.includes(f.channel.toLowerCase())) return false;
  }

  const hasLenFilter = f.minLenMin !== null || f.maxLenMin !== null;
  if (hasLenFilter) {
    const sec = historyDurationSec(card);
    if (sec !== null) {
      const minSec = f.minLenMin !== null ? f.minLenMin * 60 : 0;
      const maxSec = f.maxLenMin !== null ? f.maxLenMin * 60 : Infinity;
      if (sec < minSec || sec > maxSec) return false;
    }
    // When duration is null (live/shorts/unparseable), skip duration filter
    // so we don't accidentally hide something we can't classify.
  }

  if (f.withinDays !== null) {
    const daysAgo = cardUploadDaysAgo(card);
    // If we can't parse the date, leave the card visible.
    if (daysAgo !== null && daysAgo > f.withinDays) return false;
  }

  return true;
}

// ─── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: FEATURE_ID,

  setup(ctx) {
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let filters: FilterState = emptyFilter();
    const unsubs: Array<() => void> = [];

    // ── DOM helpers ────────────────────────────────────────────────────────

    const isHistoryPage = () => location.pathname === HISTORY_PATH;

    const historyCards = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>(HISTORY_VIDEO_SELECTOR));

    // ── Filter application ──────────────────────────────────────────────────

    const applyFilters = () => {
      const cards = historyCards();
      let visible = 0;
      for (const card of cards) {
        if (cardMatches(card, filters)) {
          unhideCard(card, FEATURE_ID);
          visible++;
        } else {
          hideCard(card, FEATURE_ID);
        }
      }
      updateCount(visible, cards.length);
    };

    const updateCount = (visible: number, total: number) => {
      if (!shadow) return;
      const countEl = shadow.getElementById('yt-pro-h-count');
      if (!countEl) return;
      const hasFilters =
        filters.title ||
        filters.channel ||
        filters.minLenMin !== null ||
        filters.maxLenMin !== null ||
        filters.withinDays !== null;
      countEl.textContent = hasFilters ? `${visible} / ${total} shown` : '';
    };

    // ── Filter clear ────────────────────────────────────────────────────────

    const clearFilters = () => {
      filters = emptyFilter();
      if (shadow) {
        const titleEl = shadow.getElementById('yt-pro-h-title') as HTMLInputElement | null;
        const channelEl = shadow.getElementById('yt-pro-h-channel') as HTMLInputElement | null;
        const minEl = shadow.getElementById('yt-pro-h-minlen') as HTMLInputElement | null;
        const maxEl = shadow.getElementById('yt-pro-h-maxlen') as HTMLInputElement | null;
        const daysEl = shadow.getElementById('yt-pro-h-days') as HTMLInputElement | null;
        if (titleEl) titleEl.value = '';
        if (channelEl) channelEl.value = '';
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
        if (daysEl) daysEl.value = '';
      }
      unhideAllCards(FEATURE_ID);
      updateCount(historyCards().length, historyCards().length);
    };

    // ── Bar injection ───────────────────────────────────────────────────────

    const wireBar = (sr: ShadowRoot) => {
      const get = <T extends HTMLElement>(id: string) =>
        sr.getElementById(id) as T | null;

      const titleEl = get<HTMLInputElement>('yt-pro-h-title');
      const channelEl = get<HTMLInputElement>('yt-pro-h-channel');
      const minLenEl = get<HTMLInputElement>('yt-pro-h-minlen');
      const maxLenEl = get<HTMLInputElement>('yt-pro-h-maxlen');
      const daysEl = get<HTMLInputElement>('yt-pro-h-days');
      const clearBtn = get<HTMLButtonElement>('yt-pro-h-clear');

      const parseNum = (el: HTMLInputElement | null): number | null => {
        if (!el || !el.value.trim()) return null;
        const v = parseFloat(el.value);
        return isNaN(v) ? null : v;
      };

      const onInput = () => {
        filters = {
          title: titleEl?.value?.trim() ?? '',
          channel: channelEl?.value?.trim() ?? '',
          minLenMin: parseNum(minLenEl),
          maxLenMin: parseNum(maxLenEl),
          withinDays: parseNum(daysEl),
        };
        applyFilters();
      };

      titleEl?.addEventListener('input', onInput);
      channelEl?.addEventListener('input', onInput);
      minLenEl?.addEventListener('input', onInput);
      maxLenEl?.addEventListener('input', onInput);
      daysEl?.addEventListener('input', onInput);
      clearBtn?.addEventListener('click', clearFilters);
    };

    const removeBar = () => {
      host?.remove();
      host = null;
      shadow = null;
    };

    const injectBar = () => {
      if (host && document.contains(host)) return; // already injected

      let anchor: Element | null = null;
      for (const sel of BAR_ANCHOR_SELECTORS) {
        anchor = document.querySelector(sel);
        if (anchor) break;
      }
      if (!anchor) return;

      host = document.createElement('div');
      host.id = HOST_ID;
      shadow = host.attachShadow({ mode: 'open' });

      const styleEl = document.createElement('style');
      styleEl.textContent = BAR_CSS;
      shadow.appendChild(styleEl);

      const barEl = document.createElement('div');
      barEl.innerHTML = BAR_HTML;
      shadow.appendChild(barEl);

      anchor.parentElement?.insertBefore(host, anchor);

      wireBar(shadow);
      applyFilters();
    };

    // ── Navigation wiring ───────────────────────────────────────────────────

    unsubs.push(
      ctx.navigation.onNavigate((url) => {
        const path = new URL(url).pathname;
        if (path === HISTORY_PATH) {
          injectBar();
        } else {
          // Left history page — hide bar and restore all hidden cards
          removeBar();
          unhideAllCards(FEATURE_ID);
        }
      }),
    );

    // Re-apply filters when new history entries lazy-load on scroll
    unsubs.push(
      ctx.observer.onChange(() => {
        if (!isHistoryPage()) return;
        // Re-inject bar if YouTube re-rendered the container
        injectBar();
        applyFilters();
      }),
    );

    // Initial injection — user may already be on history page
    if (isHistoryPage()) injectBar();

    // ── Teardown ────────────────────────────────────────────────────────────
    return () => {
      unsubs.forEach((off) => off());
      removeBar();
      unhideAllCards(FEATURE_ID);
    };
  },
};

export default feature;
