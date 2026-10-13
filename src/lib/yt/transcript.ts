/**
 * transcript.ts — read the current video's transcript by driving YouTube's own transcript panel
 * (no external API): click "Show transcript" in the description, wait for the segments to render
 * in the engagement panel (`#secondary` — it must not be display:none), parse them, and close the
 * panel again if we were the ones who opened it.
 */

import type { YTContext } from './context';

/** One timestamped line of a video transcript. */
export interface TranscriptSegment {
  /** Offset from the start of the video, in seconds. */
  start: number;
  text: string;
}

// Modern "In this video" panel first, then the older ytd-transcript-* renderer.
const SEGMENT = 'transcript-segment-view-model, ytd-transcript-segment-renderer';
const TIMESTAMP = '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp';
const TEXT = '.ytAttributedStringHost, .segment-text';
const PANEL = 'ytd-engagement-panel-section-list-renderer';
const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
const SHOW_BUTTON = 'ytd-video-description-transcript-section-renderer button';

/** "1:02:03" / "4:10" → seconds (0 when unparseable). */
function parseTimestamp(raw: string): number {
  const parts = raw.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Segments of the transcript panel that is open right now. A closed panel can still hold the
 * previous video's segments for a moment after SPA navigation, so only an expanded one counts.
 */
function readOpenPanel(): { panel: Element; segments: TranscriptSegment[] } | null {
  for (const node of document.querySelectorAll(SEGMENT)) {
    const panel = node.closest(PANEL);
    if (panel?.getAttribute('visibility') !== EXPANDED) continue;
    const segments: TranscriptSegment[] = [];
    for (const seg of panel.querySelectorAll(SEGMENT)) {
      const text = seg.querySelector(TEXT)?.textContent?.replace(/\s+/g, ' ').trim();
      if (text) segments.push({ start: parseTimestamp(seg.querySelector(TIMESTAMP)?.textContent ?? ''), text });
    }
    return segments.length ? { panel, segments } : null;
  }
  return null;
}

/** True when the video offers a transcript (YouTube renders "Show transcript" in the description). */
export function hasTranscript(): boolean {
  return !!document.querySelector(SHOW_BUTTON) || !!readOpenPanel();
}

/**
 * The current video's transcript, or null when it has none or the panel didn't fill within 8 s.
 * Waits on the shared observer, not a polling loop.
 */
export async function fetchTranscript(observer: YTContext['observer']): Promise<TranscriptSegment[] | null> {
  const open = readOpenPanel();
  if (open) return open.segments;

  const btn = document.querySelector<HTMLElement>(SHOW_BUTTON);
  if (!btn) return null;
  btn.click();

  const found = await new Promise<ReturnType<typeof readOpenPanel>>((resolve) => {
    const finish = (v: ReturnType<typeof readOpenPanel>) => {
      off();
      clearTimeout(soon);
      clearTimeout(late);
      resolve(v);
    };
    const check = () => {
      const v = readOpenPanel();
      if (v) finish(v);
    };
    const off = observer.onChange(check);
    // Re-opening a panel that still holds this video's segments flips an attribute only — no
    // childList mutation reaches the observer — so look once without waiting for one.
    const soon = setTimeout(check, 300);
    const late = setTimeout(() => finish(readOpenPanel()), 8000);
  });
  // We opened it just to read it — put the page back the way it was.
  found?.panel.querySelector<HTMLElement>('#visibility-button button')?.click();
  return found?.segments ?? null;
}
