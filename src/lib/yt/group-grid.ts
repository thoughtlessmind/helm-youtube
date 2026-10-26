/**
 * MAIN world only (youtube-main.content.ts): a channel group's latest videos in
 * YouTube's own feed grid, as native cards (⋮ menu, watched bar, hover preview).
 *
 *  - Data: each channel's Videos tab via InnerTube browse, signed in (SAPISIDHASH)
 *    so watch progress comes through; its first 15 videos, merged newest-first
 *    by their relative upload date ("4 days ago"; the tab has no timestamp, and
 *    YouTube's RSS feeds 404). Videos-tab cards lack the avatar and channel name;
 *    both are grafted on from the response's channel metadata.
 *  - Render: the `reloadContinuationItemsCommand` YouTube's own chips use to
 *    swap the grid's contents. "All" swaps the saved originals back.
 *
 * Protocol (window.postMessage, `source: 'ytp'`):
 *   in   { type: 'group-grid', seq, feed: 'home' | 'subscriptions' | null, ids: UC ids | null }
 *        ids null → YouTube's own contents back (feed null: on every feed)
 *   out  { type: 'group-grid-status', seq, status: 'loading' | 'ok' | 'empty' | 'error' }
 *        ('loading' only when it has to fetch: not for a grid already showing the group)
 */

import { pool } from '../pool';

type Json = any; // YouTube's internal renderer data — untyped by nature.
/** `age`: seconds since upload, Infinity when unknown. */
type Dated = { id: string; age: number; item: Json };

const VIDEOS_TAB = 'EgZ2aWRlb3PyBgQKAjoA';
const PER_CHANNEL = 15;
/** Cards in the grid, and browse requests in flight: a 60-channel group is neither 900 cards nor 60 requests at once. */
const MAX_ITEMS = 120;
const CONCURRENCY = 6;
const TTL = 10 * 60_000;
const UC = /^UC[\w-]{22}$/;
const UNITS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };

const spaces = (s: string) => s.replace(/\s+/g, ' ');

/**
 * Seconds since upload from a card's relative date in YouTube's UI language ("4 days ago", "4d ago",
 * "hace 2 sem."): the longest Intl-formatted date (any style) for the card's number that its text
 * contains — longest, so "hace 2 s" (seconds) loses to "hace 2 sem.". Without a digit, 1 and 2
 * ("قبل أسبوعين"). Infinity when nothing matches (upcoming premieres). Checked against 26 locales.
 */
function age(texts: string[], formats: Intl.RelativeTimeFormat[]): number {
  let len = 0;
  let best = Infinity;
  for (const raw of texts) {
    const text = spaces(raw);
    const digits = text.match(/\d+/)?.[0];
    for (const n of digits ? [Number(digits)] : [1, 2])
      for (const f of formats)
        for (const [unit, s] of Object.entries(UNITS)) {
          const date = spaces(f.format(-n, unit as Intl.RelativeTimeFormatUnit));
          if (date.length > len && text.includes(date)) {
            len = date.length;
            best = n * s;
          }
        }
  }
  return best;
}

/** YouTube abbreviates by locale ("4 days ago" vs "4d ago"), always with Latin digits. */
function relativeFormats(hl: string | undefined): Intl.RelativeTimeFormat[] {
  const make = (tag: string) => {
    const locale = new Intl.Locale(tag, { numberingSystem: 'latn' }).toString();
    return (['long', 'short', 'narrow'] as const).map((style) => new Intl.RelativeTimeFormat(locale, { numeric: 'always', style }));
  };
  try {
    return make(hl ?? 'en');
  } catch {
    return make('en'); // an hl Intl doesn't know
  }
}

const channels = new Map<string, { at: number; videos: Promise<Dated[]> }>();
/** Per grid (`targetId`): what we put in, and YouTube's contents it replaced. */
const swapped = new Map<string, { grid: Json; key: string; items: Json[]; original: Json[] }>();
let latest = 0;

async function authHeader(): Promise<Record<string, string>> {
  const sapisid = document.cookie.match(/(?:^|; )SAPISID=([^;]+)/)?.[1];
  if (!sapisid) return {}; // signed out: still works, without watch progress
  const ts = Math.floor(Date.now() / 1000);
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { Authorization: `SAPISIDHASH ${ts}_${hex}` };
}

async function fetchChannel(id: string): Promise<Dated[]> {
  const context = (window as Json).ytcfg.get('INNERTUBE_CONTEXT');
  const res = await fetch('/youtubei/v1/browse?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ context, browseId: id, params: VIDEOS_TAB }),
  });
  if (!res.ok) throw new Error(`browse ${res.status}`);
  const browse: Json = await res.json();
  const formats = relativeFormats(context?.client?.hl);

  const meta = browse.metadata?.channelMetadataRenderer ?? {};
  const name: string = meta.title ?? '';
  const url = meta.vanityChannelUrl ? new URL(meta.vanityChannelUrl).pathname : `/channel/${id}`;
  const onTap = {
    innertubeCommand: {
      commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_CHANNEL', rootVe: 3611 } },
      browseEndpoint: { browseId: id, canonicalBaseUrl: url },
    },
  };
  const avatar = browse.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.image?.decoratedAvatarViewModel;
  const tab = browse.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
    (t: Json) => t.tabRenderer?.content?.richGridRenderer,
  );

  const videos: Dated[] = [];
  for (const item of tab?.tabRenderer.content.richGridRenderer.contents ?? []) {
    const lockup = item.richItemRenderer?.content?.lockupViewModel;
    if (!lockup?.contentId) continue; // the "load more" continuation
    if (videos.length === PER_CHANNEL) break;
    const md = lockup.metadata?.lockupMetadataViewModel;
    if (md && !md.image && avatar) {
      md.image = {
        decoratedAvatarViewModel: {
          ...avatar,
          avatar: { avatarViewModel: { ...avatar.avatar?.avatarViewModel, avatarImageSize: 'AVATAR_SIZE_M' } },
          a11yLabel: `Go to channel ${name}`,
          rendererContext: { commandContext: { onTap } },
        },
      };
    }
    const rows: Json[] = md?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
    const texts = rows.flatMap((r) => r.metadataParts ?? []).map((p: Json) => p.text?.content ?? '');
    const parts = rows[0]?.metadataParts;
    // Collabs already name their channels.
    if (name && Array.isArray(parts) && !parts[0]?.text?.content?.startsWith(name)) {
      parts.unshift({ text: { content: name, commandRuns: [{ startIndex: 0, length: name.length, onTap }] } });
    }
    videos.push({ id: lockup.contentId, age: age(texts, formats), item });
  }
  return videos;
}

/** One channel's videos, cached for TTL (failures aren't). */
function channelVideos(id: string): Promise<Dated[]> {
  const hit = channels.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.videos;
  const videos = fetchChannel(id);
  channels.set(id, { at: Date.now(), videos });
  videos.catch(() => channels.delete(id));
  return videos;
}

/** Newest-first rich items from these channels, at most MAX_ITEMS. Throws only when every channel fails. */
async function groupItems(ids: string[]): Promise<Json[]> {
  const results = await pool(ids, CONCURRENCY, (id) => channelVideos(id).catch(() => null));
  const loaded = results.filter((r) => r !== null);
  if (ids.length && !loaded.length) throw new Error('No channel loaded');
  const seen = new Set<string>(); // a collab sits in two members' tabs
  return loaded
    .flat()
    .sort((a, b) => (a.age === b.age ? 0 : a.age - b.age)) // stable: ties keep each channel's own order
    .filter((v) => !seen.has(v.id) && !!seen.add(v.id))
    .slice(0, MAX_ITEMS)
    .map((v) => v.item);
}

/** Swaps the grid's contents through YouTube's own command (routed by targetId). */
function reload(targetId: string, continuationItems: Json[]): void {
  document.querySelector('ytd-app')?.dispatchEvent(
    new CustomEvent('yt-action', {
      bubbles: true,
      composed: true,
      detail: {
        actionName: 'yt-reload-continuation-items-command',
        optionalAction: false,
        returnValue: [],
        args: [{ reloadContinuationItemsCommand: { targetId, slot: 'RELOAD_CONTINUATION_SLOT_BODY', continuationItems } }],
      },
    }),
  );
}

/** YouTube's contents back in every grid still showing ours (else YouTube already replaced them). */
function restore(feed: string | null): void {
  for (const [targetId, s] of swapped) {
    if (feed && !s.grid.closest(`ytd-browse[page-subtype="${feed}"]`)) continue;
    if (s.grid.data?.contents === s.items) reload(targetId, s.original);
    swapped.delete(targetId);
  }
}

const post = (seq: number, status: 'loading' | 'ok' | 'empty' | 'error') =>
  window.postMessage({ source: 'ytp', type: 'group-grid-status', seq, status }, location.origin);

async function show(seq: number, feed: string, ids: string[]): Promise<void> {
  const grid: Json = document.querySelector(`ytd-browse[page-subtype="${feed}"] ytd-rich-grid-renderer`);
  const targetId: string | undefined = grid?.data?.targetId;
  if (!targetId) return post(seq, 'error');
  const key = ids.join();
  const s = swapped.get(targetId);
  if (s?.key === key && grid.data.contents === s.items) return post(seq, 'ok'); // e.g. Back to a cached page
  post(seq, 'loading'); // YouTube's own videos are in the grid until ours arrive
  try {
    const items = await groupItems(ids);
    if (seq !== latest) return;
    if (!items.length) return post(seq, 'empty');
    const cur = swapped.get(targetId);
    const original = cur && grid.data.contents === cur.items ? cur.original : grid.data.contents;
    swapped.set(targetId, { grid, key, items, original });
    reload(targetId, items);
    post(seq, 'ok');
  } catch {
    if (seq === latest) post(seq, 'error');
  }
}

export function installGroupGrid(): void {
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || e.origin !== location.origin || d?.source !== 'ytp' || d.type !== 'group-grid' || typeof d.seq !== 'number') return;
    latest = d.seq;
    const feed = d.feed === 'home' || d.feed === 'subscriptions' ? d.feed : null;
    const ids = Array.isArray(d.ids) ? d.ids.filter((id: unknown) => typeof id === 'string' && UC.test(id)) : null;
    if (feed && ids) void show(d.seq, feed, ids);
    else restore(feed);
  });
}
