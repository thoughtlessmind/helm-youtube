/**
 * feed-cards.ts
 *
 * Shared helpers for enumerating and manipulating YouTube video cards
 * across the home feed (ytd-rich-item-renderer), search results
 * (ytd-video-renderer), watch-page sidebar (ytd-compact-video-renderer),
 * and grid pages (ytd-grid-video-renderer).
 *
 * Multi-feature hide coordination
 * ────────────────────────────────
 * A card can be hidden by MULTIPLE features simultaneously (e.g. "block-by-length"
 * AND "block-keywords"). We track which features have hidden a card via the
 * attribute  data-yt-pro-hidden-by  (space-separated feature-id set).
 *
 * hideCard(card, featureId)  — adds featureId to the set; sets display:none
 * unhideCard(card, featureId) — removes featureId; clears display only when set is empty
 *
 * On feature teardown, iterate querySelectorAll('[data-yt-pro-hidden-by~="<id>"]')
 * and call unhideCard(card, id) on each to fully restore visibility.
 */

import { channelIdFromHref } from './video';

// ─── Selectors ───────────────────────────────────────────────────────────────

/** All four renderer types that represent a video card. */
const CARD_SELECTOR =
  'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';

/** Selectors tried in order for the video title text. */
const TITLE_SELECTORS = [
  '#video-title-link',
  '#video-title',
  'yt-formatted-string#video-title',
  'a#video-title',
  '.title',
];

/** Selectors tried in order for the channel byline anchor. */
const CHANNEL_LINK_SELECTORS = [
  'ytd-channel-name a',
  '#channel-name a',
  '.ytd-channel-name a',
  'yt-formatted-string.ytd-channel-name',
];

/**
 * Selectors for the thumbnail duration badge.
 * YouTube uses multiple overlay renderers depending on the surface.
 */
const DURATION_SELECTORS = [
  'ytd-thumbnail-overlay-time-status-renderer #text',
  'ytd-thumbnail-overlay-time-status-renderer span#text',
  '#time-status',
  'ytd-thumbnail-overlay-time-status-renderer',
  '.ytd-thumbnail-overlay-time-status-renderer',
];

/** Attribute used to coordinate multi-feature card hiding. */
const HIDDEN_BY_ATTR = 'data-yt-pro-hidden-by';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns every video card currently in the document across all supported
 * surfaces. Cheap — single querySelectorAll call.
 */
export function enumerateVideoCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
}

/**
 * Returns the display title of a video card.
 * Falls back to empty string if title cannot be located.
 */
export function cardTitle(card: HTMLElement): string {
  for (const sel of TITLE_SELECTORS) {
    const el = card.querySelector(sel);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }
  return '';
}

/**
 * Returns the channel identity from the byline of a video card.
 * `id` is null when the href cannot be parsed (e.g. not yet rendered).
 */
export function cardChannel(card: HTMLElement): { id: string | null; name: string } {
  for (const sel of CHANNEL_LINK_SELECTORS) {
    const el = card.querySelector<HTMLAnchorElement>(sel);
    if (!el) continue;
    const name = el.textContent?.trim() ?? '';
    const id = channelIdFromHref(el.getAttribute('href'));
    if (name || id) {
      return { id, name };
    }
  }
  return { id: null, name: '' };
}

/**
 * Parses the thumbnail time badge and returns duration in seconds.
 *
 * Returns `null` (leave visible) when:
 *  - No badge exists
 *  - Badge text is "LIVE", "PREMIERES", "UPCOMING", or similar non-duration text
 *  - The card links to a /shorts/ URL
 *  - The badge text cannot be parsed as a time
 *
 * Supported formats: `m:ss`, `mm:ss`, `h:mm:ss`, `hh:mm:ss`
 */
export function cardDurationSeconds(card: HTMLElement): number | null {
  // Shorts are identified by their thumbnail href — skip duration parsing entirely.
  const thumbLink = card.querySelector<HTMLAnchorElement>('a#thumbnail, a.ytd-thumbnail');
  if (thumbLink?.href && thumbLink.href.includes('/shorts/')) return null;

  for (const sel of DURATION_SELECTORS) {
    const el = card.querySelector<HTMLElement>(sel);
    if (!el) continue;

    // Check aria-label first (more reliable than text content which may include icons)
    const raw = (el.getAttribute('aria-label') || el.textContent || '').trim().toUpperCase();

    if (!raw) continue;

    // Non-duration badges — leave card visible
    if (
      raw === 'LIVE' ||
      raw.startsWith('LIVE') ||
      raw === 'PREMIERES' ||
      raw.startsWith('PREMIERES') ||
      raw === 'UPCOMING' ||
      raw.startsWith('UPCOMING') ||
      raw === 'NEW' ||
      raw === 'SHORTS'
    ) {
      return null;
    }

    // Parse hh:mm:ss / h:mm:ss / mm:ss / m:ss
    const timeRaw = (el.textContent || '').trim();
    const parts = timeRaw.split(':').map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) continue;

    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    }
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + s;
    }
  }

  return null;
}

/**
 * Marks a card as hidden by `featureId` and sets `display:none`.
 * Safe to call multiple times from different features — each feature id
 * is stored independently so unhiding by one feature doesn't reveal a
 * card hidden by another.
 *
 * @param card      The video card element to hide.
 * @param featureId The calling feature's id string (e.g. `'block-keywords'`).
 */
export function hideCard(card: HTMLElement, featureId: string): void {
  const existing = card.getAttribute(HIDDEN_BY_ATTR) ?? '';
  const ids = new Set(existing ? existing.split(' ') : []);
  ids.add(featureId);
  card.setAttribute(HIDDEN_BY_ATTR, Array.from(ids).join(' '));
  (card as HTMLElement & { style: CSSStyleDeclaration }).style.display = 'none';
}

/**
 * Removes `featureId` from the card's hidden-by set.
 * Only clears `display:none` when no other feature is still hiding the card.
 *
 * @param card      The video card element to (potentially) unhide.
 * @param featureId The calling feature's id string.
 */
export function unhideCard(card: HTMLElement, featureId: string): void {
  const existing = card.getAttribute(HIDDEN_BY_ATTR) ?? '';
  const ids = new Set(existing ? existing.split(' ') : []);
  ids.delete(featureId);

  if (ids.size === 0) {
    card.removeAttribute(HIDDEN_BY_ATTR);
    card.style.display = '';
  } else {
    card.setAttribute(HIDDEN_BY_ATTR, Array.from(ids).join(' '));
  }
}

/**
 * Restores all cards that were hidden by `featureId` — call on teardown.
 * Unhides each card via `unhideCard` so multi-feature hiding is respected.
 *
 * @param featureId The feature id to clean up for.
 */
export function unhideAllCards(featureId: string): void {
  const selector = `[${HIDDEN_BY_ATTR}~="${featureId}"]`;
  document.querySelectorAll<HTMLElement>(selector).forEach((card) => {
    unhideCard(card, featureId);
  });
}
