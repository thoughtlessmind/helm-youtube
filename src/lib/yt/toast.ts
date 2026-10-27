import { createHost } from './ui';

/**
 * YouTube-native toast: bottom-left, inverted surface, optional blue action (e.g. Undo).
 * One at a time — a new toast replaces the current one. The host (with its role=status live
 * region) is created on first use and kept, so screen readers announce every message. It is the
 * one position:fixed element we add; it moves into the fullscreen element so it shows there too.
 */
const CSS = `
.region{position:fixed;left:24px;bottom:24px;z-index:2300}
.toast{display:flex;align-items:center;gap:12px;box-sizing:border-box;min-height:48px;max-width:calc(100vw - 48px);padding:0 16px;border-radius:8px;background:var(--yt-sys-color-baseline--inverted-background);color:var(--yt-sys-color-baseline--text-primary-inverse);box-shadow:0 4px 16px var(--yt-sys-color-baseline--shadow-medium);animation:toast-in .18s ease-out}
.toast.has-action{padding-right:8px}
.toast span{padding:14px 0}
.toast button{flex:none;height:36px;padding:0 12px;margin:0;border:0;border-radius:18px;font:inherit;font-weight:500;color:var(--yt-sys-color-baseline--call-to-action-inverse);background:none;cursor:pointer}
.toast button:hover{background:var(--yt-sys-color-baseline--suggested-action-inverse)}
@keyframes toast-in{from{opacity:0;transform:translateY(8px)}}
`;

let host: HTMLElement | undefined;
let region: HTMLElement;
let timer = 0;

export function flashToast(
  text: string,
  opts: { action?: { label: string; onClick: () => void } } = {},
): void {
  if (!host) {
    let root: ShadowRoot;
    ({ host, root } = createHost('ytp-toast-host', CSS));
    region = document.createElement('div');
    region.className = 'region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    root.append(region);
  }
  const parent = document.fullscreenElement ?? document.body;
  if (host.parentNode !== parent) parent.append(host);

  const toast = document.createElement('div');
  toast.className = 'toast';
  const label = document.createElement('span');
  label.textContent = text;
  toast.append(label);

  const ms = opts.action ? 4000 : 2500;
  // Every handler is a no-op once a newer toast replaced this one (its timer isn't ours).
  const current = () => region.firstChild === toast;
  const dismiss = () => {
    if (!current()) return;
    clearTimeout(timer);
    region.replaceChildren();
  };
  const pause = () => current() && clearTimeout(timer);
  const arm = () => {
    if (!current()) return;
    clearTimeout(timer);
    timer = window.setTimeout(dismiss, ms);
  };
  if (opts.action) {
    const { label: actionLabel, onClick } = opts.action;
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      dismiss();
      onClick();
    });
    toast.classList.add('has-action');
    toast.append(btn);
    // Don't time out under the pointer or keyboard focus (WCAG 2.2.1).
    toast.addEventListener('pointerenter', pause);
    toast.addEventListener('pointerleave', arm);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', arm);
  }
  region.replaceChildren(toast);
  arm();
}
