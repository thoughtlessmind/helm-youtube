import type { PlayerState, TabMessage } from '../messages';
import { getWatchChannel, isWatchPage } from './video';
import { getVideo, miniplayerText, playerVideoId, watchMetaCurrent } from './player';

/** The watch page's title, or '' while the page still shows the previous video's metadata. */
export const watchTitle = () =>
  !watchMetaCurrent()
    ? ''
    : document.querySelector('ytd-watch-metadata h1')?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, '');

const VIDEO_ID = /^[\w-]{11}$/;

/**
 * Plays `videoId` in this tab: in-app (SPA) navigation through the main-world script
 * (youtube-main.content.ts), or a plain page load if that script isn't there.
 */
export function playInThisTab(videoId: string): void {
  if (!VIDEO_ID.test(videoId)) return;
  if (document.documentElement.dataset.ytpMain) {
    window.postMessage({ source: 'ytp', type: 'navigate', videoId }, location.origin);
  } else {
    location.assign(`/watch?v=${videoId}`);
  }
}

function playerState(): PlayerState | null {
  const videoId = playerVideoId();
  const v = getVideo();
  if (!videoId || !v) return null;
  const onWatch = isWatchPage();
  return {
    videoId,
    title: onWatch ? watchTitle() : miniplayerText('title'),
    channelName: onWatch ? (watchMetaCurrent() && getWatchChannel()?.name) || '' : miniplayerText('channel'),
    currentTime: v.currentTime,
    duration: Number.isFinite(v.duration) ? v.duration : 0,
    paused: v.paused,
    rate: v.playbackRate,
  };
}

/**
 * Answers the popup's `TabMessage`s (see lib/messages.ts) for this tab: player state,
 * play/pause, seek, play a video. Installed once by the content script regardless of feature
 * flags. Handled messages reply truthy (the popup reads `undefined` as "no receiver").
 */
export function installPlayerBridge(): void {
  browser.runtime.onMessage.addListener((msg: TabMessage, _sender: unknown, reply: (r: unknown) => void) => {
    const v = getVideo();
    switch (msg?.type) {
      case 'player-state':
        reply(playerState());
        return true;
      case 'player-control':
        if (msg.action === 'play') v?.play().catch(() => {});
        else v?.pause();
        reply(!!v);
        return true;
      case 'player-seek':
        if (v) {
          const t = msg.to ?? v.currentTime + (msg.by ?? 0);
          v.currentTime = Math.max(0, Math.min(t, v.duration || t));
        }
        reply(!!v);
        return true;
      case 'play-video':
        playInThisTab(msg.videoId);
        reply(true);
        return true;
      default:
        return undefined; // e.g. 'open-manage-groups' — channel-groups answers it
    }
  });
}
