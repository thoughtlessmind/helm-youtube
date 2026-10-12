export interface FetchJsonResult<T = unknown> {
  status: number;
  /** Parsed body on 2xx, otherwise null. */
  data: T | null;
}

/**
 * GET a JSON API via the service worker. Content scripts can't fetch
 * third-party origins directly in MV3. Host must be allowlisted in
 * background.ts. Rejects if the extension context is gone.
 */
export function fetchJson<T>(url: string): Promise<FetchJsonResult<T>> {
  return browser.runtime.sendMessage({ type: 'fetch-json', url });
}
