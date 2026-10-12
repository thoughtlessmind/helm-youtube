/**
 * Multi-Video Grid — Feature: `multi-video-grid`
 *
 * Opens a full-viewport overlay containing up to 4 YouTube embed players
 * arranged in a switchable grid layout (1×1, 2×1, 2×2). Each cell
 * provides a URL/id input to load a video and a "focus" button that
 * unmutes that player while muting all others.
 *
 * Keyboard shortcut: `G` (global, not on /watch exclusively)
 * Masthead button:   "⊞ Grid" — injected next to the YouTube Pro menu btn
 *
 * IFrame API commands used:
 *   mute / unMute   — via postMessage (see ../lib/yt/embed)
 */

import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { parseVideoId, buildEmbedUrl, iframeCmd } from '../lib/yt/embed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BTN_ID = 'yt-pro-mvg-btn';
const HOST_ID = 'yt-pro-mvg-host';

/** Masthead container selectors — mirrors header-menu.ts. */
const MASTHEAD_SELECTORS = [
  'ytd-masthead #buttons',
  '#masthead #buttons',
  'ytd-masthead #end',
] as const;

type Layout = '1x1' | '2x1' | '2x2';

/** Number of cells active for each layout. */
const LAYOUT_CELLS: Record<Layout, number> = {
  '1x1': 1,
  '2x1': 2,
  '2x2': 4,
};

// ---------------------------------------------------------------------------
// CSS (scoped inside shadow DOM — no leakage)
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
  margin-right: 8px;
}

.layout-btn {
  padding: 4px 10px;
  border: 1px solid #444;
  background: transparent;
  color: #aaa;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
}
.layout-btn:hover { background: #222; color: #f1f1f1; border-color: #666; }
.layout-btn.active { background: #ff0000; color: #fff; border-color: #ff0000; }

.close-btn {
  margin-left: auto;
  padding: 4px 12px;
  border: 1px solid #555;
  background: transparent;
  color: #ccc;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms;
}
.close-btn:hover { background: #333; color: #fff; border-color: #888; }

.grid {
  flex: 1;
  display: grid;
  gap: 4px;
  padding: 4px;
  min-height: 0;
}

.grid.layout-1x1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.grid.layout-2x1 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
.grid.layout-2x2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }

.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 120ms;
}
.cell.focused { border-color: #ff0000; }

.cell-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.85);
  flex-shrink: 0;
  z-index: 1;
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

.focus-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #555;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 120ms, color 120ms;
}
.focus-btn:hover { background: #222; color: #f1f1f1; }

.cell-iframe-wrap {
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

.cell-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 14px;
  pointer-events: none;
}
`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CellState {
  videoId: string | null;
  isMuted: boolean;
}

// ---------------------------------------------------------------------------
// Overlay builder
// ---------------------------------------------------------------------------

/**
 * Mount the overlay, returning a teardown function.
 * Called each time the user opens the grid.
 */
function mountOverlay(onClose: () => void): {
  host: HTMLDivElement;
  teardown: () => void;
} {
  // ---- Host + shadow root ------------------------------------------------
  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
  } as CSSStyleDeclaration);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);

  // ---- State -------------------------------------------------------------
  let layout: Layout = '2x2';
  const cells: CellState[] = [
    { videoId: null, isMuted: false },
    { videoId: null, isMuted: false },
    { videoId: null, isMuted: false },
    { videoId: null, isMuted: false },
  ];

  // ---- Build DOM ---------------------------------------------------------
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  shadow.appendChild(backdrop);

  // Toolbar — built imperatively to avoid TS narrowing false-positives.
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const toolbarTitle = document.createElement('span');
  toolbarTitle.className = 'toolbar-title';
  toolbarTitle.textContent = '⊞ Video Grid';
  toolbar.appendChild(toolbarTitle);

  const makeLayoutBtn = (lbl: string, val: Layout): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'layout-btn';
    b.dataset.layout = val;
    b.textContent = lbl;
    toolbar.appendChild(b);
    return b;
  };
  makeLayoutBtn('1×1', '1x1');
  makeLayoutBtn('2×1', '2x1');
  makeLayoutBtn('2×2', '2x2');

  const closeToolbarBtn = document.createElement('button');
  closeToolbarBtn.className = 'close-btn';
  closeToolbarBtn.id = 'mvg-close';
  closeToolbarBtn.textContent = '✕ Close';
  toolbar.appendChild(closeToolbarBtn);

  backdrop.appendChild(toolbar);

  // Grid container
  const gridEl = document.createElement('div');
  gridEl.className = `grid layout-${layout}`;
  backdrop.appendChild(gridEl);

  // Iframe references (one per cell, persistent)
  const iframes: HTMLIFrameElement[] = [];

  // ---- Render cells ------------------------------------------------------
  const renderGrid = () => {
    gridEl.className = `grid layout-${layout}`;
    gridEl.innerHTML = '';
    iframes.length = 0;

    const count = LAYOUT_CELLS[layout];
    for (let i = 0; i < count; i++) {
      const cell = buildCell(i);
      gridEl.appendChild(cell.el);
      iframes.push(cell.iframe);
    }

    // Update layout button active states
    shadow.querySelectorAll<HTMLButtonElement>('.layout-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });
  };

  const buildCell = (idx: number): { el: HTMLDivElement; iframe: HTMLIFrameElement } => {
    const cell = cells[idx];
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.idx = String(idx);

    // Cell toolbar
    const ctb = document.createElement('div');
    ctb.className = 'cell-toolbar';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'url-input';
    input.placeholder = 'Paste YouTube URL or video ID…';
    input.value = cell.videoId
      ? `https://www.youtube.com/watch?v=${cell.videoId}`
      : '';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'load-btn';
    loadBtn.textContent = 'Load';

    const focusBtn = document.createElement('button');
    focusBtn.className = 'focus-btn';
    focusBtn.textContent = '🔊 Focus';
    focusBtn.title = 'Unmute this player, mute others';

    ctb.appendChild(input);
    ctb.appendChild(loadBtn);
    ctb.appendChild(focusBtn);
    el.appendChild(ctb);

    // Iframe wrapper
    const wrap = document.createElement('div');
    wrap.className = 'cell-iframe-wrap';

    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');

    if (cell.videoId) {
      iframe.src = buildEmbedUrl(cell.videoId);
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'cell-placeholder';
    placeholder.textContent = 'Paste a URL above and click Load';

    wrap.appendChild(iframe);
    if (!cell.videoId) wrap.appendChild(placeholder);
    el.appendChild(wrap);

    // ---- Wire events for this cell -------------------------------------
    const doLoad = () => {
      const id = parseVideoId(input.value);
      if (!id) {
        flashToast('Could not parse video ID');
        return;
      }
      cells[idx].videoId = id;
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

    focusBtn.addEventListener('click', () => {
      const count = LAYOUT_CELLS[layout];
      for (let j = 0; j < count; j++) {
        if (j === idx) {
          iframeCmd(iframes[j], 'unMute');
          cells[j].isMuted = false;
          gridEl.querySelectorAll<HTMLDivElement>('.cell')[j]?.classList.add('focused');
        } else {
          iframeCmd(iframes[j], 'mute');
          cells[j].isMuted = true;
          gridEl.querySelectorAll<HTMLDivElement>('.cell')[j]?.classList.remove('focused');
        }
      }
    });

    return { el, iframe };
  };

  // ---- Wire toolbar events -----------------------------------------------
  toolbar.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const layoutBtn = target.closest<HTMLButtonElement>('.layout-btn');
    if (layoutBtn?.dataset.layout) {
      layout = layoutBtn.dataset.layout as Layout;
      renderGrid();
      return;
    }

    if (target.closest('#mvg-close')) {
      onClose();
    }
  });

  // ESC key inside shadow root (document-level because shadow doesn't capture)
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', onEsc, true);

  // Initial render
  renderGrid();
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
  id: 'multi-video-grid',

  setup(ctx) {
    let overlayTeardown: (() => void) | null = null;
    let button: HTMLButtonElement | null = null;

    // ---- Helpers -----------------------------------------------------------

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

    // ---- Masthead button ---------------------------------------------------

    /** Find the masthead buttons container — mirrors header-menu.ts. */
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
      btn.setAttribute('aria-label', 'Multi-video grid (G)');
      btn.title = 'Multi-Video Grid (G)';
      btn.textContent = '⊞';
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
      // Insert as first child so it sits immediately left of the YouTube Pro menu btn.
      container.insertBefore(button, container.firstChild);
    };

    // Re-inject whenever YouTube re-renders the masthead.
    const offChange = ctx.observer.onChange(() => inject());
    inject();

    // ---- Keyboard shortcut: G (mnemonic: Grid) -------------------------
    const offKey = onKey('g', () => {
      toggle();
    });

    // ---- Teardown --------------------------------------------------------
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
