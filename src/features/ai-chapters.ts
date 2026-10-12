/**
 * ai-chapters — on-device AI chapter detection panel.
 *
 * UX:
 *   - A floating button opens a shadow-DOM panel.
 *   - Fetches the video transcript (with timestamps), prompts Chrome's
 *     built-in LanguageModel to produce chapter markers (`timestamp – title`),
 *     parses the output, and renders a clickable chapter list.
 *   - Clicking a chapter seeks the `<video>` element to that timestamp.
 *   - Handles: no transcript, model unavailable, model downloading (progress
 *     bar), parse failures, and async errors with clear user-facing messages.
 *   - Panel is reset on SPA navigation (new video).
 *   - All UI lives in shadow DOM.
 *
 * Manifest permissions: none.
 *
 * Suggested catalog: section "AI (on-device)", label "AI Chapters",
 *   desc "Auto-detect chapter markers in any video using on-device AI."
 */

import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import { isWatchPage } from '../lib/yt/video';
import { fetchTranscript, formatTimestamp } from '../lib/yt/transcript';
import {
  isPromptAvailable,
  createPromptSession,
  formatTranscriptForAI,
  chunkTranscript,
  availabilityMessage,
  type AIAvailability,
  type LanguageModelSession,
} from '../lib/yt/chrome-ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_ID = 'yt-pro-ai-chapters-host';
const TOGGLE_ID = 'yt-pro-ai-chapters-toggle-host';
const PANEL_WIDTH = 360;

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const TOGGLE_CSS = `
  :host { all: initial; }
  button {
    position: fixed;
    bottom: 380px;
    right: 20px;
    z-index: 2147483646;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: #2e7d32;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.35);
    font-family: system-ui, sans-serif;
    transition: background 0.15s, transform 0.1s;
    line-height: 1;
  }
  button:hover { background: #1b5e20; transform: scale(1.07); }
  button[aria-pressed="true"] { background: #333; }
  button[aria-pressed="true"]:hover { background: #555; }
`;

const PANEL_CSS = `
  :host { all: initial; }
  .panel {
    position: fixed;
    top: 56px;
    right: 0;
    width: ${PANEL_WIDTH}px;
    height: calc(100vh - 56px);
    background: var(--yt-spec-menu-background, #fff);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border-left: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
    box-shadow: -4px 0 24px rgba(0,0,0,0.14);
    display: flex;
    flex-direction: column;
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
    z-index: 2147483645;
    box-sizing: border-box;
    overflow: hidden;
  }
  .panel * { box-sizing: border-box; }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    flex-shrink: 0;
    background: var(--yt-spec-menu-background, #fff);
  }
  .title { font-size: 14px; font-weight: 700; }
  .close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: 20px;
    padding: 4px 6px;
    border-radius: 4px;
    line-height: 1;
  }
  .close-btn:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.06)); }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  .chapter {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 14px;
    cursor: pointer;
    transition: background 0.1s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    color: inherit;
  }
  .chapter:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05)); }
  .chapter:focus-visible { outline: 2px solid #2e7d32; outline-offset: -2px; }
  .ch-ts {
    font-size: 11px;
    color: #2e7d32;
    font-weight: 700;
    flex-shrink: 0;
    padding-top: 1px;
    min-width: 40px;
    font-family: monospace;
  }
  .ch-title { line-height: 1.45; }
  .state-msg {
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
    padding: 32px 20px;
  }
  .progress-wrap {
    margin: 12px 0;
    height: 4px;
    border-radius: 2px;
    background: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: #2e7d32;
    border-radius: 2px;
    width: 0%;
    transition: width 0.3s;
  }
  .retry-btn {
    margin-top: 14px;
    padding: 8px 18px;
    border: none;
    border-radius: 20px;
    background: #2e7d32;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  .retry-btn:hover { background: #1b5e20; }
  .ch-count {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    padding: 4px 14px 8px;
    font-style: italic;
  }
`;

// ---------------------------------------------------------------------------
// Chapter parsing
// ---------------------------------------------------------------------------

export interface ChapterMarker {
  /** Offset from video start, in seconds. */
  seconds: number;
  /** Chapter title as returned by the model. */
  title: string;
}

/**
 * System prompt instructing the model to produce chapter markers.
 *
 * Output format we ask for:
 *   [m:ss] Chapter title
 *   [m:ss] Chapter title
 * One per line; no extra commentary.
 */
const CHAPTERS_SYSTEM_PROMPT = `You are a video chapter generator.
Given a video transcript with timestamps in the format [m:ss] spoken text,
identify the major topic changes and output chapter markers.

Output ONLY a list of chapters, one per line, in this exact format:
[m:ss] Chapter title

Rules:
- Use timestamps that actually appear in the transcript.
- Aim for 4–12 chapters depending on video length.
- Chapter titles should be concise (2–7 words).
- Do not include any other text, explanations, or commentary.
- The first chapter should always start at or near [0:00].`;

/**
 * Parse model output into an array of chapter markers.
 * Tolerant regex: accepts `[m:ss]`, `[mm:ss]`, `[h:mm:ss]` with optional
 * surrounding brackets, dashes, or colons as separators.
 *
 * Lines that don't match or have empty titles are silently skipped.
 *
 * @param raw - Raw model text output.
 * @param videoDuration - Optional video duration in seconds; chapters beyond
 *   this are dropped.
 */
function parseChapters(raw: string, videoDuration?: number): ChapterMarker[] {
  const lines = raw.split('\n');
  const results: ChapterMarker[] = [];
  // Match: optional [ , digits:digits(:digits)?, optional ] , separator, title
  const RE = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–:]\s*(.+?)\s*$/;

  for (const line of lines) {
    const m = RE.exec(line.trim());
    if (!m) continue;
    const [, ts, title] = m;
    if (!title.trim()) continue;

    // Parse timestamp to seconds.
    const parts = ts.split(':').map(Number);
    let seconds: number;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      seconds = parts[0] * 60 + parts[1];
    }

    if (isNaN(seconds)) continue;
    if (videoDuration !== undefined && seconds > videoDuration + 5) continue;

    results.push({ seconds, title: title.trim() });
  }

  // Deduplicate by timestamp (keep first occurrence) and sort.
  const seen = new Set<number>();
  return results
    .filter((c) => { if (seen.has(c.seconds)) return false; seen.add(c.seconds); return true; })
    .sort((a, b) => a.seconds - b.seconds);
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'ai-chapters',

  async setup(ctx) {
    // ---- State ----
    let isOpen = false;
    let isLoading = false;
    let session: LanguageModelSession | null = null;

    // ---- Host elements ----
    let toggleHost: HTMLDivElement | null = null;
    let toggleShadow: ShadowRoot | null = null;
    let toggleBtn: HTMLButtonElement | null = null;
    let panelHost: HTMLDivElement | null = null;
    let panelShadow: ShadowRoot | null = null;

    // ---- Shadow DOM builders ----
    const createToggle = () => {
      if (toggleHost && document.contains(toggleHost)) return;

      toggleHost = document.createElement('div');
      toggleHost.id = TOGGLE_ID;
      toggleShadow = toggleHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = TOGGLE_CSS;
      toggleShadow.appendChild(style);

      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.title = 'AI Chapters';
      toggleBtn.setAttribute('aria-label', 'Open AI chapter markers panel');
      toggleBtn.setAttribute('aria-pressed', 'false');
      // Chapters / bookmark-list icon
      toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z"/>
      </svg>`;
      toggleBtn.addEventListener('click', () => { void toggle(); });
      toggleShadow.appendChild(toggleBtn);
      document.body.appendChild(toggleHost);
    };

    const ensurePanel = () => {
      if (panelHost && document.contains(panelHost)) return;

      panelHost = document.createElement('div');
      panelHost.id = HOST_ID;
      panelShadow = panelHost.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = PANEL_CSS;
      panelShadow.appendChild(style);

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.setAttribute('role', 'complementary');
      panel.setAttribute('aria-label', 'AI chapter markers');
      panelShadow.appendChild(panel);

      document.body.appendChild(panelHost);
    };

    const getPanel = (): HTMLElement | null =>
      panelShadow?.querySelector('.panel') ?? null;

    const escHtml = (s: string): string =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      );

    // ---- Render helpers ----
    const renderState = (msg: string, progress?: number, showRetry = false) => {
      const panel = getPanel();
      if (!panel) return;
      const progressHtml =
        progress !== undefined
          ? `<div class="progress-wrap"><div class="progress-bar" style="width:${Math.round(progress * 100)}%"></div></div>`
          : '';
      const btn = showRetry
        ? `<button class="retry-btn" id="yt-pro-chapters-retry">Try again</button>`
        : '';
      panel.innerHTML = `
        <div class="header">
          <span class="title">📑 AI Chapters</span>
          <button class="close-btn" aria-label="Close AI chapters panel">×</button>
        </div>
        <div class="list"><div class="state-msg">${escHtml(msg)}${progressHtml}${btn}</div></div>
      `;
      panel.querySelector('.close-btn')?.addEventListener('click', () => close());
      if (showRetry) {
        panel.querySelector('#yt-pro-chapters-retry')?.addEventListener('click', () => { void runChapters(); });
      }
    };

    const renderChapters = (chapters: ChapterMarker[]) => {
      const panel = getPanel();
      if (!panel) return;

      const chaptersHtml = chapters
        .map(
          (c) =>
            `<button class="chapter" data-seconds="${c.seconds}" aria-label="Jump to ${formatTimestamp(c.seconds)}: ${escHtml(c.title)}">
              <span class="ch-ts">${escHtml(formatTimestamp(c.seconds))}</span>
              <span class="ch-title">${escHtml(c.title)}</span>
            </button>`,
        )
        .join('');

      panel.innerHTML = `
        <div class="header">
          <span class="title">📑 AI Chapters</span>
          <button class="close-btn" aria-label="Close AI chapters panel">×</button>
        </div>
        <div class="ch-count">${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} detected by AI</div>
        <div class="list" role="list">${chaptersHtml}</div>
      `;

      panel.querySelector('.close-btn')?.addEventListener('click', () => close());

      panel.querySelectorAll<HTMLElement>('.chapter').forEach((btn) => {
        btn.addEventListener('click', () => seekTo(Number(btn.dataset.seconds ?? 0)));
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            seekTo(Number(btn.dataset.seconds ?? 0));
          }
        });
      });
    };

    const getVideo = (): HTMLVideoElement | null =>
      document.querySelector<HTMLVideoElement>('video.html5-main-video');

    const seekTo = (seconds: number) => {
      const v = getVideo();
      if (v) v.currentTime = seconds;
    };

    // ---- Core: fetch transcript + generate chapters ----
    const runChapters = async () => {
      if (isLoading) return;
      isLoading = true;

      try {
        // 1. Check availability.
        const avail: AIAvailability = await isPromptAvailable();
        if (avail === 'unavailable') {
          renderState(availabilityMessage('unavailable'));
          return;
        }

        // 2. Fetch transcript with timestamps.
        renderState('Fetching transcript…');
        const segments = await fetchTranscript(10_000);
        if (!segments || segments.length === 0) {
          renderState('No transcript available for this video. AI chapters require captions.');
          return;
        }

        // 3. Format transcript with timestamps for the model.
        const transcriptText = formatTranscriptForAI(segments, true);
        // For chapters we want the full transcript (or first large chunk).
        const chunks = chunkTranscript(transcriptText);
        // Use up to the first ~2 chunks to cover the bulk of the video context.
        const inputText = chunks.slice(0, 2).join('\n');

        // 4. Get video duration for timestamp validation.
        const videoDuration = getVideo()?.duration;

        // 5. Create LanguageModel session.
        renderState(
          avail === 'available' ? 'Generating chapters…' : 'Downloading AI model…',
          avail === 'available' ? undefined : 0,
        );

        // Destroy any existing session from a previous run.
        session?.destroy();
        session = null;

        const onProgress = (frac: number) => {
          if (isOpen) renderState('Downloading AI model…', frac);
        };

        session = await createPromptSession(
          {
            initialPrompts: [
              { role: 'system', content: CHAPTERS_SYSTEM_PROMPT },
            ],
          },
          avail !== 'available' ? onProgress : undefined,
        );

        // 6. Prompt.
        renderState('Generating chapters…');
        const prompt = `Here is the video transcript:\n\n${inputText}\n\nGenerate chapter markers for this video.`;
        const raw = await session.prompt(prompt);

        // 7. Parse and validate output.
        const chapters = parseChapters(raw, videoDuration);
        if (chapters.length === 0) {
          renderState('Could not detect chapters. The model output was not in the expected format.', undefined, true);
          return;
        }

        renderChapters(chapters);

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred';
        renderState(`Failed to generate chapters: ${msg}`, undefined, true);
      } finally {
        isLoading = false;
      }
    };

    // ---- Open / close / toggle ----
    const open = async () => {
      if (!isWatchPage()) {
        flashToast('Open a video first');
        return;
      }
      isOpen = true;
      ensurePanel();
      if (panelHost) panelHost.style.display = 'block';
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
      await runChapters();
    };

    const close = () => {
      isOpen = false;
      if (panelHost) panelHost.style.display = 'none';
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
      isLoading = false;
    };

    const toggle = async () => {
      if (isOpen) close();
      else await open();
    };

    // ---- Inject toggle button ----
    const injectToggle = () => {
      if (!isWatchPage()) return;
      createToggle();
    };

    const offChange = ctx.observer.onChange(() => injectToggle());

    const offNav = ctx.navigation.onNavigate(() => {
      close();
      // Destroy the session — new video needs fresh chapters.
      session?.destroy();
      session = null;
      injectToggle();
    });

    injectToggle();

    // ---- Teardown ----
    return () => {
      offChange();
      offNav();
      close();
      session?.destroy();
      session = null;
      toggleHost?.remove();
      panelHost?.remove();
      toggleHost = null;
      panelHost = null;
      toggleShadow = null;
      panelShadow = null;
      toggleBtn = null;
    };
  },
};

export default feature;
