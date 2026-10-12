/**
 * Compare Videos — Feature: `compare-videos`
 *
 * Full-viewport overlay with two YouTube embed players side-by-side.
 * A synced-playback control bar issues IFrame API commands to both
 * players simultaneously:
 *
 *   Play Both   — playVideo
 *   Pause Both  — pauseVideo
 *   Restart Both — seekTo(0) + playVideo
 *   Sync (align to left) — read left player's current time, seekTo on right
 *
 * Each side has a URL/id input. Great for tutorial / sports / music
 * comparison.
 *
 * Keyboard shortcut: `V` (mnemonic: Versus / Compare)
 * Masthead button:   "⇔ Compare" — injected in masthead buttons container
 *
 * IFrame API postMessage format: see ../lib/yt/embed.ts
 */

import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { parseVideoId, buildEmbedUrl, iframeCmd } from '../lib/yt/embed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BTN_ID = 'yt-pro-cmp-btn';
const HOST_ID = 'yt-pro-cmp-host';

const MASTHEAD_SELECTORS = [
  'ytd-masthead #buttons',
  '#masthead #buttons',
  'ytd-masthead #end',
] as const;

// ---------------------------------------------------------------------------
// CSS (scoped inside shadow DOM)
// ---------------------------------------------------------------------------

const OVERLAY_CSS = `
*, *::before, *::after { box-sizing: border-box; }

:host {
  all: initial;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
  color: #f1f1f1;
}

/* ---- Top toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #111;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f1f1;
  margin-right: 4px;
}

/* ---- Sync control bar ---- */
.sync-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  background: #181818;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.ctrl-btn {
  padding: 6px 14px;
  background: #222;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f1f1f1;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms;
  white-space: nowrap;
}
.ctrl-btn:hover { background: #333; border-color: #777; }
.ctrl-btn.primary { background: #ff0000; border-color: #ff0000; }
.ctrl-btn.primary:hover { background: #cc0000; border-color: #cc0000; }

.ctrl-sep {
  width: 1px;
  height: 22px;
  background: #333;
  flex-shrink: 0;
}

.close-btn {
  padding: 4px 12px;
  border: 1px solid #555;
  background: transparent;
  color: #ccc;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms;
  white-space: nowrap;
}
.close-btn:hover { background: #333; color: #fff; border-color: #888; }

/* ---- Main split area ---- */
.players-row {
  flex: 1;
  display: flex;
  gap: 4px;
  padding: 4px;
  min-height: 0;
}

.player-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid #2a2a2a;
  min-width: 0;
}

.pane-label {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  background: #111;
  color: #888;
  flex-shrink: 0;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pane-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.85);
  flex-shrink: 0;
}

.url-input {
  flex: 1;
  padding: 4px 8px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f1f1f1;
  font-size: 12px;
  outline: none;
  min-width: 0;
}
.url-input::placeholder { color: #666; }
.url-input:focus { border-color: #ff0000; }

.load-btn {
  padding: 4px 10px;
  background: #ff0000;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 120ms;
}
.load-btn:hover { background: #cc0000; }

.iframe-wrap {
  flex: 1;
  position: relative;
  min-height: 0;
}

iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 14px;
  pointer-events: none;
  text-align: center;
  padding: 16px;
}
`;

// ---------------------------------------------------------------------------
// Overlay builder
// ---------------------------------------------------------------------------

/**
 * Mounts the compare-videos overlay.
 * Returns a teardown that removes everything.
 */
function mountOverlay(onClose: () => void): {
  host: HTMLDivElement;
  teardown: () => void;
} {
  // ---- Shadow root -------------------------------------------------------
  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
  } as CSSStyleDeclaration);
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = OVERLAY_CSS;
  shadow.appendChild(styleEl);

  // ---- Backdrop ----------------------------------------------------------
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  shadow.appendChild(backdrop);

  // ---- Top toolbar (title + close) ----------------------------------------
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const title = document.createElement('span');
  title.className = 'toolbar-title';
  title.textContent = '⇔ Compare Videos';
  toolbar.appendChild(title);

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  toolbar.appendChild(spacer);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '✕ Close';
  closeBtn.addEventListener('click', onClose);
  toolbar.appendChild(closeBtn);
  backdrop.appendChild(toolbar);

  // ---- Sync control bar --------------------------------------------------
  const syncBar = document.createElement('div');
  syncBar.className = 'sync-bar';

  const makeCtrl = (label: string, primary = false): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.className = primary ? 'ctrl-btn primary' : 'ctrl-btn';
    btn.textContent = label;
    return btn;
  };

  const playBothBtn = makeCtrl('▶ Play Both', true);
  const pauseBothBtn = makeCtrl('⏸ Pause Both');
  const sep1 = document.createElement('div');
  sep1.className = 'ctrl-sep';
  const restartBtn = makeCtrl('⏮ Restart Both');
  const sep2 = document.createElement('div');
  sep2.className = 'ctrl-sep';
  const syncBtn = makeCtrl('⟳ Sync Right to Left');

  syncBar.appendChild(playBothBtn);
  syncBar.appendChild(pauseBothBtn);
  syncBar.appendChild(sep1);
  syncBar.appendChild(restartBtn);
  syncBar.appendChild(sep2);
  syncBar.appendChild(syncBtn);
  backdrop.appendChild(syncBar);

  // ---- Players row -------------------------------------------------------
  const playersRow = document.createElement('div');
  playersRow.className = 'players-row';
  backdrop.appendChild(playersRow);

  /** Build one player pane (left or right). */
  const buildPane = (
    labelText: string,
  ): { pane: HTMLDivElement; iframe: HTMLIFrameElement } => {
    const pane = document.createElement('div');
    pane.className = 'player-pane';

    // Label strip
    const label = document.createElement('div');
    label.className = 'pane-label';
    label.textContent = labelText;
    pane.appendChild(label);

    // URL toolbar
    const ptb = document.createElement('div');
    ptb.className = 'pane-toolbar';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'url-input';
    input.placeholder = 'Paste YouTube URL or video ID…';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'load-btn';
    loadBtn.textContent = 'Load';

    ptb.appendChild(input);
    ptb.appendChild(loadBtn);
    pane.appendChild(ptb);

    // Iframe area
    const wrap = document.createElement('div');
    wrap.className = 'iframe-wrap';

    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');

    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = 'Paste a URL above and click Load';

    wrap.appendChild(iframe);
    wrap.appendChild(placeholder);
    pane.appendChild(wrap);

    const doLoad = () => {
      const id = parseVideoId(input.value);
      if (!id) {
        flashToast('Could not parse video ID');
        return;
      }
      iframe.src = buildEmbedUrl(id);
      placeholder.remove();
      input.value = `https://www.youtube.com/watch?v=${id}`;
    };

    loadBtn.addEventListener('click', doLoad);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doLoad();
      }
    });

    return { pane, iframe };
  };

  const { pane: leftPane, iframe: leftIframe } = buildPane('A — Left');
  const { pane: rightPane, iframe: rightIframe } = buildPane('B — Right');
  playersRow.appendChild(leftPane);
  playersRow.appendChild(rightPane);

  // ---- Sync control handlers ---------------------------------------------

  playBothBtn.addEventListener('click', () => {
    iframeCmd(leftIframe, 'playVideo');
    iframeCmd(rightIframe, 'playVideo');
  });

  pauseBothBtn.addEventListener('click', () => {
    iframeCmd(leftIframe, 'pauseVideo');
    iframeCmd(rightIframe, 'pauseVideo');
  });

  restartBtn.addEventListener('click', () => {
    iframeCmd(leftIframe, 'seekTo', [0, true]);
    iframeCmd(rightIframe, 'seekTo', [0, true]);
    iframeCmd(leftIframe, 'playVideo');
    iframeCmd(rightIframe, 'playVideo');
  });

  /**
   * Sync right player to the left player's current time.
   *
   * The YouTube IFrame API doesn't expose a synchronous getCurrentTime via
   * postMessage, so we read the time from the left iframe's embed URL or
   * rely on the approach of posting a `getCurrentTime` event and handling
   * the reply. As a pragmatic fallback — since we cannot reliably read
   * state from the embed without full IFrame API JS initialization — we
   * expose a simple "sync both to 0 and play" behavior when no time is
   * available, or let the user set time via the Restart button.
   *
   * The more robust approach: we request `getCurrentTime` via postMessage
   * and listen for the API's `infoDelivery` response event once. This works
   * when `enablejsapi=1` is set and the iframe has loaded.
   */
  syncBtn.addEventListener('click', () => {
    // Listen for time info from the left iframe.
    const handleMsg = (e: MessageEvent) => {
      if (e.source !== leftIframe.contentWindow) return;
      let data: Record<string, unknown>;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data.event !== 'infoDelivery') return;
      const info = data.info as Record<string, unknown> | undefined;
      const currentTime = info?.currentTime;
      if (typeof currentTime !== 'number') return;
      window.removeEventListener('message', handleMsg);
      iframeCmd(rightIframe, 'seekTo', [currentTime, true]);
      flashToast(`Synced right to ${currentTime.toFixed(1)}s`);
    };
    window.addEventListener('message', handleMsg);
    // Request current time from the left player.
    iframeCmd(leftIframe, 'getCurrentTime');
    // Timeout safety: remove listener after 2s if no reply.
    setTimeout(() => window.removeEventListener('message', handleMsg), 2000);
  });

  // ---- ESC to close -------------------------------------------------------
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', onEsc, true);

  // ---- Mount -------------------------------------------------------------
  document.body.appendChild(host);

  const teardown = () => {
    document.removeEventListener('keydown', onEsc, true);
    host.remove();
  };

  return { host, teardown };
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

const feature: Feature = {
  id: 'compare-videos',

  setup(ctx) {
    let overlayTeardown: (() => void) | null = null;
    let button: HTMLButtonElement | null = null;

    // ---- Open / close helpers ---------------------------------------------

    const isOpen = () => overlayTeardown !== null;

    const open = () => {
      if (isOpen()) return;
      const { teardown } = mountOverlay(close);
      overlayTeardown = teardown;
    };

    const close = () => {
      if (!isOpen()) return;
      overlayTeardown!();
      overlayTeardown = null;
    };

    const toggle = () => (isOpen() ? close() : open());

    // ---- Masthead button --------------------------------------------------

    const findContainer = (): HTMLElement | null => {
      for (const sel of MASTHEAD_SELECTORS) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };

    const createButton = (): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Compare videos side-by-side (V)');
      btn.title = 'Compare Videos (V)';
      btn.textContent = '⇔';
      Object.assign(btn.style, {
        width: '40px',
        height: '40px',
        border: 'none',
        background: 'transparent',
        color: 'var(--yt-spec-text-primary, #0f0f0f)',
        cursor: 'pointer',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        flexShrink: '0',
        transition: 'background 120ms',
      } as CSSStyleDeclaration);
      btn.addEventListener('mouseenter', () => {
        btn.style.background =
          'var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05))';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });
      btn.addEventListener('click', toggle);
      return btn;
    };

    const inject = () => {
      if (button && document.contains(button)) return;
      const container = findContainer();
      if (!container) return;
      button = createButton();
      container.insertBefore(button, container.firstChild);
    };

    // Re-inject if YouTube re-renders the masthead.
    const offChange = ctx.observer.onChange(() => inject());
    inject();

    // ---- Keyboard shortcut: V (mnemonic: Versus) ---------------------------
    const offKey = onKey('v', () => {
      toggle();
    });

    // ---- Teardown ---------------------------------------------------------
    return () => {
      offChange();
      offKey();
      close();
      button?.remove();
      button = null;
    };
  },
};

export default feature;
