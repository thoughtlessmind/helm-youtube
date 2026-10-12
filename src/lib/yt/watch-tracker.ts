import { storage } from '#imports';
import type { YTContext } from './context';
import { getWatchChannel, type ChannelRef } from './video';

/**
 * watch-tracker.ts
 *
 * Measures REAL watch time — wall-clock seconds while <video> is actually
 * playing AND document is visible.
 *
 * Measurement model (wall-clock delta, not timeupdate count):
 *   - On play / visibilitychange→visible: record lastTick = Date.now()
 *   - On pause / visibilitychange→hidden / flush:
 *       accumulate (Date.now() - lastTick) / 1000 into pendingSeconds
 *
 * Data shape in chrome.storage.local:
 *   "local:ytpro:watch-tracker:log" →
 *     { [dateISO: string]: DayStats }
 *
 * At most 90 days retained. Flushed every 15 s, on navigate/unload, and
 * before every query.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelStats {
  /** Channel id (UC… or @handle) */
  channelId: string;
  /** Human-readable channel name */
  name: string;
  /** Accumulated seconds */
  seconds: number;
}

export interface DayStats {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Total seconds watched that day */
  totalSeconds: number;
  /** Per-channel breakdown */
  perChannel: Record<string, { name: string; seconds: number }>;
}

/** Full log keyed by ISO date string */
type WatchLog = Record<string, DayStats>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_KEY = 'local:ytpro:watch-tracker:log' as const;
const FLUSH_INTERVAL_MS = 15_000;
const MAX_DAYS = 90;

// ---------------------------------------------------------------------------
// Module-level state (content script — not service worker)
// ---------------------------------------------------------------------------

/** Accumulated seconds not yet flushed to storage */
let pendingSeconds = 0;

/** Channel of the video being watched — may arrive after playback starts */
let channel: ChannelRef | null = null;

/** Timestamp of last play tick start (null when paused/hidden) */
let lastTick: number | null = null;

/** Tail of the storage write chain — writes run one at a time so none is lost */
let writes: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('video.html5-main-video');
}

/** Accumulate seconds elapsed since lastTick. */
function tick(): void {
  if (lastTick === null) return;
  const now = Date.now();
  pendingSeconds += Math.max(0, now - lastTick) / 1000;
  lastTick = now;
}

function pause(): void {
  tick();
  lastTick = null;
}

function resume(): void {
  if (lastTick === null && !document.hidden) lastTick = Date.now();
}

async function loadLog(): Promise<WatchLog> {
  return (await storage.getItem<WatchLog>(LOG_KEY)) ?? {};
}

async function record(seconds: number, ch: ChannelRef | null): Promise<void> {
  const log = await loadLog();

  // Prune entries older than MAX_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  for (const key of Object.keys(log)) {
    if (new Date(key) < cutoff) delete log[key];
  }

  const date = isoDate(new Date());
  const day = (log[date] ??= { date, totalSeconds: 0, perChannel: {} });
  day.totalSeconds += seconds;

  if (ch) {
    const entry = (day.perChannel[ch.id] ??= { name: ch.name, seconds: 0 });
    entry.seconds += seconds;
    // Always keep the latest known name
    if (ch.name) entry.name = ch.name;
  }

  await storage.setItem(LOG_KEY, log);
}

/**
 * Write pending seconds to storage. Seconds and channel are captured
 * synchronously, so callers may switch `channel` right after.
 */
function flush(): Promise<void> {
  tick();
  if (pendingSeconds > 0) {
    const seconds = pendingSeconds;
    const ch = channel;
    pendingSeconds = 0;
    writes = writes
      .then(() => record(seconds, ch))
      .catch((err) => console.error('[youtube-pro] watch-tracker: write failed', err));
  }
  return writes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start tracking. Returns the stop function, which flushes pending time and
 * removes every listener.
 */
export function startTracking(ctx: YTContext): () => void {
  let video: HTMLVideoElement | null = null;

  const detachVideo = () => {
    video?.removeEventListener('play', resume);
    video?.removeEventListener('pause', pause);
    video = null;
  };

  const attachVideo = (v: HTMLVideoElement | null) => {
    if (!v || v === video) return;
    detachVideo();
    pause();
    video = v;
    v.addEventListener('play', resume);
    v.addEventListener('pause', pause);
    if (!v.paused) resume();
  };

  const onVisibility = () => {
    if (document.hidden) pause();
    else if (video && !video.paused) resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Best-effort async flush; storage.setItem will usually complete.
  const onPageHide = () => {
    pause();
    void flush();
  };
  window.addEventListener('pagehide', onPageHide);

  // YouTube may swap the <video> element
  const offMutation = ctx.observer.subscribe((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLVideoElement) attachVideo(node);
      });
    }
  });

  const offNav = ctx.navigation.onNavigate(() => {
    void flush(); // time so far belongs to the previous page's channel
    channel = getWatchChannel();
    attachVideo(getVideo());
  });

  // Watch metadata renders late — fill in the channel once it appears
  const offChange = ctx.observer.onChange(() => {
    channel ??= getWatchChannel();
  });

  const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  channel = getWatchChannel();
  attachVideo(getVideo());

  return () => {
    detachVideo();
    pause();
    void flush();
    channel = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    offMutation();
    offNav();
    offChange();
    clearInterval(flushTimer);
  };
}

/**
 * Stats for the last `days` days (today first). Flushes pending time first
 * so today's figure is live.
 */
export async function getRange(days: number): Promise<DayStats[]> {
  await flush();
  const log = await loadLog();
  const result: DayStats[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = isoDate(d);
    result.push(log[date] ?? { date, totalSeconds: 0, perChannel: {} });
  }
  return result;
}

/**
 * All channels watched over the last `days` days, sorted by seconds desc.
 */
export async function getChannelTotals(days: number): Promise<ChannelStats[]> {
  const range = await getRange(days);
  const totals: Record<string, ChannelStats> = {};
  for (const day of range) {
    for (const [id, data] of Object.entries(day.perChannel)) {
      if (!totals[id]) {
        totals[id] = { channelId: id, name: data.name, seconds: 0 };
      }
      totals[id].seconds += data.seconds;
      if (data.name) totals[id].name = data.name;
    }
  }
  return Object.values(totals).sort((a, b) => b.seconds - a.seconds);
}

/**
 * Total seconds watched for a specific channel across all stored history.
 */
export async function getChannelTotal(channelId: string): Promise<number> {
  const log = await loadLog();
  let total = 0;
  for (const day of Object.values(log)) {
    total += day.perChannel[channelId]?.seconds ?? 0;
  }
  return total;
}
