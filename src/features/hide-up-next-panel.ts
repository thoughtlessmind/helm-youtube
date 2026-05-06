import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-up-next-panel';

/**
 * Hide the autoplay "Up next" panel that appears when a video ends.
 * Different from the recommendations rail — this is the in-player
 * countdown overlay.
 */
const CSS = `
.ytp-autonav-endscreen-upnext-container,
.ytp-autonav-endscreen-upnext-cancel-button,
.ytp-upnext {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'hide-up-next-panel',
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
