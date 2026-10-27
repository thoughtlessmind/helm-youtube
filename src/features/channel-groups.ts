/**
 * channel-groups — named groups of channels that filter Home and
 * Subscriptions (YouTube only shows those as one flat list).
 *
 *  - Group pill next to Subscribe on watch and channel pages: a popover with
 *    a checkbox per group, inline "New group" and "Manage groups".
 *  - Home / Subscriptions: a group switcher in the chip-bar slot ("All" + one
 *    chip per non-empty group, "New group", "Manage groups"). Where YouTube has
 *    its own chips, a toggle at the strip's right end swaps back to them (config
 *    `youtubeChips`; no group while they show). A group chip puts its channels'
 *    latest videos, newest first, in YouTube's own grid as native cards (the
 *    MAIN-world lib/yt/group-grid.ts; GroupFeed stands in while they load). The choice per feed lives in
 *    sessionStorage `feedKey(pathname)` (focus-mode's calm home writes it too).
 *  - Manage groups: an in-page modal (reorder, rename, edit channels,
 *    delete + Undo, new group). Also opened by the popup (`open-manage-groups`
 *    message, or `#ytp-manage-groups` on load).
 *  - Favorites is a built-in group: its channels are pinned, starred, at the
 *    top of the guide's Subscriptions list.
 *
 * Storage: `local:helm:channel-groups` → Group[] (store.svelte.ts).
 */

import { mount, unmount, type Component } from 'svelte';
import type { Feature } from '../lib/features';
import type { TabMessage } from '../lib/messages';
import { getConfig, setConfig, watchConfig } from '../lib/settings';
import {
  cardChannel,
  currentFeed,
  dropFeedBarPart,
  enumerateVideoCards,
  feedBarPart,
  feedChipBar,
  feedGrid,
} from '../lib/yt/feed-cards';
import { addStyle, createHost, showDialog } from '../lib/yt/ui';
import { watchMetaCurrent } from '../lib/yt/player';
import { channelIdFromHref, getWatchChannel, isWatchPage, type ChannelRef } from '../lib/yt/video';
import ChipBar from './channel-groups/ChipBar.svelte';
import Editor from './channel-groups/Editor.svelte';
import GroupFeed from './channel-groups/GroupFeed.svelte';
import { channelIds } from './channel-groups/channel-ids';
import GroupPill from './channel-groups/GroupPill.svelte';
import Manage from './channel-groups/Manage.svelte';
import {
  FAV,
  createGroup,
  feedKey,
  loadGroups,
  memberKey,
  store,
  updateGroup,
  type Group,
} from './channel-groups/store.svelte';

const ID = 'channel-groups';
const MANAGE_HASH = '#ytp-manage-groups';
const FAV_ATTR = 'data-ytp-favorite';
/** On a feed's `ytd-browse` while GroupFeed stands in for its grid (loading, empty, failed). */
const GROUP_FEED_ATTR = 'data-ytp-group-feed';

// ── Selectors ───────────────────────────────────────────────────────────────
const WATCH_SUBSCRIBE = 'ytd-watch-metadata #owner #subscribe-button';
const CHANNEL_PAGE = 'ytd-browse[page-subtype="channels"]:not([hidden])';
/** Header actions row; Subscribe is its first action. */
const CHANNEL_ACTIONS = 'yt-flexible-actions-view-model';
const CHANNEL_HANDLE = 'yt-content-metadata-view-model';
const GUIDE_SECTION = 'ytd-guide-renderer ytd-guide-section-renderer';
const GUIDE_ENTRY = 'ytd-guide-entry-renderer';

const STAR_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 3.2l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 16.95 6.62 19.8l1.03-6L3.3 9.6l6-.9z'/%3E%3C/svg%3E";
/**
 * Light DOM, so page-level: ★ after a pinned favorite's name in the guide; YouTube's grid (and its
 * "load more" spinner) out of the way while GroupFeed stands in for it.
 */
const PAGE_CSS = `
[${GROUP_FEED_ATTR}] ytd-rich-grid-renderer > #contents { display: none !important; }
[${FAV_ATTR}] .title::after {
  content: "★" / ", in Favorites";
  display: inline-block; width: 11px; height: 11px; margin-left: 5px; vertical-align: -1px; overflow: hidden;
  color: transparent; background: var(--yt-sys-color-baseline--text-secondary);
  mask: url("${STAR_SVG}") center / contain no-repeat;
}`;

const PILL_CSS = ':host { display: inline-flex; align-items: center; margin-left: 8px; }';
const DIALOG_CSS = '.ytp-dialog:has(.manage) { height: min(538px, calc(100vh - 32px)); }';

/** The channel the watch or channel page belongs to. */
function pageChannel(): ChannelRef | null {
  if (isWatchPage()) return watchMetaCurrent() ? getWatchChannel() : null; // metadata lags SPA nav
  const page = document.querySelector(CHANNEL_PAGE);
  const fromUrl = channelIdFromHref(location.pathname);
  if (!page || !fromUrl) return null;
  // Prefer the @handle: it's how cards and the watch page link the channel.
  const handle = page.querySelector(CHANNEL_HANDLE)?.textContent?.match(/@[\w.-]+/)?.[0];
  const id = fromUrl.startsWith('@') ? fromUrl : (handle ?? fromUrl);
  return { id, name: page.querySelector('h1')?.textContent?.trim() || id };
}

/** Where the pill goes: right after Subscribe. */
function pillAnchor(): Element | null {
  if (isWatchPage()) return document.querySelector(WATCH_SUBSCRIBE);
  return document.querySelector(CHANNEL_PAGE)?.querySelector(CHANNEL_ACTIONS)?.firstElementChild ?? null;
}

/** A guide entry for a subscribed channel: links a channel and shows its avatar (not an icon). */
function guideChannel(entry: Element): ChannelRef | null {
  const a = entry.querySelector('a');
  const id = channelIdFromHref(a?.getAttribute('href'));
  if (!id || !entry.querySelector('yt-img-shadow:not([hidden])')) return null;
  return { id, name: a?.title || entry.querySelector('.title')?.textContent?.trim() || id };
}

/**
 * `#items` of the guide's Subscriptions section, found by structure (not its
 * localized title): the section with the most subscribed-channel entries,
 * preferring one that links the Subscriptions feed.
 */
function guideSubscriptions(): HTMLElement | null {
  let best: Element | null = null;
  let bestScore = 0;
  for (const sec of document.querySelectorAll(GUIDE_SECTION)) {
    const n = [...sec.querySelectorAll(GUIDE_ENTRY)].filter(guideChannel).length;
    const score = n * 2 + (sec.querySelector('a[href="/feed/subscriptions"], a[href="/feed/channels"]') ? 1 : 0);
    if (n && score > bestScore) {
      best = sec;
      bestScore = score;
    }
  }
  return best?.querySelector<HTMLElement>('#items') ?? null;
}

const feature: Feature = {

  async setup(ctx) {
    let pill: { host: HTMLElement; app: ReturnType<typeof mount> } | null = null;
    let chipBar: { target: HTMLElement; app: ReturnType<typeof mount> } | null = null;
    let groupFeed: { host: HTMLElement; app: ReturnType<typeof mount> } | null = null;
    let dialog: HTMLDialogElement | null = null;

    const pageStyle = addStyle(PAGE_CSS);

    // ── Dialogs ───────────────────────────────────────────────────────────

    /** [id, name] of every channel we know: group members, guide subscriptions, page cards. */
    function knownChannels(): [string, string][] {
      const map = new Map<string, string>();
      const add = (id: string | null, name: string) => {
        if (id && !map.has(id)) map.set(id, name || id);
      };
      for (const g of store.groups) for (const [id, name] of Object.entries(g.channels)) add(id, name);
      const items = guideSubscriptions();
      for (const entry of items?.querySelectorAll(GUIDE_ENTRY) ?? []) {
        const ch = guideChannel(entry);
        if (ch) add(ch.id, ch.name);
      }
      for (const card of enumerateVideoCards()) {
        const { id, name } = cardChannel(card);
        if (name) add(id, name);
      }
      if (store.page) add(store.page.id, store.page.name);
      return [...map];
    }

    const closeDialog = () => dialog?.close();

    function openDialog<P extends Record<string, unknown>>(component: Component<P>, props: P, label: string): void {
      closeDialog();
      const { host, root } = createHost('ytp-groups-dialog', DIALOG_CSS);
      const el = document.createElement('dialog');
      el.className = 'ytp-dialog';
      el.setAttribute('aria-label', label);
      el.setAttribute('closedby', 'any'); // backdrop click closes
      root.append(el);
      document.body.append(host);
      const app = mount(component, { target: el, props });
      el.addEventListener('close', () => {
        void unmount(app);
        host.remove();
        if (dialog === el) dialog = null;
      });
      dialog = el;
      showDialog(el);
    }

    function openManage(): void {
      openDialog(Manage, { channels: knownChannels(), onClose: closeDialog }, 'Manage groups');
    }

    function openEditor(group: Group | null): void {
      openDialog(
        Editor,
        {
          group,
          channels: knownChannels(),
          onCancel: closeDialog,
          onSave: (name: string, channels: Record<string, string>) => {
            if (group) updateGroup(group.id, { name, channels });
            else selectGroup(createGroup(name, channels));
            closeDialog();
          },
        },
        group ? 'Edit group' : 'New group',
      );
    }

    // ── Group pill ────────────────────────────────────────────────────────

    function syncPill(): void {
      const ch = pageChannel();
      if (store.page?.id !== ch?.id || store.page?.name !== ch?.name) store.page = ch;
      store.onChannelPage = !isWatchPage();
      const anchor = ch && pillAnchor();
      if (!anchor) {
        pill?.host.remove();
        return;
      }
      if (!pill) {
        const { host, root } = createHost('ytp-group-pill', PILL_CSS);
        pill = { host, app: mount(GroupPill, { target: root, props: { onManage: openManage } }) };
      }
      if (pill.host.previousElementSibling !== anchor) anchor.after(pill.host);
    }

    // ── Feed switcher + filter ────────────────────────────────────────────

    function selectGroup(id: string): void {
      if (id) sessionStorage.setItem(feedKey(location.pathname), id);
      else sessionStorage.removeItem(feedKey(location.pathname));
      syncFeed();
    }

    function swapChips(): void {
      store.youtubeChips = !store.youtubeChips;
      void setConfig(ID, { youtubeChips: store.youtubeChips });
      syncFeed();
    }

    function syncFeed(): void {
      const feed = currentFeed();
      if (!feed) return;
      store.chipBar = !!feedChipBar(feed);
      const part = feedBarPart('groups', !(store.chipBar && store.youtubeChips));
      if (part && chipBar?.target !== part) {
        if (chipBar) void unmount(chipBar.app);
        chipBar = {
          target: part,
          app: mount(ChipBar, {
            target: part,
            props: { onPick: selectGroup, onNew: () => openEditor(null), onManage: openManage, onSwap: swapChips },
          }),
        };
      }
      store.selected = sessionStorage.getItem(feedKey(location.pathname)) ?? '';
      syncGrid(feed);
      feed.toggleAttribute(GROUP_FEED_ATTR, !!store.active && store.gridStatus !== 'ok'); // no-op when unchanged
      // In the grid's place (after it: the row may sit right before it, on Subscriptions).
      const grid = feedGrid(feed);
      if (grid) {
        if (!groupFeed) {
          const { host, root } = createHost('ytp-group-feed');
          const onRetry = () => {
            gridAsked = '';
            syncFeed();
          };
          groupFeed = { host, app: mount(GroupFeed, { target: root, props: { onEdit: openEditor, onRetry } }) };
        }
        if (grid.nextElementSibling !== groupFeed.host) grid.after(groupFeed.host);
      }
    }

    // ── Group grid: asks the MAIN world (lib/yt/group-grid.ts) ────────────

    let gridSeq = 0;
    /** Feed + member keys last asked for; cleared on navigation (Back may restore a cached page). */
    let gridAsked = '';
    /**
     * The `gridAsked` the grid last showed ('ok'). Re-asking for it after Back skips the skeleton,
     * which would hide the grid (and collapse the page) while YouTube restores the scroll position.
     */
    let gridShown = '';

    const askGrid = (seq: number, feed: string | null, ids: string[] | null) =>
      window.postMessage({ source: 'ytp', type: 'group-grid', seq, feed, ids }, location.origin);

    const setGridStatus = (status: typeof store.gridStatus) => {
      store.gridStatus = status;
      gridShown = status === 'ok' ? gridAsked : '';
      syncFeed();
    };

    function syncGrid(feed: HTMLElement): void {
      // ponytail: waits for the MAIN-world script (it sets this before listening); without it, loads forever.
      if (!document.documentElement.dataset.ytpMain) return;
      if (!feedGrid(feed)?.firstElementChild) return; // the grid's data (and its targetId) not there yet
      const subtype = feed.getAttribute('page-subtype');
      const keys = Object.keys(store.active?.channels ?? {}).sort();
      const asked = `${subtype}|${keys.join()}`;
      if (asked === gridAsked) return;
      gridAsked = asked;
      const seq = ++gridSeq;
      if (!keys.length) {
        gridShown = '';
        return askGrid(seq, subtype, null);
      }
      if (asked !== gridShown) store.gridStatus = 'loading';
      channelIds(keys).then(
        (ids) => seq === gridSeq && (ids.length ? askGrid(seq, subtype, ids) : setGridStatus('error')),
        () => seq === gridSeq && setGridStatus('error'),
      );
    }

    const onGridStatus = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || d?.source !== 'ytp' || d.type !== 'group-grid-status' || d.seq !== gridSeq) return;
      if (!['loading', 'ok', 'empty', 'error'].includes(d.status)) return;
      setGridStatus(d.status);
    };
    window.addEventListener('message', onGridStatus);

    // ── Guide: Favorites pinned first ─────────────────────────────────────

    /** Each pinned guide entry's original [parent, next sibling], for teardown. */
    const moved = new Map<Element, [ParentNode, Node | null]>();

    function syncGuide(): void {
      const items = guideSubscriptions();
      if (!items) return;
      const fav = store.groups.find((g) => g.id === FAV)!;
      const pinned: Element[] = [];
      for (const entry of items.querySelectorAll(GUIDE_ENTRY)) {
        const ch = guideChannel(entry);
        const on = !!ch && !!memberKey(fav, ch);
        if (entry.hasAttribute(FAV_ATTR) !== on) entry.toggleAttribute(FAV_ATTR, on);
        if (on) pinned.push(entry);
      }
      // Move only when out of place: each move is a mutation that re-runs this.
      // Unpinned entries keep their spot until YouTube re-renders the guide (or teardown).
      if (pinned.some((entry, i) => items.children[i] !== entry)) {
        for (const e of pinned) if (!moved.has(e)) moved.set(e, [e.parentNode!, e.nextSibling]);
        items.prepend(...pinned);
      }
    }

    /** Puts moved guide entries back, last first so each one's old next sibling is already home. */
    function restoreGuide(): void {
      for (const [el, [parent, next]] of [...moved].reverse()) {
        if (el.isConnected && (next ? next.parentNode === parent : parent.isConnected)) parent.insertBefore(el, next);
      }
      moved.clear();
    }

    // ── Wiring ────────────────────────────────────────────────────────────

    const sync = () => {
      syncPill();
      syncFeed();
      syncGuide();
    };

    const onMessage = (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
      if ((msg as TabMessage | null)?.type !== 'open-manage-groups') return;
      openManage();
      sendResponse(true);
      return true;
    };
    browser.runtime.onMessage.addListener(onMessage);

    store.youtubeChips = (await getConfig(ID)).youtubeChips;
    const unsubs = [
      await loadGroups(sync),
      watchConfig(ID, (cfg) => {
        store.youtubeChips = cfg.youtubeChips;
        syncFeed();
      }),
      ctx.observer.onChange(sync),
      ctx.navigation.onNavigate(() => {
        gridAsked = '';
        sync();
      }),
    ];
    sync();

    if (location.hash === MANAGE_HASH) {
      history.replaceState(history.state, '', location.pathname + location.search);
      openManage();
    }

    return () => {
      unsubs.forEach((off) => off());
      browser.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener('message', onGridStatus);
      askGrid(++gridSeq, null, null); // YouTube's own contents back, on every feed
      closeDialog();
      if (pill) {
        void unmount(pill.app);
        pill.host.remove();
      }
      if (chipBar) void unmount(chipBar.app);
      dropFeedBarPart('groups');
      if (groupFeed) {
        void unmount(groupFeed.app);
        groupFeed.host.remove();
      }
      document.querySelectorAll(`[${GROUP_FEED_ATTR}]`).forEach((el) => el.removeAttribute(GROUP_FEED_ATTR));
      pageStyle.remove();
      document.querySelectorAll(`[${FAV_ATTR}]`).forEach((el) => el.removeAttribute(FAV_ATTR));
      restoreGuide();
      store.page = null;
    };
  },
};

export default feature;
