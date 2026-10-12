import { storage } from '#imports';
import type { YTContext } from './context';
import { getVideoId, getWatchChannel, isWatchPage } from './video';

/**
 * watch-tracker.ts
 *
 * Singleton watch-time tracker. Measures REAL watch time — wall-clock
 * seconds while <video> is actually playing AND document is visible.
 *
 * Measurement model (wall-clock delta, not timeupdate count):
 *   - On play / visibilitychange→visible: record lastTick = Date.now()
 *   - On pause / visibilitychange→hidden / timeupdate (periodic flush):
 *       accumulate (Date.now() - lastTick) / 1000 into session buffer, reset lastTick
 *
 * Data shape in chrome.storage.local:
 *   "local:ytpro:watch-tracker:log" →
 *     { [dateISO: string]: DayStats }
 *
 * At most 90 days retained. Flushed every ~15 s and on pause/navigate/unload.
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
// Module-level singleton state (content script — not service worker)
// ---------------------------------------------------------------------------

/** Number of features currently using the tracker */
let refCount = 0;

/** Accumulated seconds not yet flushed to storage */
let pendingSeconds = 0;

/** The context passed by the first caller — used for subscriptions */
let sharedCtx: YTContext | null = null;

/** Video id for the current session accumulation */
let sessionVideoId: string | null = null;

/** Channel info for the current session — may arrive late */
let sessionChannelId: string | null = null;
let sessionChannelName: string = '';

/** Timestamp of last play tick start (null when paused/hidden) */
let lastTick: number | null = null;

/** Timer for periodic flush */
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Teardown functions registered when first started */
const teardowns: Array<() => void> = [];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('video.html5-main-video');
}

/** Tick: compute elapsed since lastTick, accumulate, reset. */
function tick(): void {
  if (lastTick === null) return;
  const now = Date.now();
  const elapsed = (now - lastTick) / 1000;
  if (elapsed > 0) {
    pendingSeconds += elapsed;
  }
  lastTick = now;
}

/** Stop accumulation without updating lastTick. */
function pause(): void {
  tick(); // flush elapsed
  lastTick = null;
}

/** Resume accumulation. */
function resume(): void {
  if (document.hidden) return; // stay paused when hidden
  lastTick = Date.now();
}

/**
 * Flush pendingSeconds into storage under the current session's video/channel.
 * Called periodically and on every stop trigger.
 */
async function flush(): Promise<void> {
  if (pendingSeconds <= 0) return;
  const seconds = pendingSeconds;
  pendingSeconds = 0;

  const date = todayISO();
  const log: WatchLog = (await storage.getItem<WatchLog>(LOG_KEY)) ?? {};

  // Prune entries older than MAX_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DAYS);
  for (const key of Object.keys(log)) {
    if (new Date(key) < cutoff) delete log[key];
  }

  if (!log[date]) {
    log[date] = { date, totalSeconds: 0, perChannel: {} };
  }

  const day = log[date];
  day.totalSeconds += seconds;

  // Attribute to channel if known
  if (sessionChannelId) {
    if (!day.perChannel[sessionChannelId]) {
      day.perChannel[sessionChannelId] = { name: sessionChannelName, seconds: 0 };
    }
    day.perChannel[sessionChannelId].seconds += seconds;
    // Always keep the latest known name
    if (sessionChannelName) {
      day.perChannel[sessionChannelId].name = sessionChannelName;
    }
  }

  await storage.setItem(LOG_KEY, log);
}

/** Re-detect channel info for the current watch page. */
function refreshChannelInfo(): void {
  if (!isWatchPage()) return;
  const ch = getWatchChannel();
  if (ch && ch.id) {
    sessionChannelId = ch.id;
    if (ch.name) sessionChannelName = ch.name;
  }
}

/** Called on navigation — flush and reset session. */
async function onNavigate(url: string): Promise<void> {
  // Flush accumulated time before switching sessions
  pause();
  await flush();

  // Reset session
  sessionVideoId = null;
  sessionChannelId = null;
  sessionChannelName = '';
  pendingSeconds = 0;
  lastTick = null;

  // Detect new session if still on a watch page
  if (isWatchPage()) {
    sessionVideoId = getVideoId();
    refreshChannelInfo();
    // Video may not be playing yet — wait for play event
  }
}

/** Wire up video element event listeners. Returns cleanup fn. */
function attachVideoListeners(video: HTMLVideoElement): () => void {
  const onPlay = () => {
    sessionVideoId = getVideoId();
    refreshChannelInfo();
    resume();
  };
  const onPause = () => pause();
  const onTimeUpdate = () => {
    if (lastTick !== null && Date.now() - lastTick >= FLUSH_INTERVAL_MS) {
      tick();
      void flush();
    }
    // Also try to fill in late-arriving channel info
    if (!sessionChannelId) refreshChannelInfo();
  };
  const onEnded = () => pause();

  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);

  // If already playing when attached
  if (!video.paused && !document.hidden) {
    sessionVideoId = getVideoId();
    refreshChannelInfo();
    resume();
  }

  return () => {
    video.removeEventListener('play', onPlay);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start tracking. Idempotent — multiple features may call this; tracking
 * begins only on the first call and the refcount is incremented.
 *
 * @param ctx - Shared YTContext from the feature's setup().
 */
export function startTracking(ctx: YTContext): void {
  refCount++;
  if (refCount > 1) return; // already running

  sharedCtx = ctx;

  // --- Page visibility ---
  const onVisibility = () => {
    if (document.hidden) {
      pause();
    } else {
      const v = getVideo();
      if (v && !v.paused) resume();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // --- Unload flush ---
  const onUnload = () => {
    pause();
    // Synchronous flush not possible in MV3 (no sendBeacon for local storage);
    // use best-effort async; storage.setItem will usually complete.
    void flush();
  };
  window.addEventListener('pagehide', onUnload);

  // --- Video element management ---
  let detachVideo: (() => void) | null = null;

  const attachCurrentVideo = () => {
    const v = getVideo();
    if (!v) return;
    detachVideo?.();
    detachVideo = attachVideoListeners(v);
  };

  attachCurrentVideo();

  const offMutation = ctx.observer.subscribe((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLVideoElement) {
          detachVideo?.();
          detachVideo = attachVideoListeners(node);
        }
      });
    }
  });

  // --- Navigation ---
  const offNav = ctx.navigation.onNavigate((url) => {
    void onNavigate(url);
    // Re-attach video on new page
    requestAnimationFrame(() => attachCurrentVideo());
  });

  // --- Channel info refresh (late rendering) ---
  const offChange = ctx.observer.onChange(() => {
    if (!sessionChannelId && isWatchPage()) refreshChannelInfo();
  });

  // --- Periodic flush interval ---
  flushTimer = setInterval(() => {
    if (lastTick !== null) {
      tick();
      void flush();
    }
  }, FLUSH_INTERVAL_MS);

  // --- Seed current session if on watch page ---
  if (isWatchPage()) {
    sessionVideoId = getVideoId();
    refreshChannelInfo();
  }

  teardowns.push(
    () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
    },
    offMutation,
    offNav,
    offChange,
    () => {
      detachVideo?.();
      detachVideo = null;
    },
    () => {
      if (flushTimer !== null) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    },
  );
}

/**
 * Stop tracking. Decrements refcount; actually tears down only when count
 * reaches zero.
 */
export async function stopTracking(): Promise<void> {
  if (refCount <= 0) return;
  refCount--;
  if (refCount > 0) return; // other features still active

  // Final flush
  pause();
  await flush();

  // Run teardowns
  for (const fn of teardowns.splice(0)) fn();

  // Reset state
  sharedCtx = null;
  sessionVideoId = null;
  sessionChannelId = null;
  sessionChannelName = '';
  pendingSeconds = 0;
  lastTick = null;
}

// ---------------------------------------------------------------------------
// Query API
// ---------------------------------------------------------------------------

/** Load the full log from storage. */
async function loadLog(): Promise<WatchLog> {
  return (await storage.getItem<WatchLog>(LOG_KEY)) ?? {};
}

/**
 * Stats for today (combined with any in-memory pending seconds for an
 * accurate live reading).
 */
export async function getToday(): Promise<DayStats> {
  // Flush pending first to get an accurate snapshot
  if (lastTick !== null) {
    tick();
    await flush();
    if (lastTick === null && sharedCtx) {
      // Resume tick after query
      const v = getVideo();
      if (v && !v.paused && !document.hidden) resume();
    }
  }

  const log = await loadLog();
  const date = todayISO();
  return log[date] ?? { date, totalSeconds: 0, perChannel: {} };
}

/**
 * Stats for the last `days` days (today first).
 */
export async function getRange(days: number): Promise<DayStats[]> {
  const log = await loadLog();
  const result: DayStats[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push(log[iso] ?? { date: iso, totalSeconds: 0, perChannel: {} });
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
