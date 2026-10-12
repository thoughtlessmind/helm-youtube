import type { Feature } from '../lib/features';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';

const STYLE_ID = 'yt-pro-focus-mode';

type Surface = keyof FeatureConfig['focus-mode'];

/** One CSS block per surface; the enabled ones are concatenated into one <style>. */
const CSS: Record<Surface, string> = {
  /** Calm home replacement is built in setup(); see T7. */
  homeFeed: '',

  /**
   * #secondary also hosts engagement panels (transcript, chapters) and live
   * chat, which never load while it's display:none — that broke YouTube's
   * own transcript and every transcript-based feature. So only the
   * recommendations are hidden; the column collapses unless one of those
   * is open. Also hides the in-player "Up next" autoplay countdown.
   */
  recommendations: `
ytd-watch-next-secondary-results-renderer,
ytd-watch-flexy ytd-merch-shelf-renderer,
ytd-watch-flexy ytd-ticket-shelf-renderer,
.ytp-autonav-endscreen-upnext-container,
.ytp-autonav-endscreen-upnext-cancel-button,
.ytp-upnext {
  display: none !important;
}
ytd-watch-flexy[role="main"] #secondary:not(:has(
  ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"],
  ytd-live-chat-frame
)) {
  display: none !important;
}`,

  comments: `
ytd-watch-flexy ytd-comments,
ytd-watch-flexy #comments {
  display: none !important;
}`,

  /** Metadata line under thumbnails everywhere, plus views/date on the watch page. */
  metadata: `
ytd-video-meta-block #metadata-line,
ytd-rich-grid-media #metadata-line,
ytd-grid-video-renderer #metadata-line,
ytd-compact-video-renderer #metadata-line,
ytd-video-renderer #metadata-line,
ytd-playlist-video-renderer #metadata-line,
ytd-watch-metadata ytd-watch-info-text,
ytd-watch-metadata #info,
ytd-watch-metadata .view-count {
  display: none !important;
}`,
};

function apply(cfg: FeatureConfig['focus-mode']): void {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = (Object.keys(CSS) as Surface[])
    .filter((s) => cfg[s])
    .map((s) => CSS[s])
    .join('\n');
}

const feature: Feature = {
  id: 'focus-mode',
  async setup() {
    apply(await getConfig('focus-mode'));
    const offConfig = watchConfig('focus-mode', apply);
    return () => {
      offConfig();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
