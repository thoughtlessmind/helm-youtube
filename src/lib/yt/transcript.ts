/**
 * transcript.ts — DOM-based transcript extraction for YouTube watch pages.
 *
 * Strategy (no external API):
 *   1. Find and click the "Show transcript" button inside the description
 *      area. YouTube renders it lazily inside `ytd-video-description-
 *      transcript-section-renderer`, but there's also a fallback path via
 *      the engagement-panel overflow menu.
 *   2. Wait for the transcript engagement panel to populate with
 *      `ytd-transcript-segment-renderer` elements.
 *   3. Parse each segment's `.segment-timestamp` and `.segment-text` into
 *      a `TranscriptSegment`.
 *   4. Leave the panel open (it's not intrusive, and closing it would
 *      require extra clicks that could race with the user). Callers that
 *      need it closed can do so themselves.
 *
 * UI side-effects:
 *   - The "Show transcript" button is clicked → transcript panel slides in
 *     on the right-hand side of the watch page.
 *   - The panel remains open after the call returns.
 *   - If the transcript panel was already open the function reads it
 *     immediately without clicking anything.
 */

/** One timestamped line of a video transcript. */
export interface TranscriptSegment {
  /** Offset from the start of the video, in seconds (float). */
  start: number;
  /** The spoken text for this segment, with leading/trailing whitespace stripped. */
  text: string;
}

// ---------------------------------------------------------------------------
// Selectors — named constants so a YouTube redesign is a one-file fix.
// ---------------------------------------------------------------------------

/** The rendered segment list lives inside the engagement panel. */
const SEGMENT_SEL = 'ytd-transcript-segment-renderer';

/** Timestamp cell inside a segment. */
const TIMESTAMP_SEL = '.segment-timestamp';

/** Text cell inside a segment. */
const TEXT_SEL = '.segment-text';

/**
 * The "Show transcript" button rendered by YouTube inside the video
 * description section (new UI). We try multiple selectors in order.
 */
const SHOW_TRANSCRIPT_BTN_SELECTORS = [
  // New polymer UI — description transcript section button
  'ytd-video-description-transcript-section-renderer button',
  // Button with aria-label containing "transcript"
  'ytd-watch-metadata button[aria-label*="ranscript" i]',
  // Engagement panel header button sometimes used in older layouts
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"] button',
];

/**
 * Once the panel is open the segments live here. Two selectors cover
 * minor YouTube layout variations.
 */
const TRANSCRIPT_PANEL_SELECTORS = [
  'ytd-transcript-renderer #segments-container',
  'ytd-transcript-segment-renderer',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the transcript of the currently-playing video by driving YouTube's
 * own transcript UI — no external API calls.
 *
 * Returns `null` when:
 *   - The video has no transcript (button not present).
 *   - The transcript panel did not populate within `timeoutMs`.
 *   - Called outside a watch page.
 *
 * The transcript engagement panel is left open after the call.
 *
 * @param timeoutMs  Maximum time to wait for the panel to populate (default 6 s).
 */
export async function fetchTranscript(
  timeoutMs = 6000,
): Promise<TranscriptSegment[] | null> {
  // Fast path: segments already in the DOM (panel already open).
  const existing = readSegmentsFromDOM();
  if (existing) return existing;

  // Try to find and click the "Show transcript" button.
  const btn = findShowTranscriptButton();
  if (!btn) return null; // Video likely has no transcript.

  btn.click();

  // Wait for the panel to populate.
  const segments = await pollForSegments(timeoutMs);
  return segments;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse `"m:ss"` or `"h:mm:ss"` timestamp text → seconds.
 * Returns 0 on parse failure.
 */
function parseTimestamp(raw: string): number {
  const clean = raw.trim();
  const parts = clean.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) {
    // m:ss
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    // h:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Try to read already-rendered transcript segments from the DOM.
 * Returns the parsed array if segments are present, or `null` if not yet
 * rendered or if the result is empty.
 */
function readSegmentsFromDOM(): TranscriptSegment[] | null {
  const nodes = document.querySelectorAll<HTMLElement>(SEGMENT_SEL);
  if (!nodes.length) return null;

  const result: TranscriptSegment[] = [];
  for (const node of nodes) {
    const tsEl = node.querySelector<HTMLElement>(TIMESTAMP_SEL);
    const txEl = node.querySelector<HTMLElement>(TEXT_SEL);
    if (!tsEl || !txEl) continue;
    const text = txEl.textContent?.trim() ?? '';
    if (!text) continue;
    result.push({ start: parseTimestamp(tsEl.textContent ?? ''), text });
  }
  return result.length ? result : null;
}

/**
 * Find the button that triggers the transcript panel. Tries multiple
 * selectors and also scans buttons by aria-label as a last resort.
 */
function findShowTranscriptButton(): HTMLElement | null {
  for (const sel of SHOW_TRANSCRIPT_BTN_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }

  // Last-resort: any button whose aria-label mentions "transcript".
  const allBtns = document.querySelectorAll<HTMLElement>(
    'ytd-watch-metadata button, #below button',
  );
  for (const btn of allBtns) {
    const label = (
      btn.getAttribute('aria-label') ??
      btn.textContent ??
      ''
    ).toLowerCase();
    if (label.includes('transcript')) return btn;
  }
  return null;
}

/**
 * Poll (via `requestAnimationFrame` + timeout) until transcript segments
 * appear in the DOM. Returns the parsed segments, or `null` on timeout.
 */
function pollForSegments(
  timeoutMs: number,
): Promise<TranscriptSegment[] | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs;

    const tick = () => {
      const segs = readSegmentsFromDOM();
      if (segs) {
        resolve(segs);
        return;
      }
      if (performance.now() >= deadline) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}
