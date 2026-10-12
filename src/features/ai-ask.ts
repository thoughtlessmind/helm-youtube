/**
 * ai-ask — on-device AI chat panel for asking questions about the video.
 *
 * UX:
 *   - A floating button opens a shadow-DOM chat panel.
 *   - On open: fetches the video transcript, seeds a LanguageModel session
 *     with it via `initialPrompts` (system message), and awaits user questions.
 *   - User types questions in a textarea; answers stream into the panel in
 *     real time via `session.promptStreaming()`.
 *   - The model is instructed to cite transcript timestamps as `[m:ss]`.
 *     Once a streamed answer finishes, those citations are rendered as
 *     clickable spans that seek the `<video>` element.
 *   - Streaming chunk handling: Chrome's Prompt API may return cumulative
 *     text (each chunk is the full response so far) or incremental deltas.
 *     We always use the latest yielded value as the display text — this works
 *     for cumulative (which is the common case) and shows the last delta for
 *     delta-mode builds. After the stream settles the full text is final.
 *   - Chat history is kept in the panel (within one navigation session).
 *   - On navigation: session is destroyed, panel is reset for the new video.
 *   - All UI in shadow DOM.
 *
 * Manifest permissions: none.
 *
 * Suggested catalog: section "AI (on-device)", label "Ask AI",
 *   desc "Ask questions about the current video using on-device AI."
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

const HOST_ID = 'yt-pro-ai-ask-host';
const TOGGLE_ID = 'yt-pro-ai-ask-toggle-host';
const PANEL_WIDTH = 400;

// Maximum number of transcript chars to include in the session seed.
// We take the first chunk(s) that fit to keep the system prompt manageable.
const MAX_SEED_CHARS = 10_000;

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const TOGGLE_CSS = `
  :host { all: initial; }
  button {
    position: fixed;
    bottom: 440px;
    right: 20px;
    z-index: 2147483646;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: #6a1b9a;
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
  button:hover { background: #4a148c; transform: scale(1.07); }
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
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .message {
    display: flex;
    flex-direction: column;
    max-width: 100%;
  }
  .message.user .bubble {
    background: #6a1b9a;
    color: #fff;
    border-radius: 16px 16px 4px 16px;
    align-self: flex-end;
  }
  .message.assistant .bubble {
    background: var(--yt-spec-general-background-a, #f2f2f2);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border-radius: 16px 16px 16px 4px;
    align-self: flex-start;
  }
  .bubble {
    padding: 8px 12px;
    line-height: 1.5;
    font-size: 13px;
    max-width: 90%;
    word-break: break-word;
  }
  .bubble.streaming::after {
    content: "▍";
    animation: blink 0.8s step-start infinite;
    margin-left: 2px;
    opacity: 0.7;
  }
  @keyframes blink {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 0; }
  }
  /* Timestamp citation links */
  .ts-cite {
    color: #6a1b9a;
    font-weight: 700;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    font-family: monospace;
    font-size: 12px;
  }
  .ts-cite:hover { color: #4a148c; }
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    flex-shrink: 0;
    background: var(--yt-spec-menu-background, #fff);
  }
  textarea {
    flex: 1;
    resize: none;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 20px;
    padding: 8px 12px;
    font-size: 13px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    outline: none;
    font-family: inherit;
    line-height: 1.45;
    max-height: 96px;
    min-height: 36px;
    overflow-y: auto;
  }
  textarea:focus { border-color: #6a1b9a; }
  textarea:disabled { opacity: 0.5; }
  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #6a1b9a;
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .send-btn:hover { background: #4a148c; }
  .send-btn:disabled { background: #bbb; cursor: not-allowed; }
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
    background: #6a1b9a;
    border-radius: 2px;
    width: 0%;
    transition: width 0.3s;
  }
  .seed-note {
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #606060);
    text-align: center;
    padding: 4px 12px 0;
    font-style: italic;
  }
`;

// ---------------------------------------------------------------------------
// Timestamp citation rendering
// ---------------------------------------------------------------------------

/**
 * Regex that matches `[m:ss]`, `[mm:ss]`, or `[h:mm:ss]` citation patterns
 * embedded in model output text. Gemini Nano often markdown-escapes the
 * brackets (`\[0:06\]`), so the backslashes are swallowed too.
 */
const TS_CITE_RE = /\\?\[(\d{1,2}:\d{2}(?::\d{2})?)\\?\]/g;

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );

/**
 * Parse a `m:ss` or `mm:ss` or `h:mm:ss` string into seconds.
 */
function parseTsToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

/**
 * Convert plain assistant text into safe HTML, replacing `[m:ss]` patterns
 * with clickable `<span class="ts-cite">` elements.
 *
 * Also converts newlines to `<br>` for multi-paragraph answers.
 */
function renderAssistantText(text: string): string {
  // Escape first so we don't accidentally create tags.
  const escaped = escHtml(text);
  // Replace citation patterns.
  const withLinks = escaped.replace(TS_CITE_RE, (_, ts) => {
    const secs = parseTsToSeconds(ts);
    return `<span class="ts-cite" data-seconds="${secs}" role="button" tabindex="0" aria-label="Jump to ${ts}">[${escHtml(ts)}]</span>`;
  });
  // Basic line breaks.
  return withLinks.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Chat message types
// ---------------------------------------------------------------------------

type Role = 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  /** Final text content (used for rendering). */
  text: string;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'ai-ask',

  async setup(ctx) {
    // ---- State ----
    let isOpen = false;
    let isStreaming = false;
    let session: LanguageModelSession | null = null;
    let messages: ChatMessage[] = [];
    let seedTruncated = false;

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
      toggleBtn.title = 'Ask AI about this video';
      toggleBtn.setAttribute('aria-label', 'Open AI chat panel');
      toggleBtn.setAttribute('aria-pressed', 'false');
      // Chat bubble icon
      toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
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
      panel.setAttribute('aria-label', 'Ask AI about this video');
      panelShadow.appendChild(panel);

      document.body.appendChild(panelHost);
    };

    const getPanel = (): HTMLElement | null =>
      panelShadow?.querySelector('.panel') ?? null;

    // ---- Panel rendering ----

    /** Render a status/loading state (replaces panel content). */
    const renderStatus = (msg: string, progress?: number) => {
      const panel = getPanel();
      if (!panel) return;
      const progressHtml =
        progress !== undefined
          ? `<div class="progress-wrap"><div class="progress-bar" style="width:${Math.round(progress * 100)}%"></div></div>`
          : '';
      panel.innerHTML = `
        <div class="header">
          <span class="title">💬 Ask AI</span>
          <button class="close-btn" aria-label="Close AI chat panel">×</button>
        </div>
        <div class="messages"><div class="state-msg">${escHtml(msg)}${progressHtml}</div></div>
        <div class="input-row">
          <textarea placeholder="Ask a question about this video…" disabled></textarea>
          <button class="send-btn" disabled aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      `;
      panel.querySelector('.close-btn')?.addEventListener('click', () => close());
    };

    /** Full re-render of the chat UI with current messages. */
    const renderChat = (streamingBubble?: HTMLElement) => {
      const panel = getPanel();
      if (!panel) return;

      const msgHtml = messages
        .map((m) => {
          const bubbleContent =
            m.role === 'assistant'
              ? `<p>${renderAssistantText(m.text)}</p>`
              : escHtml(m.text).replace(/\n/g, '<br>');
          return `<div class="message ${m.role}"><div class="bubble">${bubbleContent}</div></div>`;
        })
        .join('');

      const seedNote = seedTruncated
        ? `<div class="seed-note">Transcript was trimmed to fit on-device AI memory.</div>`
        : '';

      panel.innerHTML = `
        <div class="header">
          <span class="title">💬 Ask AI</span>
          <button class="close-btn" aria-label="Close AI chat panel">×</button>
        </div>
        ${seedNote}
        <div class="messages">${msgHtml}</div>
        <div class="input-row">
          <textarea placeholder="Ask a question about this video…" ${isStreaming ? 'disabled' : ''} aria-label="Your question"></textarea>
          <button class="send-btn" ${isStreaming ? 'disabled' : ''} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      `;

      panel.querySelector('.close-btn')?.addEventListener('click', () => close());
      wireInputRow(panel);

      // Scroll to bottom.
      const msgContainer = panel.querySelector<HTMLElement>('.messages');
      if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

      // Return the last assistant bubble if streaming.
      if (streamingBubble) {
        const bubbles = panel.querySelectorAll<HTMLElement>('.message.assistant .bubble');
        return bubbles[bubbles.length - 1] ?? null;
      }
      return null;
    };

    /** Wire citation clicks and keyboard seek in the panel. */
    const wireCitations = (panel: HTMLElement) => {
      panel.querySelectorAll<HTMLElement>('.ts-cite').forEach((span) => {
        const handler = () => {
          const secs = Number(span.dataset.seconds ?? 0);
          seekTo(secs);
        };
        span.addEventListener('click', handler);
        span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
        });
      });
    };

    /** Wire the textarea + send button. */
    const wireInputRow = (panel: HTMLElement) => {
      const textarea = panel.querySelector<HTMLTextAreaElement>('textarea');
      const sendBtn = panel.querySelector<HTMLButtonElement>('.send-btn');
      if (!textarea || !sendBtn) return;

      // Stop keyboard events from leaking to YouTube.
      textarea.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void sendMessage(textarea.value.trim());
        }
      });

      sendBtn.addEventListener('click', () => {
        void sendMessage(textarea.value.trim());
      });
    };

    const getVideo = (): HTMLVideoElement | null =>
      document.querySelector<HTMLVideoElement>('video.html5-main-video');

    const seekTo = (seconds: number) => {
      const v = getVideo();
      if (v) v.currentTime = seconds;
    };

    // ---- Session setup ----

    /**
     * System message content seeded into the LanguageModel session.
     * The transcript is embedded so the model has video context throughout
     * the conversation without needing it repeated in each prompt.
     */
    const buildSystemPrompt = (transcriptText: string): string => `You are a helpful assistant answering questions about a YouTube video.

The video transcript (with timestamps) is provided below. Use it to answer questions accurately.

When referring to specific moments in the video, cite the timestamp in the format [m:ss] (e.g. [3:42]).
Only cite timestamps that appear in the transcript. Make citations clickable by using the exact format.
Keep answers concise and focused.

TRANSCRIPT:
${transcriptText}`;

    const initSession = async (onProgress?: (f: number) => void) => {
      const avail: AIAvailability = await isPromptAvailable();
      if (avail === 'unavailable') {
        renderStatus(availabilityMessage('unavailable'));
        return false;
      }

      renderStatus('Fetching transcript…');
      const segments = await fetchTranscript(10_000);

      let transcriptText: string;
      seedTruncated = false;

      if (!segments || segments.length === 0) {
        // No transcript — still allow chat, just without video context.
        transcriptText = '(No transcript available for this video.)';
      } else {
        const full = formatTranscriptForAI(segments, true);
        const chunks = chunkTranscript(full);
        // Fit up to MAX_SEED_CHARS into the system prompt.
        let seedText = '';
        for (const chunk of chunks) {
          if (seedText.length + chunk.length > MAX_SEED_CHARS) {
            seedTruncated = true;
            break;
          }
          seedText += chunk + '\n';
        }
        transcriptText = seedText.trim() || full.slice(0, MAX_SEED_CHARS);
        if (full.length > MAX_SEED_CHARS) seedTruncated = true;
      }

      renderStatus(
        avail === 'available' ? 'Preparing AI…' : 'Downloading AI model…',
        avail === 'available' ? undefined : 0,
      );

      session?.destroy();
      session = null;

      session = await createPromptSession(
        {
          initialPrompts: [
            { role: 'system', content: buildSystemPrompt(transcriptText) },
          ],
        },
        avail !== 'available' ? onProgress : undefined,
      );

      messages = [];
      return true;
    };

    // ---- Sending a message ----

    const sendMessage = async (text: string) => {
      if (!text || isStreaming || !session) return;

      isStreaming = true;

      // Add user message.
      messages.push({ role: 'user', text });
      // Add a placeholder for the assistant.
      messages.push({ role: 'assistant', text: '' });
      const assistantIdx = messages.length - 1;

      renderChat();

      // Find the last assistant bubble for live streaming updates.
      const panel = getPanel();
      let streamBubble: HTMLElement | null = null;
      if (panel) {
        const bubbles = panel.querySelectorAll<HTMLElement>('.message.assistant .bubble');
        streamBubble = bubbles[bubbles.length - 1] ?? null;
        if (streamBubble) streamBubble.classList.add('streaming');
      }

      // Clear the textarea.
      const textarea = panel?.querySelector<HTMLTextAreaElement>('textarea');
      if (textarea) textarea.value = '';

      try {
        const stream = session.promptStreaming(text);

        // Chrome's Prompt API may return cumulative text (each chunk is the
        // full response so far) or incremental deltas (each chunk is only
        // new characters). We handle both:
        //   - Cumulative: each new chunk starts with the previous chunk's text
        //     → just replace `accumulated` with the latest chunk.
        //   - Delta: each chunk is new text only → append to `accumulated`.
        // Detection heuristic: if the new chunk starts with the previous chunk
        // it's cumulative; otherwise it's a delta.
        let accumulated = '';
        let prevChunk = '';

        for await (const chunk of stream) {
          if (chunk.startsWith(prevChunk) && chunk.length >= prevChunk.length) {
            // Cumulative mode — latest chunk IS the full text so far.
            accumulated = chunk;
          } else {
            // Delta mode — append the new fragment.
            accumulated += chunk;
          }
          prevChunk = chunk;

          messages[assistantIdx].text = accumulated;

          // Update the streaming bubble in place without a full re-render.
          if (streamBubble) {
            streamBubble.innerHTML = `<p>${renderAssistantText(accumulated)}</p>`;
          }

          // Auto-scroll.
          const msgContainer = panel?.querySelector<HTMLElement>('.messages');
          if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
        }

        // Stream complete — do a full re-render to wire citation clicks properly.
        messages[assistantIdx].text = accumulated;

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error getting response';
        messages[assistantIdx].text = `⚠️ ${msg}`;
      } finally {
        isStreaming = false;
        // Full re-render to restore input, wire citations, and remove streaming cursor.
        renderChat();
        const finalPanel = getPanel();
        if (finalPanel) wireCitations(finalPanel);
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

      const onProgress = (frac: number) => {
        if (isOpen) renderStatus('Downloading AI model…', frac);
      };

      const ok = await initSession(onProgress);
      if (!ok) return;
      renderChat();
    };

    const close = () => {
      isOpen = false;
      isStreaming = false;
      if (panelHost) panelHost.style.display = 'none';
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
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
      // Destroy the session — new video needs a new transcript seed.
      session?.destroy();
      session = null;
      messages = [];
      seedTruncated = false;
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
      messages = [];
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
