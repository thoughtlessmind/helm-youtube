import type { Feature } from '../lib/features';
import { addStyle } from '../lib/yt/ui';

const CSS = `
/* Sidebar nav entries (full + mini guide) */
ytd-guide-entry-renderer:has(a[title="Shorts"]),
ytd-mini-guide-entry-renderer[aria-label="Shorts"] {
  display: none !important;
}

/* Shorts shelves on home, subscriptions, search */
ytd-rich-shelf-renderer[is-shorts],
ytd-reel-shelf-renderer,
grid-shelf-view-model:has(a[href*="/shorts/"]) {
  display: none !important;
}

/* Also collapse the wrapping section so it doesn't leave an empty row
   in the homepage grid (visible when customize-grid is on). */
ytd-rich-section-renderer:has(> #content > ytd-rich-shelf-renderer[is-shorts]),
ytd-rich-section-renderer:has(> #content > ytd-reel-shelf-renderer) {
  display: none !important;
}

/* Individual Shorts items in feeds (home grid, search results, related) */
ytd-rich-item-renderer:has(a[href^="/shorts/"]),
ytd-video-renderer:has(a[href^="/shorts/"]),
ytd-grid-video-renderer:has(a[href^="/shorts/"]),
ytd-compact-video-renderer:has(a[href^="/shorts/"]) {
  display: none !important;
}

/* Channel page Shorts tab */
yt-tab-shape[tab-title="Shorts"],
tp-yt-paper-tab:has(> .tab-content:is([href*="/shorts"])) {
  display: none !important;
}
`;

const feature: Feature = {
  setup() {
    const style = addStyle(CSS);
    // If we're already on a /shorts/ URL, send the user back home.
    if (location.pathname.startsWith('/shorts/')) location.replace('/');
    return () => style.remove();
  },
};

export default feature;
