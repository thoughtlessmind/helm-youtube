/**
 * GET a JSON API via the service worker: the parsed body on 2xx, else null. Content scripts can't
 * fetch third-party origins directly in MV3. Host must be allowlisted in background.ts. Rejects if
 * the extension context is gone.
 */
export const fetchJson = <T>(url: string): Promise<T | null> => browser.runtime.sendMessage({ type: 'fetch-json', url });
