import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { flashToast } from '../lib/yt/toast';
import {
  startTracking,
  stopTracking,
  getToday,
} from '../lib/yt/watch-tracker';

/**
 * watch-goals.ts
 *
 * Let the user set a daily watch-time limit. When today's total exceeds it,
 * show:
 *   1. A flashToast notification (once per session)
 *   2. A soft, dismissible banner (shadow-DOM, non-blocking, never pauses
 *      playback or prevents navigation)
 *
 * Config: { dailyLimitMinutes: number }, default 120.
 * Stored under 'sync:config:watch-goals' via wxt storage (same key convention
 * as getConfig/setConfig). Watched reactively with storage.watch.
 *
 * NOTE FOR COORDINATOR — required edits to settings.ts:
 *   1. Add to FeatureFlags:
 *        'watch-goals'?: boolean;
 *   2. Add to FEATURE_DEFAULTS:
 *        'watch-goals': false,
 *   3. Add to FeatureConfig interface:
 *        'watch-goals': { dailyLimitMinutes: number };
 *   4. Add to FEATURE_CONFIG_DEFAULTS:
 *        'watch-goals': { dailyLimitMinutes: 120 },
 *   The feature reads storage directly (with its own fallback) so it is safe
 *   to ship before step 3-4 are applied.
 *
 * NOTE FOR COORDINATOR — catalog config field:
 *   Recommend a select field with preset minute values (30/60/90/120/180/240)
 *   rather than a free-entry number input, because header-menu.ts's
 *   isNumericField helper expects select-with-numeric-option-values. If the
 *   catalog/menu is later extended to support <input type="number">, switch to
 *   a "number" field type.
 */

// ---------------------------------------------------------------------------
// Config type & key (mirrors the settings.ts convention, no module augmentation
// needed — we read/write storage directly to avoid triggering TS errors in
// FEATURE_CONFIG_DEFAULTS until the coordinator lands the settings.ts update)
// ---------------------------------------------------------------------------

interface WatchGoalsConfig {
  dailyLimitMinutes: number;
}

const CONFIG_KEY = 'sync:config:watch-goals' as const;
const DEFAULT_CONFIG: WatchGoalsConfig = { dailyLimitMinutes: 120 };

async function loadConfig(): Promise<WatchGoalsConfig> {
  const stored = await storage.getItem<WatchGoalsConfig>(CONFIG_KEY);
  return { ...DEFAULT_CONFIG, ...(stored ?? {}) };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANNER_ID = 'yt-pro-watch-goals-banner';

/** How often (ms) to poll watch time while the feature is active. */
const CHECK_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// CSS for the banner (shadow-DOM)
// ---------------------------------------------------------------------------

const BANNER_CSS = `
  :host { all: initial; }

  .banner {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    background: #1a1a1a;
    color: #fff;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    border: 1px solid #333;
    font-family: 'YouTube Sans', Roboto, sans-serif;
    font-size: 14px;
    max-width: 480px;
    width: max-content;
    animation: slide-up 0.25s ease;
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(12px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .text {
    flex: 1;
    line-height: 1.4;
  }

  .text strong { color: #ff9900; }

  .dismiss {
    background: none;
    border: 1px solid #444;
    color: #aaa;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dismiss:hover { background: #272727; color: #fff; border-color: #666; }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'watch-goals',

  async setup(ctx) {
    startTracking(ctx);

    // Config state — loaded once, watched reactively
    let config = await loadConfig();
    let limitMinutes = config.dailyLimitMinutes;

    // Session state
    let bannerHost: HTMLElement | null = null;
    let toastFired = false;   // show toast only once per extension lifetime
    let bannerDismissed = false;
    let checkTimer: ReturnType<typeof setInterval> | null = null;

    // ---- Banner ----
    const removeBanner = () => {
      bannerHost?.remove();
      bannerHost = null;
      document.getElementById(BANNER_ID)?.remove();
    };

    const showBanner = (watchedMinutes: number) => {
      if (bannerDismissed) return;
      if (document.getElementById(BANNER_ID)) return; // already visible

      bannerHost = document.createElement('div');
      bannerHost.id = BANNER_ID;
      const shadow = bannerHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = BANNER_CSS;
      shadow.appendChild(style);

      const banner = document.createElement('div');
      banner.className = 'banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = `
        <span class="icon">⏰</span>
        <span class="text">
          You've watched <strong>${fmtTime(watchedMinutes)}</strong> today —
          your daily limit of <strong>${fmtTime(limitMinutes)}</strong> has been reached.
        </span>
        <button class="dismiss" data-act="dismiss">Dismiss</button>
      `;
      shadow.appendChild(banner);
      document.body.appendChild(bannerHost);

      banner.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
        bannerDismissed = true;
        removeBanner();
      });
    };

    // ---- Limit check ----
    const checkLimit = async () => {
      if (limitMinutes <= 0) return; // 0 = disabled

      const today = await getToday();
      const watchedMinutes = Math.floor(today.totalSeconds / 60);
      if (watchedMinutes < limitMinutes) return;

      // Toast — once per session
      if (!toastFired) {
        toastFired = true;
        flashToast(`⏰ Daily limit reached: ${fmtTime(watchedMinutes)} watched today`);
      }

      // Banner — until dismissed
      showBanner(watchedMinutes);
    };

    // ---- Reactive config watch ----
    const offConfigWatch = storage.watch<WatchGoalsConfig>(CONFIG_KEY, (val) => {
      config = { ...DEFAULT_CONFIG, ...(val ?? {}) };
      limitMinutes = config.dailyLimitMinutes;
      // If limit changed, remove stale banner so it re-evaluates
      if (!bannerDismissed) removeBanner();
      void checkLimit();
    });

    // ---- Periodic check ----
    const startCheck = () => {
      if (checkTimer) return;
      checkTimer = setInterval(() => void checkLimit(), CHECK_INTERVAL_MS);
    };
    const stopCheck = () => {
      if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
      }
    };

    startCheck();

    // Initial check
    await checkLimit();

    // Re-check on SPA navigation (new video may push over limit)
    const offNav = ctx.navigation.onNavigate(() => {
      void checkLimit();
    });

    return async () => {
      stopCheck();
      offConfigWatch();
      offNav();
      removeBanner();
      await stopTracking();
    };
  },
};

export default feature;
