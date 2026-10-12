import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { channelIdFromHref, getWatchChannel, isWatchPage } from '../lib/yt/video';
import { flashToast } from '../lib/yt/toast';

/**
 * Favorite Channels — mark channels as favorites so they bubble to the top
 * of YouTube's left-guide subscriptions list. A star toggle is injected on:
 *   • Watch pages: next to the channel owner row below the video.
 *   • Channel pages: in the channel header / metadata row.
 *
 * Favorited channels are persisted in `local:ytpro:favorite-channels` as a
 * map of channelId → channelName so names survive across page navigations.
 *
 * The guide re-ordering runs inside `ctx.observer.onChange` because YouTube
 * frequently re-renders the entire guide/sidebar on navigation and focus.
 */

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'local:ytpro:favorite-channels' as const;

/** Map of stable channel id (UC… or @handle) → display name. */
type FavMap = Record<string, string>;

async function loadFavorites(): Promise<FavMap> {
  return (await storage.getItem<FavMap>(STORAGE_KEY)) ?? {};
}

async function saveFavorites(map: FavMap): Promise<void> {
  await storage.setItem(STORAGE_KEY, map);
}

// ─── Guide reordering ────────────────────────────────────────────────────────

/** Attribute we stamp on moved entries so teardown can restore order. */
const MOVED_ATTR = 'data-yt-pro-fav-moved';
const STAR_MARKER_CLASS = 'yt-pro-fav-star-marker';
const GUIDE_STYLE_ID = 'yt-pro-favorite-channels-guide-style';

/** CSS for the small star marker appended to favorited guide entries. */
const GUIDE_MARKER_CSS = `
.${STAR_MARKER_CLASS} {
  display: inline-block;
  margin-left: 4px;
  font-size: 11px;
  color: var(--yt-spec-brand-icon-active, #ff0000);
  vertical-align: middle;
  pointer-events: none;
  user-select: none;
}
`;

function injectGuideStyle(): () => void {
  if (document.getElementById(GUIDE_STYLE_ID)) return () => {};
  const style = document.createElement('style');
  style.id = GUIDE_STYLE_ID;
  style.textContent = GUIDE_MARKER_CSS;
  document.head.appendChild(style);
  return () => document.getElementById(GUIDE_STYLE_ID)?.remove();
}

/**
 * Find the subscription list inside the left guide. YouTube renders two
 * guide variants; we handle both. Returns the parent container and its
 * subscription `ytd-guide-entry-renderer` children.
 */
function findGuideSubscriptions(): {
  container: HTMLElement;
  entries: HTMLElement[];
} | null {
  // Full expanded guide
  const sectionHeaders = document.querySelectorAll<HTMLElement>(
    'ytd-guide-section-renderer #guide-section-title',
  );

  for (const header of sectionHeaders) {
    const text = header.textContent?.trim().toLowerCase() ?? '';
    if (!text.includes('subscription')) continue;
    const section = header.closest<HTMLElement>('ytd-guide-section-renderer');
    if (!section) continue;
    const items = section.querySelectorAll<HTMLElement>('#items > ytd-guide-entry-renderer');
    if (items.length === 0) continue;
    const container = section.querySelector<HTMLElement>('#items');
    if (!container) continue;
    return { container, entries: Array.from(items) };
  }
  return null;
}

/**
 * Extract the channel id from a guide entry's anchor href.
 */
function guideEntryChannelId(entry: HTMLElement): string | null {
  const a = entry.querySelector<HTMLAnchorElement>('a');
  return channelIdFromHref(a?.getAttribute('href'));
}

/**
 * Re-order the guide: move favorited entries to the top (stable sort),
 * add a star marker, restore non-favorited entries below.
 */
function reorderGuide(favMap: FavMap): void {
  const result = findGuideSubscriptions();
  if (!result) return;
  const { container, entries } = result;

  const favIds = new Set(Object.keys(favMap));
  const favored: HTMLElement[] = [];
  const rest: HTMLElement[] = [];

  for (const entry of entries) {
    const id = guideEntryChannelId(entry);
    if (id && favIds.has(id)) {
      favored.push(entry);
    } else {
      rest.push(entry);
    }
  }

  // Add / remove star markers
  for (const entry of favored) {
    entry.setAttribute(MOVED_ATTR, 'true');
    if (!entry.querySelector(`.${STAR_MARKER_CLASS}`)) {
      const star = document.createElement('span');
      star.className = STAR_MARKER_CLASS;
      star.textContent = '★';
      star.setAttribute('aria-hidden', 'true');
      entry.appendChild(star);
    }
  }
  for (const entry of rest) {
    entry.removeAttribute(MOVED_ATTR);
    entry.querySelector(`.${STAR_MARKER_CLASS}`)?.remove();
  }

  // Re-insert in order: favorited first, then the rest
  const ordered = [...favored, ...rest];
  for (const entry of ordered) {
    container.appendChild(entry);
  }
}

/**
 * Restore original DOM order by putting moved entries back after the others
 * (we can't know original indices, so just remove markers; YouTube will
 * re-render on next navigation anyway).
 */
function restoreGuide(): void {
  document
    .querySelectorAll<HTMLElement>(`[${MOVED_ATTR}]`)
    .forEach((el) => {
      el.removeAttribute(MOVED_ATTR);
      el.querySelector(`.${STAR_MARKER_CLASS}`)?.remove();
    });
}

// ─── Star toggle button ───────────────────────────────────────────────────────

const TOGGLE_BTN_ID = 'yt-pro-fav-toggle';
const TOGGLE_STYLE_ID = 'yt-pro-fav-toggle-style';

const TOGGLE_CSS = `
#${TOGGLE_BTN_ID} {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
  border-radius: 18px;
  background: transparent;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 13px;
  font-family: 'Roboto', sans-serif;
  line-height: 1;
  transition: background 150ms, color 150ms, border-color 150ms;
  vertical-align: middle;
  flex-shrink: 0;
}
#${TOGGLE_BTN_ID}:hover {
  background: var(--yt-spec-badge-chip-background, rgba(255,255,255,0.08));
}
#${TOGGLE_BTN_ID}[data-favorited="true"] {
  color: var(--yt-spec-brand-icon-active, #ff0000);
  border-color: var(--yt-spec-brand-icon-active, #ff0000);
}
#${TOGGLE_BTN_ID} .yt-pro-fav-star {
  font-size: 15px;
  line-height: 1;
}
`;

function injectToggleStyle(): () => void {
  if (document.getElementById(TOGGLE_STYLE_ID)) return () => {};
  const style = document.createElement('style');
  style.id = TOGGLE_STYLE_ID;
  style.textContent = TOGGLE_CSS;
  document.head.appendChild(style);
  return () => document.getElementById(TOGGLE_STYLE_ID)?.remove();
}

/** Selectors for where to anchor the toggle button. */
const WATCH_OWNER_ANCHORS = [
  // "Subscribe" button row on watch page
  'ytd-watch-metadata #subscribe-button',
  'ytd-video-owner-renderer #subscribe-button',
  '#owner #subscribe-button',
];

const CHANNEL_PAGE_ANCHORS = [
  // Channel header action row
  'ytd-channel-tagline-renderer',
  '#channel-header-container #channel-tagline',
  '#channel-container #channel-header-links',
  'yt-flexible-actions-view-model',
  '#channel-header ytd-subscribe-button-renderer',
];

function findAnchor(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Determine the current page's channel ref for toggle injection.
 * Returns null when not on a channel or watch page, or when the DOM
 * has not yet rendered the necessary metadata.
 */
function currentPageChannel(): { id: string; name: string } | null {
  // Watch page
  if (isWatchPage()) {
    return getWatchChannel();
  }

  // Channel page — /channel/UC…, /@handle, /c/Name, /user/Name
  const channelPatterns = [/^\/channel\//, /^\/@/, /^\/c\//, /^\/user\//];
  if (!channelPatterns.some((re) => re.test(location.pathname))) return null;

  const id = channelIdFromHref(location.pathname);
  if (!id) return null;

  // Try to get a human name from the header
  const nameEl = document.querySelector<HTMLElement>(
    '#channel-name .ytd-channel-name, ytd-channel-name yt-formatted-string, ' +
    '#channel-header-container #channel-name',
  );
  const name = nameEl?.textContent?.trim() ?? id;
  return { id, name };
}

/** Build or update the star toggle button. */
function renderToggleButton(
  channel: { id: string; name: string },
  favMap: FavMap,
  onToggle: (channel: { id: string; name: string }) => void,
): HTMLButtonElement {
  let btn = document.getElementById(TOGGLE_BTN_ID) as HTMLButtonElement | null;
  const isFav = channel.id in favMap;

  if (!btn) {
    btn = document.createElement('button');
    btn.id = TOGGLE_BTN_ID;
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(channel);
    });
  }

  btn.setAttribute('data-favorited', String(isFav));
  btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
  btn.innerHTML = `<span class="yt-pro-fav-star" aria-hidden="true">${isFav ? '★' : '☆'}</span>${isFav ? 'Favorited' : 'Favorite'}`;

  return btn;
}

// ─── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'favorite-channels',

  async setup(ctx) {
    let favMap = await loadFavorites();

    // Unsubscribers / cleanups
    const cleanups: Array<() => void> = [];

    // Inject styles
    cleanups.push(injectGuideStyle());
    cleanups.push(injectToggleStyle());

    // Listen for storage changes from other tabs / sessions
    const stopStorageWatch = storage.watch<FavMap>(STORAGE_KEY, (val) => {
      favMap = val ?? {};
      reorderGuide(favMap);
      updateToggleIfVisible();
    });
    cleanups.push(stopStorageWatch);

    /** Toggle the favorited state for a channel, then refresh. */
    async function toggleFavorite(channel: { id: string; name: string }) {
      const next = { ...favMap };
      if (channel.id in next) {
        delete next[channel.id];
        flashToast(`Removed ${channel.name || channel.id} from favorites`);
      } else {
        next[channel.id] = channel.name;
        flashToast(`Added ${channel.name || channel.id} to favorites ★`);
      }
      favMap = next;
      await saveFavorites(next);
      reorderGuide(favMap);
      updateToggleIfVisible();
    }

    /** Inject or update the toggle button into the current page, if applicable. */
    function injectToggle(): void {
      const channel = currentPageChannel();
      if (!channel) {
        // Not on a relevant page — remove any stale button
        document.getElementById(TOGGLE_BTN_ID)?.remove();
        return;
      }

      const btn = renderToggleButton(channel, favMap, toggleFavorite);

      // If already in the DOM (correct page), just refresh its state
      if (document.contains(btn)) return;

      // Find an anchor; try watch page first, then channel page
      const anchor = isWatchPage()
        ? findAnchor(WATCH_OWNER_ANCHORS)
        : findAnchor(CHANNEL_PAGE_ANCHORS);

      if (!anchor) return; // DOM not ready yet; will retry on next onChange

      anchor.insertAdjacentElement('afterend', btn);
    }

    /** Re-render toggle state in place (no DOM re-anchor needed). */
    function updateToggleIfVisible(): void {
      const btn = document.getElementById(TOGGLE_BTN_ID) as HTMLButtonElement | null;
      if (!btn) return;
      const channel = currentPageChannel();
      if (!channel) return;
      const isFav = channel.id in favMap;
      btn.setAttribute('data-favorited', String(isFav));
      btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
      btn.innerHTML = `<span class="yt-pro-fav-star" aria-hidden="true">${isFav ? '★' : '☆'}</span>${isFav ? 'Favorited' : 'Favorite'}`;
    }

    // Re-order guide + re-inject toggle on DOM mutations
    const stopObserver = ctx.observer.onChange(() => {
      reorderGuide(favMap);
      injectToggle();
    });
    cleanups.push(stopObserver);

    // Re-inject toggle on SPA navigation
    const stopNav = ctx.navigation.onNavigate(() => {
      // Remove old button; the new page's DOM will be different
      document.getElementById(TOGGLE_BTN_ID)?.remove();
      // Defer slightly so YouTube can render the new page metadata
      setTimeout(() => {
        injectToggle();
        reorderGuide(favMap);
      }, 600);
    });
    cleanups.push(stopNav);

    // Initial run
    reorderGuide(favMap);
    injectToggle();

    return () => {
      cleanups.forEach((fn) => fn());
      document.getElementById(TOGGLE_BTN_ID)?.remove();
      restoreGuide();
    };
  },
};

export default feature;
