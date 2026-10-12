/**
 * ai-summarize — on-device AI video summary panel.
 *
 * UX:
 *   - A floating button (bottom-right, above transcript-panel's toggle) opens
 *     a shadow-DOM panel.
 *   - On open: fetches the video transcript, runs it through Chrome's built-in
 *     Summarizer API (key-points, markdown, medium length), and renders the
 *     summary as formatted text.
 *   - Long transcripts are chunked; each chunk is summarized separately and
 *     then the chunk summaries are combined into a final summary-of-summaries.
 *   - Handles: no transcript, model unavailable, model downloading (with
 *     progress bar), and async errors with clear user-facing messages.
 *   - Panel is reset on SPA navigation (new video).
 *   - All UI lives in shadow DOM; no YouTube styles leak in.
 *
 * Manifest permissions: none — on-device AI needs no host permission.
 *
 * Suggested catalog: section "AI (on-device)", label "AI Summary",
 *   desc "Summarize any video using on-device AI — no internet or API key needed."
 */

import type { Feature } from '../lib/features';
import { flashToast } from '../lib/yt/toast';
import { isWatchPage } from '../lib/yt/video';
import { fetchTranscript } from '../lib/yt/transcript';
import {
  isSummarizerAvailable,
  createSummarizer,
  formatTranscriptForAI,
  chunkTranscript,
  availabilityMessage,
  type AIAvailability,
  type SummarizerInstance,
} from '../lib/yt/chrome-ai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_ID = 'yt-pro-ai-summarize-host';
const TOGGLE_ID = 'yt-pro-ai-summarize-toggle-host';
const PANEL_WIDTH = 400;

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const TOGGLE_CSS = `
  :host { all: initial; }
  button {
    position: fixed;
    bottom: 320px;
    right: 20px;
    z-index: 2147483646;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: #1565c0;
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
  button:hover { background: #0d47a1; transform: scale(1.07); }
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
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px;
  }
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
    background: #1565c0;
    border-radius: 2px;
    width: 0%;
    transition: width 0.3s;
  }
  .retry-btn {
    margin-top: 14px;
    padding: 8px 18px;
    border: none;
    border-radius: 20px;
    background: #1565c0;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  .retry-btn:hover { background: #0d47a1; }
  .summary {
    line-height: 1.65;
    font-size: 13px;
  }
  /* Markdown-ish rendering */
  .summary h1, .summary h2, .summary h3 {
    font-size: 14px;
    font-weight: 700;
    margin: 12px 0 4px;
  }
  .summary ul { padding-left: 18px; margin: 6px 0; }
  .summary li { margin: 4px 0; }
  .summary p { margin: 6px 0; }
  .summary strong { font-weight: 700; }
  .summary em { font-style: italic; }
  .chunk-label {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    margin-bottom: 4px;
    font-style: italic;
  }
`;

// ---------------------------------------------------------------------------
// Lightweight markdown → HTML renderer (key-points format)
// ---------------------------------------------------------------------------

/**
 * Convert the model's markdown output (key-points style) to safe HTML.
 * Handles: **bold**, *italic*, # headings, - bullet lists, blank-line paragraphs.
 * All content is escaped before inline patterns are applied.
 */
function markdownToHtml(md: string): string {
  const escHtml = (s: string): string =>
    s.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    );

  const inlineRender = (line: string): string => {
    // Escape first so we don't double-escape markup.
    let s = escHtml(line);
    // **bold**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return s;
  };

  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings
    if (/^#{1,3}\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = (line.match(/^#+/)?.[0].length ?? 1);
      const text = inlineRender(line.replace(/^#+\s*/, ''));
      out.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    // Bullet / dash list items
    if (/^[-*•]\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      const text = inlineRender(line.replace(/^[-*•]\s/, ''));
      out.push(`<li>${text}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      const text = inlineRender(line.replace(/^\d+\.\s/, ''));
      out.push(`<li>${text}</li>`);
      continue;
    }

    // Close list before non-list content
    if (inList && line.trim() === '') {
      out.push('</ul>');
      inList = false;
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }

    // Blank line
    if (line.trim() === '') continue;

    out.push(`<p>${inlineRender(line)}</p>`);
  }

  if (inList) out.push('</ul>');
  return out.join('');
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'ai-summarize',

  async setup(ctx) {
    // ---- State ----
    let isOpen = false;
    let isLoading = false;
    let summarizerInstance: SummarizerInstance | null = null;

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
      toggleBtn.title = 'AI Summary';
      toggleBtn.setAttribute('aria-label', 'Open AI summary panel');
      toggleBtn.setAttribute('aria-pressed', 'false');
      // Sparkle / AI icon
      toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M19 3l-1.5 3.5L14 8l3.5 1.5L19 13l1.5-3.5L24 8l-3.5-1.5zm-8 2L9 9.5 4.5 11 9 12.5 11 17l2-4.5L17.5 11 13 9.5zm0 10l-1 2.5L7.5 19 10 20l1 2.5L12 20l2.5-1L12 17.5z"/>
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
      panel.setAttribute('aria-label', 'AI video summary');
      panelShadow.appendChild(panel);

      document.body.appendChild(panelHost);
    };

    const getPanel = (): HTMLElement | null =>
      panelShadow?.querySelector('.panel') ?? null;

    // ---- Render helpers ----

    /** Render arbitrary HTML into the panel body, wiring the close button. */
    const renderPanel = (bodyHtml: string) => {
      const panel = getPanel();
      if (!panel) return;
      panel.innerHTML = `
        <div class="header">
          <span class="title">✨ AI Summary</span>
          <button class="close-btn" aria-label="Close AI summary panel">×</button>
        </div>
        <div class="body">${bodyHtml}</div>
      `;
      panel.querySelector('.close-btn')?.addEventListener('click', () => close());
    };

    const renderLoading = (msg = 'Summarizing…', progress?: number) => {
      const progressHtml =
        progress !== undefined
          ? `<div class="progress-wrap"><div class="progress-bar" style="width:${Math.round(progress * 100)}%"></div></div>`
          : '';
      renderPanel(`<div class="state-msg">${escHtml(msg)}${progressHtml}</div>`);
    };

    const renderError = (msg: string, showRetry = false) => {
      const btn = showRetry
        ? `<button class="retry-btn" id="yt-pro-summarize-retry">Try again</button>`
        : '';
      renderPanel(`<div class="state-msg">${escHtml(msg)}${btn}</div>`);
      if (showRetry) {
        getPanel()?.querySelector('#yt-pro-summarize-retry')?.addEventListener('click', () => {
          void runSummary();
        });
      }
    };

    const escHtml = (s: string): string =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      );

    // ---- Core: fetch transcript + summarize ----
    const runSummary = async () => {
      if (isLoading) return;
      isLoading = true;

      try {
        // 1. Check AI availability.
        const avail: AIAvailability = await isSummarizerAvailable();
        if (avail === 'unavailable') {
          renderError(availabilityMessage('unavailable'));
          return;
        }

        // 2. Fetch transcript.
        renderLoading('Fetching transcript…');
        const segments = await fetchTranscript(10_000);
        if (!segments || segments.length === 0) {
          renderError('No transcript available for this video. AI summary requires captions.');
          return;
        }

        // 3. Format transcript text (no timestamps needed for summarization).
        const transcriptText = formatTranscriptForAI(segments, false);
        const chunks = chunkTranscript(transcriptText);
        const isMultiChunk = chunks.length > 1;

        // 4. Create summarizer (with download progress if needed).
        renderLoading(
          avail === 'available' ? 'Summarizing…' : 'Downloading AI model…',
          avail === 'available' ? undefined : 0,
        );

        summarizerInstance?.destroy();
        summarizerInstance = null;

        const onProgress = (frac: number) => {
          if (isOpen) renderLoading('Downloading AI model…', frac);
        };

        summarizerInstance = await createSummarizer(
          { type: 'key-points', format: 'markdown', length: 'medium' },
          avail !== 'available' ? onProgress : undefined,
        );

        // 5. Summarize — chunked if needed.
        let finalSummary: string;

        if (!isMultiChunk) {
          renderLoading('Summarizing…');
          finalSummary = await summarizerInstance.summarize(chunks[0]);
        } else {
          // Multi-chunk: summarize each chunk, then summarize the summaries.
          const chunkSummaries: string[] = [];
          for (let i = 0; i < chunks.length; i++) {
            renderLoading(`Summarizing part ${i + 1} of ${chunks.length}…`);
            const chunkSummary = await summarizerInstance.summarize(chunks[i]);
            chunkSummaries.push(chunkSummary);
          }
          renderLoading('Combining summaries…');
          const combined = chunkSummaries
            .map((s, i) => `Part ${i + 1}:\n${s}`)
            .join('\n\n');
          finalSummary = await summarizerInstance.summarize(combined);
        }

        // 6. Render the summary.
        const summaryHtml = markdownToHtml(finalSummary);
        const chunkNote = isMultiChunk
          ? `<div class="chunk-label">Summarized from ${chunks.length} transcript sections</div>`
          : '';
        renderPanel(`${chunkNote}<div class="summary">${summaryHtml}</div>`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred';
        renderError(`Failed to summarize: ${msg}`, true);
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
      await runSummary();
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
      // Destroy old summarizer session; new video → new summary on next open.
      summarizerInstance?.destroy();
      summarizerInstance = null;
      injectToggle();
    });

    injectToggle();

    // ---- Teardown ----
    return () => {
      offChange();
      offNav();
      close();
      summarizerInstance?.destroy();
      summarizerInstance = null;
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
