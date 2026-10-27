import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import { PREVIEW_BUTTONS } from '../lib/yt/feed-cards';
import { SHELF_EVENT, VIDEO_SHELF } from '../lib/yt/shelf-cols';
import { addStyle } from '../lib/yt/ui';

const ITEM = 'ytd-rich-grid-renderer ytd-rich-item-renderer:not(ytd-rich-section-renderer *)';
/** Every card that takes the grid's size: the grid's own, plus those in video shelves ("Top news"). */
const CARD = `:is(${ITEM}, ${VIDEO_SHELF} ytd-rich-item-renderer)`;

const clampCols = (cols: unknown) => Math.min(8, Math.max(0, Math.round(Number(cols)) || 0));

/** `cols` goes into page CSS and a hand-edited backup can put anything in config: clampCols it first. */
function buildCSS(cols: number): string {
  if (!cols) return ''; // 0 = YouTube default: its own responsive grid, untouched
  // YouTube's media queries override its own items-per-row var at narrow
  // viewports, so we set grid-template-columns explicitly. The CSS vars
  // are kept in sync for any internal YT calc that still reads them.
  // `display: contents` flattens YT's row wrappers so items become direct
  // grid children. `grid-auto-flow: dense` lets later items fill the gap
  // before a Shorts/Playables shelf so the grid stays packed.
  return `
ytd-rich-grid-renderer {
  --ytd-rich-grid-items-per-row: ${cols} !important;
  --ytd-rich-grid-posts-per-row: ${cols} !important;
  --ytd-rich-grid-slim-items-per-row: ${cols} !important;
  --ytd-rich-grid-game-cards-per-row: ${cols} !important;
  --ytd-rich-grid-mini-game-cards-per-row: ${cols} !important;
  --ytd-rich-grid-item-min-width: 0px !important;
  --ytd-rich-grid-item-max-width: 9999px !important;
}

ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer {
  display: grid !important;
  grid-template-columns: repeat(${cols}, minmax(0, 1fr)) !important;
  gap: 16px !important; /* YouTube's own; the hover box bleeds 12px past each card */
  grid-auto-flow: dense !important;
}

ytd-rich-grid-row,
ytd-rich-grid-row #contents.ytd-rich-grid-row {
  display: contents !important;
}

/* Section shelves (Shorts, Playables, Posts) take a full row so their
   horizontal scrollers don't break grid flow. */
ytd-rich-section-renderer {
  grid-column: 1 / -1 !important;
  width: 100% !important;
  max-width: none !important;
  margin: 0 0 24px 0 !important;
}

/* :not() excludes items nested inside section shelves like "Explore more
   topics" — those keep their own flex row, below. */
${ITEM} {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 0 24px 0 !important;
}

/* Video shelves ("Top news", "Explore more topics") size their cards from a per-row var YouTube
   sets inline on each shelf; the MAIN world makes them render that many (lib/yt/shelf-cols.ts). */
${VIDEO_SHELF} {
  --ytd-rich-grid-items-per-row: ${cols} !important;
}

/* Each card is a size container so its text can scale with it. */
${CARD} {
  container-type: inline-size;
}

/* Text keeps the card's proportions: YouTube's 16px title / 14px metadata
   on a 360px-wide card, shrinking in ratio on narrower cards. Never larger
   than YouTube's size; floored at 11px / 10px to stay readable. */
${CARD} .ytLockupMetadataViewModelTitle,
${CARD} #video-title {
  font-size: clamp(11px, 4.44cqi, 16px) !important;
  line-height: 1.375em !important;
}
${CARD} .ytContentMetadataViewModelMetadataText,
${CARD} .ytContentMetadataViewModelDelimiter,
${CARD} #metadata-line span,
${CARD} ytd-channel-name #text {
  font-size: clamp(10px, 3.89cqi, 14px) !important;
  line-height: 1.43em !important;
}

/* Buttons on a hovered thumbnail scale the same way: YouTube's hover toggles (in the card) and
   the hover preview's mute / CC / queue stack. The preview is one overlay outside the cards, so
   its thumbnail-sized controls box is the container there. tan(atan2(a, b)) = a / b as a plain
   number. Floored at half size (YouTube's own small variant) so three still fit a short thumbnail. */
yt-inline-player-controls {
  container-type: inline-size;
}
${CARD} .ytThumbnailHoverOverlayToggleActionsViewModelButton,
${PREVIEW_BUTTONS} {
  zoom: clamp(0.5, tan(atan2(100cqi, 360px)), 1);
}
`;
}

const feature: Feature = {
  async setup(ctx) {
    const html = document.documentElement;
    const style = addStyle('');
    let cols = 0;

    /** Tells the MAIN world how many cards a video shelf should render (lib/yt/shelf-cols.ts). */
    const askShelves = () => document.dispatchEvent(new Event(SHELF_EVENT));
    const apply = (value: unknown) => {
      cols = clampCols(value);
      style.textContent = buildCSS(cols);
      if (cols) html.dataset.ytpGridCols = String(cols);
      else delete html.dataset.ytpGridCols; // the MAIN world puts back YouTube's own count
      askShelves();
    };
    // New shelves (scrolling) and re-rendered ones (a resize, a topic chip) start at YouTube's count.
    const syncShelves = () => {
      if (!cols) return;
      const want = String(cols);
      if ([...document.querySelectorAll(VIDEO_SHELF)].some((s) => s.getAttribute('elements-per-row') !== want)) askShelves();
    };

    apply((await getConfig('customize-grid')).columnsPerRow);
    const offs = [watchConfig('customize-grid', (next) => apply(next.columnsPerRow)), ctx.observer.onChange(syncShelves)];
    return () => {
      offs.forEach((off) => off());
      style.remove();
      delete html.dataset.ytpGridCols;
      askShelves();
    };
  },
};

export default feature;
