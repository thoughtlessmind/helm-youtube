/**
 * video-notes — attach a free-text personal note to any YouTube video.
 *
 * Injects a floating shadow-DOM panel anchored to the bottom-right corner
 * of the viewport. The panel is a circular toggle button that expands into
 * a resizable textarea. A filled-dot indicator on the toggle signals that
 * the current video already has a saved note. Notes auto-save 400ms after
 * the last keystroke; a pending write is flushed synchronously on teardown
 * so the last edit is never lost.
 *
 * Storage shape:  `local:ytpro:video-notes`  →  Record<videoId, string>
 * FeatureConfig:  none
 * Permissions:    none new
 * Catalog:        Notes & Tags / "Video Notes"
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { getVideoId, isWatchPage } from '../lib/yt/video';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOST_ID = 'yt-pro-video-notes-host';
const STORAGE_KEY = 'local:ytpro:video-notes' as const;
const DEBOUNCE_MS = 400;
/** Above most YouTube UI. */
const Z_INDEX = 2147483640;

// ─── CSS (scoped inside shadow root) ─────────────────────────────────────────

const SHADOW_CSS = `
  :host {
    all: initial;
    font-family: "YouTube Sans", Roboto, system-ui, sans-serif;
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: inherit; }

  .toggle {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: var(--yt-spec-call-to-action, #065fd4);
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s, background 0.15s;
    flex-shrink: 0;
    user-select: none;
  }
  .toggle:hover { transform: scale(1.08); }
  .toggle:active { transform: scale(0.96); }

  .toggle[aria-expanded="true"] {
    background: var(--yt-spec-text-secondary, #606060);
  }

  /* Filled dot indicator: note exists for this video */
  .has-note::after {
    content: '';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #f90;
    border: 2px solid #fff;
  }

  .panel {
    background: var(--yt-spec-base-background, #fff);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    width: 320px;
    overflow: hidden;
    transition: opacity 0.15s, transform 0.15s;
    transform-origin: bottom right;
  }
  .panel[hidden] {
    display: none;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    font-size: 12px;
    font-weight: 600;
    color: var(--yt-spec-text-secondary, #606060);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    user-select: none;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 16px;
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
    transition: background 0.15s;
  }
  .close-btn:hover { background: rgba(0,0,0,0.07); }

  .textarea {
    width: 100%;
    min-height: 160px;
    max-height: 400px;
    border: none;
    outline: none;
    resize: vertical;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.55;
    color: var(--yt-spec-text-primary, #0f0f0f);
    background: transparent;
  }

  .panel-footer {
    padding: 4px 12px 8px;
    font-size: 11px;
    color: var(--yt-spec-text-secondary, #909090);
    text-align: right;
    min-height: 20px;
  }

  /* Dark mode via attribute on <html> */
  :host-context(html[dark]) .panel,
  :host-context([dark]) .panel {
    background: #212121;
    border-color: rgba(255,255,255,0.1);
  }
  :host-context(html[dark]) .textarea,
  :host-context([dark]) .textarea {
    color: #f1f1f1;
  }
  :host-context(html[dark]) .panel-header,
  :host-context([dark]) .panel-header {
    border-color: rgba(255,255,255,0.08);
    color: #aaa;
  }
  :host-context(html[dark]) .close-btn:hover,
  :host-context([dark]) .close-btn:hover {
    background: rgba(255,255,255,0.08);
  }
`;

// ─── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'video-notes',

  setup(ctx) {
    // In-memory cache of the full notes dict.
    let noteCache: Record<string, string> = {};
    let currentVideoId: string | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isOpen = false;

    // DOM handles.
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let toggleBtn: HTMLButtonElement | null = null;
    let panelEl: HTMLDivElement | null = null;
    let textareaEl: HTMLTextAreaElement | null = null;
    let footerEl: HTMLDivElement | null = null;

    const teardowns: Array<() => void> = [];

    // ── Storage ─────────────────────────────────────────────────────────────

    const loadCache = async () => {
      noteCache = (await storage.getItem<Record<string, string>>(STORAGE_KEY)) ?? {};
    };

    const flushWrite = (vid: string, text: string) => {
      noteCache[vid] = text;
      if (!text.trim()) delete noteCache[vid];
      void storage.setItem(STORAGE_KEY, noteCache);
    };

    /** Debounced save — call on every textarea input event. */
    const scheduleSave = (vid: string, text: string) => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        flushWrite(vid, text);
        updateFooter('Saved');
      }, DEBOUNCE_MS);
    };

    /** Force-write any pending changes immediately (called on teardown + nav). */
    const flushPending = () => {
      if (debounceTimer !== null && currentVideoId && textareaEl) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        flushWrite(currentVideoId, textareaEl.value);
      }
    };

    // ── UI helpers ───────────────────────────────────────────────────────────

    const updateFooter = (msg: string) => {
      if (!footerEl) return;
      footerEl.textContent = msg;
      setTimeout(() => {
        if (footerEl) footerEl.textContent = '';
      }, 1500);
    };

    const refreshToggleIndicator = () => {
      if (!toggleBtn) return;
      const hasNote = !!(currentVideoId && (noteCache[currentVideoId] ?? '').trim());
      toggleBtn.classList.toggle('has-note', hasNote);
      toggleBtn.setAttribute(
        'title',
        hasNote ? 'Video note (saved)' : 'Video note',
      );
    };

    const openPanel = () => {
      if (!panelEl || !toggleBtn) return;
      isOpen = true;
      panelEl.removeAttribute('hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
      textareaEl?.focus();
    };

    const closePanel = () => {
      if (!panelEl || !toggleBtn) return;
      flushPending();
      isOpen = false;
      panelEl.setAttribute('hidden', '');
      toggleBtn.setAttribute('aria-expanded', 'false');
    };

    // ── Build shadow DOM (once) ───────────────────────────────────────────────

    const buildUI = () => {
      host = document.createElement('div');
      host.id = HOST_ID;
      Object.assign(host.style, {
        position: 'fixed',
        bottom: '140px',
        right: '20px',
        zIndex: String(Z_INDEX),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        pointerEvents: 'none',
      } as Partial<CSSStyleDeclaration>);

      shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = SHADOW_CSS;
      shadow.appendChild(style);

      // Panel (starts hidden).
      panelEl = document.createElement('div');
      panelEl.className = 'panel';
      panelEl.setAttribute('hidden', '');
      panelEl.style.pointerEvents = 'auto';

      const header = document.createElement('div');
      header.className = 'panel-header';
      header.textContent = 'Video Note';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close';
      closeBtn.setAttribute('aria-label', 'Close notes panel');
      closeBtn.addEventListener('click', () => closePanel());
      header.appendChild(closeBtn);

      textareaEl = document.createElement('textarea');
      textareaEl.className = 'textarea';
      textareaEl.placeholder = 'Add a note for this video…';
      textareaEl.setAttribute('aria-label', 'Video note');
      // Prevent page-level key handlers from firing inside the textarea.
      textareaEl.addEventListener('keydown', (e) => e.stopPropagation());
      textareaEl.addEventListener('keyup', (e) => e.stopPropagation());
      textareaEl.addEventListener('keypress', (e) => e.stopPropagation());
      textareaEl.addEventListener('input', () => {
        if (currentVideoId) scheduleSave(currentVideoId, textareaEl!.value);
      });

      footerEl = document.createElement('div');
      footerEl.className = 'panel-footer';

      panelEl.appendChild(header);
      panelEl.appendChild(textareaEl);
      panelEl.appendChild(footerEl);

      // Toggle button.
      toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle';
      toggleBtn.setAttribute('aria-label', 'Video note');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.title = 'Video note';
      toggleBtn.style.pointerEvents = 'auto';
      toggleBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>`;
      toggleBtn.addEventListener('click', () => {
        if (isOpen) closePanel(); else openPanel();
      });

      shadow.appendChild(panelEl);
      shadow.appendChild(toggleBtn);

      document.body.appendChild(host);
    };

    // ── Load note for current video ───────────────────────────────────────────

    const loadCurrentNote = () => {
      if (!textareaEl) return;
      const text = (currentVideoId ? noteCache[currentVideoId] : '') ?? '';
      textareaEl.value = text;
      refreshToggleIndicator();
      if (footerEl) footerEl.textContent = '';
    };

    // ── Show / hide based on page type ───────────────────────────────────────

    const syncVisibility = () => {
      if (!host) return;
      host.style.display = isWatchPage() ? 'flex' : 'none';
    };

    // ── Bootstrap ────────────────────────────────────────────────────────────

    void (async () => {
      await loadCache();

      buildUI();

      currentVideoId = getVideoId();
      loadCurrentNote();
      syncVisibility();

      // Watch for storage updates from other tabs.
      teardowns.push(
        storage.watch<Record<string, string>>(STORAGE_KEY, (v) => {
          if (v) noteCache = v;
          // Refresh indicator; don't overwrite textarea if user is actively typing.
          refreshToggleIndicator();
        }),
      );

      // React to SPA navigation.
      teardowns.push(
        ctx.navigation.onNavigate(() => {
          flushPending();
          if (isOpen) closePanel();
          currentVideoId = getVideoId();
          loadCurrentNote();
          syncVisibility();
        }),
      );
    })();

    // ── Teardown ─────────────────────────────────────────────────────────────

    return () => {
      flushPending();
      teardowns.forEach((off) => off());
      host?.remove();
      host = null;
      shadow = null;
      toggleBtn = null;
      panelEl = null;
      textareaEl = null;
      footerEl = null;
    };
  },
};

export default feature;
