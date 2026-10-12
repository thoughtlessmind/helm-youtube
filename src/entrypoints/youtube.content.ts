import { createYTContext } from '../lib/yt/context';
import { featureRegistry } from '../lib/features';
import { getEnabledFeatures, watchEnabledFeatures } from '../lib/settings';
import { mountHeaderMenu } from '../lib/yt/header-menu';
import { installThemeAliases } from '../lib/yt/theme';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
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

    installThemeAliases();

    // Header menu mounts independently of feature flags — it must remain
    // available even when the extension kill-switch is off.
    mountHeaderMenu(ctx);

    const sync = async (enabledIds: string[]) => {
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
          console.error(`[youtube-pro] feature "${id}" failed to load`, err);
          devLog(`setup ${id}: ${(err as Error)?.stack ?? err}`);
        }
      }
    };

    sync(await getEnabledFeatures());
    watchEnabledFeatures(sync);
  },
});
