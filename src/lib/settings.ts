import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, tags) belongs
 * in chrome.storage.local — see TODO when those features arrive.
 */
export interface FeatureFlags {
  // 'hide-shorts': boolean;
}

const FLAGS_KEY = 'sync:featureFlags' as const;

export async function getEnabledFeatures(): Promise<string[]> {
  const flags = (await storage.getItem<FeatureFlags>(FLAGS_KEY)) ?? ({} as FeatureFlags);
  return Object.entries(flags)
    .filter(([, on]) => on)
    .map(([id]) => id);
}

export function watchEnabledFeatures(cb: (ids: string[]) => void): () => void {
  return storage.watch<FeatureFlags>(FLAGS_KEY, (flags) => {
    const ids = Object.entries(flags ?? {})
      .filter(([, on]) => on)
      .map(([id]) => id);
    cb(ids);
  });
}
