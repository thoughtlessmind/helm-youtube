/**
 * Playback speed: a default rate for every video, plus (optionally) a
 * remembered rate per channel that overrides it.
 *
 * - The rate is (re)applied on `loadedmetadata` (YouTube reuses one <video>
 *   across SPA navigations and resets the rate on each new src) and again
 *   once the watch metadata renders and the channel is known.
 * - User speed changes are captured via `ratechange` and saved for the
 *   channel. Our own assignments are gated by `applying`; YouTube's
 *   load-time resets are gated by `mediaSettled` (~500 ms after
 *   loadedmetadata — no user changes speed that fast).
 * - Saving the default rate for a channel deletes its override.
 * - Overrides live in `local:ytpro:per-channel-speed` (`channelId → rate`).
 */

import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { getConfig, watchConfig } from '../lib/settings';
import { getWatchChannel, isWatchPage } from '../lib/yt/video';

const VIDEO_SEL = 'video.html5-main-video';
const STORAGE_KEY = 'local:ytpro:per-channel-speed';

type SpeedMap = Record<string, number>;

const feature: Feature = {
  id: 'playback-speed',

  async setup(ctx) {
    let cfg = await getConfig('playback-speed');
    let map: SpeedMap = (await storage.getItem<SpeedMap>(STORAGE_KEY)) ?? {};
    // Channel of the current watch page; null until metadata renders.
    let channelId: string | null = null;
    let applying = false;
    let mediaSettled = true;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const getVideo = () => document.querySelector<HTMLVideoElement>(VIDEO_SEL);

    const target = (): number =>
      (cfg.perChannel && channelId && map[channelId]) || cfg.rate;

    const apply = () => {
      const video = getVideo();
      const rate = target();
      if (!video || video.playbackRate === rate) return;
      applying = true;
      video.playbackRate = rate;
      // ratechange fires synchronously; clear the gate after it.
      queueMicrotask(() => { applying = false; });
    };

    const onRateChange = () => {
      if (applying) return;
      // YouTube resets the rate itself while a new src loads.
      if (!mediaSettled) return;
      if (!cfg.perChannel || !channelId) return;
      const rate = getVideo()?.playbackRate;
      if (rate == null) return;
      map = { ...map };
      if (rate === cfg.rate) delete map[channelId];
      else map[channelId] = rate;
      void storage.setItem<SpeedMap>(STORAGE_KEY, map);
    };

    const onLoadedMetadata = () => {
      mediaSettled = false;
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        mediaSettled = true;
        settleTimer = null;
      }, 500);
      apply();
    };

    // Media events don't bubble but do capture, so listening on document
    // survives YouTube swapping out the <video> element.
    const onMediaEvent = (e: Event) => {
      if (!(e.target as Element).matches?.(VIDEO_SEL)) return;
      if (e.type === 'loadedmetadata') onLoadedMetadata();
      else onRateChange();
    };
    document.addEventListener('ratechange', onMediaEvent, true);
    document.addEventListener('loadedmetadata', onMediaEvent, true);

    /** Resolve the channel once the watch metadata has rendered, then apply. */
    const resolveChannel = () => {
      if (!isWatchPage()) {
        channelId = null;
        return;
      }
      const ch = getWatchChannel();
      if (!ch || ch.id === channelId) return;
      channelId = ch.id;
      apply();
    };

    const offChange = ctx.observer.onChange(resolveChannel);
    const offNav = ctx.navigation.onNavigate(() => {
      channelId = null;
      apply();
      resolveChannel();
    });
    const offStorage = storage.watch<SpeedMap>(STORAGE_KEY, (val) => {
      map = val ?? {};
    });
    const offConfig = watchConfig('playback-speed', (next) => {
      cfg = next;
      apply();
    });

    resolveChannel();
    apply();

    return () => {
      document.removeEventListener('ratechange', onMediaEvent, true);
      document.removeEventListener('loadedmetadata', onMediaEvent, true);
      offChange();
      offNav();
      offStorage();
      offConfig();
      if (settleTimer !== null) clearTimeout(settleTimer);
    };
  },
};

export default feature;
