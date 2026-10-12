import { mount, unmount } from 'svelte';
import { storage } from '#imports';
import type { Feature } from '../lib/features';
import {
  PLAYER_TAB_KEY,
  addToQueue,
  getQueue,
  getPlayerTabId,
  markPlayed,
  moveInQueue,
  removeFromQueue,
  setQueue,
  upNext,
  watchQueue,
  watchUrl,
  type QueueItem,
} from '../lib/queue';
import { myTabId } from '../lib/messages';
import { getConfig, setConfig, watchConfig, type FeatureConfig } from '../lib/settings';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { createHost } from '../lib/yt/ui';
import { getVideoId, getWatchChannel, isWatchPage } from '../lib/yt/video';
import { adShowing, mainVideo, playInThisTab, watchTitle } from '../lib/yt/player-bridge';
import QueuePanel, { type PanelState } from './read-later-queue/QueuePanel.svelte';

/**
 * Global queue (features-v2.md → "Global queue"). One list in `local:ytpro:queue` shared by every
 * tab; only the *player tab* (`session:ytpro:player-tab`) shows the watch-page panel and
 * auto-advances. Adding: YouTube's ⋮ → "Add to queue" (redirected by youtube-main.content.ts)
 * and `Q`. Every tab marks a queued video ✓ when it starts playing.
 */

/** Agent T7's Focus-mode CSS keeps #secondary visible while it contains this id. */
const HOST_ID = 'ytp-queue-panel';
const VIDEO_ID = /^[\w-]{11}$/;
const CARD =
  'yt-lockup-view-model, ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ' +
  'ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer';
const TIME = /^(\d+:)?\d{1,2}:\d{2}$/;

const toSeconds = (t: string) => t.split(':').reduce((acc, n) => acc * 60 + Number(n), 0);

/** Title/channel/duration of a video from a card on the page, else from oEmbed. */
async function lookup(videoId: string): Promise<Omit<QueueItem, 'addedAt' | 'playedAt'>> {
  // The first link may be the player's end screen, not a card.
  const card = [...document.querySelectorAll(`a[href*="v=${videoId}"]`)].map((a) => a.closest(CARD)).find(Boolean);
  if (card) {
    const h3 = card.querySelector('h3');
    const title = (h3?.getAttribute('title') || h3?.textContent || '').trim();
    const channelName = (
      card.querySelector('ytd-channel-name a, ytd-channel-name #text, #byline') ??
      card.querySelector('[class*="MetadataRow"], [class*="metadata-row"]')
    )?.textContent?.trim() ?? '';
    const badge = [...card.querySelectorAll('badge-shape, #time-status #text')]
      .map((b) => b.textContent?.trim() ?? '')
      .find((t) => TIME.test(t));
    if (title) return { videoId, title, channelName, duration: badge ? toSeconds(badge) : 0 };
  }
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`);
    const o = res.ok ? await res.json() : null;
    return { videoId, title: o?.title ?? '', channelName: o?.author_name ?? '', duration: 0 };
  } catch {
    return { videoId, title: '', channelName: '', duration: 0 };
  }
}

const feature: Feature = {
  id: 'read-later-queue',
  async setup(ctx) {
    const html = document.documentElement;
    // whoami answers once the SW has opened session storage to content scripts — ask it first.
    const tabId = await myTabId();
    const [initialItems, initialConfig, initialPlayerTab] = await Promise.all([
      getQueue(),
      getConfig('read-later-queue'),
      getPlayerTabId(),
    ]);
    let items = initialItems;
    let config = initialConfig;
    let playerTab = initialPlayerTab;
    const isPlayerTab = () => tabId !== null && playerTab === tabId;

    // ── Panel ──────────────────────────────────────────────────────────────
    let panel: { host: HTMLElement; app: { update(s: PanelState): void }; offObserver: () => void } | null = null;

    const saveConfig = (patch: Partial<FeatureConfig['read-later-queue']>) =>
      setConfig('read-later-queue', { ...config, ...patch });

    const panelState = (): PanelState => ({
      items,
      currentId: getVideoId(),
      autoAdvance: config.autoAdvance,
      collapsed: config.panelCollapsed,
    });

    /** Same slot as YouTube's own queue (ytd-playlist-panel-renderer#playlist). */
    const place = (host: HTMLElement) => {
      const slot = document.querySelector('ytd-watch-flexy #secondary-inner');
      if (!slot || host.parentElement === slot) return;
      const native = slot.querySelector(':scope > ytd-playlist-panel-renderer');
      if (native) slot.insertBefore(host, native);
      else slot.prepend(host);
    };

    const unmountPanel = () => {
      if (!panel) return;
      panel.offObserver();
      void unmount(panel.app);
      panel.host.remove();
      panel = null;
    };

    const render = () => {
      if (!(isPlayerTab() && isWatchPage() && upNext(items).length > 0)) {
        unmountPanel();
        return;
      }
      if (!panel) {
        document.getElementById(HOST_ID)?.remove(); // stale host from a previous load
        const { host, root } = createHost(HOST_ID, ':host{display:block;margin:0 0 16px}');
        const app = mount(QueuePanel, {
          target: root,
          props: {
            initial: panelState(),
            actions: {
              play: playInThisTab,
              remove: (id) => void removeFromQueue(id),
              move: (id, to) => void moveInQueue(id, to),
              setAutoAdvance: (on) => void saveConfig({ autoAdvance: on }),
              setCollapsed: (c) => void saveConfig({ panelCollapsed: c }),
              clearWatched: async () => {
                const cur = getVideoId();
                const all = await getQueue();
                await setQueue(all.filter((i) => !i.playedAt || i.videoId === cur));
              },
            },
          },
        });
        // YouTube re-renders the right column (SPA nav, theater toggle) — put us back.
        panel = { host, app, offObserver: ctx.observer.onChange(() => panel && place(panel.host)) };
      } else {
        panel.app.update(panelState());
      }
      place(panel.host);
    };

    // ── Played ✓ + auto-advance (main <video> only; ads and previews ignored) ──
    const isMain = (t: EventTarget | null) => t instanceof HTMLVideoElement && t === mainVideo();

    const notePlaying = () => {
      const id = getVideoId();
      if (id && !adShowing() && items.some((i) => i.videoId === id && !i.playedAt)) void markPlayed(id);
    };

    // Media events don't bubble, but capture on document sees them; YouTube reuses the <video>.
    const onPlaying = (e: Event) => isMain(e.target) && notePlaying();
    const onEnded = (e: Event) => {
      if (!isMain(e.target) || adShowing() || !isPlayerTab() || !config.autoAdvance) return;
      const next = upNext(items).find((i) => i.videoId !== getVideoId());
      if (next) playInThisTab(next.videoId); // beats YouTube's autoplay countdown
    };
    document.addEventListener('playing', onPlaying, true);
    document.addEventListener('ended', onEnded, true);

    // ── Adding ──────────────────────────────────────────────────────────────
    const add = async (item: Omit<QueueItem, 'addedAt' | 'playedAt'>) => {
      const was = (await getQueue()).find((i) => i.videoId === item.videoId);
      const { upNext: n } = await addToQueue(item);
      // The player tab's watch page shows the panel instead of a toast.
      if (isPlayerTab() && isWatchPage()) return;
      if (was && !was.playedAt) return flashToast('Already in queue');
      // Undo only this add — other tabs may have changed the queue since. A re-queued played video gets its ✓ back.
      const undo = () => void (was ? markPlayed(item.videoId) : removeFromQueue(item.videoId));
      flashToast(`Added to queue · ${n} up next`, { action: { label: 'Undo', onClick: undo } });
    };

    const offQ = onKey('q', async () => {
      const videoId = getVideoId();
      if (!videoId) return;
      const v = mainVideo();
      void add({
        videoId,
        title: watchTitle(),
        channelName: getWatchChannel()?.name ?? '',
        duration: v && !adShowing() && Number.isFinite(v.duration) ? Math.round(v.duration) : 0,
      });
    });

    // From the main world's ⋮ → "Add to queue" redirect.
    const onMessage = async (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || d?.source !== 'ytp' || d.type !== 'queue-add') return;
      if (typeof d.videoId !== 'string' || !VIDEO_ID.test(d.videoId) || !config.nativeAdd) return;
      await add(await lookup(d.videoId));
    };
    window.addEventListener('message', onMessage);

    // ── State sync ──────────────────────────────────────────────────────────
    const mirrorNativeAdd = () => (html.dataset.ytpNativeAdd = config.nativeAdd ? '1' : '0');
    mirrorNativeAdd();

    const offs = [
      offQ,
      watchQueue((v) => {
        items = v;
        render();
      }),
      watchConfig('read-later-queue', (v) => {
        config = v;
        mirrorNativeAdd();
        render();
      }),
      storage.watch<number>(PLAYER_TAB_KEY, (v) => {
        playerTab = v ?? null;
        render();
      }),
      ctx.navigation.onNavigate(() => {
        const v = mainVideo();
        if (v && !v.paused) notePlaying();
        render();
      }),
    ];
    render();

    return () => {
      for (const off of offs) off();
      document.removeEventListener('playing', onPlaying, true);
      document.removeEventListener('ended', onEnded, true);
      window.removeEventListener('message', onMessage);
      delete html.dataset.ytpNativeAdd;
      unmountPanel();
    };
  },
};

export default feature;
