import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-end-screen-cards';

/**
 * The end-screen suggested-video overlay covers the last ~20s of every
 * video. CSS-only — YouTube renders these inside the player as
 * `.ytp-ce-element` (cards) and `.ytp-endscreen-content` (the full
 * suggestion grid).
 */
const CSS = `
.ytp-ce-element,
.ytp-ce-covering-overlay,
.ytp-ce-element-shadow,
.ytp-ce-covering-image,
.ytp-ce-expanding-overlay-background,
.ytp-endscreen-content {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'hide-end-screen-cards',
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
