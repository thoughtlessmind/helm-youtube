import { storage } from '#imports';
import type { YTContext } from './context';
import { getWatchChannel, isWatchPage, type ChannelRef } from './video';
import { watchMetaCurrent } from './player';

/**
 * Measures real watch time: wall-clock seconds while the watch page's main
 * player is playing AND the tab is visible. Hover/inline previews (home,
 * search) never count — only `/watch` and only YouTube's main player video.
 *
 *   local:ytpro:watch-tracker:log      { [YYYY-MM-DD]: DayStats } — last 90 days (the popup reads it)
 *   local:ytpro:watch-tracker:channels { [channelId]: { name, seconds } } — all time, no cap
 *
 * Flushed every 15 s, on navigation and on pagehide.
 */

export interface DayStats {
  /** YYYY-MM-DD (local time) */
  date: string;
  totalSeconds: number;
  perChannel: Record<string, { name: string; seconds: number }>;
}

/** Full log keyed by YYYY-MM-DD. */
export type WatchLog = Record<string, DayStats>;
/** All-time seconds per channel id (`UC…` or `@handle`, see lib/yt/video.ts). */
export type ChannelTotals = Record<string, { name: string; seconds: number }>;

export const LOG_KEY = 'local:ytpro:watch-tracker:log' as const;
export const CHANNELS_KEY = 'local:ytpro:watch-tracker:channels' as const;
const FLUSH_INTERVAL_MS = 15_000;
const MAX_DAYS = 90;
/** YouTube's main player video; preview players live outside ytd-watch-flexy. */
const MAIN_VIDEO = 'ytd-watch-flexy video.html5-main-video';

let pendingSeconds = 0;
/** Channel of the video being watched — may arrive after playback starts. */
let channel: ChannelRef | null = null;
/** Start of the current counting stretch; null while not counting. */
let lastTick: number | null = null;
/** Tail of the storage write chain — writes run one at a time so none is lost. */
let writes: Promise<void> = Promise.resolve();

/** The watch page's channel, or null while its metadata still shows the previous video's (SPA nav). */
const currentChannel = () => (watchMetaCurrent() ? getWatchChannel() : null);

export function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tick(): void {
  if (lastTick === null) return;
  const now = Date.now();
  pendingSeconds += Math.max(0, now - lastTick) / 1000;
  lastTick = now;
}

function stopCounting(): void {
  tick();
  lastTick = null;
}

async function record(seconds: number, ch: ChannelRef | null): Promise<void> {
  const [logItem, chItem] = await storage.getItems([LOG_KEY, CHANNELS_KEY]);
  const log: WatchLog = logItem.value ?? {};
  const totals: ChannelTotals = chItem.value ?? {};

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  const oldest = isoDate(cutoff);
  for (const key of Object.keys(log)) if (key < oldest) delete log[key];

  const date = isoDate();
  const day = (log[date] ??= { date, totalSeconds: 0, perChannel: {} });
  day.totalSeconds += seconds;
  if (ch) {
    for (const map of [day.perChannel, totals]) {
      const entry = (map[ch.id] ??= { name: ch.name, seconds: 0 });
      entry.seconds += seconds;
      if (ch.name) entry.name = ch.name;
    }
  }
  await storage.setItems([
    { key: LOG_KEY, value: log },
    { key: CHANNELS_KEY, value: totals },
  ]);
}

/** Writes pending seconds. Seconds and channel are captured synchronously. */
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

/** Starts tracking; returns stop (flushes and removes every listener). */
export function startTracking(ctx: YTContext): () => void {
  let video: HTMLVideoElement | null = null;

  /** Count exactly while the main watch-page video plays in a visible tab. */
  const sync = () => {
    const counting = !!video && !video.paused && !document.hidden && isWatchPage();
    if (counting && lastTick === null) lastTick = Date.now();
    else if (!counting) stopCounting();
  };

  const attach = () => {
    const v = isWatchPage() ? document.querySelector<HTMLVideoElement>(MAIN_VIDEO) : null;
    if (v !== video) {
      video?.removeEventListener('play', sync);
      video?.removeEventListener('pause', sync);
      v?.addEventListener('play', sync);
      v?.addEventListener('pause', sync);
      video = v;
    }
    sync();
  };

  const onPageHide = () => {
    stopCounting();
    void flush();
  };

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', onPageHide);
  const offNav = ctx.navigation.onNavigate(() => {
    stopCounting();
    void flush(); // time so far belongs to the previous page's channel
    channel = currentChannel();
    attach();
  });
  // YouTube may swap the <video>; watch metadata (channel) renders late.
  const offChange = ctx.observer.onChange(() => {
    channel ??= currentChannel();
    attach();
  });
  const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  channel = currentChannel();
  attach();

  return () => {
    video?.removeEventListener('play', sync);
    video?.removeEventListener('pause', sync);
    video = null;
    stopCounting();
    void flush();
    channel = null;
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', onPageHide);
    offNav();
    offChange();
    clearInterval(flushTimer);
  };
}

// Readers don't flush: a reader reacting to LOG_KEY changes would otherwise write on every
// change it sees. Up to 15 s of this tab's time may be missing — fine for stats.
export async function getLog(): Promise<WatchLog> {
  return (await storage.getItem<WatchLog>(LOG_KEY)) ?? {};
}

export async function getChannelTotals(): Promise<ChannelTotals> {
  return (await storage.getItem<ChannelTotals>(CHANNELS_KEY)) ?? {};
}
