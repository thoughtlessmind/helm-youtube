import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import { addStyle } from '../lib/yt/ui';

const ITEM = 'ytd-rich-grid-renderer ytd-rich-item-renderer:not(ytd-rich-section-renderer *)';

function buildCSS(cols: number): string {
  // YouTube's media queries override its own items-per-row var at narrow
  // viewports, so we set grid-template-columns explicitly. The CSS vars
  // are kept in sync for any internal YT calc that still reads them.
  // `display: contents` flattens YT's row wrappers so items become direct
  // grid children. `grid-auto-flow: dense` lets later items fill the gap
  // before a Shorts/Playables shelf so the grid stays packed.
  return `
ytd-rich-grid-renderer {
  --ytd-rich-grid-items-per-row: ${cols} !important;
  --ytd-rich-grid-posts-per-row: ${cols} !important;
  --ytd-rich-grid-slim-items-per-row: ${cols} !important;
  --ytd-rich-grid-game-cards-per-row: ${cols} !important;
  --ytd-rich-grid-mini-game-cards-per-row: ${cols} !important;
  --ytd-rich-grid-item-min-width: 0px !important;
  --ytd-rich-grid-item-max-width: 9999px !important;
}

ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer {
  display: grid !important;
  grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;
  gap: 16px 8px !important;
  grid-auto-flow: dense !important;
}

ytd-rich-grid-row,
ytd-rich-grid-row #contents.ytd-rich-grid-row {
  display: contents !important;
}

/* Section shelves (Shorts, Playables, Posts) take a full row so their
   horizontal scrollers don't break grid flow. */
ytd-rich-section-renderer {
  grid-column: 1 / -1 !important;
  width: 100% !important;
  max-width: none !important;
  margin: 0 0 24px 0 !important;
}

/* :not() excludes items nested inside section shelves like "Explore more
   topics" — those have their own internal layout we shouldn't override.
   Each card is a size container so its text can scale with it. */
${ITEM} {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 0 24px 0 !important;
  container-type: inline-size;
}

/* Text keeps the card's proportions: YouTube's 16px title / 14px metadata
   on a 360px-wide card, shrinking in ratio on narrower cards. Never larger
   than YouTube's size; floored at 11px / 10px to stay readable. */
${ITEM} .ytLockupMetadataViewModelTitle,
${ITEM} #video-title {
  font-size: clamp(11px, 4.44cqi, 16px) !important;
  line-height: 1.375em !important;
}
${ITEM} .ytContentMetadataViewModelMetadataText,
${ITEM} .ytContentMetadataViewModelDelimiter,
${ITEM} #metadata-line span,
${ITEM} ytd-channel-name #text {
  font-size: clamp(10px, 3.89cqi, 14px) !important;
  line-height: 1.43em !important;
}
`;
}

const feature: Feature = {
  async setup() {
    const style = addStyle(buildCSS((await getConfig('customize-grid')).columnsPerRow));
    const offConfig = watchConfig('customize-grid', (next) => (style.textContent = buildCSS(next.columnsPerRow)));
    return () => {
      offConfig();
      style.remove();
    };
  },
};

export default feature;
