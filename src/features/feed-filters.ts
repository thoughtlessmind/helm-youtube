/**
 * Feed filters: hide video cards by title keyword, by length, and flag
 * already-watched ones — across home, search, subscriptions and sidebar.
 *
 * - Keyword and length filters scan cards on every DOM change and hide via
 *   the shared feed-cards coordinator (other features hide cards too).
 * - Length filtering leaves cards with no parseable duration (live, Shorts,
 *   premieres) visible.
 * - Watched cards (a resume-progress bar on the thumbnail) are dimmed or
 *   hidden with pure CSS `:has()` — no scanning needed.
 */

import type { Feature } from '../lib/features';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';
import {
  cardDurationSeconds,
  cardTitle,
  enumerateVideoCards,
  hideCard,
  unhideAllCards,
  unhideCard,
} from '../lib/yt/feed-cards';

const FEATURE_ID = 'feed-filters';
const STYLE_ID = 'yt-pro-feed-filters';

type Config = FeatureConfig['feed-filters'];

const WATCHED = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
].map((r) => `${r}:has(ytd-thumbnail-overlay-resume-playback-renderer #progress)`);

const HIDE_WATCHED_CSS = `${WATCHED.join(',\n')} { display: none !important; }`;

const feature: Feature = {
  id: FEATURE_ID,

  async setup(ctx) {
    let keywords: string[] = [];
    let minSec = 0;
    let maxSec = 0;

    const shouldHide = (card: HTMLElement): boolean => {
      if (keywords.length) {
        const title = cardTitle(card).toLowerCase();
        if (keywords.some((kw) => title.includes(kw))) return true;
      }
      if (minSec || maxSec) {
        const dur = cardDurationSeconds(card);
        if (dur !== null && ((minSec && dur < minSec) || (maxSec && dur > maxSec))) return true;
      }
      return false;
    };

    const filterAll = () => {
      for (const card of enumerateVideoCards()) {
        if (shouldHide(card)) hideCard(card, FEATURE_ID);
        else unhideCard(card, FEATURE_ID);
      }
    };

    const apply = (cfg: Config) => {
      keywords = cfg.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      minSec = Math.max(0, cfg.minMinutes) * 60;
      maxSec = Math.max(0, cfg.maxMinutes) * 60;
      filterAll();

      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = cfg.hideWatched ? HIDE_WATCHED_CSS : '';
    };

    apply(await getConfig('feed-filters'));
    const offConfig = watchConfig('feed-filters', apply);
    const offObserver = ctx.observer.onChange(filterAll);

    return () => {
      offConfig();
      offObserver();
      unhideAllCards(FEATURE_ID);
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
