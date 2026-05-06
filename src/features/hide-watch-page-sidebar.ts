import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-watch-page-sidebar';

/**
 * Hide the right-rail recommendations on the watch page. We keep the
 * primary column at its current width (YouTube's theater-mode CSS does
 * the full-width thing; we don't fight its layout).
 *
 * Scoped via :is(...) so it only triggers on watch pages.
 */
const CSS = `
ytd-watch-flexy[role="main"] #secondary,
ytd-watch-flexy[role="main"] #secondary-inner,
ytd-watch-next-secondary-results-renderer {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'hide-watch-page-sidebar',
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
