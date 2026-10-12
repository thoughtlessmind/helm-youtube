/**
 * relative-date.ts
 *
 * Parses YouTube's human-readable relative-date strings (e.g. "2 weeks ago",
 * "Streamed 3 days ago", "1 year ago") into a normalized `{days}` value so
 * that features can sort, filter, and aggregate by approximate upload age.
 *
 * Only the rendered strings YouTube produces are handled — no locale guessing.
 * All units are converted to whole days using approximate calendar constants:
 *   minute → 0 days (< 1 day)
 *   hour   → 0 days (< 1 day)
 *   day    → 1 day per unit
 *   week   → 7 days per unit
 *   month  → 30 days per unit
 *   year   → 365 days per unit
 *
 * Returns `null` when the string cannot be recognized (LIVE, PREMIERE, etc.).
 */

/** Result of a successful parse. */
export interface RelativeDate {
  /** Approximate age in whole days (0 = today / earlier today). */
  days: number;
}

/**
 * Parses a YouTube relative-date string and returns the approximate age in days.
 *
 * @param text Raw text from the upload-date metadata element, e.g. "3 weeks ago".
 * @returns `{days: number}` on success, `null` when unrecognized.
 *
 * @example
 * parseRelativeDate("2 weeks ago")   // { days: 14 }
 * parseRelativeDate("Streamed 1 year ago") // { days: 365 }
 * parseRelativeDate("LIVE")          // null
 */
export function parseRelativeDate(text: string | null | undefined): RelativeDate | null {
  if (!text) return null;

  // Strip leading qualifiers: "Streamed", "Premiered", "Shared", etc.
  const cleaned = text.replace(/^(streamed|premiered|shared|uploaded)\s+/i, '').trim();

  // Match patterns like "3 days ago", "1 week ago", "5 months ago"
  const match = cleaned.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let days: number;
  switch (unit) {
    case 'minute':
    case 'hour':
      days = 0;
      break;
    case 'day':
      days = count;
      break;
    case 'week':
      days = count * 7;
      break;
    case 'month':
      days = count * 30;
      break;
    case 'year':
      days = count * 365;
      break;
    default:
      return null;
  }

  return { days };
}

// ─── Selectors for the upload-date metadata on video cards ───────────────────

/**
 * Selectors tried in order to find the upload-date text on a video card.
 * YouTube renders this in several different elements depending on the surface
 * (home feed, grid page, search results, history page).
 */
const DATE_SELECTORS: string[] = [
  // Rich-item / search-result metadata line — the second span is usually the date
  'ytd-video-meta-block #metadata-line span.inline-metadata-item:last-child',
  'ytd-video-meta-block #metadata-line span:last-child',
  // Grid card
  '#metadata-line span.inline-metadata-item:last-child',
  '#metadata-line span:last-child',
  // Compact sidebar renderer
  '.ytd-video-meta-block span.inline-metadata-item:last-child',
  // Generic fallback
  '[aria-label*=" ago"]',
];

/**
 * Extracts the approximate upload age (in days) from a video card element.
 *
 * Iterates candidate selectors and returns the first successful parse.
 * Returns `null` when no recognizable date string is found.
 *
 * @param card Any of the four ytd-*-renderer card elements.
 */
export function cardUploadDaysAgo(card: HTMLElement): number | null {
  for (const sel of DATE_SELECTORS) {
    const els = card.querySelectorAll<HTMLElement>(sel);
    for (const el of els) {
      const text = el.textContent?.trim() ?? '';
      const result = parseRelativeDate(text);
      if (result !== null) return result.days;
    }
  }
  return null;
}
