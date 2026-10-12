/**
 * Playback speed: a default rate for every video, plus (optionally) a
 * remembered rate per channel that overrides it.
 *
 * - The rate is (re)applied on `loadedmetadata` (YouTube reuses one <video>
 *   across SPA navigations and resets the rate on each new src) and again
 *   once the watch metadata renders and the channel is known.
 * - User speed changes (YouTube's own menu) are captured via `ratechange` and
 *   saved for the channel. Our own assignments are gated by `applying`;
 *   YouTube's load-time resets are gated by `mediaSettled` (~500 ms after
 *   loadedmetadata — no user changes speed that fast).
 * - Saving the default rate for a channel deletes its override.
 * - Overrides live in `local:ytpro:per-channel-speed` (`channelId → rate`);
 *   the channel-page watch-time tooltip reads it too.
 * - Player UI (board WatchPlayer): a "1.5×" chip in the controls opens a popover
 *   to step this channel's speed and the default, or reset the channel.
 */

import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { getConfig, setConfig, watchConfig } from '../lib/settings';
import { getWatchChannel, isWatchPage, type ChannelRef } from '../lib/yt/video';
import { createHost, openPopover } from '../lib/yt/ui';
import {
  PLAYER_CSS,
  getPlayer,
  getVideo,
  isAdShowing,
  mountInPlayer,
  onVideoEvent,
  tooltip,
} from '../lib/yt/player';

const STORAGE_KEY = 'local:ytpro:per-channel-speed';
/** The Settings board's speed choices; the popover steps through them. */
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

type SpeedMap = Record<string, number>;

const sp = (v: number) => `${v}×`;
const stepFrom = (v: number, dir: number) =>
  dir > 0 ? SPEEDS.find((s) => s > v + 1e-6) : [...SPEEDS].reverse().find((s) => s < v - 1e-6);

const svg = (d: string, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${size === 18 ? 2.2 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MINUS = svg('<path d="M5 12h14"/>');
const PLUS = svg('<path d="M12 5v14M5 12h14"/>');
const GAUGE = svg('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>', 22);
const RESET = svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 22);

// Board px ÷ 0.8916. The popover is a player menu: always dark.
const CSS = `
:host{display:flex}
.chip{width:52px;font-weight:500;font-variant-numeric:tabular-nums;text-shadow:0 0 2px rgba(0,0,0,.5)}
.pop{width:max-content;min-width:345px;max-width:420px;padding:4px 0 8px}
.head{display:flex;align-items:center;height:40px;padding:0 16px;font-weight:500;border-bottom:1px solid rgba(255,255,255,.2);margin-bottom:7px}
.row{display:flex;align-items:center;gap:13px;width:100%;height:40px;box-sizing:border-box;padding:0 9px 0 16px;text-align:left}
.row[hidden],.sep[hidden]{display:none}
.row>svg{width:22px;height:22px;flex:none}
.def{color:#aaa}
.av{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:50%;object-fit:cover;background:#6b4636;color:#f1f1f1;font-size:9px;font-weight:700;text-shadow:none}
.name{flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step{display:flex;align-items:center;gap:2px}
.stp{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;transition:background-color .1s}
.stp:hover:not(:disabled),.reset:hover:not(:disabled){background-color:rgba(255,255,255,.1)}
.stp:disabled{opacity:.3;cursor:default}
.val{min-width:45px;text-align:center;font-weight:500;font-variant-numeric:tabular-nums}
.sep{height:1px;background:rgba(255,255,255,.1);margin:7px 0}
.reset{transition:background-color .1s}
.reset:disabled{opacity:.4;cursor:default}
.hint{color:#aaa;padding-right:7px}
`;

const POP_HTML = `
<div class="head">Playback speed</div>
<div class="row chan"><span class="av" aria-hidden="true"></span><span class="name"></span><span class="step"><button class="stp" data-k="chan" data-d="-1">${MINUS}</button><span class="val" aria-live="polite"></span><button class="stp" data-k="chan" data-d="1">${PLUS}</button></span></div>
<div class="row def">${GAUGE}<span class="name"></span><span class="step"><button class="stp" data-k="def" data-d="-1" aria-label="Lower default speed">${MINUS}</button><span class="val" aria-live="polite"></span><button class="stp" data-k="def" data-d="1" aria-label="Raise default speed">${PLUS}</button></span></div>
<div class="sep" aria-hidden="true"></div>
<button class="row reset">${RESET}<span class="name">Reset this channel</span><span class="hint"></span></button>`;

/** Owner avatar on the watch page, for the popover's channel row. */
const ownerAvatar = () =>
  document.querySelector<HTMLImageElement>('ytd-watch-metadata ytd-video-owner-renderer #avatar img')?.src || null;

const feature: Feature = {
  id: 'playback-speed',

  async setup(ctx) {
    let cfg = await getConfig('playback-speed');
    let map: SpeedMap = (await storage.getItem<SpeedMap>(STORAGE_KEY)) ?? {};
    // Channel of the current watch page; null until metadata renders.
    let channel: ChannelRef | null = null;
    let applying = false;
    let mediaSettled = true;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const perChannel = () => (cfg.perChannel && channel ? channel : null);
    const chanRate = () => {
      const ch = perChannel();
      return (ch && map[ch.id]) || cfg.rate;
    };

    const apply = () => {
      const video = getVideo();
      const rate = chanRate();
      if (!video || video.playbackRate === rate) return;
      applying = true;
      video.playbackRate = rate;
      // ratechange fires synchronously; clear the gate after it.
      queueMicrotask(() => {
        applying = false;
      });
    };

    const saveChannel = (rate: number) => {
      const ch = perChannel();
      if (!ch) return;
      map = { ...map };
      if (rate === cfg.rate) delete map[ch.id];
      else map[ch.id] = rate;
      void storage.setItem<SpeedMap>(STORAGE_KEY, map);
    };

    // --- player UI ---------------------------------------------------------
    const { host, root } = createHost('ytp-speed-chip', PLAYER_CSS + CSS);
    const chip = document.createElement('button');
    chip.className = 'pb chip';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    const pop = document.createElement('div');
    pop.className = 'pop ytp-player-menu';
    pop.popover = 'auto'; // hidden until openPopover() shows it
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Playback speed');
    pop.innerHTML = POP_HTML;
    root.append(chip, pop);
    const $ = <T extends HTMLElement>(sel: string) => pop.querySelector<T>(sel)!;
    const chanRow = $('.chan');
    const defRow = $('.def');
    const steppers = [...pop.querySelectorAll<HTMLButtonElement>('.stp')];
    const reset = $<HTMLButtonElement>('.reset');
    const isOpen = () => pop.matches(':popover-open');

    tooltip(chip, () => {
      if (isOpen()) return '';
      const ch = perChannel();
      return ch ? `Speed for ${ch.name}` : 'Playback speed';
    });

    const render = () => {
      const ch = perChannel();
      // The live rate (YouTube's own menu may differ), except during ads, which YouTube plays at 1×.
      const rate = (!isAdShowing() && getVideo()?.playbackRate) || chanRate();
      chip.textContent = sp(rate);
      chip.setAttribute('aria-label', `${sp(rate)} playback speed${ch ? ` for ${ch.name}` : ''}`);

      chanRow.hidden = reset.hidden = $('.sep').hidden = !ch;
      $('.def .name').textContent = ch ? 'Default for other channels' : 'Default speed';
      if (ch) {
        $('.chan .name').textContent = `${ch.name} (this channel)`;
        const src = ownerAvatar();
        const av = $('.av');
        if (!(av instanceof HTMLImageElement)) {
          if (src) {
            const img = document.createElement('img');
            img.className = 'av';
            img.alt = '';
            av.replaceWith(img);
          } else {
            av.textContent = ch.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
          }
        }
        const img = $('.av');
        if (src && img instanceof HTMLImageElement && img.src !== src) img.src = src;
      }
      const vals: Record<string, number> = { chan: chanRate(), def: cfg.rate };
      $('.chan .val').textContent = sp(vals.chan);
      $('.def .val').textContent = sp(vals.def);
      for (const b of steppers) {
        b.disabled = stepFrom(vals[b.dataset.k!], Number(b.dataset.d)) == null;
        if (b.dataset.k === 'chan' && ch) {
          b.setAttribute('aria-label', `${b.dataset.d === '1' ? 'Faster' : 'Slower'} for ${ch.name}`);
        }
      }
      reset.disabled = vals.chan === vals.def;
      $('.hint').textContent = `to ${sp(cfg.rate)}`;
    };

    chip.addEventListener('click', () => {
      render(); // the avatar may have loaded since
      openPopover(chip, pop, { side: 'above' });
      if (!isOpen()) return;
      // Like YouTube's settings menu: centred on the chip, just above the progress bar.
      const a = chip.getBoundingClientRect();
      const barTop = getPlayer()?.querySelector('.ytp-progress-bar')?.getBoundingClientRect().top ?? a.top;
      const top = parseFloat(pop.style.top);
      const dy = top < a.top ? Math.min(0, barTop - 15 - pop.offsetHeight - top) : 0;
      pop.style.translate = `${(a.width - pop.offsetWidth) / 2}px ${dy}px`;
    });

    pop.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!btn || btn.disabled) return;
      if (btn === reset) {
        saveChannel(cfg.rate);
      } else {
        const d = Number(btn.dataset.d);
        if (btn.dataset.k === 'chan') {
          const next = stepFrom(chanRate(), d);
          if (next != null) saveChannel(next);
        } else {
          const next = stepFrom(cfg.rate, d);
          if (next != null) {
            cfg = { ...cfg, rate: next };
            void setConfig('playback-speed', cfg);
          }
        }
      }
      apply();
      render();
      // Keep keyboard focus in the popover when the pressed button just became disabled.
      if (btn.disabled) (btn.parentElement?.querySelector<HTMLElement>('.stp:not(:disabled)') ?? pop).focus();
    });

    // --- rate bookkeeping --------------------------------------------------
    const onRateChange = () => {
      render();
      if (applying) return;
      // YouTube resets the rate itself while a new src loads.
      if (!mediaSettled) return;
      const rate = getVideo()?.playbackRate;
      if (rate != null) saveChannel(rate);
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

    /** Resolve the channel once the watch metadata has rendered, then apply. */
    const resolveChannel = () => {
      if (!isWatchPage()) return;
      const ch = getWatchChannel();
      if (!ch || (ch.id === channel?.id && ch.name === channel.name)) return;
      channel = ch;
      apply();
      render();
    };

    const offs = [
      mountInPlayer(ctx, host, 'controls-right', 1),
      onVideoEvent('ratechange', onRateChange),
      onVideoEvent('loadedmetadata', onLoadedMetadata),
      ctx.observer.onChange(resolveChannel),
      ctx.navigation.onNavigate(() => {
        if (isWatchPage()) channel = null;
        apply();
        resolveChannel();
        render();
      }),
      storage.watch<SpeedMap>(STORAGE_KEY, (val) => {
        map = val ?? {};
        render();
      }),
      watchConfig('playback-speed', (next) => {
        cfg = next;
        apply();
        render();
      }),
    ];

    resolveChannel();
    apply();
    render();

    return () => {
      offs.forEach((off) => off());
      if (settleTimer !== null) clearTimeout(settleTimer);
    };
  },
};

export default feature;
