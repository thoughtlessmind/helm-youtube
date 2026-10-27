import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import { createHost } from '../lib/yt/ui';
import { PLAYER_CSS, getVideo, mountInPlayer, onVideoEvent, tooltip } from '../lib/yt/player';

/**
 * Volume boost above 100%: MediaElementSource → Gain → DynamicsCompressor (limiter, stops
 * clipping) → destination. A suspended AudioContext silences the video, so it is resumed on the
 * first play / click / key press. Shows a "150%" badge on the volume control.
 */

interface Graph {
  ctx: AudioContext;
  gain: GainNode;
  limiter: DynamicsCompressorNode;
  /** Routed multiplier; null = bypassed. */
  routed?: number | null;
}

/**
 * One graph per <video> for the page's lifetime: a second createMediaElementSource on the same
 * element throws. Module-level, so it survives the feature being toggled off and on.
 */
const graphs = new WeakMap<HTMLVideoElement, Graph>();

function graphFor(video: HTMLVideoElement): Graph | null {
  let g = graphs.get(video);
  if (g) return g;
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.05;
    limiter.connect(ctx.destination);
    ctx.createMediaElementSource(video).connect(gain);
    g = { ctx, gain, limiter };
    graphs.set(video, g);
    return g;
  } catch {
    return null; // AudioContext unavailable
  }
}

/** Boost through the limiter, or (null) unity gain straight out — audio as YouTube plays it. */
function route(g: Graph, multiplier: number | null): void {
  if (g.routed === multiplier) return;
  g.gain.disconnect();
  g.gain.gain.value = multiplier ?? 1;
  g.gain.connect(multiplier == null ? g.ctx.destination : g.limiter);
  g.routed = multiplier;
}

const CSS = `
:host{position:absolute;left:24px;top:-3px;z-index:1}
.badge{display:block;height:12px;padding:0 3px;border-radius:2px;background:#cc0022;color:#fff;font-size:9px;font-weight:700;line-height:12px;letter-spacing:.1px}
`;

const feature: Feature = {
  async setup(ctx) {
    let multiplier = (await getConfig('volume-boost')).multiplier;

    const { host, root } = createHost('ytp-boost-badge', PLAYER_CSS + CSS);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.setAttribute('role', 'img');
    root.append(badge);
    const label = () => `Volume boost ${Math.round(multiplier * 100)}%`;
    tooltip(badge, label);

    let stopped = false;
    const resume = () => {
      const video = getVideo();
      const g = video && graphs.get(video);
      if (g?.ctx.state === 'suspended') void g.ctx.resume();
      if (stopped) unlisten(); // switched off while suspended: this gesture's resume was the last job
    };
    const unlisten = () => {
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('keydown', resume, true);
    };
    const apply = () => {
      badge.textContent = `${Math.round(multiplier * 100)}%`;
      badge.setAttribute('aria-label', label());
      const video = getVideo();
      const g = video && graphFor(video);
      if (!g) return;
      route(g, multiplier);
      resume();
    };

    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('keydown', resume, true);
    const offs = [
      mountInPlayer(ctx, host, 'volume'),
      onVideoEvent('loadedmetadata', apply),
      onVideoEvent('play', apply),
      watchConfig('volume-boost', (cfg) => {
        multiplier = cfg.multiplier;
        apply();
      }),
    ];
    apply();

    return () => {
      stopped = true;
      offs.forEach((off) => off());
      // The graph can't be undone; unity gain + no limiter leaves the audio untouched.
      const video = getVideo();
      const g = video && graphs.get(video);
      if (g) route(g, null);
      // But a suspended context (no page gesture yet; the popup's toggle isn't one) is silent:
      // try now, and keep resuming on the page's next gesture.
      if (g?.ctx.state === 'suspended') void g.ctx.resume();
      else unlisten();
    };
  },
};

export default feature;
