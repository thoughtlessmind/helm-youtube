// Svelte UI in a host: give the component `<svelte:options css="injected" />`, then
// `const { host, root } = createHost(id); slot.append(host); mount(C, { target: root })`.
// Svelte's append_styles() puts the component CSS in `anchor.getRootNode()` (= this shadow root,
// once per root, after NATIVE_CSS so it can override). The per-component option wins over
// vite-plugin-svelte's global css:'external' (compile() lets <svelte:options> override it).

import { isTypingTarget } from './keys';

/**
 * YouTube-native component kit. Every on-page surface lives in an open shadow root from
 * `createHost()`, so YouTube's CSS can't clobber it and these short `.ytp-*` names can't collide
 * with the player's own `.ytp-*` classes. Colors are YouTube's live `--yt-sys-color-baseline--*`
 * tokens (they flip with light/dark and the theme presets); sizes are YouTube's real CSS px.
 *
 * Buttons: .ytp-btn (tonal pill) + .is-primary (inverted, Subscribe-like) | .is-cta (blue fill,
 * dialog confirm) | .is-text (no fill) | .is-link (blue text) | .is-icon (square) | .is-sm (32px).
 * Pressed/open state comes from aria-pressed / aria-expanded. Chips: .ytp-chip with
 * aria-pressed|aria-selected. Menus: .ytp-menu > .ytp-menu-item, .ytp-menu-sep. Dialog:
 * <dialog class="ytp-dialog"> with <h2> and <footer> actions. .ytp-input (.is-underline),
 * <input type="checkbox" role="switch" class="ytp-switch">, .ytp-tooltip (child of its trigger),
 * .ytp-sr (visually hidden, for live-region status text).
 * Player popovers: .ytp-player-menu (always dark, like YouTube's own player CSS).
 * Lists: .ytp-plain (bare button), .ytp-thumb (+ img, .ytp-thumb-ov play overlay, .ytp-dur badge),
 * .ytp-clamp2 (two-line clamp), .ytp-drop (+ .is-after) drag drop line on a position:relative row.
 */
const T = (name: string) => `var(--yt-sys-color-baseline--${name})`;

export const NATIVE_CSS = `
:host{display:block;color:${T('text-primary')};font-size:14px;line-height:20px}
:focus-visible{outline:2px solid ${T('call-to-action')};outline-offset:2px}
[popover]{margin:0;inset:auto;border:0;padding:0;color:inherit;background:none;overflow:auto}
[popover]:focus{outline:none}

.ytp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 16px;box-sizing:border-box;margin:0;border:0;border-radius:var(--ytp-radius,18px);font:inherit;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;color:${T('text-primary')};background:${T('additive-background')};cursor:pointer;transition:background-color .1s}
.ytp-btn:hover,.ytp-btn[aria-expanded="true"],.ytp-btn[aria-pressed="true"]{background:${T('mono-tonal-hover')}}
.ytp-btn:has(>svg:first-child){padding-left:12px}
.ytp-btn svg{width:24px;height:24px;flex:none}
.ytp-btn.is-sm{height:32px;padding:0 12px;border-radius:var(--ytp-radius,16px)}
.ytp-btn.is-sm svg{width:20px;height:20px}
.ytp-btn.is-icon{width:36px;padding:0;border-radius:50%}
.ytp-btn.is-sm.is-icon{width:32px}
.ytp-btn.is-primary{background:${T('inverted-background')};color:${T('text-primary-inverse')}}
.ytp-btn.is-primary:hover{background:${T('inverted-background-hover')}}
.ytp-btn.is-cta{background:${T('call-to-action')};color:${T('text-primary-inverse')}}
.ytp-btn.is-cta:hover{background:${T('call-to-action-hover')}}
.ytp-btn.is-text,.ytp-btn.is-link{background:none}
.ytp-btn.is-text:hover,.ytp-btn.is-text[aria-expanded="true"],.ytp-btn.is-text[aria-pressed="true"]{background:${T('additive-background')}}
.ytp-btn.is-link{color:${T('call-to-action')}}
.ytp-btn.is-link:hover{background:${T('suggested-action')}}
.ytp-btn:disabled{color:${T('text-disabled')};cursor:default;pointer-events:none}
.ytp-btn.is-primary:disabled,.ytp-btn.is-cta:disabled{background:${T('additive-background')}}

.ytp-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;box-sizing:border-box;margin:0;border:0;border-radius:var(--ytp-radius,8px);font:inherit;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;color:${T('text-primary')};background:${T('additive-background')};cursor:pointer;transition:background-color .1s,color .1s}
.ytp-chip:hover{background:${T('mono-tonal-hover')}}
.ytp-chip[aria-pressed="true"],.ytp-chip[aria-selected="true"]{background:${T('inverted-background')};color:${T('text-primary-inverse')}}
.ytp-chip[aria-pressed="true"]:hover,.ytp-chip[aria-selected="true"]:hover{background:${T('inverted-background-hover')}}
.ytp-chip svg{width:20px;height:20px;flex:none}

.ytp-menu{padding:8px 0;border-radius:var(--ytp-radius,12px);background:${T('menu-background')};box-shadow:0 4px 32px ${T('shadow-medium')}}
.ytp-player-menu{padding:8px 0;border-radius:12px;background:rgba(28,28,28,.9);color:#fff;text-shadow:0 0 2px rgba(0,0,0,.5)}
.ytp-menu-item{display:flex;align-items:center;gap:16px;width:100%;min-height:40px;padding:0 20px 0 16px;box-sizing:border-box;margin:0;border:0;font:inherit;font-size:14px;line-height:20px;text-align:left;white-space:nowrap;color:inherit;background:none;cursor:pointer}
.ytp-menu-item:hover,.ytp-menu-item:focus-visible{background:${T('additive-background')}}
.ytp-player-menu .ytp-menu-item:hover,.ytp-player-menu .ytp-menu-item:focus-visible{background:rgba(255,255,255,.1)}
.ytp-menu-item:focus-visible{outline-offset:-2px}
.ytp-menu-item:disabled,.ytp-menu-item[aria-disabled="true"]{color:${T('text-disabled')};background:none;cursor:default}
.ytp-menu-item svg{width:24px;height:24px;flex:none}
.ytp-menu-sep{height:1px;margin:8px 0;border:0;background:${T('outline')}}
@keyframes ytp-in{from{opacity:0;transform:translateY(4px)}}
.ytp-menu:popover-open,.ytp-player-menu:popover-open{animation:ytp-in .12s ease-out}

.ytp-dialog{box-sizing:border-box;width:min(494px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:24px;border:0;border-radius:12px;background:${T('raised-background')};color:${T('text-primary')};box-shadow:0 4px 32px ${T('shadow-medium')};outline:var(--ytp-dialog-outline,none);font-size:14px;line-height:20px;overflow:auto}
.ytp-dialog[open]{display:flex;flex-direction:column;gap:20px}
.ytp-dialog::backdrop{background:var(--yt-sys-color-baseline--overlay-background-medium,rgba(0,0,0,.6))}
.ytp-dialog h2{margin:0;font-size:20px;line-height:28px;font-weight:500}
.ytp-dialog footer{display:flex;justify-content:flex-end;gap:8px}

.ytp-input{box-sizing:border-box;width:100%;height:36px;padding:0 12px;margin:0;border:1px solid transparent;border-radius:var(--ytp-radius,8px);outline:none;font:inherit;font-size:14px;color:${T('text-primary')};background:${T('additive-background')};transition:border-color .1s,box-shadow .1s}
.ytp-input::placeholder{color:${T('text-secondary')}}
.ytp-input:focus{border-color:${T('call-to-action')}}
.ytp-input.is-underline{height:auto;padding:6px 0;border-width:0 0 1px;border-color:${T('text-disabled')};border-radius:0;background:none}
.ytp-input.is-underline:focus{border-color:${T('call-to-action')};box-shadow:0 1px 0 ${T('call-to-action')}}
.ytp-input[aria-invalid="true"]{border-color:${T('error-indicator')}}

.ytp-switch{appearance:none;position:relative;flex:none;width:36px;height:20px;margin:0;border-radius:10px;background:${T('text-disabled')};cursor:pointer;transition:background-color .15s}
.ytp-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--yt-sys-color-baseline--static-brand-white,#fff);transition:transform .15s}
.ytp-switch:checked{background:${T('call-to-action')}}
.ytp-switch:checked::after{transform:translateX(16px)}

:has(>.ytp-tooltip){position:relative}
.ytp-tooltip{position:absolute;bottom:calc(100% + 8px);left:50%;translate:-50% 0;z-index:1;padding:6px 10px;border-radius:4px;background:rgba(28,28,28,.9);color:#fff;font-size:12px;line-height:16px;font-weight:500;white-space:nowrap;text-shadow:none;pointer-events:none;opacity:0;transition:opacity .1s}
:hover>.ytp-tooltip,:focus-visible>.ytp-tooltip{opacity:1}
.ytp-tip{position:fixed;padding:8px;border-radius:4px;background:#606060;color:#fff;font-size:12px;line-height:18px;font-weight:400;white-space:nowrap;pointer-events:none}

.ytp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.ytp-plain{margin:0;padding:0;border:0;font:inherit;color:inherit;background:none;text-align:left;cursor:pointer}
.ytp-thumb{position:relative;flex:none;border-radius:var(--ytp-radius,8px);overflow:hidden;background:${T('additive-background')}}
.ytp-thumb img{display:block;width:100%;height:100%;object-fit:cover;transition:filter .12s ease}
.ytp-thumb:hover img{filter:brightness(.7)}
.ytp-thumb-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;opacity:0;transition:opacity .12s ease}
.ytp-thumb:hover .ytp-thumb-ov,.ytp-thumb:focus-visible .ytp-thumb-ov{opacity:1}
.ytp-dur{position:absolute;right:4px;bottom:4px;padding:0 4px;border-radius:4px;font-size:12px;line-height:16px;font-weight:500;color:#fff;background:rgba(0,0,0,.8)}
.ytp-clamp2{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ytp-drop{position:absolute;left:8px;right:8px;top:-1px;height:2px;border-radius:2px;background:${T('call-to-action')}}
.ytp-drop.is-after{top:auto;bottom:-1px}

@media (prefers-reduced-motion:reduce){*,::before,::after,::backdrop{animation:none!important;transition:none!important}}
`;

/** Keys our UI consumes; everything else still reaches YouTube's hotkeys. */
const OWN_KEYS = new Set(['Enter', ' ', 'Escape']);

/**
 * YouTube's page tooltip for `el` (grey bubble 16px below, centred) on hover / keyboard focus. Top
 * layer, so a clipping host can't cut it; skipped while `el`'s own menu is open. `el` must already
 * be in its shadow root.
 */
export function pageTooltip(el: HTMLElement, text: string): void {
  const tip = document.createElement('div');
  tip.className = 'ytp-tip';
  tip.popover = 'manual';
  tip.textContent = text;
  tip.setAttribute('aria-hidden', 'true');
  el.after(tip);
  const show = () => {
    if (el.getAttribute('aria-expanded') === 'true') return;
    tip.showPopover();
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - 8 - w))}px`;
    tip.style.top = `${r.bottom + 16}px`;
  };
  const hide = () => tip.matches(':popover-open') && tip.hidePopover();
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', hide);
  el.addEventListener('focus', () => el.matches(':focus-visible') && show());
  el.addEventListener('blur', hide);
  el.addEventListener('click', hide);
}

/** Stroke icon; `extra` attributes come first, so they win over the defaults (e.g. ' stroke-width="2"'). */
export const icon = (d: string, extra = '') =>
  `<svg${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

/** Page-level <style> (light DOM); remove the returned element in the teardown. */
export const addStyle = (css: string) =>
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

/**
 * `<ytp-host id=id>` + open shadow root holding NATIVE_CSS + extraCss, then `html`. The caller inserts the host.
 * Not a <div>: YouTube's reset (`div{background:transparent;padding:0;font-size:100%…}`) beats
 * `:host` rules, so `:host{…}` in extraCss only works on a tag the reset doesn't list.
 * Key events YouTube would misread (its listeners only see the retargeted host) are stopped at
 * the host: typing in our inputs, Enter/Space/Esc on our controls, and keys a handler consumed.
 */
export function createHost(id: string, extraCss = '', html = ''): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('ytp-host');
  host.id = id;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${NATIVE_CSS + extraCss}</style>${html}`;
  const guard = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.defaultPrevented || OWN_KEYS.has(k.key) || isTypingTarget(k.composedPath()[0])) e.stopPropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup']) host.addEventListener(type, guard);
  return { host, root };
}

const GAP = 8; // anchor ↔ panel
const EDGE = 8; // min distance from the viewport edge
const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max));
const activeIn = (el: Element) => (el.getRootNode() as Document | ShadowRoot).activeElement;

/**
 * Light dismiss runs on pointerup, before the trigger's click: when the press was on the panel's
 * own anchor, that click must not reopen it. panel → that anchor, valid briefly.
 */
const dismissedBy = new WeakMap<HTMLElement, { anchor: Element; until: number }>();

/**
 * Shows `panel` (already inside a createHost root) as an auto popover next to `anchor`.
 * Calling it while the panel is open closes it, so a trigger's click handler can just call it.
 * Returns close(). Cleanup runs on `beforetoggle` (sync; `toggle` events get coalesced).
 */
export function openPopover(
  anchor: Element,
  panel: HTMLElement,
  opts: { align?: 'start' | 'end'; side?: 'below' | 'above' } = {},
): () => void {
  const d = dismissedBy.get(panel);
  dismissedBy.delete(panel);
  if (panel.matches(':popover-open') || (d?.anchor === anchor && performance.now() < d.until)) {
    if (panel.matches(':popover-open')) panel.hidePopover();
    return () => {};
  }

  let pressed = false;
  let ended = false;
  const onPress = () => (pressed = true);
  const end = () => {
    if (ended) return;
    ended = true;
    panel.removeEventListener('beforetoggle', onBefore);
    anchor.removeEventListener('pointerdown', onPress);
    removeEventListener('scroll', place, true);
    removeEventListener('resize', place);
    anchor.setAttribute('aria-expanded', 'false');
    if (pressed) dismissedBy.set(panel, { anchor, until: performance.now() + 1000 });
    // Esc / close() with focus inside → back to the anchor. A click elsewhere keeps its focus.
    if (panel.contains(activeIn(panel))) (anchor as HTMLElement).focus();
  };
  const close = () => (panel.matches(':popover-open') ? panel.hidePopover() : end());
  const onBefore = (e: Event) => (e as ToggleEvent).newState === 'closed' && end();
  const place = () => {
    // Anchor re-rendered away, or host torn down while open (no beforetoggle then).
    if (!anchor.isConnected || !panel.matches(':popover-open')) return close();
    const a = anchor.getBoundingClientRect();
    const { width: w, height: h } = panel.getBoundingClientRect();
    const fitsBelow = a.bottom + GAP + h <= innerHeight - EDGE;
    const fitsAbove = a.top - GAP - h >= EDGE;
    const above = opts.side === 'above' ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
    panel.style.top = `${clamp(above ? a.top - GAP - h : a.bottom + GAP, innerHeight - h - EDGE)}px`;
    panel.style.left = `${clamp(opts.align === 'end' ? a.right - w : a.left, innerWidth - w - EDGE)}px`;
  };

  panel.popover = 'auto';
  // `source` = invoker: a popover opened from inside this one nests instead of closing it.
  (panel as HTMLElement & { showPopover(o: { source: Element }): void }).showPopover({ source: anchor });
  panel.addEventListener('beforetoggle', onBefore);
  anchor.addEventListener('pointerdown', onPress);
  anchor.setAttribute('aria-expanded', 'true');
  place();
  addEventListener('scroll', place, { capture: true, passive: true });
  addEventListener('resize', place, { passive: true });

  const first = panel.querySelector<HTMLElement>('[role^="menuitem"], [autofocus]');
  if (first) first.focus();
  else {
    panel.tabIndex = -1;
    panel.focus();
  }
  return close;
}

/** ArrowUp/Down/Home/End move focus over the menu's enabled [role^=menuitem]s. Returns detach. */
export function menuKeys(menu: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent) => {
    const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(
      (el) => !el.matches(':disabled, [aria-disabled="true"]') && el.checkVisibility(),
    );
    const n = items.length;
    if (!n) return;
    const i = items.indexOf(activeIn(menu) as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? items[(i + 1) % n]
      : e.key === 'ArrowUp' ? items[(Math.max(i, 0) + n - 1) % n]
      : e.key === 'Home' ? items[0]
      : e.key === 'End' ? items[n - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    e.stopPropagation(); // YouTube maps these keys to volume/seek
    next.focus();
  };
  menu.addEventListener('keydown', onKey);
  return () => menu.removeEventListener('keydown', onKey);
}

const deepActive = () => {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a as HTMLElement | null;
};

/** showModal() + put focus back where it was when the dialog closes. */
export function showDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  // Opened from a popover menu: close it first so focus returns to (and is restored to) its anchor.
  deepActive()?.closest<HTMLElement>(':popover-open')?.hidePopover();
  const prev = deepActive();
  dialog.addEventListener('close', () => prev?.focus(), { once: true });
  dialog.showModal();
}
