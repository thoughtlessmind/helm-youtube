import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';

/**
 * A→B section loop.
 *
 *   `[` set point A at current playback position
 *   `]` set point B (must be after A)
 *   `\` clear the loop
 *
 * When both A and B are set, we listen for `timeupdate` and rewind to
 * A whenever playback passes B. Loop state is per-page — clears on
 * navigation so loops don't leak across videos.
 */

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const feature: Feature = {
  id: 'loop-section',
  setup(ctx) {
    let a: number | null = null;
    let b: number | null = null;

    const getVideo = () =>
      document.querySelector<HTMLVideoElement>('video.html5-main-video');

    const onTimeUpdate = () => {
      const v = getVideo();
      if (!v || a == null || b == null) return;
      if (v.currentTime >= b) v.currentTime = a;
    };

    const attach = (video: HTMLVideoElement) => {
      video.addEventListener('timeupdate', onTimeUpdate);
    };
    const detach = (video: HTMLVideoElement) => {
      video.removeEventListener('timeupdate', onTimeUpdate);
    };

    const current = getVideo();
    if (current) attach(current);

    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) attach(node);
        });
      }
    });

    const offNav = ctx.navigation.onNavigate(() => {
      // New video — clear loop so it doesn't bounce around.
      a = null;
      b = null;
    });

    const offSetA = onKey('[', () => {
      const v = getVideo();
      if (!v) return;
      a = v.currentTime;
      if (b != null && b <= a) b = null;
      flashToast(`Loop A set at ${fmt(a)}`);
    });
    const offSetB = onKey(']', () => {
      const v = getVideo();
      if (!v) return;
      const t = v.currentTime;
      if (a == null) {
        flashToast('Set A first ([)');
        return;
      }
      if (t <= a) {
        flashToast('B must be after A');
        return;
      }
      b = t;
      flashToast(`Loop ${fmt(a)} → ${fmt(b)}`);
    });
    const offClear = onKey('\\', () => {
      if (a == null && b == null) return;
      a = null;
      b = null;
      flashToast('Loop cleared');
    });

    return () => {
      offMutation();
      offNav();
      offSetA();
      offSetB();
      offClear();
      const v = getVideo();
      if (v) detach(v);
    };
  },
};

export default feature;
