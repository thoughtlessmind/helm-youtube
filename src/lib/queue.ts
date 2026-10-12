import { storage } from '#imports';

/**
 * The global queue — one list shared by every YouTube tab in the profile
 * (spec: features-v2.md "Global queue"). Played items stay, with a ✓.
 *
 * ponytail: read-modify-write from any tab; two tabs writing in the same
 * tick can drop one change. Route writes through the SW if that ever bites.
 */

export interface QueueItem {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  /** Seconds; 0 when unknown. */
  duration: number;
  addedAt: number;
  /** Set the first time the video plays in any tab → ✓. */
  playedAt?: number;
}

export const QUEUE_KEY = 'local:ytpro:queue' as const;
/** Tab that plays the queue (the "player tab"). Session-scoped: gone on browser restart. */
export const PLAYER_TAB_KEY = 'session:ytpro:player-tab' as const;

export const thumbUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

export const upNext = (items: QueueItem[]) => items.filter((i) => !i.playedAt);

export async function getQueue(): Promise<QueueItem[]> {
  return (await storage.getItem<QueueItem[]>(QUEUE_KEY)) ?? [];
}

export function setQueue(items: QueueItem[]): Promise<void> {
  return storage.setItem(QUEUE_KEY, items);
}

export function watchQueue(cb: (items: QueueItem[]) => void): () => void {
  return storage.watch<QueueItem[]>(QUEUE_KEY, (v) => cb(v ?? []));
}

async function update(fn: (items: QueueItem[]) => QueueItem[]): Promise<QueueItem[]> {
  const next = fn(await getQueue());
  await setQueue(next);
  return next;
}

/** Appends unless already queued-and-unplayed; a played duplicate is re-queued unplayed at the end. */
export async function addToQueue(
  item: Omit<QueueItem, 'addedAt' | 'playedAt'>,
): Promise<{ upNext: number }> {
  const next = await update((items) => {
    const existing = items.find((i) => i.videoId === item.videoId);
    if (existing && !existing.playedAt) return items;
    return [...items.filter((i) => i.videoId !== item.videoId), { ...item, addedAt: Date.now() }];
  });
  return { upNext: upNext(next).length };
}

export async function removeFromQueue(videoId: string): Promise<void> {
  await update((items) => items.filter((i) => i.videoId !== videoId));
}

export async function moveInQueue(videoId: string, toIndex: number): Promise<void> {
  await update((items) => {
    const from = items.findIndex((i) => i.videoId === videoId);
    if (from < 0) return items;
    const next = items.slice();
    const [it] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, it);
    return next;
  });
}

/** Moves to right after `afterVideoId` (or to the front of the unplayed items) and clears playedAt. */
export async function playNext(videoId: string, afterVideoId?: string | null): Promise<void> {
  await update((items) => {
    const it = items.find((i) => i.videoId === videoId);
    if (!it) return items;
    const rest = items.filter((i) => i.videoId !== videoId);
    let at = afterVideoId ? rest.findIndex((i) => i.videoId === afterVideoId) + 1 : 0;
    if (at <= 0) {
      const firstUnplayed = rest.findIndex((i) => !i.playedAt);
      at = firstUnplayed < 0 ? rest.length : firstUnplayed;
    }
    rest.splice(at, 0, { ...it, playedAt: undefined });
    return rest;
  });
}

export async function markPlayed(videoId: string): Promise<void> {
  const items = await getQueue();
  const it = items.find((i) => i.videoId === videoId);
  if (!it || it.playedAt) return;
  await setQueue(items.map((i) => (i === it ? { ...i, playedAt: Date.now() } : i)));
}

export async function clearPlayed(): Promise<void> {
  await update(upNext);
}

export function clearQueue(): Promise<void> {
  return setQueue([]);
}

/** Null when unset — or when session storage isn't readable yet (SW not started; see `myTabId`). */
export async function getPlayerTabId(): Promise<number | null> {
  try {
    return (await storage.getItem<number>(PLAYER_TAB_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function setPlayerTabId(id: number | null): Promise<void> {
  if (id === null) await storage.removeItem(PLAYER_TAB_KEY);
  else await storage.setItem(PLAYER_TAB_KEY, id);
}
