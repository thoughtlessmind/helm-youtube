/**
 * Grid density for shelves inside the feed ("Top news", "Explore more topics"). YouTube renders a
 * collapsed shelf with `elementsPerRow` cards (attribute `elements-per-row`), which it computes in
 * JS from the window width and pushes down from the grid, so CSS alone (customize-grid sizes the
 * cards) would leave a row of 3 cards in 5 slots. The isolated world sets <html data-ytp-grid-cols>
 * and fires SHELF_EVENT; the MAIN world sets each video shelf's `elementsPerRow` to it, or back to
 * the grid's own count when the attribute is gone.
 */

type Json = any; // Polymer elements — untyped by nature.

/** Shelves of ordinary video cards: not Shorts, Playables or posts, which have their own per-row counts. */
export const VIDEO_SHELF =
  'ytd-rich-grid-renderer ytd-rich-shelf-renderer:not([is-shorts]):not(:has([is-slim-media], [is-mini-game-card-shelf], [is-post]))';
export const SHELF_EVENT = 'ytp-shelf-cols';

/** MAIN world only (youtube-main.content.ts). */
export function installShelfCols(): void {
  document.addEventListener(SHELF_EVENT, () => {
    const cols = Number(document.documentElement.dataset.ytpGridCols) || 0;
    for (const shelf of document.querySelectorAll<Json>(VIDEO_SHELF)) {
      const n = cols || shelf.closest('ytd-rich-grid-renderer')?.elementsPerRow;
      if (typeof n === 'number' && n > 0 && shelf.elementsPerRow !== n) shelf.elementsPerRow = n;
    }
  });
}
