import type { Feature } from '../lib/features';

/**
 * YouTube periodically pauses playback to ask "Video paused. Continue
 * watching?" Pure friction. We watch for the dialog and click "Yes".
 *
 * The selector path is intentionally loose: YouTube has used several
 * different popup containers over the years (`yt-confirm-dialog-renderer`,
 * `tp-yt-paper-dialog`, `ytmusic-popup-container`). We match on the
 * confirm-button role inside any visible dialog.
 */

const feature: Feature = {
  id: 'auto-dismiss-still-watching',
  setup(ctx) {
    const tryDismiss = () => {
      // Standard confirm dialog ("Yes" button).
      const dialog = document.querySelector<HTMLElement>(
        'yt-confirm-dialog-renderer, tp-yt-paper-dialog[role="alertdialog"]',
      );
      if (!dialog || dialog.hidden) return;

      // The "Yes" button is the primary confirm button — usually the
      // second button in the action bar (first is "No, cancel").
      const buttons = dialog.querySelectorAll<HTMLElement>(
        'yt-button-renderer, button',
      );
      // Prefer button labelled like Yes/Continue, otherwise click the last.
      let target: HTMLElement | null = null;
      for (const btn of buttons) {
        const label = (btn.textContent ?? '').trim().toLowerCase();
        if (/^(yes|continue|confirm)/.test(label)) {
          target = btn;
          break;
        }
      }
      if (!target && buttons.length > 0) target = buttons[buttons.length - 1];
      target?.click();
    };

    return ctx.observer.onChange(tryDismiss);
  },
};

export default feature;
