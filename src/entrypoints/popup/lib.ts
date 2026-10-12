import { storage } from '#imports';
import type { DayStats } from '../../lib/yt/watch-tracker';

/** Small helpers shared by the popup pages. */

export type Page = 'main' | 'settings' | 'stats' | 'firstrun';

export const FIRST_RUN_KEY = 'local:ytpro:first-run-seen' as const;
/** Written by lib/yt/watch-tracker.ts (read-only here). */
const LOG_KEY = 'local:ytpro:watch-tracker:log' as const;
export type WatchLog = Record<string, DayStats>;

export const getLog = async (): Promise<WatchLog> => (await storage.getItem<WatchLog>(LOG_KEY)) ?? {};
export const watchLog = (cb: (log: WatchLog) => void) => storage.watch<WatchLog>(LOG_KEY, (v) => cb(v ?? {}));

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The date `back` days before today (0 = today). */
export function dayAgo(back: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return d;
}

/** Whole minutes watched on `d`. */
export const minutesOn = (log: WatchLog, d: Date) => Math.round((log[isoDate(d)]?.totalSeconds ?? 0) / 60);

/** Minutes watched over the `days` days ending `endBack` days ago (0 = through today). */
export function minutesOver(log: WatchLog, days: number, endBack = 0): number {
  let sum = 0;
  for (let i = endBack; i < endBack + days; i++) sum += minutesOn(log, dayAgo(i));
  return sum;
}

/** 72 → "1h 12m", 125 → "2h 05m", 120 → "2h", 48 → "48m". */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return m + 'm';
  return h + 'h' + (m ? ' ' + String(m).padStart(2, '0') + 'm' : '');
}

/** Seconds → "4:05" / "1:02:03". */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}

/** Every YouTube tab, most recently used first. Host permission gives url/title. */
export async function youtubeTabs() {
  const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
  return tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
}

export async function focusTab(tab: { id?: number; windowId?: number }) {
  if (tab.id == null) return;
  await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
}

/** Opens youtube.com (or `url`) in a new tab. */
export const openYouTube = (url = 'https://www.youtube.com/', active = true) => browser.tabs.create({ url, active });
