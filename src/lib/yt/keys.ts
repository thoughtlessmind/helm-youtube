/**
 * Helper for page-level keyboard shortcuts. Skips events when the user
 * is typing into an input, textarea, contenteditable, or the search
 * bar — otherwise the shortcut would steal keystrokes from comments,
 * playlist titles, etc.
 */

// YouTube's search box is a div[contenteditable] or an input — both covered.
export const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function onKey(key: string, handler: (e: KeyboardEvent) => void): () => void {
  const wrapped = (e: KeyboardEvent) => {
    if (e.repeat || e.key.toLowerCase() !== key.toLowerCase()) return; // holding S: one screenshot
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    // composedPath()[0]: inside our shadow roots e.target is just the host.
    if (isTypingTarget(e.composedPath()[0] ?? e.target)) return;
    handler(e);
  };
  document.addEventListener('keydown', wrapped, true);
  return () => document.removeEventListener('keydown', wrapped, true);
}
