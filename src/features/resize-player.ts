import type { Feature } from '../lib/features';
import { storage } from '#imports';

/** Config stored under sync:config:resize-player */
interface ResizePlayerConfig {
  width: 'default' | 'narrow' | 'wide' | 'full';
}

const CONFIG_KEY = 'sync:config:resize-player' as const;
const CONFIG_DEFAULT: ResizePlayerConfig = { width: 'default' };

const STYLE_ID = 'yt-pro-resize-player-style';

/**
 * Width presets as CSS applied to the watch-page layout.
 *
 * YouTube's watch layout uses `ytd-watch-flexy` as the outer shell,
 * `#primary` for the player + metadata column, and `#secondary` for
 * the recommendations sidebar. We resize `#primary` and its player
 * containers, keeping `ytd-watch-flexy` centred naturally.
 *
 * `full` stretches to the full viewport width and hides the sidebar —
 * similar to Theater mode but without toggling YouTube's theater flag.
 *
 * `default` is a clean no-op: the style element is not injected at all.
 */
const WIDTH_PRESETS: Record<string, string> = {
  narrow: `
ytd-watch-flexy:not([theater]):not([fullscreen]) #primary.ytd-watch-flexy {
  max-width: 720px !important;
}
ytd-watch-flexy:not([theater]):not([fullscreen]) #player-container-outer {
  max-width: 720px !important;
  width: 720px !important;
}
`,
  wide: `
ytd-watch-flexy:not([theater]):not([fullscreen]) {
  max-width: 1600px !important;
}
ytd-watch-flexy:not([theater]):not([fullscreen]) #primary.ytd-watch-flexy {
  max-width: 1100px !important;
  flex: 1 1 1100px !important;
}
ytd-watch-flexy:not([theater]):not([fullscreen]) #player-container-outer,
ytd-watch-flexy:not([theater]):not([fullscreen]) #player-theater-container {
  max-width: 100% !important;
  width: 100% !important;
}
`,
  full: `
ytd-watch-flexy:not([fullscreen]) {
  max-width: 100vw !important;
}
ytd-watch-flexy:not([fullscreen]) #primary.ytd-watch-flexy {
  max-width: 100% !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
}
ytd-watch-flexy:not([fullscreen]) #secondary.ytd-watch-flexy {
  display: none !important;
}
ytd-watch-flexy:not([fullscreen]) #player-container-outer,
ytd-watch-flexy:not([fullscreen]) #player-theater-container {
  max-width: 100% !important;
  width: 100% !important;
}
ytd-watch-flexy:not([fullscreen]) #columns {
  max-width: 100% !important;
  padding: 0 !important;
}
`,
};

const feature: Feature = {
  id: 'resize-player',

  async setup(ctx) {
    // ── Load config ────────────────────────────────────────────────────
    const stored = await storage.getItem<ResizePlayerConfig>(CONFIG_KEY);
    let cfg: ResizePlayerConfig = { ...CONFIG_DEFAULT, ...(stored ?? {}) };

    // ── Apply / remove stylesheet ──────────────────────────────────────
    const applyWidth = (w: ResizePlayerConfig['width']) => {
      document.getElementById(STYLE_ID)?.remove();
      if (w === 'default') return; // clean no-op
      const css = WIDTH_PRESETS[w];
      if (!css) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    };

    applyWidth(cfg.width);

    // React to config changes (user switches preset in popup).
    const stopConfigWatch = storage.watch<ResizePlayerConfig>(CONFIG_KEY, (v) => {
      cfg = { ...CONFIG_DEFAULT, ...(v ?? {}) };
      applyWidth(cfg.width);
    });

    // Re-apply on SPA navigation (YouTube rebuilds the layout element).
    const offNav = ctx.navigation.onNavigate(() => {
      applyWidth(cfg.width);
    });

    // ── Teardown ───────────────────────────────────────────────────────
    return () => {
      offNav();
      stopConfigWatch();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
