import type { Feature } from '../lib/features';
import { getVideoId, isWatchPage } from '../lib/yt/video';
import { enumerateVideoCards, cardDurationSeconds } from '../lib/yt/feed-cards';

/**
 * reading-time
 *
 * Converts video duration into a "reading-time equivalent" so viewers can
 * quickly gauge cognitive effort relative to a text article.
 *
 * Formula: readingMins ≈ videoDurationSecs × (130 / 250 / 60)
 *   • 130 wpm  — average spoken word rate
 *   • 250 wpm  — average silent reading rate
 *   Ratio: 130/250 = 0.52 → reader absorbs the same content in ~52% of the time.
 *
 * Two injection points:
 *   1. Watch page — badge near the video title.
 *   2. Feed / search / sidebar cards — badge overlaid on the duration chip.
 *
 * No external API. No FeatureConfig. Pure client-side.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Ratio of spoken wpm to reading wpm. */
const SPOKEN_TO_READING_RATIO = 130 / 250;

/** Attribute stamped on processed feed cards to avoid re-processing. */
const PROCESSED_ATTR = 'data-yt-pro-readtime';

/** Id of the watch-page badge element. */
const WATCH_BADGE_ID = 'yt-pro-readtime-watch';

/** Class applied to per-card reading-time badges (for bulk teardown). */
const CARD_BADGE_CLASS = 'yt-pro-readtime-card';

/**
 * Selectors for the watch-page metadata anchor.
 * Tried in order; first match wins.
 */
const WATCH_META_SELECTORS = [
  'h1.ytd-watch-metadata',
  'ytd-watch-metadata h1',
  '#above-the-fold #title h1',
  'ytd-watch-metadata #title',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a duration in seconds to a rounded "reading minutes" value.
 */
function readingMins(durationSecs: number): number {
  return Math.max(1, Math.round(durationSecs * SPOKEN_TO_READING_RATIO / 60));
}

/** Format badge label. */
function label(mins: number): string {
  return `≈ ${mins} min read`;
}

/**
 * Attempts to read the video duration from the native `<video>` element.
 * Returns null if the video is not loaded or duration is not finite.
 */
function getPlayerDuration(): number | null {
  const v = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!v || !isFinite(v.duration) || v.duration <= 0) return null;
  return v.duration;
}

/**
 * Creates and styles a reading-time badge element.
 *
 * @param text  The label text (e.g. "≈ 12 min read").
 * @param small Whether to render a compact version for feed cards.
 */
function createBadge(text: string, small: boolean): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: small ? '11px' : '13px',
    fontFamily: 'system-ui, sans-serif',
    color: small
      ? 'rgba(255,255,255,0.9)'
      : 'var(--yt-spec-text-secondary, #606060)',
    background: small ? 'rgba(0,0,0,0.72)' : 'transparent',
    borderRadius: small ? '3px' : '0',
    padding: small ? '1px 4px' : '0',
    marginLeft: small ? '0' : '6px',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    lineHeight: '1.4',
  } as CSSStyleDeclaration);
  return el;
}

// ── Watch-page badge ─────────────────────────────────────────────────────────

function injectWatchBadge(): void {
  if (document.getElementById(WATCH_BADGE_ID)) return; // already present

  const duration = getPlayerDuration();
  if (!duration) return; // player not ready

  let anchor: HTMLElement | null = null;
  for (const sel of WATCH_META_SELECTORS) {
    anchor = document.querySelector<HTMLElement>(sel);
    if (anchor) break;
  }
  if (!anchor) return;

  const badge = createBadge(label(readingMins(duration)), false);
  badge.id = WATCH_BADGE_ID;
  anchor.insertAdjacentElement('afterend', badge);
}

function removeWatchBadge(): void {
  document.getElementById(WATCH_BADGE_ID)?.remove();
}

// ── Feed-card badges ─────────────────────────────────────────────────────────

/**
 * Processes all unprocessed feed cards. Skips cards that:
 *  - have already been processed (PROCESSED_ATTR present)
 *  - have no parseable duration (live, upcoming, shorts, etc.)
 */
function processCards(): void {
  for (const card of enumerateVideoCards()) {
    if (card.hasAttribute(PROCESSED_ATTR)) continue;

    const secs = cardDurationSeconds(card);
    if (secs === null || secs <= 0) {
      // Mark as processed so we don't keep checking on every mutation.
      card.setAttribute(PROCESSED_ATTR, 'skip');
      continue;
    }

    card.setAttribute(PROCESSED_ATTR, '1');

    const badge = createBadge(label(readingMins(secs)), true);
    badge.classList.add(CARD_BADGE_CLASS);

    // Find the duration chip element to anchor the badge.
    const durationChip = card.querySelector<HTMLElement>(
      'ytd-thumbnail-overlay-time-status-renderer, #time-status',
    );
    if (durationChip) {
      // Stack our badge below the duration chip inside the thumbnail area.
      Object.assign(badge.style, {
        position: 'absolute',
        bottom: '2px',
        right: '2px',
      });
      const parent = durationChip.parentElement;
      if (parent) {
        const pos = window.getComputedStyle(parent).position;
        if (pos === 'static') parent.style.position = 'relative';
        parent.appendChild(badge);
      } else {
        durationChip.insertAdjacentElement('afterend', badge);
      }
    } else {
      // Fallback: append to the card's thumbnail wrapper if chip not found.
      const thumb = card.querySelector<HTMLElement>('#thumbnail, ytd-thumbnail');
      if (thumb) {
        Object.assign(badge.style, { position: 'absolute', bottom: '2px', right: '2px' });
        const pos = window.getComputedStyle(thumb).position;
        if (pos === 'static') thumb.style.position = 'relative';
        thumb.appendChild(badge);
      }
    }
  }
}

function removeAllCardBadges(): void {
  document.querySelectorAll<HTMLElement>(`[${PROCESSED_ATTR}]`).forEach((card) => {
    card.removeAttribute(PROCESSED_ATTR);
  });
  document.querySelectorAll<HTMLElement>(`.${CARD_BADGE_CLASS}`).forEach((el) => el.remove());
}

// ── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'reading-time',

  setup(ctx) {
    // Initial pass.
    if (isWatchPage()) injectWatchBadge();
    processCards();

    // Re-apply on SPA navigation.
    const offNav = ctx.navigation.onNavigate(() => {
      removeWatchBadge();
      // Cards on the new page are new elements — no stale PROCESSED_ATTR to clear.
      if (isWatchPage()) {
        // Watch page: try immediately, then rely on observer for player ready.
        injectWatchBadge();
      }
      processCards();
    });

    // Re-apply on DOM mutations (new cards loaded, YouTube re-render).
    const offObs = ctx.observer.onChange(() => {
      if (isWatchPage() && !document.getElementById(WATCH_BADGE_ID)) {
        injectWatchBadge();
      }
      processCards();
    });

    return () => {
      offNav();
      offObs();
      removeWatchBadge();
      removeAllCardBadges();
    };
  },
};

export default feature;
