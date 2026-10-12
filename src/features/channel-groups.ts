/**
 * channel-groups — named groups of channels, used to filter Home and
 * Subscriptions (YouTube only shows those as one flat list).
 *
 *  - Chip bar above the Home / Subscriptions grid: "All" + one chip per
 *    non-empty group. A chip hides cards from channels outside the group.
 *    The selection is remembered per feed for the session.
 *  - "Manage groups" opens a modal: create / rename / delete groups and tick
 *    channels into the selected one. Channels come from the feed cards on
 *    the page plus those already in a group.
 *  - Favorites is a built-in group (fixed id, can't be renamed or deleted):
 *    a star toggle on watch and channel pages, and favorites are pinned to
 *    the top of the guide's Subscriptions list.
 *
 * Storage: `local:ytpro:channel-groups` → Group[]
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import { channelIdFromHref, getWatchChannel, isWatchPage, type ChannelRef } from '../lib/yt/video';
import {
  cardChannel,
  enumerateVideoCards,
  hideCard,
  unhideAllCards,
  unhideCard,
} from '../lib/yt/feed-cards';

interface Group {
  id: string;
  name: string;
  /** Channel id → display name, so the manage list can label channels that aren't on screen. */
  channels: Record<string, string>;
}

const ID = 'channel-groups';
const KEY = 'local:ytpro:channel-groups' as const;
const FAV = 'favorites';

/** Feed routes that get the chip bar → their `ytd-browse` page-subtype. */
const FEEDS: Record<string, string> = { '/': 'home', '/feed/subscriptions': 'subscriptions' };

/** The star toggle goes right after the first match. */
const WATCH_ANCHOR = 'ytd-watch-metadata #subscribe-button, #owner #subscribe-button';
const CHANNEL_ANCHOR = [
  'ytd-channel-tagline-renderer',
  '#channel-header-container #channel-tagline',
  '#channel-container #channel-header-links',
  'yt-flexible-actions-view-model',
  '#channel-header ytd-subscribe-button-renderer',
].join(', ');
const CHANNEL_NAME = 'yt-page-header-renderer h1, #channel-header ytd-channel-name #text';

/** Stamped on the guide entries of favorite channels; GUIDE_CSS draws the ★. */
const PIN_ATTR = 'data-yt-pro-favorite';
const GUIDE_CSS = `[${PIN_ATTR}] .title::before { content: "★ "; }`;

/** Shared by every shadow root this feature creates (bar, modal, star). */
const CSS = `
  :host {
    all: initial;
    display: contents;
    --fg: var(--yt-sys-color-baseline--text-primary, #0f0f0f);
    --fg2: var(--yt-sys-color-baseline--text-secondary, #606060);
    --bg: var(--yt-sys-color-baseline--base-background, #fff);
    --menu: var(--yt-sys-color-baseline--menu-background, #fff);
    --tint: var(--yt-sys-color-baseline--additive-background, rgba(0,0,0,.05));
    --line: var(--yt-sys-color-baseline--outline, rgba(0,0,0,.1));
    font: 14px/1.4 Roboto, Arial, sans-serif;
    color: var(--fg);
  }
  * { box-sizing: border-box; font: inherit; color: inherit; }
  button {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--tint);
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: var(--line); }
  button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
  input {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: none;
  }
  input:disabled { border-color: transparent; }
  input[type="checkbox"] { flex: none; height: auto; accent-color: var(--fg); }

  .bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0 8px; }
  .manage { margin-left: auto; background: none; color: var(--fg2); }
  .star { height: 36px; margin-left: 8px; border-radius: 18px; }

  dialog {
    width: min(640px, 96vw);
    height: min(560px, 85vh);
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: var(--menu);
    color: var(--fg);
    box-shadow: 0 8px 48px rgba(0,0,0,.3);
  }
  dialog[open] { display: flex; flex-direction: column; }
  dialog::backdrop { background: rgba(0,0,0,.45); }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 16px;
    font-weight: 500;
  }
  .cols { display: flex; flex: 1; min-height: 0; }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 200px;
    padding: 8px;
    overflow-y: auto;
    border-right: 1px solid var(--line);
  }
  nav > button { flex: none; overflow: hidden; text-overflow: ellipsis; text-align: left; background: none; }
  nav > button[aria-current="true"] { background: var(--tint); font-weight: 500; }
  form { display: flex; gap: 6px; margin-top: auto; padding-top: 8px; }
  section { display: flex; flex-direction: column; flex: 1; gap: 8px; min-width: 0; padding: 12px 16px; }
  .head { display: flex; gap: 8px; }
  .list { overflow-y: auto; }
  label { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-radius: 6px; cursor: pointer; }
  label:hover { background: var(--tint); }
  label span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small, .empty { color: var(--fg2); font-size: 12px; }
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const has = (g: Group, channelId: string) => Object.hasOwn(g.channels, channelId);
const isEmpty = (g: Group) => Object.keys(g.channels).length === 0;

/** Favorites always exists; it's created on first read rather than seeded. */
function withFavorites(groups: Group[] | null): Group[] {
  const list = groups ?? [];
  return list.some((g) => g.id === FAV)
    ? list
    : [{ id: FAV, name: 'Favorites', channels: {} }, ...list];
}

function shadowHost(tag: 'div' | 'span', html: string): ShadowRoot {
  const root = document.createElement(tag).attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>${html}`;
  return root;
}

/** The current feed's rich grid, or null off Home / Subscriptions. */
function currentGrid(): Element | null {
  const subtype = FEEDS[location.pathname];
  return subtype
    ? document.querySelector(`ytd-browse[page-subtype="${subtype}"] ytd-rich-grid-renderer`)
    : null;
}

/** The channel the current watch or channel page belongs to. */
function pageChannel(): ChannelRef | null {
  if (isWatchPage()) return getWatchChannel();
  const id = channelIdFromHref(location.pathname);
  if (!id) return null;
  return { id, name: document.querySelector(CHANNEL_NAME)?.textContent?.trim() || id };
}

/** `#items` of the guide's Subscriptions section (matched by its English title). */
function guideSubscriptions(): Element | null {
  for (const title of document.querySelectorAll('ytd-guide-section-renderer #guide-section-title')) {
    if (title.textContent?.toLowerCase().includes('subscription')) {
      return title.closest('ytd-guide-section-renderer')?.querySelector('#items') ?? null;
    }
  }
  return null;
}

const feature: Feature = {
  id: ID,

  async setup(ctx) {
    let groups = withFavorites(await storage.getItem<Group[]>(KEY));
    /** Selected chip per feed route; in-memory, so each feed starts on "All". */
    const active = new Map<string, string>();
    /** Group open in the manage panel. */
    let selected = FAV;
    let bar: ShadowRoot | null = null;
    let modal: ShadowRoot | null = null;
    let star: ShadowRoot | null = null;

    const guideStyle = document.createElement('style');
    guideStyle.textContent = GUIDE_CSS;
    document.head.append(guideStyle);

    const favorites = () => groups.find((g) => g.id === FAV)!;
    const activeGroup = () => {
      const id = active.get(location.pathname);
      return groups.find((g) => g.id === id && !isEmpty(g));
    };

    // ── Writes ────────────────────────────────────────────────────────────
    // The storage watcher also fires for this tab's own writes, so it is the
    // one place the bar, filter, guide and star re-render after an edit.

    function commit(next: Group[]): void {
      groups = next;
      void storage.setItem(KEY, next);
    }

    function patchGroup(id: string, fn: (g: Group) => Group): void {
      commit(groups.map((g) => (g.id === id ? fn(g) : g)));
    }

    function setMember(groupId: string, ch: ChannelRef, on: boolean): void {
      patchGroup(groupId, (g) => {
        const channels = { ...g.channels };
        if (on) channels[ch.id] = ch.name || ch.id;
        else delete channels[ch.id];
        return { ...g, channels };
      });
    }

    // ── Chip bar + feed filter ────────────────────────────────────────────

    function applyFilter(): void {
      const group = activeGroup();
      const grid = currentGrid();
      if (!group || !grid) {
        unhideAllCards(ID);
        return;
      }
      for (const card of enumerateVideoCards()) {
        if (!grid.contains(card)) continue;
        // Cards without a channel link (shelves, ads, not yet rendered) stay visible.
        const { id } = cardChannel(card);
        if (id && !has(group, id)) hideCard(card, ID);
        else unhideCard(card, ID);
      }
    }

    function renderBar(): void {
      const row = bar?.querySelector('.bar');
      if (!row) return;
      const current = activeGroup()?.id ?? '';
      const chip = (id: string, name: string) =>
        `<button data-group="${esc(id)}" aria-pressed="${id === current}">${esc(name)}</button>`;
      row.innerHTML =
        chip('', 'All') +
        groups.filter((g) => !isEmpty(g)).map((g) => chip(g.id, g.name)).join('') +
        '<button class="manage" data-act="manage">Manage groups</button>';
    }

    function mountBar(): void {
      const grid = currentGrid();
      if (!grid) {
        bar?.host.remove();
        return;
      }
      if (bar?.host.nextElementSibling === grid) return;
      if (!bar) {
        bar = shadowHost('div', '<div class="bar"></div>');
        bar.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('button');
          if (!btn) return;
          if (btn.dataset.act === 'manage') {
            openModal();
            return;
          }
          if (btn.dataset.group) active.set(location.pathname, btn.dataset.group);
          else active.delete(location.pathname);
          renderBar();
          applyFilter();
        });
      }
      grid.before(bar.host);
      renderBar();
    }

    // ── Manage panel ──────────────────────────────────────────────────────

    /** [id, name] of every channel in a group or on a card on the page, by name. */
    function knownChannels(): [string, string][] {
      const map = new Map<string, string>();
      for (const g of groups) {
        for (const [id, name] of Object.entries(g.channels)) map.set(id, name);
      }
      for (const card of enumerateVideoCards()) {
        const { id, name } = cardChannel(card);
        if (id && !map.has(id)) map.set(id, name || id);
      }
      return [...map].sort(([, a], [, b]) => a.localeCompare(b));
    }

    /**
     * Rebuilt on open and on structural edits only — ticking a channel
     * doesn't re-render, so focus and scroll position survive.
     */
    function renderModal(): void {
      const dialog = modal?.querySelector('dialog');
      if (!dialog) return;
      const group = groups.find((g) => g.id === selected) ?? groups[0];
      selected = group.id;
      const fav = group.id === FAV;
      const rows = knownChannels()
        .map(
          ([id, name]) => `
            <label>
              <input type="checkbox" data-ch="${esc(id)}" data-name="${esc(name)}" ${has(group, id) ? 'checked' : ''}>
              <span>${esc(name)}</span>${name === id ? '' : `<small>${esc(id)}</small>`}
            </label>`,
        )
        .join('');
      dialog.innerHTML = `
        <header>Channel groups <button data-act="close" aria-label="Close">✕</button></header>
        <div class="cols">
          <nav>
            ${groups
              .map((g) => `<button data-group="${esc(g.id)}" aria-current="${g.id === selected}">${esc(g.name)}</button>`)
              .join('')}
            <form><input name="name" placeholder="New group" maxlength="60" required><button>Add</button></form>
          </nav>
          <section>
            <div class="head">
              <input class="name" value="${esc(group.name)}" maxlength="60" aria-label="Group name" ${fav ? 'disabled' : ''}>
              ${fav ? '' : '<button data-act="delete">Delete</button>'}
            </div>
            <div class="list">
              ${rows || '<p class="empty">No channels yet. Close this, scroll a feed to load some, then reopen.</p>'}
            </div>
          </section>
        </div>`;
    }

    function openModal(): void {
      modal = shadowHost('div', '<dialog></dialog>');
      document.body.append(modal.host);
      const dialog = modal.querySelector('dialog')!;

      dialog.addEventListener('close', () => {
        modal?.host.remove();
        modal = null;
      });
      // YouTube's hotkeys only see the retargeted host, so they'd fire while typing here.
      dialog.addEventListener('keydown', (e) => e.stopPropagation());

      dialog.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t === dialog) dialog.close(); // backdrop
        const groupId = t.closest<HTMLElement>('[data-group]')?.dataset.group;
        const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
        if (groupId) {
          selected = groupId;
          renderModal();
        } else if (act === 'close') {
          dialog.close();
        } else if (act === 'delete') {
          const group = groups.find((g) => g.id === selected);
          if (!group || !confirm(`Delete group "${group.name}"?`)) return;
          commit(groups.filter((g) => g !== group));
          selected = FAV;
          renderModal();
          flashToast('Group deleted');
        }
      });

      dialog.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.dataset.ch) {
          setMember(selected, { id: t.dataset.ch, name: t.dataset.name ?? '' }, t.checked);
        } else if (t.classList.contains('name')) {
          const name = t.value.trim();
          if (name) {
            patchGroup(selected, (g) => ({ ...g, name }));
            flashToast('Group renamed');
          }
          renderModal(); // also resets a blanked-out name
        }
      });

      dialog.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = String(new FormData(e.target as HTMLFormElement).get('name')).trim();
        if (!name) return;
        selected = crypto.randomUUID();
        commit([...groups, { id: selected, name, channels: {} }]);
        renderModal();
        flashToast(`Group "${name}" created`);
      });

      selected = FAV;
      renderModal();
      dialog.showModal();
    }

    // ── Favorites: guide pinning + star toggle ────────────────────────────

    function syncGuide(): void {
      const items = guideSubscriptions();
      if (!items) return;
      const fav = favorites();
      const pinned: Element[] = [];
      for (const entry of items.querySelectorAll(':scope > ytd-guide-entry-renderer')) {
        const id = channelIdFromHref(entry.querySelector('a')?.getAttribute('href'));
        const on = !!id && has(fav, id);
        entry.toggleAttribute(PIN_ATTR, on);
        if (on) pinned.push(entry);
      }
      // Only move when out of place: each move is a mutation that re-runs this.
      // Unpinned entries keep their spot until YouTube re-renders the guide.
      if (pinned.some((entry, i) => items.children[i] !== entry)) items.prepend(...pinned);
    }

    function toggleFavorite(): void {
      const ch = pageChannel();
      if (!ch) return;
      const on = !has(favorites(), ch.id);
      setMember(FAV, ch, on);
      flashToast(`${on ? 'Added to' : 'Removed from'} Favorites: ${ch.name || ch.id}`);
    }

    function syncStar(): void {
      const ch = pageChannel();
      const anchor = ch && document.querySelector(isWatchPage() ? WATCH_ANCHOR : CHANNEL_ANCHOR);
      if (!ch || !anchor) {
        star?.host.remove();
        return;
      }
      if (!star) {
        star = shadowHost('span', '<button class="star"></button>');
        star.addEventListener('click', toggleFavorite);
      }
      if (star.host.previousElementSibling !== anchor) anchor.after(star.host);
      const on = has(favorites(), ch.id);
      const btn = star.querySelector('button')!;
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '★ Favorited' : '☆ Favorite';
    }

    // ── Wiring ────────────────────────────────────────────────────────────

    const sync = () => {
      mountBar();
      applyFilter();
      syncGuide();
      syncStar();
    };
    const rerender = () => {
      renderBar();
      sync();
    };

    const unsubs = [
      storage.watch<Group[]>(KEY, (next) => {
        groups = withFavorites(next);
        rerender();
      }),
      ctx.observer.onChange(sync),
      ctx.navigation.onNavigate(() => {
        unhideAllCards(ID);
        rerender();
      }),
    ];
    sync();

    return () => {
      unsubs.forEach((off) => off());
      for (const root of [bar, modal, star]) root?.host.remove();
      guideStyle.remove();
      document.querySelectorAll(`[${PIN_ATTR}]`).forEach((el) => el.removeAttribute(PIN_ATTR));
      unhideAllCards(ID);
    };
  },
};

export default feature;
