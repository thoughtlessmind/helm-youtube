/**
 * Watch-page slots below the player: the action row (our buttons sit just left of Like) and the
 * description box (the note card sits on top of it). Selectors live here so a YouTube redesign is
 * a one-file fix. Both helpers are idempotent: they touch the DOM only when the host is missing
 * or out of place, so calling them from `ctx.observer.onChange` can't loop.
 */

/** Left-to-right order of our hosts in the action row, whatever order features mount in. */
const ACTION_ORDER = ['ytp-notes', 'ytp-transcript'];

const LIKE_ROW = 'ytd-watch-metadata #top-level-buttons-computed';
const DESCRIPTION = 'ytd-watch-metadata #description';

/**
 * Shadow CSS for a host's pill (icon + label in a <span>). YouTube sizes the row for its own
 * buttons, so ours give way first when it's tight: icon only, then hidden — YouTube's buttons
 * are never pushed out of the row. `full` = the labelled pill's width in px (fixed English labels
 * in Roboto 14/500, so a constant holds). flex-shrink ∝ (full − 36) / full makes all our pills
 * reach icon size together. Height follows the row (stretched host), so the pills match YouTube's
 * buttons whether they're 36px or 40px tall.
 */
export const actionCss = (full: number) => `
:host{flex:0 ${((full - 36) / full).toFixed(3)} ${full}px;min-width:0;margin-right:8px;container-type:inline-size;overflow:clip;overflow-clip-margin:4px}
.ytp-btn{height:100%;border-radius:var(--ytp-radius,999px)}
.ytp-btn:has(>svg){width:100%}
@container (width < ${full - 1}px){.ytp-btn:has(>svg){padding:0}.ytp-btn>span{display:none}}
@container (width < 36px){.ytp-btn{visibility:hidden}}
`;

function placeBefore(host: HTMLElement, ref: Element | null): boolean {
  if (!ref?.parentElement) return false;
  if (host.nextElementSibling !== ref) ref.parentElement.insertBefore(host, ref);
  return true;
}

/** Inserts `host` (id from ACTION_ORDER) left of Like / our later buttons. False = row not rendered. */
export function placeInActionRow(host: HTMLElement): boolean {
  const like = document.querySelector(LIKE_ROW);
  if (!like) return false;
  const next = ACTION_ORDER.slice(ACTION_ORDER.indexOf(host.id) + 1)
    .map((id) => document.getElementById(id))
    .find((el) => el?.parentElement === like.parentElement);
  return placeBefore(host, next ?? like);
}

/** Inserts `host` directly above the description box. False = description not rendered. */
export function placeAboveDescription(host: HTMLElement): boolean {
  return placeBefore(host, document.querySelector(DESCRIPTION));
}
