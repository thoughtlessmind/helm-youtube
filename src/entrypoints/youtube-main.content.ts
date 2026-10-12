/**
 * Main-world helper for the Global queue. Polymer/lockup data (`.data`, `componentProps`) and
 * YouTube's own `yt-navigate` handler are only reachable from the page's JS world, so this tiny
 * script does two things and talks to the isolated world over `window.postMessage`:
 *  a) ⋮ → "Add to queue": while <html data-ytp-native-add="1"> (set by read-later-queue), the
 *     click is swallowed and `{ source: 'ytp', type: 'queue-add', videoId }` posted instead.
 *     Matching is locale-independent (icon / command data, never menu text); anything that
 *     doesn't match runs YouTube's native behaviour untouched.
 *  b) `{ source: 'ytp', type: 'navigate', videoId }` → SPA navigation to that video.
 * No extension APIs here (main world has none).
 */
const VIDEO_ID = /^[\w-]{11}$/;
const QUEUE_LIST = 'PLAYLIST_EDIT_LIST_TYPE_QUEUE';
const QUEUE_ICON = 'ADD_TO_QUEUE_TAIL';

type Json = any; // YouTube's internal renderer data — untyped by nature.

const queueCommand = (endpoint: Json) =>
  endpoint?.signalServiceEndpoint?.actions?.find((a: Json) => a?.addToPlaylistCommand)?.addToPlaylistCommand;

/** The video id when `target` is an "Add to queue" menu item, else null. */
function queuedVideoId(target: Element): string | null {
  let cmd: Json;
  let icon: string | undefined;

  // Classic menus (search results, channel pages): Polymer `.data` on the item.
  const item = target.closest('ytd-menu-service-item-renderer') as Json;
  if (item) {
    cmd = queueCommand(item.data?.serviceEndpoint);
    icon = item.data?.icon?.iconType;
  } else {
    // Lockup menus (watch sidebar, new home cards): the sheet holds the item list; the
    // clicked row's index among the list's children is its index in that data.
    const row = target.closest('yt-list-item-view-model');
    const list = row?.closest('yt-list-view-model');
    const sheet = row?.closest('yt-sheet-view-model') as Json;
    if (!row || !list || !sheet) return null;
    const raw = sheet.componentProps?.data;
    const items = (typeof raw === 'function' ? raw() : raw)?.content?.listViewModel?.listItems;
    const kids = [...list.children];
    if (!Array.isArray(items) || items.length !== kids.length) return null;
    const vm = items[kids.findIndex((k) => k.contains(row))]?.listItemViewModel;
    cmd = queueCommand(vm?.rendererContext?.commandContext?.onTap?.innertubeCommand);
    icon = vm?.leadingImage?.sources?.[0]?.clientResource?.imageName;
  }

  const isQueue = cmd?.listType === QUEUE_LIST || icon === QUEUE_ICON;
  return isQueue && typeof cmd?.videoId === 'string' && VIDEO_ID.test(cmd.videoId) ? cmd.videoId : null;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  globalName: false,
  main() {
    const html = document.documentElement;
    // Tells the isolated world SPA navigation is available (else it falls back to a reload).
    html.dataset.ytpMain = '1';

    const onActivate = (e: Event) => {
      if (html.dataset.ytpNativeAdd !== '1') return;
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
      if (!(e.target instanceof Element)) return;
      let videoId: string | null = null;
      try {
        videoId = queuedVideoId(e.target);
      } catch {
        // YouTube changed its data shape — let the native action run.
      }
      if (!videoId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      (e.target.closest('tp-yt-iron-dropdown') as Json)?.close?.();
      window.postMessage({ source: 'ytp', type: 'queue-add', videoId }, location.origin);
    };
    // Capture on window runs before every YouTube listener (they sit on the items / document).
    window.addEventListener('click', onActivate, true);
    window.addEventListener('keydown', onActivate, true);

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window || e.origin !== location.origin) return;
      if (d?.source !== 'ytp' || d.type !== 'navigate') return;
      if (typeof d.videoId !== 'string' || !VIDEO_ID.test(d.videoId)) return;
      const url = `/watch?v=${d.videoId}`;
      const app = document.querySelector('ytd-app');
      if (!app) {
        location.assign(url);
        return;
      }
      // Same event YouTube's own links fire; ytd-app handles it as an in-app navigation.
      app.dispatchEvent(
        new CustomEvent('yt-navigate', {
          bubbles: true,
          composed: true,
          detail: {
            endpoint: {
              commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
              watchEndpoint: { videoId: d.videoId },
            },
          },
        }),
      );
    });
  },
});
