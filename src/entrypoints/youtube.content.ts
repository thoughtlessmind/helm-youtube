import { createYTContext } from '../lib/yt/context';
import { featureRegistry } from '../lib/features';
import { getEnabledFeatures, watchEnabledFeatures } from '../lib/settings';
import { installPlayerBridge } from '../lib/yt/player-bridge';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  async main(wxt) {
    const ctx = createYTContext();
    const teardowns = new Map<string, () => void>();

    // Dev-only: isolated-world errors never reach the page console, so mirror
    // them onto <html data-ytp-errors> where smoke tests can read them.
    const devLog = (msg: string) => {
      if (!import.meta.env.DEV) return;
      const el = document.documentElement;
      el.dataset.ytpErrors = ((el.dataset.ytpErrors ?? '') + msg + '\n').slice(-8000);
    };
    if (import.meta.env.DEV) {
      addEventListener('error', (e) => devLog(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
      addEventListener('unhandledrejection', (e) => devLog(`rejection: ${e.reason?.stack ?? e.reason}`));
    }

    // The popup's now-playing card talks to every YouTube tab, even with
    // every feature (or the whole extension) switched off.
    installPlayerBridge();

    const apply = async (enabledIds: string[]) => {
      if (wxt.isInvalid) return;
      const enabled = new Set(enabledIds);

      for (const [id, off] of teardowns) {
        if (!enabled.has(id)) {
          off();
          teardowns.delete(id);
        }
      }

      for (const id of enabled) {
        if (teardowns.has(id)) continue;
        const loader = featureRegistry[id];
        if (!loader) continue;
        try {
          const mod = await loader();
          const result = await mod.default.setup(ctx);
          teardowns.set(id, typeof result === 'function' ? result : () => {});
        } catch (err) {
          console.error(`[helm] feature "${id}" failed to load`, err);
          devLog(`setup ${id}: ${(err as Error)?.stack ?? err}`);
        }
      }
    };

    // One sync at a time: a toggle (or the kill switch) arriving mid-setup
    // must not double-set-up a feature or miss tearing one down.
    let queue = Promise.resolve();
    const sync = (ids: string[]) => (queue = queue.then(() => apply(ids)));

    // Extension updated/reloaded: this script is orphaned (storage and
    // messaging throw). Remove everything it added so the page is plain YouTube.
    wxt.onInvalidated(() => {
      for (const off of teardowns.values()) {
        try {
          off();
        } catch {}
      }
      teardowns.clear();
      ctx.observer.destroy();
      ctx.navigation.destroy();
    });

    sync(await getEnabledFeatures());
    watchEnabledFeatures(sync);
  },
});
