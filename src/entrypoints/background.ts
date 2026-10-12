import type { FetchJsonResult } from '../lib/fetch-json';

// Content-script fetches run with youtube.com's origin and are blocked
// cross-origin; the SW holds host_permissions, so third-party API calls
// are proxied here. Allowlisted so it can't become an open proxy.
const ALLOWED_HOSTS = new Set(['sponsor.ajay.app', 'returnyoutubedislikeapi.com']);

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'fetch-json') return;
    const fail: FetchJsonResult = { status: 0, data: null };
    const url = URL.parse(msg.url);
    if (!url || !ALLOWED_HOSTS.has(url.hostname)) {
      sendResponse(fail);
      return;
    }
    fetch(url)
      .then(async (res) => ({ status: res.status, data: res.ok ? await res.json() : null }))
      .then(sendResponse, () => sendResponse(fail));
    return true; // keep the channel open for the async response
  });
});
