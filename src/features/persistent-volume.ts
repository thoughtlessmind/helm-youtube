import type { Feature } from '../lib/features';

/**
 * YouTube's per-account volume sync is inconsistent. Persist the user's
 * last volume locally and restore it when a new video starts.
 *
 * We listen for `volumechange` (debounced) and apply on `loadedmetadata`.
 */

const KEY = 'yt-pro:volume';

const feature: Feature = {
  id: 'persistent-volume',
  setup(ctx) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const restore = () => {
      const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (!video) return;
      const stored = localStorage.getItem(KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { volume: number; muted: boolean };
      video.volume = Math.max(0, Math.min(1, parsed.volume));
      video.muted = parsed.muted;
    };

    const onVolume = (e: Event) => {
      const v = e.currentTarget as HTMLVideoElement;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        localStorage.setItem(KEY, JSON.stringify({ volume: v.volume, muted: v.muted }));
      }, 300);
    };

    const onLoaded = () => restore();

    const attach = (video: HTMLVideoElement) => {
      video.addEventListener('volumechange', onVolume);
      video.addEventListener('loadedmetadata', onLoaded);
    };

    const current = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (current) {
      attach(current);
      restore();
    }

    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) attach(node);
        });
      }
    });

    return () => {
      offMutation();
      if (saveTimer) clearTimeout(saveTimer);
      document.querySelectorAll<HTMLVideoElement>('video.html5-main-video').forEach((v) => {
        v.removeEventListener('volumechange', onVolume);
        v.removeEventListener('loadedmetadata', onLoaded);
      });
    };
  },
};

export default feature;
