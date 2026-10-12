import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, queue) lives
 * in chrome.storage.local, owned by each feature.
 */
export interface FeatureFlags {
  'hide-shorts'?: boolean;
  'auto-dismiss-still-watching'?: boolean;
  'hide-end-screen-cards'?: boolean;
  'default-playback-speed'?: boolean;
  'hide-watch-page-sidebar'?: boolean;
  'true-black-dark-mode'?: boolean;
  'screenshot-current-frame'?: boolean;
  'hide-up-next-panel'?: boolean;
  'volume-boost'?: boolean;
  'hide-comments-by-default'?: boolean;
  'hide-metadata'?: boolean;
  'loop-section'?: boolean;
  'customize-grid'?: boolean;
  'distraction-free-mode'?: boolean;
  'per-channel-speed'?: boolean;
  'block-keywords'?: boolean;
  'block-by-length'?: boolean;
  'video-notes'?: boolean;
  'favorite-channels'?: boolean;
  'read-later-queue'?: boolean;
  'subscription-folders'?: boolean;
  'custom-dashboards'?: boolean;
  'sponsorblock'?: boolean;
  'flag-watched'?: boolean;
  'download-transcript'?: boolean;
  'watch-analytics'?: boolean;
  'channel-watch-stat'?: boolean;
  'watch-goals'?: boolean;
}

export const FEATURE_DEFAULTS: FeatureFlags = {
  'hide-shorts': true,
  'auto-dismiss-still-watching': true,
  'hide-end-screen-cards': true,
  'default-playback-speed': false,
  'hide-watch-page-sidebar': false,
  'true-black-dark-mode': false,
  'screenshot-current-frame': true,
  'hide-up-next-panel': true,
  'volume-boost': false,
  'hide-comments-by-default': false,
  'hide-metadata': false,
  'loop-section': true,
  'customize-grid': false,
  'distraction-free-mode': false,
  'per-channel-speed': true,
  'block-keywords': false,
  'block-by-length': false,
  'video-notes': false,
  'favorite-channels': false,
  'read-later-queue': false,
  'subscription-folders': false,
  'custom-dashboards': false,
  'sponsorblock': false,
  'flag-watched': false,
  'download-transcript': false,
  'watch-analytics': false,
  'channel-watch-stat': false,
  'watch-goals': false,
};

/**
 * Per-feature config blobs (separate from on/off flag). Each feature
 * owns its own key under `sync:config:<id>`. Use TypeScript module
 * augmentation in feature files to type the value.
 */
export interface FeatureConfig {
  'default-playback-speed': { rate: number };
  'volume-boost': { multiplier: number };
  'customize-grid': { columnsPerRow: number; hideCardInfo: boolean };
  // Note: block-keywords and block-by-length augment this interface from
  // their own feature files (module augmentation). They appear in
  // FEATURE_CONFIG_DEFAULTS below.
  'watch-goals': { dailyLimitMinutes: number };
  // Note: flag-watched augments this interface from its own feature file.
}

export const FEATURE_CONFIG_DEFAULTS: FeatureConfig = {
  'default-playback-speed': { rate: 1 },
  'volume-boost': { multiplier: 1.5 },
  'customize-grid': { columnsPerRow: 3, hideCardInfo: false },
  'block-keywords': { keywords: '' },
  'block-by-length': { minMinutes: 0, maxMinutes: 0 },
  'watch-goals': { dailyLimitMinutes: 120 },
  'flag-watched': { mode: 'dim' },
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
const EXTENSION_ENABLED_KEY = 'sync:extensionEnabled' as const;

export async function getFlags(): Promise<FeatureFlags> {
  const stored = (await storage.getItem<FeatureFlags>(FLAGS_KEY)) ?? {};
  return { ...FEATURE_DEFAULTS, ...stored };
}

export async function setFlag(id: keyof FeatureFlags, on: boolean): Promise<void> {
  const flags = await getFlags();
  flags[id] = on;
  await storage.setItem(FLAGS_KEY, flags);
}

export async function getExtensionEnabled(): Promise<boolean> {
  const stored = await storage.getItem<boolean>(EXTENSION_ENABLED_KEY);
  return stored ?? true;
}

export async function setExtensionEnabled(on: boolean): Promise<void> {
  await storage.setItem(EXTENSION_ENABLED_KEY, on);
}

export function watchExtensionEnabled(cb: (on: boolean) => void): () => void {
  return storage.watch<boolean>(EXTENSION_ENABLED_KEY, (value) => {
    cb(value ?? true);
  });
}

const enabledIds = (flags: FeatureFlags) =>
  Object.entries(flags)
    .filter(([, on]) => on)
    .map(([id]) => id);

export async function getEnabledFeatures(): Promise<string[]> {
  const on = await getExtensionEnabled();
  if (!on) return [];
  return enabledIds(await getFlags());
}

export function watchEnabledFeatures(cb: (ids: string[]) => void): () => void {
  const emit = async () => {
    cb(await getEnabledFeatures());
  };
  const offFlags = storage.watch<FeatureFlags>(FLAGS_KEY, () => {
    void emit();
  });
  const offEnabled = storage.watch<boolean>(EXTENSION_ENABLED_KEY, () => {
    void emit();
  });
  return () => {
    offFlags();
    offEnabled();
  };
}
