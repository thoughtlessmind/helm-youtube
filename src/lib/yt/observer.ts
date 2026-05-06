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

type Listener = (mutations: MutationRecord[]) => void;

export interface PageObserver {
  subscribe(listener: Listener): () => void;
  /** For features that just want "the DOM changed, re-scan", debounced. */
  onChange(listener: () => void): () => void;
  destroy(): void;
}

export function createPageObserver(): PageObserver {
  const listeners = new Set<Listener>();
  let pendingMutations: MutationRecord[] = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const batch = pendingMutations;
    pendingMutations = [];
    for (const l of listeners) l(batch);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const ric = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 16));
    ric(flush, { timeout: 200 });
  };

  const observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations);
    schedule();
  });

  // Scope to YouTube's main app root if available, falling back to body.
  const target =
    document.querySelector('ytd-app') ?? document.querySelector('#content') ?? document.body;
  observer.observe(target, { childList: true, subtree: true });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onChange(listener) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const wrapped: Listener = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(listener, 100);
      };
      listeners.add(wrapped);
      return () => {
        if (timer) clearTimeout(timer);
        listeners.delete(wrapped);
      };
    },
    destroy() {
      observer.disconnect();
      listeners.clear();
    },
  };
}
