/**
 * Feed filters: hide video cards by title keyword, by length, and already
 * watched ones — on every surface with video cards.
 *
 * - Each hidden card carries its reason in `data-ytp-filtered` and is hidden
 *   through the shared feed-cards coordinator (channel-groups hides cards too).
 * - Cards with no parseable length (live, Shorts, premieres) pass the length filter.
 * - On Home / Subscriptions the feed chip row gets an "N hidden by filters"
 *   toggle: it shows the hidden cards dimmed with their reason for this
 *   visit; navigating away hides them again.
 */

import type { Feature } from '../lib/features';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';
import {
  cardDurationSeconds,
  cardTitle,
  cardWatched,
  currentFeed,
  dropFeedBarPart,
  enumerateVideoCards,
  feedBarPart,
  feedGrid,
  hiddenByOther,
  hideCard,
  onCardsChanged,
  unhideAllCards,
  unhideCard,
} from '../lib/yt/feed-cards';
import { addStyle } from '../lib/yt/ui';

const ID = 'feed-filters';
const REASON = 'data-ytp-filtered';

const EYE_OFF =
  '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.16 3.19"/><path d="M6.6 6.6C3.6 8.6 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>';
const EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const svg = (paths: string, attrs = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${paths}</svg>`;

/** Revealed cards (toggle on): dimmed, with a "Hidden · reason" badge on the thumbnail. */
const PAGE_CSS = `
[${REASON}]:not([data-helm-hidden-by]) { position: relative; }
[${REASON}]:not([data-helm-hidden-by]) > * { opacity: .4; }
[${REASON}]:not([data-helm-hidden-by])::before {
  content: "Hidden · " attr(${REASON});
  position: absolute; z-index: 1; top: 8px; left: 8px;
  padding: 2px 8px 2px 24px; border-radius: 4px;
  background: rgba(0,0,0,.8) url("data:image/svg+xml,${encodeURIComponent(svg(EYE_OFF, 'xmlns="http://www.w3.org/2000/svg" stroke="white"').replace('stroke="currentColor" ', ''))}") no-repeat 7px 50% / 13px;
  color: #fff; font: 500 12px/17px Roboto, Arial, sans-serif; pointer-events: none;
}`;

const TOGGLE_CSS = `
.toggle { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 11px 0 9px;
  border: 0; border-radius: 16px; margin: 0; background: none; font: inherit; font-size: 14px; font-weight: 500;
  white-space: nowrap; color: var(--yt-sys-color-baseline--text-secondary); cursor: pointer;
  transition: background-color .1s, color .1s; }
.toggle:hover { background: var(--yt-sys-color-baseline--additive-background); color: var(--yt-sys-color-baseline--text-primary); }
.toggle svg { width: 20px; height: 20px; flex: none; }`;

const feature: Feature = {

  async setup(ctx) {
    let keywords: string[] = [];
    let minSec = 0;
    let maxSec = 0;
    let hideWatched = false;
    /** "Show hidden" for this visit of the feed; reset on navigation. */
    let reveal = false;
    let toggle: HTMLButtonElement | null = null;

    const pageStyle = addStyle(PAGE_CSS);

    /** Why the card is filtered (board copy), or null to keep it. */
    const reason = (card: HTMLElement): string | null => {
      if (keywords.length) {
        const title = cardTitle(card).toLowerCase();
        const kw = keywords.find((k) => title.includes(k));
        if (kw) return `keyword “${kw}”`;
      }
      if (minSec || maxSec) {
        const dur = cardDurationSeconds(card);
        if (dur !== null && maxSec && dur > maxSec) return `over ${maxSec / 60} min`;
        if (dur !== null && minSec && dur < minSec) return `under ${minSec / 60} min`;
      }
      if (hideWatched && cardWatched(card)) return 'watched';
      return null;
    };

    const renderToggle = () => {
      const part = feedBarPart('filters');
      if (!part) return;
      if (!toggle || !part.contains(toggle)) {
        part.innerHTML = `<style>${TOGGLE_CSS}</style><button class="toggle" type="button"></button>`;
        toggle = part.querySelector('button')!;
        toggle.addEventListener('click', () => {
          reveal = !reveal;
          filterAll();
        });
      }
      const feed = currentFeed();
      const n = feed
        ? [...feed.querySelectorAll<HTMLElement>(`[${REASON}]`)].filter((c) => !hiddenByOther(c, ID)).length
        : 0;
      part.hidden = n === 0 || !feedGrid()?.checkVisibility(); // a group feed or the calm home stands in for it
      const label = reveal ? `Hide filtered (${n})` : `${n} hidden by filter${n === 1 ? '' : 's'}`;
      if (toggle.textContent === label) return;
      toggle.innerHTML = `${svg(reveal ? EYE : EYE_OFF)}<span>${label}</span>`;
      toggle.setAttribute('aria-pressed', String(reveal));
    };

    function filterAll() {
      for (const card of enumerateVideoCards()) {
        const why = reason(card);
        if (why) card.setAttribute(REASON, why);
        else card.removeAttribute(REASON);
        if (why && !reveal) hideCard(card, ID);
        else unhideCard(card, ID);
      }
      renderToggle();
    }

    const apply = (cfg: FeatureConfig['feed-filters']) => {
      keywords = cfg.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      minSec = Math.max(0, cfg.minMinutes) * 60;
      maxSec = Math.max(0, cfg.maxMinutes) * 60;
      hideWatched = cfg.hideWatched;
      filterAll();
    };

    apply(await getConfig('feed-filters'));
    const unsubs = [
      watchConfig('feed-filters', apply),
      ctx.observer.onChange(filterAll),
      onCardsChanged(renderToggle), // channel-groups hiding changes the count
      ctx.navigation.onNavigate(() => {
        reveal = false;
        filterAll();
      }),
    ];

    return () => {
      unsubs.forEach((off) => off());
      unhideAllCards(ID);
      document.querySelectorAll(`[${REASON}]`).forEach((c) => c.removeAttribute(REASON));
      pageStyle.remove();
      dropFeedBarPart('filters');
    };
  },
};

export default feature;
