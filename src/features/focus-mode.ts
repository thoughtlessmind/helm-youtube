import { mount, unmount } from 'svelte';
import { storage } from '#imports';
import type { Feature } from '../lib/features';
import {
  getConfig,
  getEnabledFeatures,
  watchConfig,
  watchEnabledFeatures,
  type FeatureConfig,
} from '../lib/settings';
import { getQueue, setPlayerTabId, upNext, watchQueue, type QueueItem } from '../lib/queue';
import { myTabId } from '../lib/messages';
import { addStyle, createHost } from '../lib/yt/ui';
import { getVideoId, isWatchPage } from '../lib/yt/video';
import { playInThisTab } from '../lib/yt/player-bridge';
import { KEY as GROUPS_KEY, feedKey, type Group } from './channel-groups/store.svelte';
import CalmHome, { type CalmState } from './focus-mode/CalmHome.svelte';

/**
 * Focus mode — per-surface options (config 'focus-mode'):
 *   homeFeed        → the home grid is replaced by a calm home (queue, channel groups, "Show it once").
 *   recommendations → only the watch-next list is hidden (+ a quiet "Show once" line); #secondary
 *                     stays for engagement panels, live chat and our queue panel.
 *   comments, metadata (view counts + upload dates).
 */

const HOME_GRID = 'ytd-browse[page-subtype="home"]:not([hidden]) ytd-rich-grid-renderer';
const RELATED = 'ytd-watch-flexy:not([hidden]) #related';

type Surface = keyof FeatureConfig['focus-mode'];

const CSS: Record<Surface, string> = {
  homeFeed: `
ytd-browse[page-subtype="home"] ytd-rich-grid-renderer { display: none !important; }`,

  /**
   * #secondary also hosts engagement panels (transcript, chapters), live chat and our queue
   * panel; panels never load while it's display:none. So only the recommendations are hidden
   * and the column collapses unless one of those is there. Also hides the end-screen "Up next".
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
  ytd-live-chat-frame,
  #ytp-queue-panel
)) {
  display: none !important;
}`,

  comments: `
ytd-watch-flexy ytd-comments,
ytd-watch-flexy #comments {
  display: none !important;
}`,

  /** Views + date under thumbnails (old renderers and lockups) and on the watch page. */
  metadata: `
ytd-video-meta-block #metadata-line,
ytd-grid-video-renderer #metadata-line,
ytd-video-renderer #metadata-line,
ytd-playlist-video-renderer #metadata-line,
yt-lockup-view-model yt-content-metadata-view-model > div:not(:first-of-type),
ytd-watch-metadata ytd-watch-info-text,
ytd-watch-metadata #info,
ytd-watch-metadata .view-count {
  display: none !important;
}`,
};

const EYE_OFF = `<svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.1"/><path d="M6.6 6.6A13.3 13.3 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const EYE = `<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

const LINE_CSS = `
:host{display:block}
.line{display:flex;align-items:center;gap:8px;height:36px;margin:0 0 12px;padding-left:4px;color:var(--yt-sys-color-baseline--text-secondary)}
svg{flex:none;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.on,.dot,:host(.shown) .off{display:none}
:host(.shown) .on,:host(.shown) .dot{display:block}
.dot{margin:0 -3px}
.ytp-btn{margin-left:-6px;padding:0 8px}
`;
const LINE_HTML = `<div class="line">${EYE_OFF}${EYE}<span class="msg"></span><span class="dot" aria-hidden="true">·</span><button class="ytp-btn is-link"></button></div>`;

const feature: Feature = {
  async setup(ctx) {
    let cfg = await getConfig('focus-mode');
    /** "Show it once" on home — reset when we leave home. */
    let feedShown = false;
    /** Video whose recommendations were revealed with "Show once". */
    let recsShownFor: string | null = null;

    const style = addStyle('');
    const applyCss = () => {
      style.textContent = [
        cfg.homeFeed && !feedShown && CSS.homeFeed,
        cfg.recommendations && recsShownFor !== getVideoId() && CSS.recommendations,
        cfg.comments && CSS.comments,
        cfg.metadata && CSS.metadata,
      ]
        .filter(Boolean)
        .join('\n');
    };

    // ---- Calm home ----
    let calm: { host: HTMLElement; app: { update(s: CalmState): void }; offs: (() => void)[] } | null = null;
    let items: QueueItem[] = [];
    let groups: Group[] = [];
    let enabled: string[] = [];

    const push = () =>
      calm?.app.update({
        feedShown,
        upNext: enabled.includes('read-later-queue') ? upNext(items) : [],
        groups: enabled.includes('channel-groups')
          ? groups
              .map((g) => ({ id: g.id, name: g.name, channels: Object.keys(g.channels).length }))
              .filter((g) => g.channels > 0)
          : [],
      });

    const startCalm = () => {
      const { host, root } = createHost('ytp-calm-home');
      const app = mount(CalmHome, {
        target: root,
        props: {
          initial: { feedShown, upNext: [], groups: [] },
          actions: {
            toggleFeed() {
              feedShown = !feedShown;
              applyCss();
              push();
            },
            async play(videoId) {
              await setPlayerTabId(await myTabId());
              playInThisTab(videoId);
            },
            openGroup(id) {
              sessionStorage.setItem(feedKey('/feed/subscriptions'), id); // read by the switcher there (D15)
              // The guide's own link navigates in-app; a page load is the fallback.
              const link = document.querySelector<HTMLElement>('ytd-app a[href="/feed/subscriptions"]');
              if (link) link.click();
              else location.assign('/feed/subscriptions');
            },
          },
        },
      });
      calm = {
        host,
        app,
        offs: [
          watchQueue((q) => ((items = q), push())),
          storage.watch<Group[]>(GROUPS_KEY, (g) => ((groups = g ?? []), push())),
          watchEnabledFeatures((ids) => ((enabled = ids), push())),
        ],
      };
      void Promise.all([getQueue(), storage.getItem<Group[]>(GROUPS_KEY), getEnabledFeatures()]).then(
        ([q, g, ids]) => {
          items = q;
          groups = g ?? [];
          enabled = ids;
          push();
        },
      );
    };

    const stopCalm = () => {
      if (!calm) return;
      calm.offs.forEach((off) => off());
      void unmount(calm.app);
      calm.host.remove();
      calm = null;
    };

    const ensureCalm = () => {
      if (!cfg.homeFeed || location.pathname !== '/') return stopCalm();
      if (!calm) startCalm();
      const grid = document.querySelector(HOME_GRID);
      if (grid && calm!.host.nextElementSibling !== grid) grid.before(calm!.host);
    };

    // ---- Watch page: "Recommendations hidden · Show once" ----
    const { host: line, root: lineRoot } = createHost('ytp-recs-line', LINE_CSS, LINE_HTML);
    const msg = lineRoot.querySelector('.msg')!;
    const recsBtn = lineRoot.querySelector('button')!;

    const renderLine = () => {
      if (!cfg.recommendations || !isWatchPage()) return line.remove();
      const shown = recsShownFor === getVideoId();
      line.classList.toggle('shown', shown);
      msg.textContent = shown ? 'Showing recommendations for this video' : 'Recommendations hidden';
      recsBtn.textContent = shown ? 'Hide' : 'Show once';
      recsBtn.setAttribute('aria-expanded', String(shown));
      const related = document.querySelector(RELATED);
      if (related && line.nextElementSibling !== related) related.before(line);
    };
    recsBtn.addEventListener('click', () => {
      recsShownFor = recsShownFor === getVideoId() ? null : getVideoId();
      applyCss();
      renderLine();
    });

    const refresh = () => {
      applyCss();
      ensureCalm();
      renderLine();
    };
    refresh();

    const offConfig = watchConfig('focus-mode', (next) => {
      cfg = next;
      refresh();
    });
    const offNav = ctx.navigation.onNavigate(() => {
      if (location.pathname !== '/') feedShown = false;
      refresh();
    });
    // YouTube re-renders the home grid / watch columns: put our hosts back.
    const offChange = ctx.observer.onChange(() => {
      ensureCalm();
      renderLine();
    });

    return () => {
      offConfig();
      offNav();
      offChange();
      stopCalm();
      line.remove();
      style.remove();
    };
  },
};

export default feature;
