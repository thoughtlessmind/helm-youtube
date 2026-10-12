/**
 * Helpers scoped to YouTube playlist pages — selectors, data extraction,
 * and per-item menu interaction. Centralised here so a YouTube redesign is
 * a one-file fix.
 *
 * Exported functions are pure utilities; they carry no runtime state.
 */

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/** True when the current page is the Watch Later playlist. */
export function isWatchLaterPage(): boolean {
  return (
    location.pathname === '/playlist' &&
    new URLSearchParams(location.search).get('list') === 'WL'
  );
}

// ---------------------------------------------------------------------------
// Selectors — named constants so redesigns are a one-file fix
// ---------------------------------------------------------------------------

/** The scrollable list of playlist video rows. */
export const PLAYLIST_LIST_SEL = 'ytd-playlist-video-list-renderer';

/** Each individual video row within the list. */
export const PLAYLIST_ITEM_SEL = 'ytd-playlist-video-renderer';

/** Duration badge text inside a playlist item. */
export const DURATION_SEL =
  'ytd-thumbnail-overlay-time-status-renderer #text, ' +
  'ytd-thumbnail-overlay-time-status-renderer span';

/** Channel byline link inside a playlist item. */
export const CHANNEL_LINK_SEL =
  'ytd-channel-name a, #channel-name a, [class*="channel"] a';

/** Video title link inside a playlist item. */
export const TITLE_LINK_SEL =
  '#video-title, a#video-title, [title][class*="title"]';

/** Watch-progress bar — presence means the video has been (partially) watched. */
export const PROGRESS_BAR_SEL =
  'ytd-thumbnail-overlay-resume-playback-renderer, #progress[style*="width"]';

/** The ⋮ (more options) menu button on each row. */
export const ITEM_MENU_BTN_SEL = '#menu yt-icon-button, #menu button';

/** Shared YouTube dropdown that appears when any ⋮ is clicked. */
export const MENU_POPUP_SEL =
  'ytd-menu-popup-renderer, tp-yt-iron-dropdown ytd-menu-popup-renderer';

/** Individual action items inside the popup menu. */
export const MENU_ITEM_SEL =
  'ytd-menu-service-item-renderer, yt-menu-service-item-renderer';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface PlaylistItemData {
  /** The `ytd-playlist-video-renderer` element itself. */
  el: HTMLElement;
  /** Video title. */
  title: string;
  /** Channel display name (may be empty if not rendered). */
  channel: string;
  /** Stable channel id — UC… id or @handle. */
  channelId: string | null;
  /** Absolute URL to the video watch page. */
  url: string;
  /** Human-readable duration string (e.g. "12:34"). Empty string if unavailable. */
  durationText: string;
  /** Duration converted to total seconds. -1 if unparseable. */
  durationSecs: number;
  /**
   * DOM order index (0-based). Used as a proxy for "date added" — Watch Later
   * orders newest at top, so index 0 = most recently added.
   */
  index: number;
  /** True when a watch-progress bar is present (video fully or partially watched). */
  watched: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YouTube duration string ("H:MM:SS" | "MM:SS" | "SS") to total
 * seconds. Returns -1 when the string cannot be parsed.
 */
export function parseDuration(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return -1;
  const parts = cleaned.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return -1;
  if (parts.length === 1) return parts[0]; // bare seconds (rare)
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return -1;
}

/**
 * Normalise a channel href into a stable id. Mirrors the logic in
 * `src/lib/yt/video.ts::channelIdFromHref` so we stay consistent without
 * creating a circular dependency.
 */
function channelIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const path = href.startsWith('http') ? new URL(href).pathname : href;
    const uc = path.match(/\/channel\/(UC[\w-]+)/);
    if (uc) return uc[1];
    const handle = path.match(/\/(@[\w.-]+)/);
    if (handle) return handle[1];
    const named = path.match(/\/(?:c|user)\/([\w.-]+)/);
    if (named) return named[1];
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract structured data from a single `ytd-playlist-video-renderer`
 * element. Only reads the already-rendered DOM — does not trigger lazy-load.
 */
export function readPlaylistItem(el: HTMLElement, index: number): PlaylistItemData {
  const titleEl = el.querySelector<HTMLAnchorElement>(TITLE_LINK_SEL);
  const title = titleEl?.getAttribute('title') ?? titleEl?.textContent?.trim() ?? '';
  const href = titleEl?.getAttribute('href') ?? '';
  const url = href.startsWith('http')
    ? href
    : href
      ? `https://www.youtube.com${href}`
      : '';

  const channelEl = el.querySelector<HTMLAnchorElement>(CHANNEL_LINK_SEL);
  const channel = channelEl?.textContent?.trim() ?? '';
  const channelId = channelIdFromHref(channelEl?.getAttribute('href'));

  const durationEl = el.querySelector<HTMLElement>(DURATION_SEL);
  const durationText = durationEl?.textContent?.trim() ?? '';
  const durationSecs = parseDuration(durationText);

  const watched = !!el.querySelector(PROGRESS_BAR_SEL);

  return { el, title, channel, channelId, url, durationText, durationSecs, index, watched };
}

/**
 * Collect all currently-rendered playlist items from a list container.
 */
export function readAllItems(
  listEl: HTMLElement,
): PlaylistItemData[] {
  const rows = listEl.querySelectorAll<HTMLElement>(PLAYLIST_ITEM_SEL);
  return Array.from(rows).map((el, i) => readPlaylistItem(el, i));
}

// ---------------------------------------------------------------------------
// Menu interaction
// ---------------------------------------------------------------------------

/** Small async delay — kept short to stay responsive. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll for an element matching `sel`, giving up after `timeoutMs`.
 * Identical pattern to save-to-playlist.ts::waitFor.
 */
export function waitForEl<T extends Element>(
  sel: string,
  timeoutMs = 2500,
  root: ParentNode = document,
): Promise<T | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const el = root.querySelector<T>(sel);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Dismiss any open YouTube popup menu by pressing Escape.
 */
export function closeYtMenu(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
}

/**
 * Click the ⋮ menu on a playlist item, find the "Remove" option, and click
 * it. Waits for the popup to render before looking for the action item.
 *
 * Returns `'removed'` on success, `'skipped'` when the menu or action item
 * is not found, `'aborted'` when the caller's AbortSignal fires.
 */
export async function removeItemViaMenu(
  itemEl: HTMLElement,
  signal: AbortSignal,
): Promise<'removed' | 'skipped' | 'aborted'> {
  if (signal.aborted) return 'aborted';

  const menuBtn = itemEl.querySelector<HTMLElement>(ITEM_MENU_BTN_SEL);
  if (!menuBtn) return 'skipped';

  menuBtn.click();

  if (signal.aborted) {
    closeYtMenu();
    return 'aborted';
  }

  // Wait for the popup to appear.
  const popup = await waitForEl<HTMLElement>(MENU_POPUP_SEL, 2500);
  if (!popup) return 'skipped';

  if (signal.aborted) {
    closeYtMenu();
    return 'aborted';
  }

  // Find the "Remove from Watch later" / "Remove from playlist" action.
  const items = popup.querySelectorAll<HTMLElement>(MENU_ITEM_SEL);
  let target: HTMLElement | null = null;
  for (const item of items) {
    const text = item.textContent?.trim().toLowerCase() ?? '';
    if (text.includes('remove')) {
      target = item;
      break;
    }
  }

  if (!target) {
    closeYtMenu();
    return 'skipped';
  }

  target.click();

  // Brief pause so YouTube registers the deletion before we move to the next.
  await delay(350);

  return 'removed';
}
