/**
 * Channel groups: storage + reactive state shared by the feature module and
 * its Svelte components. Group order = array order (the switcher follows it).
 */

import { storage } from '#imports';
import type { ChannelRef } from '../../lib/yt/video';

export interface Group {
  id: string;
  name: string;
  /** Channel id (`@handle` or `UC…`) → display name. */
  channels: Record<string, string>;
}

export const KEY = 'local:ytpro:channel-groups';
export const FAV = 'favorites';

class Store {
  /** Always contains Favorites. Replaced (never mutated) on every change. */
  groups = $state.raw<Group[]>([]);
  /** The watch/channel page's channel, for the Group pill. */
  page = $state.raw<ChannelRef | null>(null);
  /** Channel page (40px pill, menu below) vs watch page (36px, menu above). */
  onChannelPage = $state(false);
  /** Selected group id on the current feed ('' = All). */
  selected = $state('');
  /** The selected group hides every card in the feed. */
  empty = $state(false);
}
export const store = new Store();

/** Favorites always exists; created on first read rather than seeded. */
export function withFavorites(list: Group[] | null): Group[] {
  const groups = list ?? [];
  return groups.some((g) => g.id === FAV) ? groups : [{ id: FAV, name: 'Favorites', channels: {} }, ...groups];
}

/** Loads the groups and keeps them in sync with every tab's writes; returns unwatch. */
export async function loadGroups(onChange: () => void): Promise<() => void> {
  store.groups = withFavorites(await storage.getItem<Group[]>(KEY));
  return storage.watch<Group[]>(KEY, (next) => {
    store.groups = withFavorites(next);
    onChange();
  });
}

export function saveGroups(next: Group[]): void {
  store.groups = next;
  void storage.setItem(KEY, next);
}

export const label = (g: Group) => (g.id === FAV ? `★ ${g.name}` : g.name);
export const channelCount = (g: Group) => Object.keys(g.channels).length;

/**
 * The key `ch` is stored under in `g`, or null. Ids differ by surface
 * (`@handle` on most links, `UC…` on some), so a same-named member counts too.
 */
export function memberKey(g: Group, ch: { id: string | null; name: string }): string | null {
  if (ch.id && Object.hasOwn(g.channels, ch.id)) return ch.id;
  if (!ch.name) return null;
  // ponytail: name fallback can merge two channels with the same display name; resolve UC↔@handle if it bites.
  return Object.keys(g.channels).find((k) => g.channels[k] === ch.name) ?? null;
}

export function setMember(groupId: string, ch: ChannelRef, on: boolean): void {
  saveGroups(
    store.groups.map((g) => {
      if (g.id !== groupId) return g;
      const channels = { ...g.channels };
      const key = memberKey(g, ch);
      if (key) delete channels[key];
      if (on) channels[ch.id] = ch.name || ch.id;
      return { ...g, channels };
    }),
  );
}

export function isDuplicateName(name: string, exceptId: string | null): boolean {
  const n = name.trim().toLowerCase();
  return !!n && store.groups.some((g) => g.id !== exceptId && g.name.toLowerCase() === n);
}

/** Appends a group; returns its id. */
export function createGroup(name: string, channels: Record<string, string> = {}): string {
  const id = crypto.randomUUID();
  saveGroups([...store.groups, { id, name: name.trim(), channels }]);
  return id;
}

export function updateGroup(id: string, patch: Partial<Omit<Group, 'id'>>): void {
  saveGroups(store.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}
