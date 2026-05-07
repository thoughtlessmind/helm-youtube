import type { Feature } from '../lib/features';

const STYLE_ID = 'yt-pro-hide-metadata';

/**
 * Reduce clickbait pull by hiding view counts and upload dates on
 * thumbnails throughout the site (homepage, search, related,
 * subscriptions, channel pages). The video title and channel name
 * stay — those are the signal we actually want.
 *
 * Targets the metadata line under each thumbnail. Different surfaces
 * use different renderers, so we cast a wide net.
 */
const CSS = `
/* Thumbnail metadata lines */
ytd-video-meta-block #metadata-line,
ytd-rich-grid-media #metadata-line,
ytd-grid-video-renderer #metadata-line,
ytd-compact-video-renderer #metadata-line,
ytd-video-renderer #metadata-line,
ytd-playlist-video-renderer #metadata-line {
  display: none !important;
}

/* Watch page: view count + relative date next to title */
ytd-watch-metadata #info,
ytd-watch-metadata .view-count {
  display: none !important;
}
`;

const feature: Feature = {
  id: 'hide-metadata',
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
