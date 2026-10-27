import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { createHost } from '../lib/yt/ui';
import { fmtClock } from '../lib/format';
import {
  CLOSE_ICON,
  PLAYER_CSS,
  getVideo,
  isAdShowing,
  mountInPlayer,
  onVideoEvent,
  playerVideoId,
  tooltip,
} from '../lib/yt/player';

/**
 * A→B section loop.
 *
 *   `[` set point A at the current position · `]` set point B (after A) · `\` clear
 *
 * While A is set: a "Loop 5:40–7:10" chip after the chapter pill (× clears) and A/B markers + a
 * band on the progress bar. With A and B set, playback past B jumps back to A. The loop is per
 * video — it clears on navigation or when another video plays.
 */

const LOOP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';

const CHIP_CSS = `
:host{display:flex;flex:none;margin:8px 0 0 5px}
:host([hidden]){display:none}
.pill{display:flex;align-items:center;gap:7px;height:40px;box-sizing:border-box;padding:0 4px 0 14px;border-radius:28px;background:rgba(0,0,0,.3);font-weight:500;text-shadow:0 0 2px rgba(0,0,0,.5)}
.pill>svg{width:18px;height:18px;flex:none}
.range{white-space:nowrap;font-variant-numeric:tabular-nums}
`;

// Inside .ytp-progress-bar (6px; visible bar = middle 4px), under SponsorBlock's segments.
const BAR_CSS = `
:host{position:absolute;inset:0;z-index:41;pointer-events:none}
:host-context(.ad-showing){display:none}
.band{position:absolute;top:-1px;height:8px;border-radius:2px;background:rgba(62,166,255,.35);box-shadow:inset 2px 0 0 #3ea6ff,inset -2px 0 0 #3ea6ff}
.stem{position:absolute;top:-5px;width:2px;height:4px;margin-left:-1px;background:#3ea6ff}
.mark{position:absolute;top:-19px;width:16px;height:14px;margin-left:-8px;border-radius:3px;background:#3ea6ff;color:#0f0f0f;font-size:10px;font-weight:700;line-height:14px;text-align:center}
`;

const feature: Feature = {
  setup(ctx) {
    let a: number | null = null;
    let b: number | null = null;
    /** Video A was set on. */
    let loopVid: string | null = null;

    const chip = createHost('ytp-loop-chip', PLAYER_CSS + CHIP_CSS);
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'A to B loop');
    pill.innerHTML = `${LOOP_ICON}<span class="range"></span><button class="pb sm" aria-label="Clear loop (\\)" aria-keyshortcuts="\\">${CLOSE_ICON}</button>`;
    chip.root.append(pill);
    const range = pill.querySelector<HTMLElement>('.range')!;
    const clearBtn = pill.querySelector<HTMLElement>('button')!;
    tooltip(clearBtn, () => 'Clear loop (\\)');
    const bar = createHost('ytp-loop-bar', PLAYER_CSS + BAR_CSS);

    const render = () => {
      chip.host.hidden = a == null;
      bar.root.querySelectorAll('span').forEach((n) => n.remove());
      if (a == null) return;
      range.textContent = `Loop ${fmtClock(a)}–${b == null ? '…' : fmtClock(b)}`;
      const d = getVideo()?.duration;
      if (!d || !Number.isFinite(d)) return;
      const pct = (t: number) => `${(t / d) * 100}%`;
      const add = (cls: string, left: number, text = '') => {
        const el = document.createElement('span');
        el.className = cls;
        el.style.left = pct(left);
        el.textContent = text;
        bar.root.append(el);
        return el;
      };
      if (b != null) add('band', a).style.width = `${((b - a) / d) * 100}%`;
      add('stem', a);
      add('mark', a, 'A');
      if (b != null) {
        add('stem', b);
        add('mark', b, 'B');
      }
    };

    const clear = () => {
      a = null;
      b = null;
      render();
    };

    clearBtn.addEventListener('click', () => {
      clear();
      flashToast('Loop cleared');
    });

    const offs = [
      mountInPlayer(ctx, chip.host, 'controls-left'),
      mountInPlayer(ctx, bar.host, 'progress'),
      onVideoEvent('timeupdate', (v) => {
        if (a == null || isAdShowing()) return;
        // Another video without a navigation (miniplayer, autoplay) or before navigate-finish.
        if (playerVideoId() !== loopVid) return clear();
        if (b != null && v.currentTime >= b) v.currentTime = a;
      }),
      onVideoEvent('durationchange', render),
      // New video — clear the loop so it doesn't bounce around.
      ctx.navigation.onNavigate(clear),
      onKey('[', () => {
        const v = getVideo();
        if (!v) return;
        a = v.currentTime;
        loopVid = playerVideoId();
        if (b != null && b <= a) b = null;
        render();
        flashToast(`Loop A set at ${fmtClock(a)}`);
      }),
      onKey(']', () => {
        const v = getVideo();
        if (!v) return;
        if (a == null) return flashToast('Set A first ([)');
        if (v.currentTime <= a) return flashToast('B must be after A');
        b = v.currentTime;
        render();
        flashToast(`Loop ${fmtClock(a)} → ${fmtClock(b)}`);
      }),
      onKey('\\', () => a != null && clearBtn.click()),
    ];
    render();

    return () => offs.forEach((off) => off());
  },
};

export default feature;
