import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';

/**
 * Force every video to start at the user's preferred playback rate.
 *
 * YouTube reuses a single <video> element across SPA navigations, but
 * the rate gets reset to 1 on each new video load. We hook
 * `loadedmetadata` (fires once per src change) to apply the rate
 * cleanly, and the navigation bus as a backstop.
 */

const feature: Feature = {
  id: 'default-playback-speed',
  async setup(ctx) {
    let rate = (await getConfig('default-playback-speed')).rate;

    const apply = () => {
      const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (video && video.playbackRate !== rate) video.playbackRate = rate;
    };

    const onLoaded = () => apply();
    const attach = (video: HTMLVideoElement) => {
      video.addEventListener('loadedmetadata', onLoaded);
    };

    // Hook current video, plus any future <video> swap-ins.
    const current = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (current) attach(current);

    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) attach(node);
        });
      }
    });

    const offNav = ctx.navigation.onNavigate(() => apply());
    const offConfig = watchConfig('default-playback-speed', (cfg) => {
      rate = cfg.rate;
      apply();
    });

    apply();

    return () => {
      offMutation();
      offNav();
      offConfig();
      document
        .querySelectorAll<HTMLVideoElement>('video.html5-main-video')
        .forEach((v) => v.removeEventListener('loadedmetadata', onLoaded));
    };
  },
};

export default feature;
