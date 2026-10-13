/**
 * One MutationObserver shared by every feature.
 *
 * Why: YouTube mutates the DOM aggressively (lazy-loaded video cards,
 * route transitions, comment lazy-render). A separate observer per
 * feature would mean N callbacks running on every mutation. Instead,
 * features subscribe to coarse events here and we batch-dispatch on the
 * next idle tick.
 *
 * Subscribers run inside requestIdleCallback to keep the main thread
 * free for YouTube's video player.
 */
export function createPageObserver() {
  const listeners = new Set<() => void>();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    for (const l of listeners) l();
  };

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(flush, { timeout: 200 });
  });

  // Scope to YouTube's main app root if available, falling back to body.
  const target = document.querySelector('ytd-app') ?? document.querySelector('#content') ?? document.body;
  observer.observe(target, { childList: true, subtree: true });

  return {
    /** For features that just want "the DOM changed, re-scan", debounced. */
    onChange(listener: () => void): () => void {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wrapped = () => {
        clearTimeout(timer);
        timer = setTimeout(listener, 100);
      };
      listeners.add(wrapped);
      return () => {
        clearTimeout(timer);
        listeners.delete(wrapped);
      };
    },
    destroy() {
      observer.disconnect();
      listeners.clear();
    },
  };
}
