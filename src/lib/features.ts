import type { YTContext } from './yt/context';

/**
 * A feature is a self-contained unit of behavior. Lazy-loaded so that
 * disabled features cost zero on the YouTube page.
 */
export interface Feature {
  id: string;
  /** Called once when the feature is enabled. Return a teardown fn. */
  setup(ctx: YTContext): void | (() => void) | Promise<void | (() => void)>;
}

type Loader = () => Promise<{ default: Feature }>;

/**
 * Registry maps feature id → dynamic import. Adding a new feature is one
 * line here plus one new file under src/features/.
 *
 * Keep these as `() => import(...)` so each feature ends up in its own
 * chunk and is only fetched/parsed when the user has it enabled.
 */
export const featureRegistry: Record<string, Loader> = {
  'hide-shorts': () => import('../features/hide-shorts'),
  'auto-dismiss-still-watching': () => import('../features/auto-dismiss-still-watching'),
  'hide-end-screen-cards': () => import('../features/hide-end-screen-cards'),
  'default-playback-speed': () => import('../features/default-playback-speed'),
  'disable-autoplay': () => import('../features/disable-autoplay'),
  'hide-watch-page-sidebar': () => import('../features/hide-watch-page-sidebar'),
  'true-black-dark-mode': () => import('../features/true-black-dark-mode'),
  'persistent-volume': () => import('../features/persistent-volume'),
  'copy-timestamped-link': () => import('../features/copy-timestamped-link'),
  'screenshot-current-frame': () => import('../features/screenshot-current-frame'),
  'hide-up-next-panel': () => import('../features/hide-up-next-panel'),
  'volume-boost': () => import('../features/volume-boost'),
  'hide-comments-by-default': () => import('../features/hide-comments-by-default'),
  'hide-metadata': () => import('../features/hide-metadata'),
  'loop-section': () => import('../features/loop-section'),
  'customize-grid': () => import('../features/customize-grid'),
  'save-to-playlist': () => import('../features/save-to-playlist'),
  'distraction-free-mode': () => import('../features/distraction-free-mode'),
  'thumbnail-save-button': () => import('../features/thumbnail-save-button'),
  'theme-presets': () => import('../features/theme-presets'),
  'per-channel-speed': () => import('../features/per-channel-speed'),
  'per-channel-skip-segments': () => import('../features/per-channel-skip-segments'),
  'mute-channels': () => import('../features/mute-channels'),
  'block-keywords': () => import('../features/block-keywords'),
  'block-by-length': () => import('../features/block-by-length'),
  'video-tags': () => import('../features/video-tags'),
  'video-notes': () => import('../features/video-notes'),
  'favorite-channels': () => import('../features/favorite-channels'),
  'read-later-queue': () => import('../features/read-later-queue'),
  'sticky-mini-player': () => import('../features/sticky-mini-player'),
  'resize-player': () => import('../features/resize-player'),
  'picture-in-picture': () => import('../features/picture-in-picture'),
  'subscription-folders': () => import('../features/subscription-folders'),
  'custom-dashboards': () => import('../features/custom-dashboards'),
  'bulk-watch-later': () => import('../features/bulk-watch-later'),
  'sponsorblock': () => import('../features/sponsorblock'),
  'dislike-count': () => import('../features/dislike-count'),
  'reading-time': () => import('../features/reading-time'),
  'flag-watched': () => import('../features/flag-watched'),
  'transcript-panel': () => import('../features/transcript-panel'),
  'download-transcript': () => import('../features/download-transcript'),
  'watch-analytics': () => import('../features/watch-analytics'),
  'channel-watch-stat': () => import('../features/channel-watch-stat'),
  'watch-goals': () => import('../features/watch-goals'),
  'channel-stats': () => import('../features/channel-stats'),
  'history-search': () => import('../features/history-search'),
  'multi-video-grid': () => import('../features/multi-video-grid'),
  'compare-videos': () => import('../features/compare-videos'),
  'ai-summarize': () => import('../features/ai-summarize'),
  'ai-chapters': () => import('../features/ai-chapters'),
  'ai-ask': () => import('../features/ai-ask'),
};
