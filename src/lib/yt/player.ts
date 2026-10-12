import type { YTContext } from './context';

/**
 * The watch player's chrome, shared by the player features (speed chip, screenshot, A→B loop,
 * SponsorBlock, volume boost). Selectors live here so a player redesign is a one-file fix.
 *
 * Probed on the 2026 player, where each control group is its own translucent pill:
 *   .ytp-chrome-controls > .ytp-left-controls (play · volume · time · chapter; overflow:hidden)
 *                        > [our pill]          (mountInPlayer 'controls-right')
 *                        > .ytp-right-controls (autoplay · CC · settings · theater · fullscreen)
 *   .ytp-progress-bar (6px; the visible bar is the middle 4px, 6px on hover)
 * The player stays dark in YouTube's light theme, so player UI uses YouTube's player colours
 * (white icons, rgba(28,28,28,.9) surfaces), not the page's --yt-sys tokens.
 */

const VIDEO_SEL = '#movie_player video.html5-main-video';

export const getPlayer = () => document.querySelector<HTMLElement>('#movie_player');
export const getVideo = () => document.querySelector<HTMLVideoElement>(VIDEO_SEL);
export const isAdShowing = () => !!getPlayer()?.classList.contains('ad-showing');

/** Video loaded in the watch player (still set while it plays in the miniplayer), else the URL's. */
export function playerVideoId(): string | null {
  return (
    document.querySelector('ytd-watch-flexy')?.getAttribute('video-id') ||
    (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null)
  );
}

/** 412 → "6:52", 3725 → "1:02:05". */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Media event of the main player's <video>. Media events don't bubble but do capture, so a
 * capture listener on document survives YouTube swapping the element. Returns detach.
 */
export function onVideoEvent(type: string, cb: (video: HTMLVideoElement) => void): () => void {
  const h = (e: Event) => {
    if ((e.target as Element).matches?.(VIDEO_SEL)) cb(e.target as HTMLVideoElement);
  };
  document.addEventListener(type, h, true);
  return () => document.removeEventListener(type, h, true);
}

/** Shared styles for player UI (append to createHost's extraCss). Real px = board px ÷ 0.8916. */
export const PLAYER_CSS = `
:host{color:#fff;font-size:14px;line-height:20px}
:focus-visible{outline-color:#3ea6ff}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
.pb{display:inline-flex;align-items:center;justify-content:center;flex:none;height:40px;border-radius:20px;transition:background-color .1s}
.pb:hover{background-color:rgba(255,255,255,.1)}
.pb svg{width:24px;height:24px}
.pb.sm{width:32px;height:32px;border-radius:50%}
.pb.sm svg{width:18px;height:18px}
.tt{position:fixed;padding:6px 10px;border-radius:4px;background:rgba(28,28,28,.9);color:#fff;font-size:12px;line-height:16px;font-weight:500;white-space:nowrap;pointer-events:none;text-shadow:none}
.tt:popover-open{display:flex;align-items:center;gap:7px}
`;

/**
 * YouTube-style player tooltip for `el` on hover / keyboard focus. Drawn in the top layer so the
 * controls' overflow:hidden can't clip it; sits 10px above the progress bar like YouTube's own,
 * centred on `el` and kept inside the player. `el` must already be in its shadow root.
 */
export function tooltip(el: HTMLElement, content: () => string | (Node | string)[]): void {
  const tip = document.createElement('div');
  tip.className = 'tt';
  tip.popover = 'manual';
  tip.setAttribute('aria-hidden', 'true');
  el.after(tip);
  const show = () => {
    const c = content();
    if (typeof c === 'string') tip.textContent = c;
    else tip.replaceChildren(...c);
    tip.showPopover();
    const r = el.getBoundingClientRect();
    const p = getPlayer()?.getBoundingClientRect();
    const bar = getPlayer()?.querySelector('.ytp-progress-bar')?.getBoundingClientRect();
    const { width: w, height: h } = tip.getBoundingClientRect();
    const minX = (p?.left ?? 0) + 8;
    const maxX = (p?.right ?? innerWidth) - 8 - w;
    tip.style.left = `${Math.max(minX, Math.min(r.left + r.width / 2 - w / 2, maxX))}px`;
    tip.style.top = `${(bar?.height ? bar.top : r.top) - 10 - h}px`;
  };
  const hide = () => {
    if (tip.matches(':popover-open')) tip.hidePopover();
  };
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', hide);
  el.addEventListener('focus', () => el.matches(':focus-visible') && show());
  el.addEventListener('blur', hide);
  el.addEventListener('click', hide);
}

export type PlayerSlot = 'controls-left' | 'controls-right' | 'progress' | 'overlay' | 'volume';

const GROUP_ID = 'ytp-player-controls';

/** The one pill right before .ytp-right-controls that holds every 'controls-right' host. */
function controlsGroup(player: HTMLElement): HTMLElement | null {
  const right = player.querySelector('.ytp-right-controls');
  if (!right) return null;
  let group = player.querySelector<HTMLElement>(`#${GROUP_ID}`);
  if (!group) {
    group = document.createElement('ytp-host'); // not a div: YouTube's div reset beats :host (see ui.ts)
    group.id = GROUP_ID;
    group.attachShadow({ mode: 'open' }).innerHTML =
      '<style>:host{display:flex;align-items:center;flex:none;height:40px;margin:8px 12px 0 0;padding:0 4px;border-radius:28px;background:rgba(0,0,0,.3)}</style><slot></slot>';
  }
  if (group.nextElementSibling !== right) right.before(group);
  return group;
}

const SLOT_PARENT: Record<Exclude<PlayerSlot, 'controls-right'>, string> = {
  'controls-left': '.ytp-left-controls',
  progress: '.ytp-progress-bar',
  overlay: '',
  volume: '.ytp-volume-area',
};

/**
 * Keeps `host` in a player slot: inserts it now (or once the player exists) and again whenever
 * YouTube re-renders that part of the player. 'controls-right' hosts share one pill, sorted by
 * `order` (speed 1, screenshot 2). Returns unmount, which removes the host (and the shared pill
 * once it's empty).
 */
export function mountInPlayer(ctx: YTContext, host: HTMLElement, slot: PlayerSlot, order = 0): () => void {
  host.dataset.order = String(order);
  const place = () => {
    const player = getPlayer();
    if (!player) return;
    if (slot === 'controls-right') {
      const group = controlsGroup(player);
      if (!group || host.parentNode === group) return;
      const next = [...group.children].find((c) => Number((c as HTMLElement).dataset.order) > order);
      group.insertBefore(host, next ?? null);
      return;
    }
    const parent = SLOT_PARENT[slot] ? player.querySelector(SLOT_PARENT[slot]) : player;
    if (parent && host.parentNode !== parent) parent.append(host);
  };
  place();
  const off = ctx.observer.onChange(place);
  return () => {
    off();
    const group = host.parentElement;
    host.remove();
    if (group?.id === GROUP_ID && !group.children.length) group.remove();
  };
}
