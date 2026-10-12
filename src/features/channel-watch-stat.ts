import type { Feature } from '../lib/features';
import {
  startTracking,
  stopTracking,
  getChannelTotal,
} from '../lib/yt/watch-tracker';
import { channelIdFromHref } from '../lib/yt/video';

/**
 * channel-watch-stat.ts
 *
 * On a YouTube channel page, injects a small badge into the channel header
 * showing "You've watched Xh Ym of this channel".
 *
 * Re-injects on navigation and when the DOM is mutated (YouTube re-renders
 * the header on SPA transitions).
 *
 * Teardown removes the injected element.
 */

// ---------------------------------------------------------------------------
// Constants / selectors
// ---------------------------------------------------------------------------

/** Id of the injected badge wrapper so we can find and remove it. */
const BADGE_ID = 'yt-pro-channel-watch-stat';

/**
 * Candidate selectors for the channel header element we inject after.
 * Listed most-specific first; first match wins.
 */
const HEADER_SELECTORS = [
  'ytd-c4-tabbed-header-renderer #channel-header-container',
  'ytd-c4-tabbed-header-renderer #inner-header-container',
  'ytd-page-header-renderer .page-header-view-model-wiz__page-header-headline-info',
  'ytd-page-header-renderer .page-header-view-model-wiz__page-header-headline',
  '#channel-header #inner-header-container',
  '#channel-header',
  'ytd-channel-name.ytd-c4-tabbed-header-renderer',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the current page looks like a channel page. */
function isChannelPage(): boolean {
  // Channel pages: /channel/UC…, /@handle, /c/Name, /user/Name
  const { pathname } = location;
  return (
    pathname.startsWith('/channel/') ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/user/')
  );
}

/** Extract channel id from the current URL. */
function getChannelIdFromUrl(): string | null {
  return channelIdFromHref(location.pathname);
}

/** Format seconds as "Xh Ym" or "Ym" or "< 1 min". */
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '< 1 min';
}

/** CSS for the badge. Scoped via shadow DOM. */
const BADGE_CSS = `
  :host { all: initial; display: block; }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 4px 10px;
    border-radius: 12px;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.75);
    font-family: 'YouTube Sans', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid rgba(255,255,255,0.12);
  }

  .icon {
    opacity: 0.6;
    flex-shrink: 0;
  }
`;

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'channel-watch-stat',

  async setup(ctx) {
    startTracking(ctx);

    let badgeHost: HTMLElement | null = null;

    /** Remove any previously injected badge. */
    const removeBadge = () => {
      badgeHost?.remove();
      badgeHost = null;
      document.getElementById(BADGE_ID)?.remove();
    };

    /** Inject (or update) the badge in the channel header. */
    const injectBadge = async () => {
      if (!isChannelPage()) return;

      const channelId = getChannelIdFromUrl();
      if (!channelId) return;

      // Find header anchor
      let anchor: HTMLElement | null = null;
      for (const sel of HEADER_SELECTORS) {
        anchor = document.querySelector<HTMLElement>(sel);
        if (anchor) break;
      }
      if (!anchor) return;

      // Avoid duplicate injection
      if (document.getElementById(BADGE_ID)) return;

      const seconds = await getChannelTotal(channelId);
      if (seconds < 60) {
        // Don't clutter the page for < 1 minute — still mark as seen so
        // re-checks below are skipped until navigation.
      }

      // Build shadow-DOM badge
      badgeHost = document.createElement('div');
      badgeHost.id = BADGE_ID;

      const shadow = badgeHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = BADGE_CSS;
      shadow.appendChild(style);

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.innerHTML = `
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.4a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clip-rule="evenodd"/>
        </svg>
        ${seconds >= 60 ? `You've watched <strong>&nbsp;${fmtTime(seconds)}&nbsp;</strong> of this channel` : `First visit to this channel`}
      `;
      shadow.appendChild(badge);

      // Inject after the anchor element (as a sibling, or inside it)
      anchor.appendChild(badgeHost);
    };

    // Initial inject
    await injectBadge();

    // Re-inject on DOM changes (header re-renders)
    const offChange = ctx.observer.onChange(async () => {
      if (!document.getElementById(BADGE_ID)) {
        await injectBadge();
      }
    });

    // Re-inject on SPA navigation
    const offNav = ctx.navigation.onNavigate(async () => {
      removeBadge();
      // Small delay to let YouTube render the new page's header
      setTimeout(() => void injectBadge(), 500);
    });

    return async () => {
      offChange();
      offNav();
      removeBadge();
      await stopTracking();
    };
  },
};

export default feature;
