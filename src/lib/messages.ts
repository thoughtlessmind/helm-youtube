/**
 * Message contracts between the popup, content scripts and the service
 * worker. One file so both ends agree on shapes.
 */

export interface PlayerState {
  videoId: string;
  title: string;
  channelName: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
}

/** popup → content script (`browser.tabs.sendMessage`). */
export type TabMessage =
  | { type: 'player-state' } // → PlayerState | null
  | { type: 'player-control'; action: 'play' | 'pause' }
  | { type: 'player-seek'; to?: number; by?: number } // absolute or relative seconds
  | { type: 'player-rate'; rate: number } // playback speed, e.g. 1.5
  | { type: 'play-video'; videoId: string } // SPA-navigate this tab to the video
  | { type: 'open-manage-groups' }; // handled by channel-groups when it's on

/** content script → service worker (`browser.runtime.sendMessage`). */
export type SwMessage = { type: 'fetch-json'; url: string } | { type: 'whoami' };

/** Resolves undefined when the tab has no receiver (no content script, or nobody handled it). */
export async function sendToTab<T>(tabId: number, msg: TabMessage): Promise<T | undefined> {
  try {
    return (await browser.tabs.sendMessage(tabId, msg)) as T | undefined;
  } catch {
    return undefined;
  }
}

/** This content script's tab id, from the SW. */
export async function myTabId(): Promise<number | null> {
  try {
    return ((await browser.runtime.sendMessage({ type: 'whoami' } satisfies SwMessage)) as number) ?? null;
  } catch {
    return null;
  }
}
