/**
 * block-by-length.ts
 *
 * Hide video cards that fall outside the user-configured length window.
 *
 * Config:
 *   minMinutes — hide videos shorter than this (0 = no lower limit)
 *   maxMinutes — hide videos longer than this (0 = no upper limit)
 *
 * Cards with no parseable duration (live streams, Shorts, Premieres, upcoming)
 * are always left visible — never assume null === 0 seconds.
 *
 * Re-filters on DOM changes (lazy-loaded cards) and when config changes.
 */

// Module augmentation — MUST be at the top, before any usage of settings types.
declare module '../lib/settings' {
  interface FeatureConfig {
    'block-by-length': {
      /** Minimum video length in minutes. 0 = no lower limit. */
      minMinutes: number;
      /** Maximum video length in minutes. 0 = no upper limit. */
      maxMinutes: number;
    };
  }
}

import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import {
  enumerateVideoCards,
  cardDurationSeconds,
  hideCard,
  unhideCard,
  unhideAllCards,
} from '../lib/yt/feed-cards';

// ─── Constants ───────────────────────────────────────────────────────────────

const FEATURE_ID = 'block-by-length';

// ─── Feature ─────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: FEATURE_ID,

  async setup(ctx) {
    // Load initial config
    const initialCfg = await getConfig('block-by-length');
    let minMinutes = initialCfg.minMinutes;
    let maxMinutes = initialCfg.maxMinutes;

    /**
     * Determine whether a duration in seconds should be hidden given the
     * current min/max config. Returns null if no filter is active.
     *
     * @param seconds  Video duration in seconds.
     * @returns `true` if the card should be hidden.
     */
    const shouldHideDuration = (seconds: number): boolean => {
      const minSec = minMinutes > 0 ? minMinutes * 60 : null;
      const maxSec = maxMinutes > 0 ? maxMinutes * 60 : null;

      if (minSec !== null && seconds < minSec) return true;
      if (maxSec !== null && seconds > maxSec) return true;
      return false;
    };

    /**
     * Returns true when neither limit is set — allows skipping the per-card
     * loop entirely for a zero-cost idle pass.
     */
    const noLimitsActive = (): boolean => minMinutes === 0 && maxMinutes === 0;

    /**
     * Apply / remove hiding for every card currently in the DOM.
     */
    const filterAll = () => {
      for (const card of enumerateVideoCards()) {
        if (noLimitsActive()) {
          // Both limits cleared — unhide anything this feature hid
          unhideCard(card, FEATURE_ID);
          continue;
        }

        const durSec = cardDurationSeconds(card);

        if (durSec === null) {
          // Live / Shorts / Premiere / no badge — always visible
          unhideCard(card, FEATURE_ID);
          continue;
        }

        if (shouldHideDuration(durSec)) {
          hideCard(card, FEATURE_ID);
        } else {
          unhideCard(card, FEATURE_ID);
        }
      }
    };

    // Re-filter when config changes
    const offConfig = watchConfig('block-by-length', (cfg) => {
      minMinutes = cfg.minMinutes;
      maxMinutes = cfg.maxMinutes;
      filterAll();
    });

    // Re-filter when YouTube lazy-loads more cards
    const offObserver = ctx.observer.onChange(filterAll);

    // Initial pass
    filterAll();

    // Teardown
    return () => {
      offConfig();
      offObserver();
      unhideAllCards(FEATURE_ID);
    };
  },
};

export default feature;
