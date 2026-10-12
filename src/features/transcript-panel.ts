/**
 * transcript-panel — floating side panel showing the current video's
 * transcript as a clickable, searchable, auto-scrolling list.
 *
 * UX:
 *   - A floating toggle button (bottom-right of the viewport) opens/closes
 *     the panel. Keyboard shortcut: `T`.
 *   - Each line shows its timestamp + text; clicking seeks the video.
 *   - While the video plays, the current line is highlighted and the panel
 *     auto-scrolls to keep it visible.
 *   - A search/filter input at the top of the panel narrows the visible
 *     lines (case-insensitive substring match).
 *   - "No transcript available" message shown when fetchTranscript() returns
 *     null.
 *   - Panel and toggle button are removed on teardown / navigation.
 *
 * Shadow DOM isolation:
 *   All injected UI lives inside a shadow root attached to a host `<div>`
 *   appended to `<body>`, so YouTube's stylesheets cannot leak in.
 *
 * Keyboard key chosen: `T` — not in the reserved list for this extension
 * (Y S W [ ] \ P Q) and not a YouTube native shortcut.
 */

import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { isWatchPage } from '../lib/yt/video';
import { fetchTranscript, formatTimestamp, type TranscriptSegment } from '../lib/yt/transcript';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOST_ID = 'yt-pro-transcript-panel-host';
const TOGGLE_ID = 'yt-pro-transcript-toggle-host';
const PANEL_WIDTH = 360;

// ---------------------------------------------------------------------------
// CSS (injected into shadow roots)
// ---------------------------------------------------------------------------

const TOGGLE_CSS = `
  :host { all: initial; }
  button {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 2147483646;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: #c00;
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
  button:hover { background: #a00; transform: scale(1.07); }
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
  .search-wrap {
    padding: 8px 14px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.06));
  }
  .search {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 20px;
    font-size: 12px;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    outline: none;
  }
  .search:focus { border-color: #c00; }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .segment {
    display: flex;
    gap: 10px;
    padding: 7px 14px;
    cursor: pointer;
    border-radius: 0;
    align-items: flex-start;
    transition: background 0.1s;
  }
  .segment:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05)); }
  .segment.active {
    background: rgba(204,0,0,0.08);
    border-left: 3px solid #c00;
    padding-left: 11px;
  }
  .ts {
    font-size: 11px;
    color: #c00;
    font-weight: 600;
    flex-shrink: 0;
    padding-top: 1px;
    min-width: 36px;
    font-family: monospace;
  }
  .tx { line-height: 1.45; }
  .tx mark {
    background: rgba(204,0,0,0.18);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
  .empty {
    padding: 32px 20px;
    text-align: center;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
    line-height: 1.6;
  }
  .loading {
    padding: 32px 20px;
    text-align: center;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 13px;
  }
`;

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'transcript-panel',

  setup(ctx) {
    // ---- State ----
    let segments: TranscriptSegment[] = [];
    let isOpen = false;
    let query = '';
    let activeIdx = -1;
    let animFrameId = 0;

    // ---- Host elements ----
    let toggleHost: HTMLDivElement | null = null;
    let toggleShadow: ShadowRoot | null = null;
    let toggleBtn: HTMLButtonElement | null = null;

    let panelHost: HTMLDivElement | null = null;
    let panelShadow: ShadowRoot | null = null;

    // ---- Build toggle button ----
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
      toggleBtn.title = 'Toggle transcript panel (T)';
      toggleBtn.setAttribute('aria-label', 'Toggle transcript panel');
      toggleBtn.setAttribute('aria-pressed', 'false');
      // Transcript icon (simplified "lines" SVG)
      toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M4 6h16v2H4zm0 4h16v2H4zm0 4h12v2H4z"/>
      </svg>`;
      toggleBtn.addEventListener('click', () => toggle());
      toggleShadow.appendChild(toggleBtn);

      document.body.appendChild(toggleHost);
    };

    // ---- Build panel ----
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
      panel.setAttribute('aria-label', 'Video transcript');
      panelShadow.appendChild(panel);

      document.body.appendChild(panelHost);
    };

    // ---- Render helpers ----
    const getPanel = (): HTMLElement | null =>
      panelShadow?.querySelector('.panel') ?? null;

    const escHtml = (s: string): string =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      );

    /**
     * Highlight `query` inside `text` with <mark> tags.
     * Safe — escapes HTML first, then injects tags around literal substring.
     */
    const highlightText = (text: string, q: string): string => {
      const escaped = escHtml(text);
      if (!q) return escaped;
      const idx = escaped.toLowerCase().indexOf(q.toLowerCase());
      if (idx === -1) return escaped;
      return (
        escaped.slice(0, idx) +
        '<mark>' +
        escaped.slice(idx, idx + q.length) +
        '</mark>' +
        escaped.slice(idx + q.length)
      );
    };

    const renderList = (loading = false) => {
      const panel = getPanel();
      if (!panel) return;

      if (loading) {
        panel.innerHTML = `
          <div class="header">
            <span class="title">Transcript</span>
            <button class="close-btn" aria-label="Close transcript panel">×</button>
          </div>
          <div class="loading">Loading transcript…</div>
        `;
        panel.querySelector('.close-btn')?.addEventListener('click', () => close());
        return;
      }

      const filtered = query
        ? segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()))
        : segments;

      const listHTML = filtered.length
        ? filtered
            .map((seg, i) => {
              // Find the original index for active-line tracking.
              const origIdx = segments.indexOf(seg);
              const isActive = origIdx === activeIdx;
              return `<div class="segment${isActive ? ' active' : ''}" data-start="${seg.start}" data-idx="${origIdx}" role="button" tabindex="0" aria-label="Jump to ${formatTimestamp(seg.start)}">
                  <span class="ts">${escHtml(formatTimestamp(seg.start))}</span>
                  <span class="tx">${highlightText(seg.text, query)}</span>
                </div>`;
            })
            .join('')
        : segments.length
          ? `<div class="empty">No lines match "<strong>${escHtml(query)}</strong>"</div>`
          : `<div class="empty">No transcript available for this video.</div>`;

      panel.innerHTML = `
        <div class="header">
          <span class="title">Transcript</span>
          <button class="close-btn" aria-label="Close transcript panel">×</button>
        </div>
        <div class="search-wrap">
          <input class="search" type="search" placeholder="Filter transcript…" value="${escHtml(query)}" aria-label="Filter transcript lines" />
        </div>
        <div class="list" role="list">${listHTML}</div>
      `;

      // Wire events.
      panel.querySelector('.close-btn')?.addEventListener('click', () => close());

      const searchInput = panel.querySelector<HTMLInputElement>('.search');
      searchInput?.addEventListener('input', (e) => {
        query = (e.target as HTMLInputElement).value;
        renderList();
      });
      // Stop keyboard events from leaking to YouTube (would trigger YT shortcuts).
      searchInput?.addEventListener('keydown', (e) => e.stopPropagation());

      panel.querySelectorAll<HTMLElement>('.segment').forEach((el) => {
        el.addEventListener('click', () => seekTo(Number(el.dataset.start ?? 0)));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') seekTo(Number(el.dataset.start ?? 0));
        });
      });

      // Scroll active line into view.
      if (activeIdx >= 0) {
        const activeEl = panel.querySelector<HTMLElement>('.segment.active');
        activeEl?.scrollIntoView({ block: 'nearest' });
      }
    };

    // ---- Playback position tracking ----
    const getVideo = (): HTMLVideoElement | null =>
      document.querySelector<HTMLVideoElement>('video.html5-main-video');

    const seekTo = (seconds: number) => {
      const v = getVideo();
      if (v) v.currentTime = seconds;
    };

    /**
     * Find the index of the segment that corresponds to the current playback
     * time. We pick the last segment whose start ≤ currentTime.
     */
    const findActiveIndex = (currentTime: number): number => {
      let idx = -1;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].start <= currentTime) idx = i;
        else break;
      }
      return idx;
    };

    const tickHighlight = () => {
      if (!isOpen) return;
      const v = getVideo();
      if (v) {
        const next = findActiveIndex(v.currentTime);
        if (next !== activeIdx) {
          activeIdx = next;
          renderList();
        }
      }
      animFrameId = requestAnimationFrame(tickHighlight);
    };

    // ---- Load transcript ----
    const loadTranscript = async () => {
      if (!isWatchPage()) return;

      ensurePanel();
      renderList(/* loading= */ true);

      const result = await fetchTranscript(8000);
      segments = result ?? [];
      activeIdx = -1;
      renderList();
    };

    // ---- Open / close ----
    const open = async () => {
      if (!isWatchPage()) {
        flashToast('Open a video first');
        return;
      }
      isOpen = true;
      ensurePanel();
      if (panelHost) panelHost.style.display = 'block';
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'true');
      await loadTranscript();
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(tickHighlight);
    };

    const close = () => {
      isOpen = false;
      if (panelHost) panelHost.style.display = 'none';
      if (toggleBtn) toggleBtn.setAttribute('aria-pressed', 'false');
      cancelAnimationFrame(animFrameId);
    };

    const toggle = () => (isOpen ? close() : open());

    // ---- Keyboard shortcut ----
    const offKey = onKey('t', () => toggle());

    // ---- Inject toggle button ----
    const injectToggle = () => {
      if (!isWatchPage()) return;
      createToggle();
    };

    // Re-inject if YouTube re-renders the page chrome.
    const offChange = ctx.observer.onChange(() => injectToggle());

    // On SPA navigation: close panel, clear transcript, re-inject toggle.
    const offNav = ctx.navigation.onNavigate(() => {
      close();
      segments = [];
      query = '';
      activeIdx = -1;
      injectToggle();
    });

    injectToggle();

    // ---- Teardown ----
    return () => {
      offKey();
      offChange();
      offNav();
      cancelAnimationFrame(animFrameId);
      close();
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
