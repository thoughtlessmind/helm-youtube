import { createYTContext } from '../lib/yt/context';
import { featureRegistry } from '../lib/features';
import { getEnabledFeatures, watchEnabledFeatures } from '../lib/settings';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  async main() {
    const ctx = createYTContext();
    const teardowns = new Map<string, () => void>();

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
        }
      }
    };

    sync(await getEnabledFeatures());
    watchEnabledFeatures(sync);
  },
});
