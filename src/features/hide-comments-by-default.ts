import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-comments-by-default';

/**
 * Hide the comments section on watch pages. Pure CSS — leaves the
 * DOM in place so the user can re-enable the feature without
 * reloading. (No reveal-button injection yet — that's a future
 * iteration once we have a "feature-injected UI" pattern.)
 */
const CSS = `
ytd-watch-flexy ytd-comments,
ytd-watch-flexy #comments {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'hide-comments-by-default',
  setup() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => document.getElementById(STYLE_ID)?.remove();
  },
};

export default feature;
