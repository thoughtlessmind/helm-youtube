import type { Feature } from '../lib/features';
import { addStyle } from '../lib/yt/ui';

/* Matched by link, not label or card tag, so it holds in any UI language and
   whichever card YouTube renders the game as. */
const CSS = `
/* Sidebar nav entries (full + mini guide) */
ytd-guide-entry-renderer:has(a[href^="/playables"]),
ytd-mini-guide-entry-renderer:has(a[href^="/playables"]) {
  display: none !important;
}

/* Playables shelves on Home, with their wrapping section so no empty row is left */
ytd-rich-section-renderer:has(a[href^="/playables/"]),
ytd-rich-shelf-renderer:has(a[href^="/playables/"]),
ytd-shelf-renderer:has(a[href^="/playables/"]) {
  display: none !important;
}

/* Individual game cards in feeds, search, related */
ytd-rich-item-renderer:has(a[href^="/playables/"]),
ytd-video-renderer:has(a[href^="/playables/"]),
ytd-compact-video-renderer:has(a[href^="/playables/"]),
yt-lockup-view-model:has(a[href^="/playables/"]) {
  display: none !important;
}
`;

const feature: Feature = {
  setup() {
    const style = addStyle(CSS);
    if (location.pathname.startsWith('/playables')) location.replace('/');
    return () => style.remove();
  },
};

export default feature;
