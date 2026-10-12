/**
 * channel-groups — named groups of channels that filter Home and
 * Subscriptions (YouTube only shows those as one flat list).
 *
 *  - Group pill next to Subscribe on watch and channel pages: a popover with
 *    a checkbox per group, inline "New group" and "Manage groups".
 *  - Home / Subscriptions: a group switcher in the chip-bar slot ("All" + one
 *    chip per non-empty group, "New group", "Manage groups"). A chip hides
 *    cards from channels outside the group. The choice per feed lives in
 *    sessionStorage `ytpro:group:<pathname>` (focus-mode's calm home writes it too).
 *  - Manage groups: an in-page modal (reorder, rename, edit channels,
 *    delete + Undo, new group). Also opened by the popup (`open-manage-groups`
 *    message, or `#ytp-manage-groups` on load).
 *  - Favorites is a built-in group: its channels are pinned, starred, at the
 *    top of the guide's Subscriptions list.
 *
 * Storage: `local:ytpro:channel-groups` → Group[] (store.svelte.ts).
 */

import { mount, unmount, type Component } from 'svelte';
import type { Feature } from '../lib/features';
import type { TabMessage } from '../lib/messages';
import {
  cardChannel,
  currentFeed,
  dropFeedBarPart,
  enumerateVideoCards,
  feedBarPart,
  hideCard,
  isCardHidden,
  onCardsChanged,
  unhideAllCards,
  unhideCard,
} from '../lib/yt/feed-cards';
import { createHost, showDialog } from '../lib/yt/ui';
import { watchMetaCurrent } from '../lib/yt/player';
import { channelIdFromHref, getWatchChannel, isWatchPage, type ChannelRef } from '../lib/yt/video';
import ChipBar from './channel-groups/ChipBar.svelte';
import Editor from './channel-groups/Editor.svelte';
import GroupPill from './channel-groups/GroupPill.svelte';
import Manage from './channel-groups/Manage.svelte';
import {
  FAV,
  channelCount,
  createGroup,
  loadGroups,
  memberKey,
  store,
  updateGroup,
  type Group,
} from './channel-groups/store.svelte';

const ID = 'channel-groups';
const MANAGE_HASH = '#ytp-manage-groups';
const FAV_ATTR = 'data-ytp-favorite';

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
/** ★ after a pinned favorite's name in the guide (light DOM, so a page-level style). */
const GUIDE_CSS = `
[${FAV_ATTR}] .title::after {
  content: "★" / ", in Favorites";
  display: inline-block; width: 11px; height: 11px; margin-left: 5px; vertical-align: -1px; overflow: hidden;
  color: transparent; background: var(--yt-sys-color-baseline--text-secondary);
  mask: url("${STAR_SVG}") center / contain no-repeat;
}`;

const PILL_CSS = ':host { display: inline-flex; align-items: center; margin-left: 8px; }';
const DIALOG_CSS = '.ytp-dialog.is-manage { height: min(538px, calc(100vh - 32px)); }';

const feedKey = () => `ytpro:group:${location.pathname}`;

function sameChannel(a: ChannelRef | null, b: ChannelRef | null): boolean {
  return a?.id === b?.id && a?.name === b?.name;
}

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
  id: ID,

  async setup(ctx) {
    let pill: { host: HTMLElement; app: ReturnType<typeof mount> } | null = null;
    let chipBar: { target: HTMLElement; app: ReturnType<typeof mount> } | null = null;
    let dialog: HTMLDialogElement | null = null;

    const guideStyle = document.createElement('style');
    guideStyle.textContent = GUIDE_CSS;
    document.head.append(guideStyle);

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

    function closeDialog(): void {
      dialog?.close();
    }

    function openDialog<P extends Record<string, unknown>>(
      component: Component<P>,
      props: P,
      label: string,
      cls = '',
    ): void {
      closeDialog();
      const { host, root } = createHost('ytp-groups-dialog', DIALOG_CSS);
      const el = document.createElement('dialog');
      el.className = `ytp-dialog ${cls}`;
      el.setAttribute('aria-label', label);
      el.setAttribute('closedby', 'any'); // backdrop click closes, like the boards' scrim
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
      openDialog(Manage, { channels: knownChannels(), onClose: closeDialog }, 'Manage groups', 'is-manage');
    }

    function openEditor(group: Group | null): void {
      const title = group ? 'Edit group' : 'New group';
      openDialog(
        Editor,
        {
          title,
          submitLabel: group ? 'Save' : 'Create',
          group,
          channels: knownChannels(),
          onCancel: closeDialog,
          onSave: (name: string, channels: Record<string, string>) => {
            if (group) updateGroup(group.id, { name, channels });
            else selectGroup(createGroup(name, channels));
            closeDialog();
          },
        },
        title,
      );
    }

    // ── Group pill ────────────────────────────────────────────────────────

    function syncPill(): void {
      const ch = pageChannel();
      if (!sameChannel(store.page, ch)) store.page = ch;
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
      if (id) sessionStorage.setItem(feedKey(), id);
      else sessionStorage.removeItem(feedKey());
      syncFeed();
    }

    function syncFeed(): void {
      const feed = currentFeed();
      if (!feed) return;
      const part = feedBarPart('groups');
      if (part && chipBar?.target !== part) {
        if (chipBar) void unmount(chipBar.app);
        chipBar = {
          target: part,
          app: mount(ChipBar, {
            target: part,
            props: { onPick: selectGroup, onNew: () => openEditor(null), onEdit: openEditor, onManage: openManage },
          }),
        };
      }

      store.selected = sessionStorage.getItem(feedKey()) ?? '';
      const group = activeGroup();
      for (const card of enumerateVideoCards(feed)) {
        // Cards whose channel we can't read (ads, not yet rendered) stay visible.
        const ch = cardChannel(card);
        if (group && (ch.id || ch.name) && !memberKey(group, ch)) hideCard(card, ID);
        else unhideCard(card, ID);
      }
      updateEmpty();
    }

    const activeGroup = () => store.groups.find((g) => g.id === store.selected && channelCount(g) > 0);

    /**
     * "No new videos from channels in …" when the group (plus any filters, ours or CSS like
     * hide-shorts) hides every card. Visible cards whose channel we can't read (ads) don't count;
     * at least one card must be hidden so a feed that hasn't rendered its bylines yet isn't "empty".
     */
    function updateEmpty(): void {
      const feed = currentFeed();
      const cards = feed ? enumerateVideoCards(feed) : [];
      const shown = cards.filter((c) => !isCardHidden(c) && c.checkVisibility());
      // ponytail: a fully hidden Home grid keeps YouTube loading more pages until a match shows up.
      store.empty =
        !!activeGroup() &&
        shown.length < cards.length &&
        shown.every((c) => {
          const ch = cardChannel(c);
          return !ch.id && !ch.name;
        });
    }

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

    const unsubs = [
      await loadGroups(sync),
      ctx.observer.onChange(sync),
      onCardsChanged(updateEmpty), // feed-filters hiding can empty the feed too
      ctx.navigation.onNavigate(() => {
        unhideAllCards(ID);
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
      closeDialog();
      if (pill) {
        void unmount(pill.app);
        pill.host.remove();
      }
      if (chipBar) void unmount(chipBar.app);
      dropFeedBarPart('groups');
      guideStyle.remove();
      document.querySelectorAll(`[${FAV_ATTR}]`).forEach((el) => el.removeAttribute(FAV_ATTR));
      restoreGuide();
      unhideAllCards(ID);
      store.page = null;
    };
  },
};

export default feature;
