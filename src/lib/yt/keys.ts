/**
 * Helper for page-level keyboard shortcuts. Skips events when the user
 * is typing into an input, textarea, contenteditable, or the search
 * bar — otherwise the shortcut would steal keystrokes from comments,
 * playlist titles, etc.
 */

export type KeyHandler = (e: KeyboardEvent) => void;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // YouTube's search box is a div[contenteditable] or input — covered above.
  return false;
}

export function onKey(key: string, handler: KeyHandler): () => void {
  const wrapped = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== key.toLowerCase()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (isTypingTarget(e.target)) return;
    handler(e);
  };
  document.addEventListener('keydown', wrapped, true);
  return () => document.removeEventListener('keydown', wrapped, true);
}
