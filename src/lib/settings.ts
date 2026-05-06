import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, tags) belongs
 * in chrome.storage.local — see TODO when those features arrive.
 */
export interface FeatureFlags {
  'hide-shorts'?: boolean;
}

export const FEATURE_DEFAULTS: FeatureFlags = {
  'hide-shorts': true,
};

const FLAGS_KEY = 'sync:featureFlags' as const;

export async function getFlags(): Promise<FeatureFlags> {
  const stored = (await storage.getItem<FeatureFlags>(FLAGS_KEY)) ?? {};
  return { ...FEATURE_DEFAULTS, ...stored };
}

export async function setFlag(id: keyof FeatureFlags, on: boolean): Promise<void> {
  const flags = await getFlags();
  flags[id] = on;
  await storage.setItem(FLAGS_KEY, flags);
}

const enabledIds = (flags: FeatureFlags) =>
  Object.entries(flags)
    .filter(([, on]) => on)
    .map(([id]) => id);

export async function getEnabledFeatures(): Promise<string[]> {
  return enabledIds(await getFlags());
}

export function watchEnabledFeatures(cb: (ids: string[]) => void): () => void {
  return storage.watch<FeatureFlags>(FLAGS_KEY, (flags) => {
    cb(enabledIds({ ...FEATURE_DEFAULTS, ...(flags ?? {}) }));
  });
}
