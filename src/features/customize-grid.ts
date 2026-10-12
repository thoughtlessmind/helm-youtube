import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';

const STYLE_ID = 'yt-pro-customize-grid';
const MIN_COLS = 3;
const MAX_COLS = 12;

function buildCSS(columns: number): string {
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, columns));

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
   topics" — those have their own internal layout we shouldn't override. */
ytd-rich-grid-renderer ytd-rich-item-renderer:not(ytd-rich-section-renderer *) {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 0 24px 0 !important;
}
`;
}

function applyStyle(css: string): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

const feature: Feature = {
  id: 'customize-grid',
  async setup() {
    const cfg = await getConfig('customize-grid');
    applyStyle(buildCSS(cfg.columnsPerRow));

    const offConfig = watchConfig('customize-grid', (next) => {
      applyStyle(buildCSS(next.columnsPerRow));
    });

    return () => {
      offConfig();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
