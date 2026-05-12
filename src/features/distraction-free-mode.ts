import type { Feature } from '../lib/features';

const STYLE_ID = 'ytp-pro-distraction-free';
const ATTR = 'data-ytp-pro-df';

/**
 * Distraction-free watch page: hides everything except the player and
 * title. CSS gated on a `data-ytp-pro-df` attribute on <html>, toggled
 * by the SPA navigation event so we only activate on /watch routes.
 */
const CSS = `
html[${ATTR}] ytd-watch-next-secondary-results-renderer,
html[${ATTR}] ytd-watch-flexy ytd-comments,
html[${ATTR}] ytd-watch-flexy #comments,
html[${ATTR}] ytd-watch-flexy[is-two-columns_] #related,
html[${ATTR}] ytd-merch-shelf-renderer,
html[${ATTR}] ytd-ticket-shelf-renderer,
html[${ATTR}] #chips-wrapper,
html[${ATTR}] yt-chip-cloud-renderer,
html[${ATTR}] ytd-watch-metadata #description-inner,
html[${ATTR}] ytd-watch-metadata ytd-watch-info-text {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'distraction-free-mode',
  setup(ctx) {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const sync = () => {
      const onWatch = location.pathname.startsWith('/watch');
      if (onWatch) {
        document.documentElement.setAttribute(ATTR, '');
      } else {
        document.documentElement.removeAttribute(ATTR);
      }
    };

    sync();
    const offNav = ctx.navigation.onNavigate(() => sync());

    return () => {
      offNav();
      document.documentElement.removeAttribute(ATTR);
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
