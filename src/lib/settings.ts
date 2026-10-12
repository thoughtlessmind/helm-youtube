import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, queue) lives
 * in chrome.storage.local, owned by each feature.
 */
export interface FeatureFlags {
  'hide-shorts'?: boolean;
  'focus-mode'?: boolean;
  'feed-filters'?: boolean;
  'customize-grid'?: boolean;
  'channel-groups'?: boolean;
  'playback-speed'?: boolean;
  'sponsorblock'?: boolean;
  'read-later-queue'?: boolean;
  'hide-end-screen-cards'?: boolean;
  'auto-dismiss-still-watching'?: boolean;
  'volume-boost'?: boolean;
  'loop-section'?: boolean;
  'video-notes'?: boolean;
  'watch-time'?: boolean;
  'download-transcript'?: boolean;
  'screenshot-current-frame'?: boolean;
  'true-black-dark-mode'?: boolean;
}

export const FEATURE_DEFAULTS: FeatureFlags = {
  'hide-shorts': true,
  'focus-mode': false,
  'feed-filters': false,
  'customize-grid': false,
  'channel-groups': false,
  'playback-speed': true,
  'sponsorblock': false,
  'read-later-queue': false,
  'hide-end-screen-cards': true,
  'auto-dismiss-still-watching': true,
  'volume-boost': false,
  'loop-section': true,
  'video-notes': false,
  'watch-time': false,
  'download-transcript': false,
  'screenshot-current-frame': true,
  'true-black-dark-mode': false,
};

/**
 * Per-feature config blobs (separate from on/off flag). Each feature
 * owns its own key under `sync:config:<id>`.
 */
export interface FeatureConfig {
  'focus-mode': {
    recommendations: boolean;
    comments: boolean;
    metadata: boolean;
  };
  'feed-filters': {
    /** Comma-separated, case-insensitive title substrings. */
    keywords: string;
    /** 0 = no limit. */
    minMinutes: number;
    maxMinutes: number;
    watched: 'show' | 'dim' | 'hide';
  };
  'customize-grid': { columnsPerRow: number; hideCardInfo: boolean };
  'playback-speed': { rate: number; perChannel: boolean };
  'volume-boost': { multiplier: number };
  /** 0 = no limit. */
  'watch-time': { dailyLimitMinutes: number };
}

export const FEATURE_CONFIG_DEFAULTS: FeatureConfig = {
  'focus-mode': { recommendations: true, comments: true, metadata: false },
  'feed-filters': { keywords: '', minMinutes: 0, maxMinutes: 0, watched: 'show' },
  'customize-grid': { columnsPerRow: 3, hideCardInfo: false },
  'playback-speed': { rate: 1, perChannel: true },
  'volume-boost': { multiplier: 1.5 },
  'watch-time': { dailyLimitMinutes: 0 },
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
