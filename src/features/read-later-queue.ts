import { mount, unmount } from 'svelte';
import { storage } from '#imports';
import type { Feature } from '../lib/features';
import {
  PLAYER_TAB_KEY,
  addToQueue,
  clearPlayed,
  getQueue,
  getPlayerTabId,
  markPlayed,
  moveInQueue,
  playInPlaceOf,
  removeFromQueue,
  setPlayerTabId,
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
import {
  PREVIEW_BUTTONS,
  PREVIEW_BUTTON_CLASS,
  PREVIEW_ICON_CLASS,
  VIDEO_CARD,
  cardChannel,
  cardDurationSeconds,
  cardTitle,
  previewVideoId,
} from '../lib/yt/feed-cards';
import { getVideoId, getWatchChannel, isWatchPage } from '../lib/yt/video';
import { playInThisTab, watchTitle } from '../lib/yt/player-bridge';
import { getVideo, isAdShowing, onVideoEvent, playerVideoId, watchMetaCurrent } from '../lib/yt/player';
import QueuePanel, { type PanelState } from './read-later-queue/QueuePanel.svelte';

/**
 * Global queue. One list in `local:helm:queue` shared by every
 * tab; only the *player tab* (`session:helm:player-tab`, or every tab while unset) shows the
 * watch-page panel and auto-advances, so two tabs never race for the same item. Not YouTube's own queue: that one
 * can only be filled through undocumented internal commands, can't show ✓, and resets on reload. Adding: YouTube's ⋮ → "Add to queue" (redirected by youtube-main.content.ts),
 * the button under a hover preview's mute / CC, and `Q`. Every tab marks a queued video ✓ when it starts playing.
 */

/** Focus mode's CSS keeps #secondary visible while it contains this id. */
const HOST_ID = 'ytp-queue-panel';
const VIDEO_ID = /^[\w-]{11}$/;
/** "Add to queue" glyph (play triangle + list), drawn to sit beside YouTube's mute / CC icons. */
const QUEUE_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" style="display:block"><path d="M2.5 2.5v7L9 6z"/><rect x="11" y="5" width="11" height="2" rx="1"/><rect x="8" y="11" width="14" height="2" rx="1"/><rect x="8" y="17" width="14" height="2" rx="1"/></svg>';

/** Title/channel/duration of a video from a card on the page, else from oEmbed. */
async function lookup(videoId: string): Promise<Omit<QueueItem, 'addedAt' | 'playedAt'>> {
  // The first link may be the player's end screen, not a card.
  const card = [...document.querySelectorAll(`a[href*="v=${videoId}"]`)]
    .map((a) => a.closest<HTMLElement>(VIDEO_CARD))
    .find(Boolean);
  const title = card ? cardTitle(card) : '';
  if (card && title) return { videoId, title, channelName: cardChannel(card).name, duration: cardDurationSeconds(card) ?? 0 };
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(videoId))}`);
    const o = res.ok ? await res.json() : null;
    return { videoId, title: o?.title ?? '', channelName: o?.author_name ?? '', duration: 0 };
  } catch {
    return { videoId, title: '', channelName: '', duration: 0 };
  }
}

const feature: Feature = {
  async setup(ctx) {
    const html = document.documentElement;
    // whoami answers once the SW has opened session storage to content scripts — ask it first.
    const tabId = await myTabId();
    let [items, config, playerTab] = await Promise.all([getQueue(), getConfig('read-later-queue'), getPlayerTabId()]);
    // With no player tab yet (nothing started, or a browser restart) every tab is a candidate.
    const isPlayerTab = () => tabId !== null && (playerTab === null || playerTab === tabId);
    /** Starting a queued video makes this the player tab; the others then hide their panel. */
    const claim = () => {
      if (tabId !== null && playerTab !== tabId) void setPlayerTabId(tabId);
    };
    const start = (videoId: string) => {
      claim();
      playInThisTab(videoId);
    };

    // ── Panel ──────────────────────────────────────────────────────────────
    let panel: { host: HTMLElement; app: { update(s: PanelState): void }; offObserver: () => void } | null = null;

    const saveConfig = (patch: Partial<FeatureConfig['read-later-queue']>) =>
      setConfig('read-later-queue', { ...config, ...patch });

    const panelState = (): PanelState => ({
      items,
      currentId: getVideoId(),
      paused: getVideo()?.paused ?? true,
      autoAdvance: config.autoAdvance,
      collapsed: config.panelCollapsed,
    });

    /** Same slot as YouTube's own queue (ytd-playlist-panel-renderer#playlist). */
    const place = (host: HTMLElement) => {
      const slot = document.querySelector('ytd-watch-flexy #secondary-inner');
      if (!slot || host.parentElement === slot) return;
      slot.insertBefore(host, slot.querySelector(':scope > ytd-playlist-panel-renderer') ?? slot.firstChild);
    };

    const unmountPanel = () => {
      if (!panel) return;
      panel.offObserver();
      void unmount(panel.app);
      panel.host.remove();
      panel = null;
    };

    const render = () => {
      // Watched items stay (✓) until cleared, so a fully watched queue still shows.
      if (!(isPlayerTab() && isWatchPage() && items.length > 0)) {
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
              play: start,
              remove: (id) => void removeFromQueue(id),
              move: (id, to) => void moveInQueue(id, to),
              setAutoAdvance: (on) => void saveConfig({ autoAdvance: on }),
              setCollapsed: (c) => void saveConfig({ panelCollapsed: c }),
              clearWatched: () => clearPlayed(getVideoId()),
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

    // ── Played ✓ + auto-advance (main <video>, miniplayer included; ads and previews ignored) ──
    const notePlaying = () => {
      const id = playerVideoId();
      if (!id || isAdShowing() || !items.some((i) => i.videoId === id && !i.playedAt)) return;
      claim(); // the tab that last started a queued video, however it was opened, plays the queue
      void markPlayed(id);
    };
    /** Last video to play to its end here: what opens after it (autoplay) doesn't take its slot. */
    let endedId: string | null = null;
    const onEnded = () => {
      if (isAdShowing()) return;
      endedId = playerVideoId();
      // Queued after it started playing (so `playing` never marked it): watched now.
      if (endedId && items.some((i) => i.videoId === endedId && !i.playedAt)) void markPlayed(endedId);
      if (!isPlayerTab() || !config.autoAdvance) return;
      const next = upNext(items).find((i) => i.videoId !== endedId);
      if (next) start(next.videoId); // beats YouTube's autoplay countdown
    };

    // ── Opening another video over a queued one ──────────────────────────────
    /** Queue fields for the watch page's video. Right after SPA navigation the page still shows the previous one's. */
    const describe = async (videoId: string) => {
      if (!watchMetaCurrent()) return lookup(videoId);
      const v = getVideo();
      return {
        videoId,
        title: watchTitle(),
        channelName: getWatchChannel()?.name ?? '',
        duration: v && !isAdShowing() && Number.isFinite(v.duration) ? Math.round(v.duration) : 0,
      };
    };

    /** Video this tab's player was last on (kept while no player shows one). */
    let lastId = playerVideoId();
    /** A non-queued video opened while a queued one was unfinished takes its slot; that one moves down. */
    const onSwitch = async () => {
      const prev = lastId;
      const id = (lastId = playerVideoId() ?? lastId);
      if (!id || !prev || id === prev || prev === endedId || !isPlayerTab()) return;
      if (items.some((i) => i.videoId === id) || !items.some((i) => i.videoId === prev)) return;
      claim();
      await playInPlaceOf(await describe(id), prev);
    };

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
      if (videoId) void add(await describe(videoId));
    });

    // A third round button under the hover preview's mute / CC. Light DOM with YouTube's own
    // classes, not a shadow host, so it is styled exactly like them (size, dimming, variants).
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = PREVIEW_BUTTON_CLASS;
    previewBtn.ariaLabel = previewBtn.title = 'Add to queue'; // title: mute / CC use native tooltips too
    previewBtn.style.cssText = 'display:block;padding:0;border:0;cursor:pointer';
    previewBtn.innerHTML = `<div class="${PREVIEW_ICON_CLASS}">${QUEUE_ICON}</div>`;
    previewBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // the preview opens the video on click
      const videoId = previewVideoId(previewBtn);
      if (videoId) await add(await lookup(videoId));
    });
    const placePreviewBtn = () => {
      const stack = document.querySelector(PREVIEW_BUTTONS);
      if (stack && stack.lastElementChild !== previewBtn) stack.append(previewBtn);
    };

    // From the main world's ⋮ → "Add to queue" redirect.
    const onMessage = async (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || e.origin !== location.origin || d?.source !== 'ytp' || d.type !== 'queue-add') return;
      if (typeof d.videoId !== 'string' || !VIDEO_ID.test(d.videoId)) return;
      await add(await lookup(d.videoId));
    };
    window.addEventListener('message', onMessage);
    // Always on while the queue is: the main world redirects ⋮ → "Add to queue" only while this is set.
    html.dataset.ytpNativeAdd = '1';

    // ── State sync ──────────────────────────────────────────────────────────

    const offs = [
      offQ,
      ctx.observer.onChange(placePreviewBtn),
      onVideoEvent('playing', notePlaying),
      onVideoEvent('ended', onEnded),
      onVideoEvent('play', render),
      onVideoEvent('pause', render),
      watchQueue((v) => {
        items = v;
        render();
      }),
      watchConfig('read-later-queue', (v) => {
        config = v;
        render();
      }),
      storage.watch<number>(PLAYER_TAB_KEY, (v) => {
        playerTab = v ?? null;
        render();
      }),
      ctx.navigation.onNavigate(() => {
        void onSwitch();
        if (getVideo()?.paused === false) notePlaying();
        render();
      }),
    ];
    render();
    placePreviewBtn();

    return () => {
      for (const off of offs) off();
      previewBtn.remove();
      window.removeEventListener('message', onMessage);
      delete html.dataset.ytpNativeAdd;
      unmountPanel();
    };
  },
};

export default feature;
