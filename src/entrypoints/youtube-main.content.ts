/**
 * Main-world helper for the Global queue and channel groups. Polymer/lockup data (`.data`,
 * `componentProps`), `ytcfg` and YouTube's own `yt-navigate` / `yt-action` handlers are only
 * reachable from the page's JS world, so this small script does four things and talks to the
 * isolated world over `window.postMessage` (d: a DOM event and attribute):
 *  a) ⋮ → "Add to queue": while <html data-ytp-native-add="1"> (set by read-later-queue), the
 *     click is swallowed and `{ source: 'ytp', type: 'queue-add', videoId }` posted instead.
 *     Matching is locale-independent (icon / command data, never menu text); anything that
 *     doesn't match runs YouTube's native behaviour untouched.
 *  b) `{ source: 'ytp', type: 'navigate', videoId }` → SPA navigation to that video.
 *  c) `{ source: 'ytp', type: 'group-grid', … }` → a channel group in the feed's own grid
 *     (lib/yt/group-grid.ts); `ytp-shelf-cols` event on document → feed shelves render
 *     <html data-ytp-grid-cols> cards per row (lib/yt/shelf-cols.ts).
 *  d) `ytp-player-video` event on document → the player's own video id and its channel (owner
 *     URL, name) on <html data-ytp-player-video / -owner / -author>, set before dispatchEvent
 *     returns (lib/yt/player.ts: the miniplayer plays videos the URL doesn't name).
 * No extension APIs here (main world has none).
 */
import { installGroupGrid } from '../lib/yt/group-grid';
import { installShelfCols } from '../lib/yt/shelf-cols';

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
  matches: ['https://www.youtube.com/*'],
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

    installGroupGrid();
    installShelfCols();

    document.addEventListener('ytp-player-video', () => {
      const player = document.querySelector('#movie_player') as Json;
      const id = player?.getVideoData?.()?.video_id;
      const ok = typeof id === 'string' && VIDEO_ID.test(id);
      const res = ok && player.getPlayerResponse?.();
      const own = ok && res?.videoDetails?.videoId === id; // the response may still be the previous video's
      html.dataset.ytpPlayerVideo = ok ? id : '';
      html.dataset.ytpPlayerOwner = (own && res.microformat?.playerMicroformatRenderer?.ownerProfileUrl) || '';
      html.dataset.ytpPlayerAuthor = (own && res.videoDetails.author) || '';
    });

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
