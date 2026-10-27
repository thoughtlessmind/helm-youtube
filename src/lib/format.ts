/** Formatters shared by the popup and the content script. No DOM, no extension APIs. */

/** 412 → "6:52", 3725 → "1:02:05". */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 7440 → "2h 04m", 7200 → "2h", 2700 → "45m". */
export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return !h ? `${m}m` : !m ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Avatar stand-in: "Byte Sized Systems" → "BS", "@robshocks" → "R". */
export const initials = (name: string) =>
  name
    .replace(/^@/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');
