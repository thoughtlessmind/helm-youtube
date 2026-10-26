import { storage } from '#imports';

/**
 * Per-feature enabled flags live in chrome.storage.sync so they roam
 * across the user's devices. Bulky data (notes, analytics, queue) lives
 * in chrome.storage.local, owned by each feature.
 */
export const FEATURE_DEFAULTS = {
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
  'theme': false,
};

export type FeatureFlags = Partial<Record<keyof typeof FEATURE_DEFAULTS, boolean>>;

/**
 * Per-feature config blobs (separate from on/off flag). Each feature
 * owns its own key under `sync:config:<id>`.
 */
export const FEATURE_CONFIG_DEFAULTS = {
  'focus-mode': { homeFeed: true, recommendations: true, comments: false, metadata: false },
  'feed-filters': {
    /** Comma-separated, case-insensitive title substrings. */
    keywords: '',
    /** 0 = no limit. */
    minMinutes: 0,
    maxMinutes: 0,
    hideWatched: true,
  },
  /** Home's chip strip shows YouTube's own topic chips instead of the group switcher. */
  'channel-groups': { youtubeChips: false },
  'customize-grid': { columnsPerRow: 5 },
  /** 1×: a fresh install shouldn't speed every video up; what's on by default is the per-channel memory. */
  'playback-speed': { rate: 1, perChannel: true },
  /** SponsorBlock categories to auto-skip. */
  'sponsorblock': { sponsor: true, selfpromo: true, interaction: true, intro: false, outro: false },
  'read-later-queue': {
    autoAdvance: true,
    /** Redirect YouTube's own ⋮ → "Add to queue" to our queue. */
    nativeAdd: true,
    panelCollapsed: false,
  },
  'volume-boost': { multiplier: 1.5 },
  /** 0 = no limit. */
  'watch-time': { dailyLimitMinutes: 120 },
  /** A `THEMES` id from features/theme/themes.ts. */
  'theme': { preset: 'nord' },
};

export type FeatureConfig = typeof FEATURE_CONFIG_DEFAULTS;

const cfgKey = (id: keyof FeatureConfig) => `sync:config:${id}` as const;
const withDefaults = <K extends keyof FeatureConfig>(id: K, v: FeatureConfig[K] | null): FeatureConfig[K] => ({
  ...FEATURE_CONFIG_DEFAULTS[id],
  ...v,
});

export const getConfig = async <K extends keyof FeatureConfig>(id: K) =>
  withDefaults(id, await storage.getItem<FeatureConfig[K]>(cfgKey(id)));

export const setConfig = <K extends keyof FeatureConfig>(id: K, value: FeatureConfig[K]) =>
  storage.setItem(cfgKey(id), value);

export const watchConfig = <K extends keyof FeatureConfig>(id: K, cb: (value: FeatureConfig[K]) => void) =>
  storage.watch<FeatureConfig[K]>(cfgKey(id), (v) => cb(withDefaults(id, v)));

const FLAGS_KEY = 'sync:featureFlags';

export const getFlags = async (): Promise<FeatureFlags> => ({
  ...FEATURE_DEFAULTS,
  ...(await storage.getItem<FeatureFlags>(FLAGS_KEY)),
});

export async function setFlag(id: keyof FeatureFlags, on: boolean): Promise<void> {
  await storage.setItem(FLAGS_KEY, { ...(await getFlags()), [id]: on });
}

/** The popup's master switch (kill switch). */
export const extensionEnabled = storage.defineItem<boolean>('sync:extensionEnabled', { fallback: true });

export async function getEnabledFeatures(): Promise<string[]> {
  if (!(await extensionEnabled.getValue())) return [];
  return Object.entries(await getFlags())
    .filter(([, on]) => on)
    .map(([id]) => id);
}

export function watchEnabledFeatures(cb: (ids: string[]) => void): () => void {
  const emit = () => void getEnabledFeatures().then(cb);
  const offs = [storage.watch(FLAGS_KEY, emit), extensionEnabled.watch(emit)];
  return () => offs.forEach((off) => off());
}
