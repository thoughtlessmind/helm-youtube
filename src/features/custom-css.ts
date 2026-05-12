import type { Feature } from '../lib/features';
import { getConfig, watchConfig, type FeatureConfig } from '../lib/settings';

const STYLE_ID = 'ytp-pro-custom-css';

/**
 * Injects user-defined CSS into the page. Power users can theme YouTube
 * freely. Updates reactively when the config changes.
 */
const feature: Feature = {
  id: 'custom-css',
  async setup() {
    const ensureStyle = (): HTMLStyleElement => {
      let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      return el;
    };

    const apply = (cfg: FeatureConfig['custom-css']) => {
      ensureStyle().textContent = cfg.css ?? '';
    };

    apply(await getConfig('custom-css'));

    const offConfig = watchConfig('custom-css', (cfg) => apply(cfg));

    return () => {
      offConfig();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
