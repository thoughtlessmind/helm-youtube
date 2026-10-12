/**
 * thumbnail-save-button — Always-visible Watch Later button on every thumbnail.
 *
 * WHY THIS EXISTS
 * ---------------
 * YouTube already renders a "Watch later" overlay toggle button
 * (`ytd-thumbnail-overlay-toggle-button-renderer`) on every thumbnail.
 * It is hidden at 0 opacity and only appears on hover — which means users
 * must hover first, wait for the overlay to fade in, then click. On mobile-
 * style layouts or fast-scrolling sessions this is easy to miss entirely.
 *
 * APPROACH — pure CSS, no DOM injection
 * --------------------------------------
 * We inject a single `<style>` that overrides YouTube's hover-gated opacity
 * so the Watch Later toggle is always visible. This reuses YouTube's own
 * button and its own save logic — we never fake a click chain or automate
 * the Save dialog. Robust against YouTube JS changes; only breaks if YouTube
 * restructures the thumbnail overlay markup (stable since ~2019).
 *
 * DISTINGUISHING "Watch Later" FROM "Add to queue"
 * -------------------------------------------------
 * YouTube renders two overlay toggle buttons on most thumbnails:
 *   1. Watch Later  (clock icon, aria-label contains "Watch later")
 *   2. Add to queue (playlist icon, aria-label contains "queue")
 *
 * We target ONLY the Watch Later button by relying on the `aria-label`
 * attribute via the CSS attribute selector `[aria-label*="Watch later"]`
 * applied to the `ytd-thumbnail-overlay-toggle-button-renderer` host.
 * This is the same attribute YouTube's own accessibility tree uses, so it
 * is a stable and semantically meaningful selector. The "Add to queue"
 * button uses a different label and is left hover-gated to keep thumbnails
 * uncluttered.
 *
 * FALLBACK
 * --------
 * If label-based targeting proves fragile (YouTube has been known to change
 * localised aria-labels), making BOTH overlay toggle buttons always-visible
 * is a one-line CSS change; the JSDoc decision is recorded here so the
 * trade-off is explicit.
 *
 * TOAST CONFIRMATION
 * ------------------
 * We attach a single capture-phase delegated click listener on `document`.
 * When the user clicks a Watch Later overlay button we fire a short toast.
 * Because YouTube's own button handles the actual save, we just provide
 * feedback — we do not need to inspect the resulting state.
 */

import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';

const STYLE_ID = 'yt-pro-thumbnail-save-button';

/**
 * Selector for the Watch Later overlay toggle button host element.
 *
 * `ytd-thumbnail-overlay-toggle-button-renderer` is the Polymer element
 * that wraps each overlay icon button on a thumbnail. The `aria-label`
 * attribute is set on the inner `<button>` inside it, so we use a
 * descendant button selector with the attribute filter.
 *
 * We expose the button itself (not the host) so we can both style it and
 * detect clicks precisely.
 */
const WL_BUTTON_SELECTOR =
  'ytd-thumbnail-overlay-toggle-button-renderer button[aria-label*="Watch later"]';

/**
 * The host element containing the Watch Later button. Used for the CSS
 * `display:flex` override — the host itself is also normally display:none
 * until hover in newer YouTube builds.
 */
const WL_HOST_SELECTOR =
  'ytd-thumbnail-overlay-toggle-button-renderer:has(button[aria-label*="Watch later"])';

const CSS = `
/*
 * Make the Watch Later overlay toggle always visible.
 * YouTube gates it behind:
 *   - opacity: 0 on the button
 *   - visibility: hidden / display: none on the renderer host
 * Override all three to ensure it's always reachable.
 *
 * We scope to ytd-rich-item-renderer (homepage), ytd-compact-video-renderer
 * (sidebar / up-next), and ytd-video-renderer (search results) so we don't
 * accidentally surface it in contexts where it would look wrong (e.g. the
 * miniplayer).
 */
ytd-rich-item-renderer ${WL_HOST_SELECTOR},
ytd-compact-video-renderer ${WL_HOST_SELECTOR},
ytd-video-renderer ${WL_HOST_SELECTOR},
ytd-reel-item-renderer ${WL_HOST_SELECTOR} {
  /* Some YouTube builds set display:none on the host */
  display: flex !important;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}

ytd-rich-item-renderer ${WL_BUTTON_SELECTOR},
ytd-compact-video-renderer ${WL_BUTTON_SELECTOR},
ytd-video-renderer ${WL_BUTTON_SELECTOR},
ytd-reel-item-renderer ${WL_BUTTON_SELECTOR} {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}
`;

const feature: Feature = {
  id: 'thumbnail-save-button',

  setup() {
    // --- Inject style ---
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // --- Toast on click ---
    // Delegated capture-phase listener: catches the click before YouTube's
    // own handlers so we don't need to read post-click state.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Walk up a few levels — the click may land on the SVG icon inside the button.
      const btn = target.closest<HTMLButtonElement>(WL_BUTTON_SELECTOR);
      if (!btn) return;
      // The aria-label toggles between "Watch later" and "Added to Watch later"
      // depending on the current saved state. Read the label BEFORE YouTube
      // toggles it (capture phase fires before the element's own listener).
      const label = btn.getAttribute('aria-label') ?? '';
      const alreadySaved = label.toLowerCase().includes('added');
      flashToast(alreadySaved ? 'Removed from Watch Later' : 'Saved to Watch Later');
    };

    document.addEventListener('click', onClick, true /* capture */);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
