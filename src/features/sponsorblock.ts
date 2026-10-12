import type { Feature } from '../lib/features';
import { getVideoId, isWatchPage } from '../lib/yt/video';

/**
 * sponsorblock
 *
 * Fetches crowd-sourced sponsor segments from the public SponsorBlock API
 * and displays the "real" (sponsor-free) watch time near the video metadata.
 *
 * Does NOT auto-skip — display only.
 *
 * Host permission required: https://sponsor.ajay.app/*
 */

const API_BASE = 'https://sponsor.ajay.app/api/skipSegments';
const CATEGORIES = ['sponsor', 'selfpromo', 'interaction'] as const;

/** Element id injected into the watch-page metadata area. */
const BADGE_ID = 'yt-pro-sponsorfree';

/** Selectors tried in order for the metadata container to anchor the badge. */
const META_ANCHOR_SELECTORS = [
  'ytd-watch-metadata #info',
  'ytd-watch-metadata #above-the-fold',
  '#above-the-fold',
  'ytd-watch-metadata',
];

interface SponsorSegment {
  category: string;
  segment: [number, number];
  UUID: string;
}

function fmtSeconds(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Tries each selector in order and returns the first element found,
 * or null if none exist yet.
 */
function findAnchor(): HTMLElement | null {
  for (const sel of META_ANCHOR_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Inserts (or updates) the sponsor-free badge in the anchor element.
 *
 * @param sponsorFreeSecs  Real watch time in seconds.
 * @param savedSecs        Total seconds removed.
 * @param videoDuration    Full video duration in seconds (from the player).
 */
function upsertBadge(sponsorFreeSecs: number, savedSecs: number): void {
  const anchor = findAnchor();
  if (!anchor) return;

  let badge = document.getElementById(BADGE_ID) as HTMLElement | null;
  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    Object.assign(badge.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      fontFamily: 'system-ui, sans-serif',
      color: 'var(--yt-spec-text-secondary, #606060)',
      marginTop: '4px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: 'var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05))',
      userSelect: 'none',
    } as CSSStyleDeclaration);
    // Insert as the first child so it stays near the top of metadata.
    anchor.prepend(badge);
  }

  const savedLabel = savedSecs > 0 ? ` (−${fmtSeconds(savedSecs)} sponsored)` : '';
  badge.textContent = `⏱ Sponsor-free: ${fmtSeconds(sponsorFreeSecs)}${savedLabel}`;
}

function removeBadge(): void {
  document.getElementById(BADGE_ID)?.remove();
}

const feature: Feature = {
  id: 'sponsorblock',

  setup(ctx) {
    let abortController: AbortController | null = null;

    /**
     * Fetches sponsor data for `videoId` and injects the badge. If the
     * anchor DOM hasn't rendered yet, registers an observer retry.
     */
    const fetchAndDisplay = async (videoId: string): Promise<void> => {
      // Abort any in-flight request for the previous page.
      abortController?.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      // Remove any stale badge immediately.
      removeBadge();

      // Build URL with categories array.
      const categoriesParam = encodeURIComponent(JSON.stringify(CATEGORIES));
      const url = `${API_BASE}?videoID=${encodeURIComponent(videoId)}&categories=${categoriesParam}`;

      let segments: SponsorSegment[];
      try {
        const res = await fetch(url, { signal });
        if (res.status === 404) return; // No sponsor data for this video — silent.
        if (!res.ok) return;            // Other errors — silent.
        segments = (await res.json()) as SponsorSegment[];
      } catch {
        // Network error or abort — silent.
        return;
      }

      // Guard: user may have navigated away while we were fetching.
      if (signal.aborted || getVideoId() !== videoId) return;

      // Sum all sponsored seconds (segments may overlap; we do simple sum per spec).
      const savedSecs = segments.reduce((acc, seg) => {
        const [start, end] = seg.segment;
        return acc + Math.max(0, end - start);
      }, 0);

      if (savedSecs <= 0) return; // Nothing meaningful to show.

      // Try to read the real video duration from the player element.
      const videoEl = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      const duration = videoEl?.duration ?? 0;
      const sponsorFreeSecs = Math.max(0, duration - savedSecs);

      const paint = (): boolean => {
        if (signal.aborted || getVideoId() !== videoId) return true; // abort retries
        const anchor = findAnchor();
        if (!anchor) return false; // not ready yet
        upsertBadge(sponsorFreeSecs, savedSecs);
        return true;
      };

      if (!paint()) {
        // Anchor not rendered yet — retry on observer ticks.
        const offObs = ctx.observer.onChange(() => {
          if (paint()) offObs(); // painted successfully — unsubscribe.
        });
        // Clean up the observer if/when teardown happens or we navigate.
        abortController.signal.addEventListener('abort', offObs);
      }
    };

    // Fetch on initial load if already on a watch page.
    if (isWatchPage()) {
      const vid = getVideoId();
      if (vid) void fetchAndDisplay(vid);
    }

    // Re-fetch on every SPA navigation.
    const offNav = ctx.navigation.onNavigate(() => {
      if (!isWatchPage()) {
        removeBadge();
        return;
      }
      const vid = getVideoId();
      if (vid) void fetchAndDisplay(vid);
    });

    // Re-inject badge if YouTube re-renders the metadata subtree.
    // Guard against re-triggering while a fetch is already in flight.
    const offObs = ctx.observer.onChange(() => {
      if (!isWatchPage()) return;
      if (document.getElementById(BADGE_ID)) return; // badge still present — nothing to do
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
