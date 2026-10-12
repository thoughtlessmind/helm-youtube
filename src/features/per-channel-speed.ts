/**
 * per-channel-speed
 *
 * Remembers the user's preferred playback speed per channel and restores it
 * automatically when they navigate to a video on that channel.
 *
 * WHY: Power users watch different channels at wildly different speeds —
 * slow tutorial channels at 1.25×, dense lecture channels at 2×, casual
 * vlogs at 1×. Having to re-set the speed every time is friction that
 * default-playback-speed can't solve (it's one global rate).
 *
 * HOW:
 * - Speed changes are detected via the video element's `ratechange` event.
 * - Programmatic applications (from this feature itself) are gated with an
 *   `applying` flag + microtask reset to avoid false "user changed speed"
 *   saves.
 * - The channel→rate map is stored under `local:ytpro:per-channel-speed`
 *   (bulky, per-channel data → local, not sync).
 * - On SPA navigation, the feature waits for `ytd-watch-metadata` to render
 *   (via `ctx.observer.onChange`) before resolving the channel id and
 *   applying its saved rate.
 * - The video element may be replaced between navigations; we re-attach via
 *   `ctx.observer.subscribe` watching for new HTMLVideoElement nodes.
 */

import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { getWatchChannel, isWatchPage } from '../lib/yt/video';

const VIDEO_SEL = 'video.html5-main-video';
const STORAGE_KEY = 'local:ytpro:per-channel-speed';

type SpeedMap = Record<string, number>;

const feature: Feature = {
  id: 'per-channel-speed',

  async setup(ctx) {
    // In-memory map — loaded once, kept in sync with storage.watch.
    let map: SpeedMap = (await storage.getItem<SpeedMap>(STORAGE_KEY)) ?? {};

    // Channel resolved for the current watch page. Null until metadata renders.
    let currentChannelId: string | null = null;

    // Guards programmatic rate assignments from being misinterpreted as user
    // actions by the ratechange handler.
    let applying = false;

    // Guards against YouTube's own programmatic rate resets that occur during
    // the video-load window (e.g. the player resets to 1× on each new src).
    // Set false on loadedmetadata, true ~500 ms later — no user can physically
    // change speed in that window, but YouTube's reset fires within it.
    let mediaSettled = true;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    // ----- video element helpers -----

    const getVideo = (): HTMLVideoElement | null =>
      document.querySelector<HTMLVideoElement>(VIDEO_SEL);

    /** Apply a saved rate to the video. Sets `applying` so the ratechange
     *  handler ignores this synthetic change. */
    const applyRate = (video: HTMLVideoElement, rate: number) => {
      if (video.playbackRate === rate) return;
      applying = true;
      video.playbackRate = rate;
      // ratechange fires synchronously; clear the gate after the microtask
      // so any synchronous ratechange handlers finish first.
      queueMicrotask(() => { applying = false; });
    };

    /** Restore the saved rate for `currentChannelId`, if known. */
    const restoreChannelRate = () => {
      if (!currentChannelId) return;
      const saved = map[currentChannelId];
      if (saved == null) return;
      const video = getVideo();
      if (video) applyRate(video, saved);
    };

    // ----- ratechange: capture user's intent -----

    const onRateChange = () => {
      // Skip if this was triggered by our own applyRate call.
      if (applying) return;
      // Skip during the load window: YouTube resets rate to 1 programmatically
      // after each new src load. We ignore ratechange until the media has
      // settled (~500 ms after loadedmetadata).
      if (!mediaSettled) return;
      // Skip if we haven't resolved the channel yet (metadata not rendered).
      if (!currentChannelId) return;
      const video = getVideo();
      if (!video) return;
      const rate = video.playbackRate;
      // Persist and update in-memory map.
      map = { ...map, [currentChannelId]: rate };
      void storage.setItem<SpeedMap>(STORAGE_KEY, map);
    };

    // ----- loadedmetadata: new src loaded, reapply rate -----

    const onLoadedMetadata = () => {
      // Mark as unsettled so YouTube's own load-time resets don't clobber saved rates.
      mediaSettled = false;
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        mediaSettled = true;
        settleTimer = null;
      }, 500);
      restoreChannelRate();
    };

    const attach = (video: HTMLVideoElement) => {
      video.addEventListener('ratechange', onRateChange);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    };

    const detach = (video: HTMLVideoElement) => {
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };

    // Attach to current video if present.
    const current = getVideo();
    if (current) attach(current);

    // Re-attach if YouTube swaps out the <video> element.
    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) attach(node);
        });
      }
    });

    // ----- Channel resolution -----

    /** Try to resolve the channel for the current page and apply its rate.
     *  Called on navigation and on each DOM change until resolved. */
    const resolveChannel = () => {
      if (!isWatchPage()) {
        currentChannelId = null;
        return;
      }
      const ch = getWatchChannel();
      if (!ch) return; // metadata not yet rendered — onChange will retry
      if (ch.id === currentChannelId) return; // already resolved for this page
      currentChannelId = ch.id;
      restoreChannelRate();
    };

    // Retry resolution on every mutation tick until the channel is found.
    const offChange = ctx.observer.onChange(() => resolveChannel());

    const offNav = ctx.navigation.onNavigate(() => {
      // New page: reset channel so we don't apply stale data until resolved.
      currentChannelId = null;
      resolveChannel();
    });

    // Keep in-memory map in sync with changes from other tabs.
    const offStorage = storage.watch<SpeedMap>(STORAGE_KEY, (val) => {
      map = val ?? {};
    });

    // Initial resolution attempt (in case content script boots mid-page).
    resolveChannel();

    // ----- Teardown -----
    return () => {
      offMutation();
      offChange();
      offNav();
      offStorage();
      if (settleTimer !== null) { clearTimeout(settleTimer); settleTimer = null; }
      document.querySelectorAll<HTMLVideoElement>(VIDEO_SEL).forEach(detach);
    };
  },
};

export default feature;
