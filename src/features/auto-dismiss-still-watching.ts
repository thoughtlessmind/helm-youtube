import type { Feature } from '../lib/features';
import { getVideo } from '../lib/yt/player';
import { isWatchPage } from '../lib/yt/video';

/**
 * YouTube periodically pauses playback to ask "Video paused. Continue
 * watching?" — we confirm it.
 *
 * That dialog is the same `yt-confirm-dialog-renderer` YouTube uses for
 * Unsubscribe, Clear history, Delete playlist… so we only confirm one that
 * appeared on its own: idleness is judged once, when the dialog shows (no click
 * or key press for IDLE_MS before it — a dialog the user opened always follows
 * their input), never later while it stays open. A born-idle dialog is
 * confirmed on a watch page with the video paused. Hidden and shown again =
 * judged again. Matching is structural (#confirm-button), never by button text.
 */

const IDLE_MS = 10_000;

const feature: Feature = {
  setup(ctx) {
    let lastInput = Date.now();
    const mark = () => (lastInput = Date.now());
    addEventListener('pointerdown', mark, true);
    addEventListener('keydown', mark, true);

    let shown = false;
    let bornIdle = false;
    const tryDismiss = () => {
      const btn = document.querySelector<HTMLElement>(
        'ytd-popup-container yt-confirm-dialog-renderer #confirm-button button',
      );
      const visible = !!btn?.checkVisibility();
      if (visible !== shown) {
        shown = visible;
        bornIdle = visible && Date.now() - lastInput >= IDLE_MS;
      }
      if (bornIdle && isWatchPage() && getVideo()?.paused) btn!.click();
    };

    const off = ctx.observer.onChange(tryDismiss);
    return () => {
      off();
      removeEventListener('pointerdown', mark, true);
      removeEventListener('keydown', mark, true);
    };
  },
};

export default feature;
