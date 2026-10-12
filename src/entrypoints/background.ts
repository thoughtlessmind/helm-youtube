import type { FetchJsonResult } from '../lib/fetch-json';
import { getPlayerTabId, setPlayerTabId } from '../lib/queue';

// Content-script fetches run with youtube.com's origin and are blocked
// cross-origin; the SW holds host_permissions, so third-party API calls
// are proxied here. Allowlisted so it can't become an open proxy.
const ALLOWED_HOSTS = new Set(['sponsor.ajay.app']);

export default defineBackground(() => {
  // Content scripts read/watch the player tab id in session storage. `whoami`
  // answers only after this, so a tab that asked first can then read it.
  const sessionReady = Promise.resolve(
    browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }),
  ).catch(() => {});

  browser.tabs.onRemoved.addListener(async (tabId) => {
    if ((await getPlayerTabId()) === tabId) await setPlayerTabId(null);
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'whoami') {
      void sessionReady.then(() => sendResponse(sender.tab?.id ?? null));
      return true;
    }
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
