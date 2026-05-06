import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';

/**
 * Boost volume above 100% using a Web Audio gain node. The video
 * element's native volume slider tops out at 1.0; we route audio
 * through a MediaElementAudioSourceNode → GainNode → destination so
 * the user can crank it to e.g. 200% on quiet videos.
 *
 * Caveat: a video element can only be sourced once. We track which
 * elements we've wired up to avoid throwing on re-attach.
 */

const wiredVideos = new WeakMap<HTMLVideoElement, GainNode>();

function wire(video: HTMLVideoElement): GainNode | null {
  const existing = wiredVideos.get(video);
  if (existing) return existing;
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    const gain = ctx.createGain();
    source.connect(gain).connect(ctx.destination);
    wiredVideos.set(video, gain);
    return gain;
  } catch {
    // Already sourced elsewhere, or AudioContext blocked. Bail quietly.
    return null;
  }
}

const feature: Feature = {
  id: 'volume-boost',
  async setup(ctx) {
    let multiplier = (await getConfig('volume-boost')).multiplier;

    const apply = () => {
      const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (!video) return;
      const gain = wire(video);
      if (gain) gain.gain.value = multiplier;
    };

    apply();

    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) {
            const gain = wire(node);
            if (gain) gain.gain.value = multiplier;
          }
        });
      }
    });

    const offNav = ctx.navigation.onNavigate(() => apply());
    const offConfig = watchConfig('volume-boost', (cfg) => {
      multiplier = cfg.multiplier;
      apply();
    });

    return () => {
      offMutation();
      offNav();
      offConfig();
      // Reset gain on teardown so the user's audio isn't permanently boosted.
      const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (video) {
        const gain = wiredVideos.get(video);
        if (gain) gain.gain.value = 1;
      }
    };
  },
};

export default feature;
