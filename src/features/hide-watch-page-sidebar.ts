import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-watch-page-sidebar';

/**
 * Hide the right-rail recommendations on the watch page. We keep the
 * primary column at its current width (YouTube's theater-mode CSS does
 * the full-width thing; we don't fight its layout).
 *
 * #secondary also hosts engagement panels (transcript, chapters) and live
 * chat, which never load while it's display:none — that broke YouTube's
 * own transcript and every transcript-based feature. So only the
 * recommendations are hidden; the column collapses unless one of those
 * is open.
 */
const CSS = `
ytd-watch-next-secondary-results-renderer {
  display: none !important;
}
ytd-watch-flexy[role="main"] #secondary:not(:has(
  ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"],
  ytd-live-chat-frame
)) {
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
