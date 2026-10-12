/**
 * block-keywords.ts
 *
 * Hide video cards whose title contains any blocked keyword
 * (case-insensitive substring match).
 *
 * Config: `keywords` — comma-separated string, default `''`.
 * Re-filters on DOM changes (lazy-loaded cards) and when config changes.
 *
 * FeatureConfig augmentation tells the settings module about this feature's
 * config shape so getConfig/watchConfig are properly typed.
 */

// Module augmentation — MUST be at the top, before any usage of settings types.
declare module '../lib/settings' {
  interface FeatureConfig {
    'block-keywords': {
      /** Comma-separated list of keywords to block (case-insensitive). */
      keywords: string;
    };
  }
}

import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import {
  enumerateVideoCards,
  cardTitle,
  hideCard,
  unhideCard,
  unhideAllCards,
} from '../lib/yt/feed-cards';

// ─── Constants ───────────────────────────────────────────────────────────────

const FEATURE_ID = 'block-keywords';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse the comma-separated keywords string into a lowercased array,
 * filtering out empty entries.
 */
function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

// ─── Feature ─────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: FEATURE_ID,

  async setup(ctx) {
    // Load initial config and pre-compute keyword list
    const initialCfg = await getConfig('block-keywords');
    let keywords = parseKeywords(initialCfg.keywords);

    /**
     * Apply / remove hiding for every card currently in the DOM.
     * Keywords are pre-computed outside the loop for O(n*k) not O(n*k*parse).
     */
    const filterAll = () => {
      for (const card of enumerateVideoCards()) {
        if (keywords.length === 0) {
          // No keywords — unhide anything this feature may have hidden
          unhideCard(card, FEATURE_ID);
          continue;
        }
        const title = cardTitle(card).toLowerCase();
        const shouldHide = keywords.some((kw) => title.includes(kw));
        if (shouldHide) {
          hideCard(card, FEATURE_ID);
        } else {
          unhideCard(card, FEATURE_ID);
        }
      }
    };

    // Re-filter when config changes (user edits the keyword list in the panel)
    const offConfig = watchConfig('block-keywords', (cfg) => {
      keywords = parseKeywords(cfg.keywords);
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
