/**
 * Video cards across YouTube's surfaces, plus the feed chip row that
 * channel-groups and feed-filters share. All card selectors live here so a
 * YouTube redesign is a one-file fix.
 *
 * Card shapes (checked against the live site, 2026-10):
 *  - Home / channel Videos tab: `ytd-rich-item-renderer` wrapping a
 *    `yt-lockup-view-model` (older builds: `ytd-rich-grid-media`).
 *  - Search: `ytd-video-renderer`.
 *  - Watch sidebar / channel shelves: a bare `yt-lockup-view-model`
 *    (older builds: `ytd-compact-video-renderer`, `ytd-grid-video-renderer`).
 *
 * Multi-feature hiding: a card can be hidden by several features at once.
 * `data-yt-pro-hidden-by` holds the space-separated set of feature ids;
 * `display:none` is cleared only when the set is empty.
 */

import { channelIdFromHref } from './video';
import { createHost } from './ui';

const CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model:not(ytd-rich-item-renderer yt-lockup-view-model)',
].join(', ');

/** Also playlist rows — for reading one video's metadata, not for filtering feeds. */
export const VIDEO_CARD = `${CARD_SELECTOR}, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer`;

/** Tried in order; the first with text wins. */
const TITLE_SELECTORS = ['#video-title', '.ytLockupMetadataViewModelTitle', 'h3'];

/** Any link to a channel; the byline is the first one with text (the avatar link has none). */
const CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]';

/** Lockup metadata rows: [channel, views · age] when the card names its channel. */
const LOCKUP_ROWS = '.ytContentMetadataViewModelMetadataRow';

/** Thumbnail badges (new badge-shape, old overlay); the one that parses as a time is the length. */
const BADGE_SELECTORS = '.ytBadgeShapeText, ytd-thumbnail-overlay-time-status-renderer #text, #time-status #text';
const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;

/** Resume bar on a thumbnail = the signed-in user has watched (some of) it. */
const WATCHED = 'ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model';

const HIDDEN_BY_ATTR = 'data-yt-pro-hidden-by';

export function enumerateVideoCards(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
}

export function cardTitle(card: HTMLElement): string {
  for (const sel of TITLE_SELECTORS) {
    const text = card.querySelector(sel)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

/**
 * The card's channel. `id` is null when the card doesn't link its channel
 * (watch-sidebar lockups); `name` may still be set from the byline text.
 */
export function cardChannel(card: HTMLElement): { id: string | null; name: string } {
  let id: string | null = null;
  for (const a of card.querySelectorAll<HTMLAnchorElement>(CHANNEL_LINK)) {
    const linkId = channelIdFromHref(a.getAttribute('href'));
    const name = a.textContent?.trim() ?? '';
    if (name) return { id: linkId ?? id, name };
    id ??= linkId;
  }
  // Lockups that name their channel without linking it: the first of two metadata rows.
  // Playlist-panel rows: a plain-text #byline.
  const rows = card.querySelectorAll(LOCKUP_ROWS);
  const name = (rows.length >= 2 ? rows[0] : card.querySelector('#byline'))?.textContent?.trim() ?? '';
  return { id, name };
}

/** Length in seconds; null for Shorts, live, premieres or no badge (leave those visible). */
export function cardDurationSeconds(card: HTMLElement): number | null {
  if (card.querySelector('a[href^="/shorts/"]')) return null;
  for (const el of card.querySelectorAll(BADGE_SELECTORS)) {
    const m = TIME.exec(el.textContent?.trim() ?? '');
    if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

export function cardWatched(card: HTMLElement): boolean {
  return card.querySelector(WATCHED) !== null;
}

// ─── Hover preview: one ytd-video-preview overlay YouTube moves onto the hovered card ───

/** The preview's mute / CC button stack, and the classes that style its round buttons. */
export const PREVIEW_BUTTONS = '.ytInlinePlayerControlsTopRightControls';
export const PREVIEW_BUTTON_CLASS = 'ytInlinePlayerControlsTopRightControlsCircleButton';
export const PREVIEW_ICON_CLASS = 'ytInlinePlayerControlsButtonIcon';

const VIDEO_LINK = 'a[href*="/watch?"], a[href*="/shorts/"]';

/** Id of the video the hover preview around `el` is playing (read on use: the overlay is reused). */
export function previewVideoId(el: Element): string | null {
  const a = el.closest(`ytd-video-preview, ${CARD_SELECTOR}`)?.querySelector<HTMLAnchorElement>(VIDEO_LINK);
  const url = URL.parse(a?.href ?? '');
  const id = url?.searchParams.get('v') ?? url?.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function hiddenBy(card: HTMLElement): Set<string> {
  return new Set((card.getAttribute(HIDDEN_BY_ATTR) ?? '').split(' ').filter(Boolean));
}

// Hiding sets attributes only, which the shared (childList) observer doesn't
// see — so counts that depend on another feature's hiding listen here.
const cardListeners = new Set<() => void>();
let notifyQueued = false;
function cardsChanged(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    cardListeners.forEach((cb) => cb());
  });
}

/** `cb` runs (batched) after any feature hid or revealed a card. Don't hide/unhide from it. */
export function onCardsChanged(cb: () => void): () => void {
  cardListeners.add(cb);
  return () => cardListeners.delete(cb);
}

export function hideCard(card: HTMLElement, featureId: string): void {
  const ids = hiddenBy(card);
  if (ids.has(featureId)) return;
  ids.add(featureId);
  card.setAttribute(HIDDEN_BY_ATTR, [...ids].join(' '));
  card.style.display = 'none';
  cardsChanged();
}

export function unhideCard(card: HTMLElement, featureId: string): void {
  const ids = hiddenBy(card);
  if (!ids.delete(featureId)) return;
  if (ids.size) {
    card.setAttribute(HIDDEN_BY_ATTR, [...ids].join(' '));
  } else {
    card.removeAttribute(HIDDEN_BY_ATTR);
    card.style.display = '';
  }
  cardsChanged();
}

/** Hidden by some feature other than `featureId`. */
export function hiddenByOther(card: HTMLElement, featureId: string): boolean {
  const ids = hiddenBy(card);
  ids.delete(featureId);
  return ids.size > 0;
}

export function isCardHidden(card: HTMLElement): boolean {
  return card.hasAttribute(HIDDEN_BY_ATTR);
}

export function unhideAllCards(featureId: string): void {
  document
    .querySelectorAll<HTMLElement>(`[${HIDDEN_BY_ATTR}~="${featureId}"]`)
    .forEach((card) => unhideCard(card, featureId));
}

// ─── Feed chip row (shared by channel-groups and feed-filters) ───────────────

/** Feed routes that get the chip row → their `ytd-browse` page-subtype. */
const FEEDS: Record<string, string> = { '/': 'home', '/feed/subscriptions': 'subscriptions' };

/** YouTube's own chip bar (new view-model, older Polymer renderer). */
const YT_CHIP_BAR = 'chip-bar-view-model, ytd-feed-filter-chip-bar-renderer';

/** The Home / Subscriptions page element, or null on any other route. */
export function currentFeed(): HTMLElement | null {
  const subtype = FEEDS[location.pathname];
  return subtype ? document.querySelector(`ytd-browse[page-subtype="${subtype}"]`) : null;
}

export type FeedBarPart = 'groups' | 'filters';

const BAR_ID = 'ytp-feed-bar';
const BAR_CSS = `
  :host { display: block; width: 100%; } /* the grid is a centered flex column */
  .row { display: flex; align-items: flex-start; gap: 12px; }
  .row:has(> :not([hidden])) { padding: 12px 0; }
  [data-part="groups"] { flex: 1 1 auto; min-width: 0; }
  [data-part="filters"] { order: 1; flex: none; margin-left: auto; }
`;

let bar: { host: HTMLElement; row: HTMLElement } | null = null;
/** YouTube's chip bar we hid to put the group switcher in its slot. */
let hiddenChipBar: HTMLElement | null = null;

function restoreChipBar(): void {
  if (hiddenChipBar) hiddenChipBar.style.display = '';
  hiddenChipBar = null;
}

/**
 * The element `part` renders into, inside the feed's chip-bar slot: the
 * group switcher replaces YouTube's chip bar (one row, as on the boards);
 * without a chip bar (Subscriptions) the row sits right above the grid.
 * Null off Home/Subscriptions or before the grid renders. Idempotent and
 * cheap — call it on every DOM change; it re-inserts the row if YouTube
 * re-rendered the slot. Set `hidden` on the part while it has nothing to show.
 */
export function feedBarPart(part: FeedBarPart): HTMLElement | null {
  const feed = currentFeed();
  const grid = feed?.querySelector('ytd-rich-grid-renderer');
  const chips = feed?.querySelector<HTMLElement>(YT_CHIP_BAR) ?? null;
  const anchor = chips ?? grid?.querySelector(':scope > #contents');
  if (!anchor?.parentElement) return null;

  if (!bar) {
    const { host, root } = createHost(BAR_ID, BAR_CSS);
    const row = document.createElement('div');
    row.className = 'row';
    root.append(row);
    bar = { host, row };
  }
  if (bar.host.nextElementSibling !== anchor) anchor.before(bar.host);

  let el = bar.row.querySelector<HTMLElement>(`:scope > [data-part="${part}"]`);
  if (!el) {
    el = document.createElement('div');
    el.dataset.part = part;
    bar.row.append(el);
  }

  const replaceChips = !!chips && !!bar.row.querySelector(':scope > [data-part="groups"]');
  if (hiddenChipBar !== (replaceChips ? chips : null)) {
    restoreChipBar();
    if (replaceChips && chips) {
      chips.style.display = 'none';
      hiddenChipBar = chips;
    }
  }
  return el;
}

/** Removes `part`; the row goes away with its last part. Caller unmounts its UI first. */
export function dropFeedBarPart(part: FeedBarPart): void {
  if (!bar) return;
  bar.row.querySelector(`:scope > [data-part="${part}"]`)?.remove();
  if (part === 'groups') restoreChipBar();
  if (!bar.row.children.length) {
    bar.host.remove();
    bar = null;
  }
}
