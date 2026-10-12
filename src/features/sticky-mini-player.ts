import type { Feature } from '../lib/features';
import { storage } from '#imports';

/** Config stored under sync:config:sticky-mini-player */
interface StickyMiniPlayerConfig {
  corner: 'bottom-right' | 'bottom-left';
}

const CONFIG_KEY = 'sync:config:sticky-mini-player' as const;
const CONFIG_DEFAULT: StickyMiniPlayerConfig = { corner: 'bottom-right' };

const STYLE_ID = 'yt-pro-sticky-mini-player-style';
const CLOSE_BTN_ID = 'yt-pro-sticky-mini-player-close';
const RESTORE_BTN_ID = 'yt-pro-sticky-mini-player-restore';
const ATTR_DOCKED = 'data-yt-pro-mini-docked';
const ATTR_HIDDEN = 'data-yt-pro-mini-hidden';

/**
 * Selector for the primary player container on a watch page.
 * `#player-container-outer` is the layout wrapper we dock.
 * Falls back to `#player-theater-container` in theater mode.
 */
const PLAYER_CONTAINER_SEL = '#player-container-outer';
const PLAYER_THEATER_SEL = '#player-theater-container';

/**
 * When docked, the player is ripped out of normal flow and pinned in a
 * corner via the `data-yt-pro-mini-docked` attribute. CSS custom
 * properties could be used for dynamic corner changes, but inlining
 * left/right as style is simpler and avoids a full re-inject.
 *
 * User affordances injected inside the mini-player:
 *   ✕ — hide the mini-player (video keeps playing; scroll up to get it back)
 *   ↑ — restore full player (scrolls to top, undocks)
 */
const CSS = `
/* ── docked mini-player ─────────────────────────────────────── */
[${ATTR_DOCKED}] {
  position: fixed !important;
  bottom: 20px !important;
  width: 320px !important;
  height: 180px !important;
  z-index: 2147483600 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.55) !important;
  transition: box-shadow 150ms ease;
}

/* keep video filling the mini box */
[${ATTR_DOCKED}] video,
[${ATTR_DOCKED}] #movie_player,
[${ATTR_DOCKED}] ytd-player {
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
}

/* suppress player chrome when mini; reveal on hover */
[${ATTR_DOCKED}] .ytp-chrome-top,
[${ATTR_DOCKED}] .ytp-chrome-bottom {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 150ms;
}
[${ATTR_DOCKED}]:hover .ytp-chrome-bottom {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* hide the placeholder space while the player is docked */
[${ATTR_HIDDEN}] {
  display: none !important;
}

/* ── control buttons ─────────────────────────────────────────── */
#${CLOSE_BTN_ID},
#${RESTORE_BTN_ID} {
  position: absolute;
  top: 6px;
  z-index: 2147483601;
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(15,15,15,0.75);
  color: #f1f1f1;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  font-family: system-ui, sans-serif;
}
#${CLOSE_BTN_ID} { right: 6px; }
#${RESTORE_BTN_ID} { right: 36px; }
#${CLOSE_BTN_ID}:hover,
#${RESTORE_BTN_ID}:hover {
  background: rgba(255,255,255,0.2);
}
`;

const feature: Feature = {
  id: 'sticky-mini-player',

  async setup(ctx) {
    // ── Load config ────────────────────────────────────────────────────
    const stored = await storage.getItem<StickyMiniPlayerConfig>(CONFIG_KEY);
    let cfg: StickyMiniPlayerConfig = { ...CONFIG_DEFAULT, ...(stored ?? {}) };

    const stopConfigWatch = storage.watch<StickyMiniPlayerConfig>(CONFIG_KEY, (v) => {
      cfg = { ...CONFIG_DEFAULT, ...(v ?? {}) };
      applyCorner();
    });

    // ── Inject stylesheet ──────────────────────────────────────────────
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ── State ──────────────────────────────────────────────────────────
    let docked = false;
    /**
     * True after the user clicks ✕ to hide the mini. The mini stays
     * hidden until the user scrolls back past the natural player position.
     */
    let hidden = false;
    let scrollListener: (() => void) | null = null;

    // ── Helpers ────────────────────────────────────────────────────────
    const getContainer = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(PLAYER_CONTAINER_SEL) ??
      document.querySelector<HTMLElement>(PLAYER_THEATER_SEL);

    /**
     * Apply the bottom-left / bottom-right inline style on the currently
     * docked element. Called both when docking and when config changes.
     */
    const applyCorner = () => {
      const el = getContainer();
      if (!el || !docked) return;
      if (cfg.corner === 'bottom-left') {
        el.style.left = '20px';
        el.style.right = '';
      } else {
        el.style.right = '20px';
        el.style.left = '';
      }
    };

    /**
     * Natural top-offset of the player relative to the page. Only valid
     * while the player is NOT docked (docked = position:fixed, offset
     * loses meaning).
     */
    const playerNaturalTop = (): number => {
      const el = getContainer();
      if (!el || docked) return 400; // safe fallback
      return el.getBoundingClientRect().top + window.scrollY;
    };

    const removeButtons = () => {
      document.getElementById(CLOSE_BTN_ID)?.remove();
      document.getElementById(RESTORE_BTN_ID)?.remove();
    };

    const injectButtons = (el: HTMLElement) => {
      removeButtons();

      const closeBtn = document.createElement('button');
      closeBtn.id = CLOSE_BTN_ID;
      closeBtn.title = 'Hide mini-player';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideMini();
      });

      const restoreBtn = document.createElement('button');
      restoreBtn.id = RESTORE_BTN_ID;
      restoreBtn.title = 'Restore player';
      restoreBtn.textContent = '↑';
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restorePlayer();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      el.appendChild(closeBtn);
      el.appendChild(restoreBtn);
    };

    const dockPlayer = () => {
      if (docked) return;
      const el = getContainer();
      if (!el) return;
      docked = true;
      hidden = false;
      el.setAttribute(ATTR_DOCKED, '');
      el.removeAttribute(ATTR_HIDDEN);
      applyCorner();
      injectButtons(el);
    };

    const restorePlayer = () => {
      if (!docked && !hidden) return;
      const el = getContainer();
      docked = false;
      hidden = false;
      if (el) {
        el.removeAttribute(ATTR_DOCKED);
        el.removeAttribute(ATTR_HIDDEN);
        el.style.left = '';
        el.style.right = '';
      }
      removeButtons();
    };

    const hideMini = () => {
      if (!docked) return;
      hidden = true;
      const el = getContainer();
      if (el) {
        el.setAttribute(ATTR_HIDDEN, '');
        el.removeAttribute(ATTR_DOCKED);
        el.style.left = '';
        el.style.right = '';
      }
      removeButtons();
      docked = false;
    };

    const onScroll = () => {
      if (!location.pathname.startsWith('/watch')) return;

      const threshold = playerNaturalTop() + 80; // 80 px buffer past player top
      const scrolledPast = window.scrollY > threshold;

      if (scrolledPast && !docked && !hidden) {
        dockPlayer();
      } else if (!scrolledPast && docked) {
        restorePlayer();
      } else if (!scrolledPast && hidden) {
        // Scrolled back to the player — un-hide so natural layout returns.
        hidden = false;
        const el = getContainer();
        if (el) el.removeAttribute(ATTR_HIDDEN);
      }
    };

    const attachScroll = () => {
      if (scrollListener) return;
      scrollListener = onScroll;
      window.addEventListener('scroll', scrollListener, { passive: true });
    };

    const detachScroll = () => {
      if (!scrollListener) return;
      window.removeEventListener('scroll', scrollListener);
      scrollListener = null;
    };

    // ── Wire up ────────────────────────────────────────────────────────
    const sync = () => {
      if (location.pathname.startsWith('/watch')) {
        attachScroll();
      } else {
        detachScroll();
        restorePlayer();
      }
    };

    sync();

    const offNav = ctx.navigation.onNavigate(() => {
      restorePlayer();
      sync();
    });

    // ── Teardown ───────────────────────────────────────────────────────
    return () => {
      offNav();
      stopConfigWatch();
      detachScroll();
      restorePlayer();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
