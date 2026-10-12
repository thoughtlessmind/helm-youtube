import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';

/**
 * flag-watched
 *
 * Visually flags videos the user has already watched in any feed, search
 * result, or sidebar listing.
 *
 * Detection: YouTube renders a `ytd-thumbnail-overlay-resume-playback-renderer`
 * with a `#progress` child element inside thumbnails for videos that have a
 * saved resume position (i.e. watched). We use a CSS `:has()` selector — no
 * JavaScript scanning needed, no observer required for the visual effect.
 *
 * Modes (FeatureConfig):
 *   - 'dim'  (default) — reduces card to ~45% opacity and adds a "Watched"
 *             label over the thumbnail.
 *   - 'hide' — hides watched cards entirely (display: none).
 *
 * FeatureConfig shape:
 *   { mode: 'dim' | 'hide' }
 *
 * No external API. No host permissions.
 */

// ── Selectors (named constants) ───────────────────────────────────────────────

/**
 * CSS selector that targets any video card containing a resume-playback
 * progress indicator. Works across all four card renderer types.
 */
const WATCHED_CARD_SELECTOR =
  'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress),' +
  'ytd-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress),' +
  'ytd-compact-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress),' +
  'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress)';

// ── Style ids ─────────────────────────────────────────────────────────────────

const DIM_STYLE_ID = 'yt-pro-flag-watched-dim';
const HIDE_STYLE_ID = 'yt-pro-flag-watched-hide';

// ── CSS blocks ────────────────────────────────────────────────────────────────

/**
 * Dim mode: reduces opacity and overlays a subtle "Watched" label on
 * the thumbnail corner. Uses `::after` on the thumbnail wrapper so it
 * doesn't interfere with YouTube's own overlay renderers.
 */
const DIM_CSS = `
/* Dim watched video cards */
${WATCHED_CARD_SELECTOR} {
  opacity: 0.45;
  transition: opacity 150ms ease;
}
${WATCHED_CARD_SELECTOR}:hover {
  opacity: 1;
}

/* "Watched" label — positioned inside the thumbnail area */
ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail::after,
ytd-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail::after,
ytd-compact-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail::after,
ytd-grid-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail::after {
  content: 'Watched';
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-family: system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #fff;
  background: rgba(0, 0, 0, 0.75);
  pointer-events: none;
  z-index: 10;
}

/* Ensure the thumbnail wrapper is positioned so ::after places correctly */
ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail,
ytd-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail,
ytd-compact-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail,
ytd-grid-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer #progress) ytd-thumbnail {
  position: relative;
}
`;

/**
 * Hide mode: completely removes watched cards from layout flow.
 */
const HIDE_CSS = `
${WATCHED_CARD_SELECTOR} {
  display: none !important;
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function removeStyles(): void {
  document.getElementById(DIM_STYLE_ID)?.remove();
  document.getElementById(HIDE_STYLE_ID)?.remove();
}

function applyStyle(mode: 'dim' | 'hide'): void {
  removeStyles();

  const style = document.createElement('style');
  if (mode === 'hide') {
    style.id = HIDE_STYLE_ID;
    style.textContent = HIDE_CSS;
  } else {
    style.id = DIM_STYLE_ID;
    style.textContent = DIM_CSS;
  }
  document.head.appendChild(style);
}

// ── FeatureConfig augmentation ────────────────────────────────────────────────

declare module '../lib/settings' {
  interface FeatureConfig {
    // Optional so TypeScript doesn't require this key in FEATURE_CONFIG_DEFAULTS
    // (which is owner-controlled). The feature defaults to 'dim' internally.
    'flag-watched'?: {
      /** Visual treatment for watched videos. Default: 'dim'. */
      mode: 'dim' | 'hide';
    };
  }
}

// ── Feature ───────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'flag-watched',

  async setup(ctx) {
    // Load config; fall back to 'dim' if not yet set (settings.ts doesn't
    // include this key in FEATURE_CONFIG_DEFAULTS, so we default here).
    const initial = await getConfig('flag-watched');
    const mode: 'dim' | 'hide' = initial?.mode ?? 'dim';
    applyStyle(mode);

    // Track current mode in a closure so the observer re-inject is always correct.
    let currentMode: 'dim' | 'hide' = mode;

    // React to config changes (user switches dim↔hide in the popup).
    const offWatch = watchConfig('flag-watched', (cfg) => {
      currentMode = cfg?.mode ?? 'dim';
      applyStyle(currentMode);
    });

    // CSS handles all DOM detection automatically via :has() — no JS scanning
    // needed. We subscribe to onChange purely so that if YouTube re-renders
    // <head> and strips our <style>, we can re-inject it.
    const offObs = ctx.observer.onChange(() => {
      const hasStyle =
        document.getElementById(DIM_STYLE_ID) || document.getElementById(HIDE_STYLE_ID);
      if (!hasStyle) {
        // Re-apply the current mode (use closure var — not getConfig — to avoid
        // async race and the "getId returns null" false-fallback).
        applyStyle(currentMode);
      }
    });

    return () => {
      removeStyles();
      offWatch();
      offObs();
    };
  },
};

export default feature;
