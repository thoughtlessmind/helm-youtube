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
  'custom-css': () => import('../features/custom-css'),
  'distraction-free-mode': () => import('../features/distraction-free-mode'),
};
