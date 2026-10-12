import type { Feature } from '../lib/features';

/**
 * YouTube periodically pauses playback to ask "Video paused. Continue
 * watching?" — we confirm it.
 *
 * That dialog is the same `yt-confirm-dialog-renderer` YouTube uses for
 * Unsubscribe, Clear history, Delete playlist… so we only confirm one that
 * appeared on its own: on a watch page, video paused, and no click or key
 * press for IDLE_MS (a dialog the user opened always follows their input).
 * Matching is structural (#confirm-button), never by button text.
 */

const IDLE_MS = 10_000;

const feature: Feature = {
  setup(ctx) {
    let lastInput = Date.now();
    const mark = () => (lastInput = Date.now());
    addEventListener('pointerdown', mark, true);
    addEventListener('keydown', mark, true);

    const tryDismiss = () => {
      if (location.pathname !== '/watch' || Date.now() - lastInput < IDLE_MS) return;
      if (!document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video')?.paused) return;
      const btn = document.querySelector<HTMLElement>(
        'ytd-popup-container yt-confirm-dialog-renderer #confirm-button button',
      );
      if (btn?.checkVisibility()) btn.click();
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
