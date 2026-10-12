import type { YTContext } from './context';

/**
 * Answers the popup's `TabMessage`s (see lib/messages.ts) for this tab:
 * player state, play/pause, seek, play a video. Installed once by the
 * content script regardless of feature flags. Owned by the queue task (T3).
 */
export function installPlayerBridge(_ctx: YTContext): () => void {
  return () => {};
}
