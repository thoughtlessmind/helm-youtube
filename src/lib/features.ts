import type { YTContext } from './yt/context';

/**
 * A feature is a self-contained unit of behavior. Lazy-loaded so that
 * disabled features cost zero on the YouTube page.
 */
export interface Feature {
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
  'focus-mode': () => import('../features/focus-mode'),
  'feed-filters': () => import('../features/feed-filters'),
  'customize-grid': () => import('../features/customize-grid'),
  'channel-groups': () => import('../features/channel-groups'),
  'playback-speed': () => import('../features/playback-speed'),
  'sponsorblock': () => import('../features/sponsorblock'),
  'read-later-queue': () => import('../features/read-later-queue'),
  'hide-end-screen-cards': () => import('../features/hide-end-screen-cards'),
  'auto-dismiss-still-watching': () => import('../features/auto-dismiss-still-watching'),
  'volume-boost': () => import('../features/volume-boost'),
  'loop-section': () => import('../features/loop-section'),
  'video-notes': () => import('../features/video-notes'),
  'watch-time': () => import('../features/watch-time'),
  'download-transcript': () => import('../features/download-transcript'),
  'screenshot-current-frame': () => import('../features/screenshot-current-frame'),
  'true-black-dark-mode': () => import('../features/true-black-dark-mode'),
};
