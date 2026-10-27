/**
 * Identity helpers for "what am I looking at right now" — the current
 * watch-page video and the channel that owns it. Centralized so features
 * (per-channel speed, video notes, etc.) agree on how a video and a
 * channel are identified, and so a YouTube redesign is a one-file fix.
 */

export interface ChannelRef {
  /** Stable channel key: the `UC…` id when available, else the `@handle`. */
  id: string;
  /** Human-readable channel name (may be empty if not yet rendered). */
  name: string;
}

/** True when the current route is a video watch page. */
export function isWatchPage(): boolean {
  return location.pathname === '/watch';
}

/** The `?v=` id of the current watch page, or null when not on one. */
export function getVideoId(): string | null {
  if (!isWatchPage()) return null;
  return new URLSearchParams(location.search).get('v');
}

/**
 * Normalize a channel URL/path into a stable id. YouTube links a channel
 * as `/channel/UC…`, `/@handle`, `/c/Name`, or `/user/Name`; we prefer the
 * `UC…` id, falling back to the handle/name segment.
 */
export function channelIdFromHref(href: string | null | undefined): string | null {
  const path = URL.parse(href ?? '', 'https://www.youtube.com')?.pathname ?? '';
  const m = path.match(/\/channel\/(UC[\w-]+)/) ?? path.match(/\/(@[^/?#]+)/) ?? path.match(/\/(?:c|user)\/([\w.-]+)/);
  try {
    // Non-ASCII handles arrive percent-encoded (/@%E3%81%82…).
    return m && decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

const WATCH_OWNER_LINK_SELECTORS = [
  'ytd-watch-metadata ytd-channel-name a',
  'ytd-watch-metadata #owner #channel-name a',
  'ytd-video-owner-renderer a.yt-simple-endpoint',
  '#owner ytd-channel-name a',
];

/**
 * The channel that owns the currently-playing video. Returns null until
 * the watch metadata has rendered — callers that need it should re-check
 * on `ctx.observer.onChange` / `ctx.navigation.onNavigate`.
 */
export function getWatchChannel(): ChannelRef | null {
  if (!isWatchPage()) return null;
  for (const sel of WATCH_OWNER_LINK_SELECTORS) {
    const a = document.querySelector<HTMLAnchorElement>(sel);
    if (!a) continue;
    const id = channelIdFromHref(a.getAttribute('href'));
    if (!id) continue;
    return { id, name: a.textContent?.trim() ?? '' };
  }
  return null;
}
