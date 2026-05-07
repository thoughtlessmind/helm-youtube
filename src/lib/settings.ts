import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, tags) belongs
 * in chrome.storage.local — see TODO when those features arrive.
 */
export interface FeatureFlags {
  'hide-shorts'?: boolean;
  'auto-dismiss-still-watching'?: boolean;
  'hide-end-screen-cards'?: boolean;
  'default-playback-speed'?: boolean;
  'disable-autoplay'?: boolean;
  'hide-watch-page-sidebar'?: boolean;
  'true-black-dark-mode'?: boolean;
  'persistent-volume'?: boolean;
  'copy-timestamped-link'?: boolean;
  'screenshot-current-frame'?: boolean;
  'hide-up-next-panel'?: boolean;
  'volume-boost'?: boolean;
  'hide-comments-by-default'?: boolean;
  'hide-metadata'?: boolean;
  'loop-section'?: boolean;
}

export const FEATURE_DEFAULTS: FeatureFlags = {
  'hide-shorts': true,
  'auto-dismiss-still-watching': true,
  'hide-end-screen-cards': true,
  'default-playback-speed': false,
  'disable-autoplay': true,
  'hide-watch-page-sidebar': false,
  'true-black-dark-mode': false,
  'persistent-volume': true,
  'copy-timestamped-link': true,
  'screenshot-current-frame': true,
  'hide-up-next-panel': true,
  'volume-boost': false,
  'hide-comments-by-default': false,
  'hide-metadata': false,
  'loop-section': true,
};

/**
 * Per-feature config blobs (separate from on/off flag). Each feature
 * owns its own key under `sync:config:<id>`. Use TypeScript module
 * augmentation in feature files to type the value.
 */
export interface FeatureConfig {
  'default-playback-speed': { rate: number };
  'volume-boost': { multiplier: number };
}

export const FEATURE_CONFIG_DEFAULTS: FeatureConfig = {
  'default-playback-speed': { rate: 1 },
  'volume-boost': { multiplier: 1.5 },
};

export async function getConfig<K extends keyof FeatureConfig>(
  id: K,
): Promise<FeatureConfig[K]> {
  const key = `sync:config:${id}` as const;
  const stored = await storage.getItem<FeatureConfig[K]>(key);
  return { ...FEATURE_CONFIG_DEFAULTS[id], ...(stored ?? {}) };
}

export async function setConfig<K extends keyof FeatureConfig>(
  id: K,
  value: FeatureConfig[K],
): Promise<void> {
  const key = `sync:config:${id}` as const;
  await storage.setItem(key, value);
}

export function watchConfig<K extends keyof FeatureConfig>(
  id: K,
  cb: (value: FeatureConfig[K]) => void,
): () => void {
  const key = `sync:config:${id}` as const;
  return storage.watch<FeatureConfig[K]>(key, (value) => {
    cb({ ...FEATURE_CONFIG_DEFAULTS[id], ...(value ?? {}) });
  });
}

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
