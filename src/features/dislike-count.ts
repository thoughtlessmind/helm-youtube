import type { Feature } from '../lib/features';
import { getVideoId, isWatchPage } from '../lib/yt/video';

/**
 * dislike-count
 *
 * Fetches the dislike count from the Return YouTube Dislike API and injects a
 * small badge next to the like/dislike buttons on the watch page.
 *
 * YouTube hides the dislike number natively; this restores it.
 *
 * Host permission required: https://returnyoutubedislikeapi.com/*
 */

const API_BASE = 'https://returnyoutubedislikeapi.com/votes';

/** Id of the injected dislike badge element. */
const BADGE_ID = 'yt-pro-dislikes';

/**
 * Selector candidates for the dislike button container, tried in order.
 * YouTube has two generations of the like/dislike UI.
 *
 * New (2023+) Polymer redesign:
 *   segmented-like-dislike-button-view-model > dislike-button-view-model
 *
 * Legacy fallback:
 *   ytd-segmented-like-dislike-button-renderer #dislike-button
 */
const DISLIKE_BUTTON_SELECTORS = [
  'dislike-button-view-model',
  'ytd-segmented-like-dislike-button-renderer #dislike-button',
  'ytd-toggle-button-renderer.ytd-segmented-like-dislike-button-renderer:last-of-type',
] as const;

interface RYDResponse {
  id: string;
  dateCreated: string;
  likes: number;
  dislikes: number;
  rating: number;
  viewCount: number;
  deleted: boolean;
}

/** Format a large number with K/M abbreviations. */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Find the best available dislike button anchor element. */
function findDislikeBtn(): HTMLElement | null {
  for (const sel of DISLIKE_BUTTON_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/** Insert or update the dislike badge after the dislike button. */
function upsertBadge(count: number): void {
  const btn = findDislikeBtn();
  if (!btn) return;

  let badge = document.getElementById(BADGE_ID) as HTMLElement | null;
  if (!badge) {
    badge = document.createElement('span');
    badge.id = BADGE_ID;
    Object.assign(badge.style, {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: 'system-ui, sans-serif',
      color: 'var(--yt-spec-text-primary, #0f0f0f)',
      marginLeft: '6px',
      userSelect: 'none',
      verticalAlign: 'middle',
      lineHeight: '1',
    } as CSSStyleDeclaration);
    // Insert directly after the dislike button.
    btn.insertAdjacentElement('afterend', badge);
  }

  badge.textContent = fmtCount(count);
  badge.title = `${count.toLocaleString()} dislikes (via Return YouTube Dislike)`;
}

function removeBadge(): void {
  document.getElementById(BADGE_ID)?.remove();
}

const feature: Feature = {
  id: 'dislike-count',

  setup(ctx) {
    let abortController: AbortController | null = null;

    /**
     * Fetch RYD data for the given videoId and inject the badge.
     * Retries insertion via observer if the dislike button hasn't rendered.
     */
    const fetchAndDisplay = async (videoId: string): Promise<void> => {
      abortController?.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      removeBadge();

      let data: RYDResponse;
      try {
        const res = await fetch(`${API_BASE}?videoId=${encodeURIComponent(videoId)}`, { signal });
        if (!res.ok) return; // Non-2xx — silent.
        data = (await res.json()) as RYDResponse;
      } catch {
        return; // Network error or abort — silent.
      }

      // Guard: stale response from a previous navigation.
      if (signal.aborted || getVideoId() !== videoId) return;

      const count = data.dislikes ?? 0;

      const paint = (): boolean => {
        if (signal.aborted || getVideoId() !== videoId) return true; // stop retrying
        const btn = findDislikeBtn();
        if (!btn) return false; // not rendered yet
        upsertBadge(count);
        return true;
      };

      if (!paint()) {
        // Dislike button not rendered yet — retry on observer ticks.
        const offObs = ctx.observer.onChange(() => {
          if (paint()) offObs();
        });
        signal.addEventListener('abort', offObs);
      }
    };

    // Initial load.
    if (isWatchPage()) {
      const vid = getVideoId();
      if (vid) void fetchAndDisplay(vid);
    }

    // Re-fetch on SPA navigation.
    const offNav = ctx.navigation.onNavigate(() => {
      if (!isWatchPage()) {
        removeBadge();
        return;
      }
      const vid = getVideoId();
      if (vid) void fetchAndDisplay(vid);
    });

    // Re-inject if YouTube re-renders the like-bar.
    // Guard against re-triggering while a fetch is already in flight.
    const offObs = ctx.observer.onChange(() => {
      if (!isWatchPage()) return;
      if (document.getElementById(BADGE_ID)) return; // badge still present
      if (abortController && !abortController.signal.aborted) return; // fetch in flight
      const vid = getVideoId();
      if (vid) void fetchAndDisplay(vid);
    });

    return () => {
      abortController?.abort();
      removeBadge();
      offNav();
      offObs();
    };
  },
};

export default feature;
