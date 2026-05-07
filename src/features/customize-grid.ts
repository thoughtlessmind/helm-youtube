import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';

const STYLE_ID = 'yt-pro-customize-grid';

function buildCSS(columns: number, hideCardInfo: boolean): string {
  const cols = Math.max(3, Math.min(12, columns));
  // YouTube's rich grid renderer respects these CSS vars across breakpoints.
  // Forcing all of them keeps the count stable as the viewport resizes.
  let css = `
ytd-rich-grid-renderer {
  --ytd-rich-grid-items-per-row: ${cols} !important;
  --ytd-rich-grid-posts-per-row: ${cols} !important;
  --ytd-rich-grid-slim-items-per-row: ${cols} !important;
  --ytd-rich-grid-game-cards-per-row: ${cols} !important;
  --ytd-rich-grid-mini-game-cards-per-row: ${cols} !important;
}
`;
  if (hideCardInfo) {
    // Hide everything below the thumbnail: title, channel, metadata, menus.
    css += `
ytd-rich-item-renderer #details,
ytd-rich-item-renderer #meta,
ytd-rich-grid-media #details,
ytd-rich-grid-media #meta,
ytd-grid-video-renderer #meta,
ytd-video-renderer #meta,
ytd-compact-video-renderer #meta {
  display: none !important;
}
`;
  }
  return css;
}

function applyStyle(css: string) {
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
    applyStyle(buildCSS(cfg.columnsPerRow, cfg.hideCardInfo));

    const offConfig = watchConfig('customize-grid', (next) => {
      applyStyle(buildCSS(next.columnsPerRow, next.hideCardInfo));
    });

    return () => {
      offConfig();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
