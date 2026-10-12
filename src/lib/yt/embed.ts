/**
 * Shared utilities for YouTube IFrame embed players.
 *
 * Provides:
 *  - `parseVideoId(input)` — robust URL/id parser
 *  - `buildEmbedUrl(videoId)` — canonical embed URL with IFrame API enabled
 *  - `iframeCmd(iframe, func, args)` — postMessage command to an embed player
 */

/** 11-character YouTube video ID pattern. */
const VIDEO_ID_RE = /^[\w-]{11}$/;

/**
 * Parse a YouTube video id from any common input form:
 *  - Bare 11-char id (`dQw4w9WgXcQ`)
 *  - Full watch URL (`https://www.youtube.com/watch?v=…`)
 *  - Short URL (`https://youtu.be/…`)
 *  - Embed URL (`https://www.youtube.com/embed/…`)
 *  - Shorts URL (`https://www.youtube.com/shorts/…`)
 *  - Scheme-relative or path-only variants of the above
 *
 * Returns the 11-char id string, or `null` if no valid id could be found.
 */
export function parseVideoId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();

  // Bare 11-char id.
  if (VIDEO_ID_RE.test(s)) return s;

  // Try parsing as URL. Accept scheme-relative by prepending https:.
  let url: URL | null = null;
  try {
    url = new URL(s.startsWith('//') ? `https:${s}` : s);
  } catch {
    // Not a URL — give up.
    return null;
  }

  // ?v= query param (watch URLs).
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;

  // youtu.be/<id>
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    if (VIDEO_ID_RE.test(id)) return id;
  }

  // /embed/<id> or /shorts/<id> path segments.
  const pathMatch = url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/);
  if (pathMatch) return pathMatch[1];

  return null;
}

/**
 * Canonical embed src for an 11-char video id.
 * `enablejsapi=1` is required for postMessage commands.
 * `origin` mirrors the page so YouTube accepts the IFrame API handshake.
 */
export function buildEmbedUrl(videoId: string): string {
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}`;
}

/**
 * Send a YouTube IFrame API command to an embed `<iframe>` via postMessage.
 *
 * Standard payload format:
 *   `{"event":"command","func":"<func>","args":[...]}`
 *
 * Common funcs:
 *  - `"playVideo"`, `"pauseVideo"` — no args
 *  - `"seekTo"` — args: `[seconds, true]`
 *  - `"mute"`, `"unMute"` — no args
 *
 * The target origin is always `https://www.youtube.com`.
 */
export function iframeCmd(
  iframe: HTMLIFrameElement,
  func: string,
  args: unknown[] = [],
): void {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args }),
    'https://www.youtube.com',
  );
}
