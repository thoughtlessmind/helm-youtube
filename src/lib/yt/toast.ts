/**
 * Lightweight toast for user feedback after a keyboard action. Appended
 * to <body>, removed after a short delay. Pure DOM, no framework.
 */

export function flashToast(text: string, durationMs = 1200) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 15, 15, 0.95)',
    color: '#f1f1f1',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '999999',
    pointerEvents: 'none',
    transition: 'opacity 200ms',
    opacity: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, durationMs);
}
