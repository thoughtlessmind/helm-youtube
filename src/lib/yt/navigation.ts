/**
 * YouTube is a SPA — it does not do full page loads when you click a
 * video. It fires a `yt-navigate-finish` event on document instead.
 * Features that need to react to route changes should subscribe here.
 */
export function createNavigationBus() {
  const listeners = new Set<(url: string) => void>();

  const handler = () => {
    const url = location.href;
    for (const l of listeners) l(url);
  };

  document.addEventListener('yt-navigate-finish', handler);

  return {
    onNavigate(listener: (url: string) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      document.removeEventListener('yt-navigate-finish', handler);
      listeners.clear();
    },
  };
}
