import { storage } from '#imports';

/**
 * Backup & restore — "export everything as a single JSON" (Phase 4).
 *
 * Feature flags and per-feature config already roam across devices for free
 * because they live in `chrome.storage.sync`. Bulky data (notes, tags,
 * dashboards, the watch queue, analytics) lives in `chrome.storage.local`,
 * which is device-local and too large for the sync-storage quota — so the
 * cross-device story for that data is this manual export/import.
 *
 * A backup captures every YouTube Pro key from both storage areas; importing
 * writes them all back. Keys are filtered to YouTube Pro's own namespace so a
 * backup never carries unrelated extension state.
 */

export interface BackupData {
  /** Schema version — bump if the shape ever changes. */
  version: 1;
  /** ISO timestamp the backup was produced. */
  exportedAt: string;
  /** `chrome.storage.sync` entries (feature flags + config), keys un-prefixed. */
  sync: Record<string, unknown>;
  /** `chrome.storage.local` entries (bulky feature data), keys un-prefixed. */
  local: Record<string, unknown>;
}

/** True for storage keys owned by YouTube Pro (un-prefixed, as `snapshot` returns them). */
function isOwnKey(key: string): boolean {
  return (
    key === 'featureFlags' ||
    key === 'extensionEnabled' ||
    key.startsWith('config:') ||
    key.startsWith('ytpro:')
  );
}

function pickOwn(snapshot: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([k]) => isOwnKey(k)),
  );
}

/** Collect every YouTube Pro setting and data blob into one object. */
export async function exportBackup(): Promise<BackupData> {
  const [sync, local] = await Promise.all([
    storage.snapshot('sync'),
    storage.snapshot('local'),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sync: pickOwn(sync),
    local: pickOwn(local),
  };
}

/** Validate that an arbitrary parsed object is a YouTube Pro backup. */
export const isBackupData = (v: any): v is BackupData =>
  v?.version === 1 && !!v.sync && typeof v.sync === 'object' && !!v.local && typeof v.local === 'object';

/** Shape checks for keys a feature would crash on if a hand-edited backup broke them. */
const LOCAL_SHAPES: Record<string, (v: unknown) => boolean> = {
  'ytpro:queue': (v) => Array.isArray(v) && v.every((i) => typeof i?.videoId === 'string'),
  'ytpro:channel-groups': (v) =>
    Array.isArray(v) && v.every((g) => typeof g?.id === 'string' && !!g.channels && typeof g.channels === 'object'),
};

/**
 * Restore a backup. Writes each key back to its storage area. Only YouTube
 * Pro keys are written, so a tampered file cannot clobber unrelated state.
 */
export async function importBackup(data: BackupData): Promise<void> {
  await storage.setItems([
    ...Object.entries(pickOwn(data.sync)).map(([k, value]) => ({ key: `sync:${k}` as const, value })),
    ...Object.entries(pickOwn(data.local))
      .filter(([k, v]) => LOCAL_SHAPES[k]?.(v) ?? true)
      .map(([k, value]) => ({ key: `local:${k}` as const, value })),
  ]);
}
