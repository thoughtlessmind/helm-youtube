import { storage } from '#imports';
import { FEATURE_CONFIG_DEFAULTS, FEATURE_DEFAULTS } from './settings';

/**
 * Backup & restore — "export everything as a single JSON".
 *
 * Feature flags and per-feature config already roam across devices for free
 * because they live in `chrome.storage.sync`. Bulky data (notes, channel
 * groups, the watch queue, watch time) lives in `chrome.storage.local`,
 * which is device-local and too large for the sync-storage quota — so the
 * cross-device story for that data is this manual export/import.
 *
 * A backup captures every Helm key from both storage areas; importing
 * writes them all back. Keys are filtered to Helm's own namespace so a
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

/** True for storage keys owned by Helm (un-prefixed, as `snapshot` returns them). */
function isOwnKey(key: string): boolean {
  return (
    key === 'featureFlags' ||
    key === 'extensionEnabled' ||
    key.startsWith('config:') ||
    key.startsWith('helm:')
  );
}

function pickOwn(snapshot: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([k]) => isOwnKey(k)),
  );
}

/** Collect every Helm setting and data blob into one object. */
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

/** Validate that an arbitrary parsed object is a Helm backup. */
export const isBackupData = (v: any): v is BackupData =>
  v?.version === 1 && !!v.sync && typeof v.sync === 'object' && !!v.local && typeof v.local === 'object';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A plain object whose every value passes `ok`. */
const mapOf = (ok: (x: any) => boolean) => (v: unknown) => isObj(v) && Object.values(v).every(ok);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Chrome's media range: playback-speed sets `video.playbackRate` straight from these, and it throws outside it. */
const isRate = (x: unknown) => isNum(x) && x >= 0.0625 && x <= 16;
const isStr = (x: unknown) => typeof x === 'string';

/** Shape checks for every local key a feature reads: a hand-edited or foreign backup must not break one. */
const LOCAL_SHAPES: Record<string, (v: any) => boolean> = {
  'helm:queue': (v) => Array.isArray(v) && v.every((i) => isStr(i?.videoId)),
  'helm:channel-groups': (v) =>
    Array.isArray(v) && v.every((g) => isStr(g?.id) && isStr(g.name) && mapOf(isStr)(g.channels)),
  'helm:channel-ids': mapOf(isStr),
  'helm:per-channel-speed': mapOf(isRate),
  'helm:video-notes': mapOf(isStr),
  'helm:watch-tracker:log': mapOf((d) => isObj(d) && isNum(d.totalSeconds) && mapOf((c) => isNum(c?.seconds))(d.perChannel)),
  'helm:watch-tracker:channels': mapOf((c) => isNum(c?.seconds)),
  'helm:watch-time-reminder': isObj,
  'helm:first-run-seen': (v) => typeof v === 'boolean',
};

/** `v`'s keys that `defaults` has, each kept only when its value has the default's type. */
function sameTypes(v: unknown, defaults: Record<string, unknown>): Record<string, unknown> | null {
  if (!isObj(v)) return null;
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => Object.hasOwn(defaults, k) && typeof x === typeof defaults[k]));
}

/** The sync keys Helm reads, with values of the types it expects; anything else is dropped. */
function cleanSync(sync: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof sync.extensionEnabled === 'boolean') out.extensionEnabled = sync.extensionEnabled;
  const flags = sameTypes(sync.featureFlags, FEATURE_DEFAULTS);
  if (flags) out.featureFlags = flags;
  for (const [id, defaults] of Object.entries(FEATURE_CONFIG_DEFAULTS)) {
    const cfg = sameTypes(sync[`config:${id}`], defaults);
    if (cfg) out[`config:${id}`] = cfg;
  }
  const speed = out['config:playback-speed'] as { rate?: unknown } | undefined;
  if (speed && !isRate(speed.rate)) delete speed.rate;
  return out;
}

/**
 * Restore a backup. Writes each key back to its storage area. Only Helm's
 * own keys are written, so a tampered file cannot clobber unrelated state.
 */
export async function importBackup(data: BackupData): Promise<void> {
  const local = Object.entries(data.local).filter(([k, v]) => k.startsWith('helm:') && (LOCAL_SHAPES[k]?.(v) ?? true));
  // Sync first: if it fails (e.g. an item over the sync quota), the local data is still untouched.
  await storage.setItems(Object.entries(cleanSync(data.sync)).map(([k, value]) => ({ key: `sync:${k}` as const, value })));
  await storage.setItems(local.map(([k, value]) => ({ key: `local:${k}` as const, value })));
}
