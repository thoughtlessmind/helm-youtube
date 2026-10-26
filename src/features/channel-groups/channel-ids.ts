/**
 * Channel keys (`@handle`, legacy name or `UC…`) → `UC…` ids, which the group
 * grid's InnerTube requests need. A handle is resolved once, from its channel
 * page's canonical link, and remembered.
 */

import { storage } from '#imports';
import { pool } from '../../lib/pool';

const UC = /^UC[\w-]{22}$/;
const CANONICAL = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/;
/** `@handle` (or legacy name) → `UC…` id. A cache, so it never needs migrating. */
const IDS_KEY = 'local:helm:channel-ids';

/** The channel's `UC…` id, from its page's canonical link. */
async function lookUpId(key: string): Promise<string | null> {
  const res = await fetch(key.startsWith('@') ? `/${key}` : `/c/${key}`);
  if (!res.ok || !res.body) return null;
  // The link sits ~0.8 MB into a ~3 MB page: stop reading there.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return null;
    html += decoder.decode(value, { stream: true });
    const id = CANONICAL.exec(html)?.[1];
    if (id) {
      void reader.cancel();
      return id;
    }
  }
}

/** `UC…` ids for channel keys; unresolvable keys are dropped. */
export async function channelIds(keys: string[]): Promise<string[]> {
  const stored = await storage.getItem<Record<string, string>>(IDS_KEY);
  const known = stored && typeof stored === 'object' ? stored : {};
  const missing = keys.filter((k) => !UC.test(k) && !known[k]);
  if (missing.length) {
    const found = await pool(missing, 4, (k) => lookUpId(k).catch(() => null)); // each streams ~1 MB
    const added = Object.fromEntries(missing.flatMap((k, i) => (found[i] ? [[k, found[i]]] : [])));
    if (Object.keys(added).length) {
      Object.assign(known, added);
      void storage.setItem(IDS_KEY, known);
    }
  }
  return [...new Set(keys.map((k) => (UC.test(k) ? k : known[k])).filter(Boolean))].sort();
}
