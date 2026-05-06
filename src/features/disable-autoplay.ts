import type { Feature } from '../lib/features';

/**
 * YouTube's "Autoplay" toggle in the player chrome. We click it off
 * whenever it's on. The user can still re-enable per-session by
 * clicking the toggle themselves — we don't fight the user, only the
 * default.
 *
 * Selector: `.ytp-autonav-toggle-button`. Its `aria-checked` attribute
 * reflects state ("true" = on).
 */

const SELECTOR = '.ytp-autonav-toggle-button';

const feature: Feature = {
  id: 'disable-autoplay',
  setup(ctx) {
    const tryDisable = () => {
      const btn = document.querySelector<HTMLElement>(SELECTOR);
      if (!btn) return;
      if (btn.getAttribute('aria-checked') === 'true') btn.click();
    };

    const offNav = ctx.navigation.onNavigate(() => {
      // Player chrome may not be ready immediately after route change.
      requestAnimationFrame(tryDisable);
    });
    const offChange = ctx.observer.onChange(tryDisable);

    tryDisable();

    return () => {
      offNav();
      offChange();
    };
  },
};

export default feature;
