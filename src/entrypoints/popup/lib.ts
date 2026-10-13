import { fmtDuration } from '../../lib/format';
import { isoDate, type WatchLog } from '../../lib/yt/watch-tracker';

/** Small helpers shared by the popup pages. */

export { fmtClock } from '../../lib/format';
export { getLog, isoDate, logItem, type WatchLog } from '../../lib/yt/watch-tracker';

export type Page = 'main' | 'settings' | 'stats' | 'firstrun';

export const FIRST_RUN_KEY = 'local:ytpro:first-run-seen' as const;

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

/** Whole minutes: 72 → "1h 12m", 120 → "2h", 48 → "48m". */
export const fmtMin = (min: number) => fmtDuration(min * 60);

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
