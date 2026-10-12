/**
 * download-transcript — injects a "Download transcript" button near the
 * video title on watch pages. Clicking it opens a tiny format picker
 * (plain-text `.txt` or SubRip `.srt`), then triggers a browser download.
 *
 * UX:
 *   - A "⬇ Transcript" button appears in `ytd-watch-metadata #actions`
 *     (the row with Like / Share / Save …). Falls back to appending after
 *     the title if the actions bar isn't found.
 *   - Clicking the button reveals an inline format picker: [.txt] [.srt].
 *   - Picking a format calls `fetchTranscript()`, builds the file content,
 *     and triggers a `<a download>` blob URL click.
 *   - A toast confirms success or explains failure.
 *   - Button and picker are removed on navigation / teardown.
 *
 * File formats:
 *   .txt — one line per segment: "m:ss  text"
 *   .srt — SubRip subtitle format with sequence numbers and time ranges
 *          (`HH:MM:SS,mmm --> HH:MM:SS,mmm`). Each cue's end time is the
 *          next segment's start time (last cue gets +3 s estimate).
 *
 * Shadow DOM:
 *   Button and picker live in a shadow root to prevent YouTube's CSS from
 *   affecting them.
 */

import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import { isWatchPage, getVideoId } from '../lib/yt/video';
import { fetchTranscript, type TranscriptSegment } from '../lib/yt/transcript';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_ID = 'yt-pro-dl-transcript-host';

/** Selectors for the watch-page action row (Like / Share / Save …). */
const ACTION_ROW_SELECTORS = [
  'ytd-watch-metadata #actions',
  'ytd-watch-metadata ytd-menu-renderer',
  '#above-the-fold #actions',
];

// ---------------------------------------------------------------------------
// CSS (injected into shadow root)
// ---------------------------------------------------------------------------

const BUTTON_CSS = `
  :host { all: initial; }
  .wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px;
    height: 36px;
    border-radius: 18px;
    border: none;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.12s;
    white-space: nowrap;
  }
  .btn:hover {
    background: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
  }
  .btn svg { flex-shrink: 0; }
  /* Format picker dropdown */
  .picker {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: var(--yt-spec-menu-background, #fff);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    z-index: 2147483647;
    overflow: hidden;
    min-width: 160px;
  }
  .picker-label {
    padding: 8px 14px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--yt-spec-text-secondary, #606060);
  }
  .fmt-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    border: none;
    background: transparent;
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .fmt-btn:hover {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
  }
  .fmt-btn .ext {
    font-size: 11px;
    font-weight: 700;
    color: #c00;
    font-family: monospace;
    min-width: 28px;
  }
  .fmt-btn .desc {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
  }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0,0,0,0.15);
    border-top-color: #c00;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Zero-pad a number to `n` digits. */
const pad = (n: number, digits: number): string =>
  String(Math.floor(n)).padStart(digits, '0');

/**
 * Convert seconds to SubRip timestamp format: `HH:MM:SS,mmm`.
 */
function toSrtTime(seconds: number): string {
  const ms = Math.round((seconds % 1) * 1000);
  const totalSecs = Math.floor(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/**
 * Build a plain-text transcript with `m:ss  text` lines.
 */
function buildTxt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const totalSecs = Math.floor(seg.start);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      const ts = `${m}:${s.toString().padStart(2, '0')}`;
      return `${ts}  ${seg.text}`;
    })
    .join('\n');
}

/**
 * Build a SubRip (.srt) file. Each cue's end time = next segment's start.
 * The final cue gets an estimated 3-second window.
 */
function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = toSrtTime(seg.start);
      const endSecs =
        i + 1 < segments.length ? segments[i + 1].start : seg.start + 3;
      const end = toSrtTime(endSecs);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join('\n\n');
}

/**
 * Trigger a browser file download using a Blob + temporary anchor.
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a short delay to let the download start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'download-transcript',

  setup(ctx) {
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let pickerOpen = false;
    let busy = false;

    // ---- Build / inject button ----
    const findActionRow = (): HTMLElement | null => {
      for (const sel of ACTION_ROW_SELECTORS) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };

    const inject = () => {
      if (!isWatchPage()) return;
      if (host && document.contains(host)) return;

      const actionRow = findActionRow();
      if (!actionRow) return;

      host = document.createElement('div');
      host.id = HOST_ID;
      shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = BUTTON_CSS;
      shadow.appendChild(style);

      const wrap = document.createElement('div');
      wrap.className = 'wrap';

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Download transcript');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-14 9v2h14v-2H5z"/>
        </svg>
        Transcript
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePicker(btn, wrap);
      });

      wrap.appendChild(btn);
      shadow.appendChild(wrap);

      // Insert at the start of the action row so it's visible quickly.
      actionRow.insertBefore(host, actionRow.firstChild);

      // Close picker when clicking outside the shadow host.
      document.addEventListener('mousedown', onOutsideClick, true);
    };

    const onOutsideClick = (e: MouseEvent) => {
      if (!pickerOpen || !host) return;
      if (host.contains(e.target as Node)) return;
      closePicker();
    };

    const togglePicker = (btn: HTMLButtonElement, wrap: HTMLElement) => {
      if (pickerOpen) {
        closePicker();
      } else {
        openPicker(btn, wrap);
      }
    };

    const openPicker = (btn: HTMLButtonElement, wrap: HTMLElement) => {
      closePicker(); // Remove any existing picker.
      pickerOpen = true;
      btn.setAttribute('aria-expanded', 'true');

      const picker = document.createElement('div');
      picker.className = 'picker';
      picker.setAttribute('role', 'menu');
      picker.innerHTML = `
        <div class="picker-label">Download as</div>
        <button class="fmt-btn" data-fmt="txt" type="button" role="menuitem">
          <span class="ext">.txt</span>
          <span class="desc">Plain text with timestamps</span>
        </button>
        <button class="fmt-btn" data-fmt="srt" type="button" role="menuitem">
          <span class="ext">.srt</span>
          <span class="desc">SubRip subtitles</span>
        </button>
      `;

      picker.querySelectorAll<HTMLButtonElement>('.fmt-btn').forEach((fmtBtn) => {
        fmtBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fmt = fmtBtn.dataset.fmt as 'txt' | 'srt';
          closePicker();
          await doDownload(fmt, btn);
        });
      });

      wrap.appendChild(picker);
    };

    const closePicker = () => {
      if (!shadow) return;
      pickerOpen = false;
      shadow.querySelector('.picker')?.remove();
      shadow.querySelector<HTMLButtonElement>('.btn')?.setAttribute('aria-expanded', 'false');
    };

    // ---- Download logic ----
    const setButtonBusy = (btn: HTMLButtonElement, loading: boolean) => {
      busy = loading;
      const icon = loading
        ? `<span class="spinner" aria-label="Loading"></span>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
             <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-14 9v2h14v-2H5z"/>
           </svg>`;
      btn.disabled = loading;
      btn.innerHTML = `${icon} Transcript`;
    };

    const doDownload = async (fmt: 'txt' | 'srt', btn: HTMLButtonElement) => {
      if (busy) return;

      setButtonBusy(btn, true);
      flashToast('Fetching transcript…', 2000);

      const segs = await fetchTranscript(8000);

      setButtonBusy(btn, false);

      if (!segs || !segs.length) {
        flashToast('No transcript available for this video');
        return;
      }

      const videoId = getVideoId() ?? 'transcript';
      const title = document
        .querySelector<HTMLElement>('ytd-watch-metadata h1 yt-formatted-string')
        ?.textContent?.trim()
        ?.replace(/[/\\:*?"<>|]/g, '-')
        ?? videoId;

      if (fmt === 'txt') {
        const content = buildTxt(segs);
        triggerDownload(content, `${title}.txt`, 'text/plain;charset=utf-8');
        flashToast('Transcript downloaded as .txt');
      } else {
        const content = buildSrt(segs);
        triggerDownload(content, `${title}.srt`, 'text/plain;charset=utf-8');
        flashToast('Transcript downloaded as .srt');
      }
    };

    // ---- Lifecycle ----
    // Re-inject if YouTube re-renders the action row.
    const offChange = ctx.observer.onChange(() => inject());

    // On SPA navigation: remove old button, re-inject for new video.
    const offNav = ctx.navigation.onNavigate(() => {
      remove();
      // Slight delay — the new page's action row takes a moment to render.
      setTimeout(() => inject(), 800);
    });

    inject();

    const remove = () => {
      document.removeEventListener('mousedown', onOutsideClick, true);
      host?.remove();
      host = null;
      shadow = null;
      pickerOpen = false;
      busy = false;
    };

    return () => {
      offChange();
      offNav();
      remove();
    };
  },
};

export default feature;
