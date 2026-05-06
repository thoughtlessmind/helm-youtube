import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-true-black-dark-mode';

/**
 * Override YouTube's dark-theme tokens to true black for OLED screens.
 * Only applies when YouTube is already in dark mode (the [dark]
 * attribute on <html>); we don't force dark mode on light-mode users.
 *
 * We override the public CSS custom properties YouTube uses for
 * background layers. Specific component classes (sidebar, header) get
 * an explicit background as a backstop.
 */
const CSS = `
html[dark] {
  --yt-spec-base-background: #000 !important;
  --yt-spec-raised-background: #000 !important;
  --yt-spec-menu-background: #0a0a0a !important;
  --yt-spec-additive-background: rgba(255, 255, 255, 0.04) !important;
}
html[dark] body,
html[dark] ytd-app,
html[dark] #masthead-container,
html[dark] ytd-mini-guide-renderer,
html[dark] ytd-guide-renderer,
html[dark] ytd-watch-flexy {
  background-color: #000 !important;
}
`;

const feature: Feature = {
  id: 'true-black-dark-mode',
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
