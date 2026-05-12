import { storage } from '#imports';
import type { YTContext } from './context';
import {
  getFlags,
  setFlag,
  getConfig,
  setConfig,
  getExtensionEnabled,
  setExtensionEnabled,
  watchExtensionEnabled,
  type FeatureFlags,
  type FeatureConfig,
} from '../settings';

interface FeatureMeta {
  id: keyof FeatureFlags;
  label: string;
  desc: string;
}

interface Section {
  title: string;
  features: FeatureMeta[];
}

const SECTIONS: Section[] = [
  {
    title: 'Feed & Discovery',
    features: [
      { id: 'hide-shorts', label: 'Hide Shorts', desc: 'Removes Shorts from feed, sidebar, search, and channel pages.' },
      { id: 'hide-metadata', label: 'Hide view counts & dates', desc: 'Reduce clickbait pull by hiding view counts and upload dates on thumbnails.' },
      { id: 'customize-grid', label: 'Customize grid', desc: 'Pack more videos per row on the homepage and hide card info for a denser feed.' },
    ],
  },
  {
    title: 'Watch Page',
    features: [
      { id: 'hide-end-screen-cards', label: 'Hide end-screen cards', desc: 'Removes the suggested-video overlay from the last 20s of videos.' },
      { id: 'hide-watch-page-sidebar', label: 'Hide watch-page sidebar', desc: 'Removes the right-rail recommendations while watching a video.' },
      { id: 'hide-up-next-panel', label: 'Hide "Up next" panel', desc: 'Removes the in-player autoplay countdown overlay.' },
      { id: 'hide-comments-by-default', label: 'Hide comments', desc: 'Hide the comments section on watch pages.' },
      { id: 'disable-autoplay', label: 'Disable autoplay', desc: 'Turns off the autoplay toggle on every watch page.' },
      { id: 'distraction-free-mode', label: 'Distraction-free mode', desc: 'On watch pages, hide everything except the player and title.' },
    ],
  },
  {
    title: 'Playback',
    features: [
      { id: 'default-playback-speed', label: 'Default playback speed', desc: 'Force every video to start at your preferred speed.' },
      { id: 'persistent-volume', label: 'Persistent volume', desc: 'Restore your last volume on every video.' },
      { id: 'volume-boost', label: 'Volume boost', desc: 'Push audio above 100% via Web Audio API gain.' },
      { id: 'loop-section', label: 'Loop section ([ ] \\)', desc: 'Press [ to set A, ] to set B, \\ to clear. Video loops between A→B.' },
      { id: 'auto-dismiss-still-watching', label: 'Auto-dismiss "Still watching?"', desc: "Auto-confirms YouTube's periodic playback-paused prompt." },
    ],
  },
  {
    title: 'Shortcuts',
    features: [
      { id: 'copy-timestamped-link', label: 'Copy timestamped link (Y)', desc: 'Press Y on a video to copy a link to the current playback position.' },
      { id: 'screenshot-current-frame', label: 'Screenshot frame (S)', desc: 'Press S to download a PNG of the current frame, no overlay.' },
      { id: 'save-to-playlist', label: 'Save to playlist (W)', desc: 'Press W on a watch page to toggle the video into the named playlist.' },
    ],
  },
  {
    title: 'Appearance',
    features: [
      { id: 'true-black-dark-mode', label: 'True black dark mode', desc: "Replaces YouTube's dark grey backgrounds with #000 for OLED." },
      { id: 'custom-css', label: 'Custom CSS', desc: 'Inject your own CSS into youtube.com to theme it freely.' },
    ],
  },
];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const BOOST_LEVELS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const GRID_COLUMNS = [3, 4, 5, 6, 7, 8];

const BUTTON_ID = 'ytp-pro-header-btn';
const POPOVER_ID = 'ytp-pro-popover-host';

const TUNE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M3 17v2h6v-2H3zm0-7v2h10v-2H3zm0-7v2h14V3H3zm18 14v-2h-6v2h6zm-6-7v2h6v-2h-6zm-2-3h2V5h2V3h-2V1h-2v2h-2v2h2v2zm-4 5h2v-2h2v-2h-2V8h-2v2H7v2h2v2z"/></svg>`;

interface PanelState {
  open: boolean;
  enabled: boolean;
  flags: FeatureFlags;
  speed: FeatureConfig['default-playback-speed'];
  boost: FeatureConfig['volume-boost'];
  grid: FeatureConfig['customize-grid'];
  savePlaylist: FeatureConfig['save-to-playlist'];
  customCss: FeatureConfig['custom-css'];
}

export function mountHeaderMenu(ctx: YTContext): () => void {
  let button: HTMLButtonElement | null = null;
  let popoverHost: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;

  const state: PanelState = {
    open: false,
    enabled: true,
    flags: {},
    speed: { rate: 1 },
    boost: { multiplier: 1.5 },
    grid: { columnsPerRow: 3, hideCardInfo: false },
    savePlaylist: { playlistName: 'Watch later' },
    customCss: { css: '' },
  };

  // ---------- State load + watch ----------
  const loadState = async () => {
    state.enabled = await getExtensionEnabled();
    state.flags = await getFlags();
    state.speed = await getConfig('default-playback-speed');
    state.boost = await getConfig('volume-boost');
    state.grid = await getConfig('customize-grid');
    state.savePlaylist = await getConfig('save-to-playlist');
    state.customCss = await getConfig('custom-css');
  };

  const watchers: Array<() => void> = [];
  watchers.push(
    watchExtensionEnabled((on) => {
      state.enabled = on;
      if (state.open) renderPanel();
    }),
  );
  watchers.push(
    storage.watch<FeatureFlags>('sync:featureFlags', (v) => {
      state.flags = { ...state.flags, ...(v ?? {}) };
      if (state.open) renderPanel();
    }),
  );
  watchers.push(
    storage.watch<FeatureConfig['default-playback-speed']>(
      'sync:config:default-playback-speed',
      (v) => {
        if (v) state.speed = v;
        if (state.open) renderPanel();
      },
    ),
  );
  watchers.push(
    storage.watch<FeatureConfig['volume-boost']>('sync:config:volume-boost', (v) => {
      if (v) state.boost = v;
      if (state.open) renderPanel();
    }),
  );
  watchers.push(
    storage.watch<FeatureConfig['customize-grid']>('sync:config:customize-grid', (v) => {
      if (v) state.grid = v;
      if (state.open) renderPanel();
    }),
  );
  watchers.push(
    storage.watch<FeatureConfig['save-to-playlist']>('sync:config:save-to-playlist', (v) => {
      if (!v || v.playlistName === state.savePlaylist.playlistName) return;
      state.savePlaylist = v;
      if (state.open) renderPanel();
    }),
  );
  watchers.push(
    storage.watch<FeatureConfig['custom-css']>('sync:config:custom-css', (v) => {
      if (!v || v.css === state.customCss.css) return;
      state.customCss = v;
      if (state.open) renderPanel();
    }),
  );

  // ---------- Button injection ----------
  const findContainer = (): HTMLElement | null => {
    return (
      (document.querySelector('ytd-masthead #buttons') as HTMLElement | null) ??
      (document.querySelector('#masthead #buttons') as HTMLElement | null) ??
      (document.querySelector('ytd-masthead #end') as HTMLElement | null)
    );
  };

  const createButton = (): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'YouTube Pro menu');
    btn.title = 'YouTube Pro';
    btn.innerHTML = TUNE_ICON;
    Object.assign(btn.style, {
      width: '40px',
      height: '40px',
      border: 'none',
      background: 'transparent',
      color: 'var(--yt-spec-text-primary, #0f0f0f)',
      borderRadius: '50%',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      margin: '0 4px',
      verticalAlign: 'middle',
      flexShrink: '0',
    } as CSSStyleDeclaration);
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });
    return btn;
  };

  const inject = () => {
    if (button && document.contains(button)) return;
    const container = findContainer();
    if (!container) return;
    button = createButton();
    container.insertBefore(button, container.firstChild);
  };

  // Use the shared observer to re-inject if YouTube re-renders.
  watchers.push(ctx.observer.onChange(() => inject()));

  // ---------- Popover ----------
  const ensurePopover = () => {
    if (popoverHost && document.contains(popoverHost)) return;
    popoverHost = document.createElement('div');
    popoverHost.id = POPOVER_ID;
    Object.assign(popoverHost.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '2147483647',
      display: 'none',
    } as CSSStyleDeclaration);
    shadow = popoverHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'panel';
    shadow.appendChild(panel);
    document.body.appendChild(popoverHost);
  };

  const positionPopover = () => {
    if (!popoverHost || !button) return;
    const rect = button.getBoundingClientRect();
    const PANEL_W = 360;
    const top = rect.bottom + 8;
    let left = rect.right - PANEL_W;
    if (left < 8) left = 8;
    if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - PANEL_W - 8;
    popoverHost.style.top = `${top}px`;
    popoverHost.style.left = `${left}px`;
  };

  const onOutside = (e: MouseEvent) => {
    if (!state.open || !popoverHost || !button) return;
    const t = e.target as Node;
    if (popoverHost.contains(t)) return;
    if (button.contains(t)) return;
    closePanel();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.open) closePanel();
  };
  const onResize = () => {
    if (state.open) positionPopover();
  };

  const openPanel = () => {
    ensurePopover();
    state.open = true;
    if (popoverHost) popoverHost.style.display = 'block';
    renderPanel();
    positionPopover();
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize, true);
    window.addEventListener('scroll', onResize, true);
  };

  const closePanel = () => {
    state.open = false;
    if (popoverHost) popoverHost.style.display = 'none';
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize, true);
    window.removeEventListener('scroll', onResize, true);
  };

  const togglePanel = async () => {
    if (state.open) {
      closePanel();
    } else {
      await loadState();
      openPanel();
    }
  };

  // ---------- Render ----------
  const renderPanel = () => {
    if (!shadow) return;
    const panel = shadow.getElementById('panel');
    if (!panel) return;
    panel.innerHTML = panelHTML(state);
    wireEvents(panel);
  };

  const wireEvents = (panel: HTMLElement) => {
    const closeBtn = panel.querySelector<HTMLButtonElement>('[data-act="close"]');
    closeBtn?.addEventListener('click', () => closePanel());

    const killSwitch = panel.querySelector<HTMLInputElement>('[data-act="kill-switch"]');
    killSwitch?.addEventListener('change', async () => {
      const next = killSwitch.checked;
      state.enabled = next;
      await setExtensionEnabled(next);
      renderPanel();
    });

    panel.querySelectorAll<HTMLInputElement>('[data-feature]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.feature as keyof FeatureFlags;
        const next = cb.checked;
        state.flags = { ...state.flags, [id]: next };
        await setFlag(id, next);
        renderPanel();
      });
    });

    const speedSel = panel.querySelector<HTMLSelectElement>('[data-act="speed"]');
    speedSel?.addEventListener('change', async () => {
      const rate = Number(speedSel.value);
      state.speed = { rate };
      await setConfig('default-playback-speed', { rate });
    });

    const boostSel = panel.querySelector<HTMLSelectElement>('[data-act="boost"]');
    boostSel?.addEventListener('change', async () => {
      const multiplier = Number(boostSel.value);
      state.boost = { multiplier };
      await setConfig('volume-boost', { multiplier });
    });

    const gridColsSel = panel.querySelector<HTMLSelectElement>('[data-act="grid-cols"]');
    gridColsSel?.addEventListener('change', async () => {
      const columnsPerRow = Number(gridColsSel.value);
      state.grid = { ...state.grid, columnsPerRow };
      await setConfig('customize-grid', state.grid);
    });

    const gridHide = panel.querySelector<HTMLInputElement>('[data-act="grid-hide"]');
    gridHide?.addEventListener('change', async () => {
      state.grid = { ...state.grid, hideCardInfo: gridHide.checked };
      await setConfig('customize-grid', state.grid);
    });

    const playlistInput = panel.querySelector<HTMLInputElement>('[data-act="playlist-name"]');
    playlistInput?.addEventListener('input', async () => {
      const playlistName = playlistInput.value;
      state.savePlaylist = { playlistName };
      await setConfig('save-to-playlist', { playlistName });
    });

    const cssArea = panel.querySelector<HTMLTextAreaElement>('[data-act="custom-css"]');
    cssArea?.addEventListener('click', (e) => e.stopPropagation());
    cssArea?.addEventListener('change', async () => {
      const css = cssArea.value;
      state.customCss = { css };
      await setConfig('custom-css', { css });
    });
  };

  // ---------- Bootstrap ----------
  void loadState().then(() => {
    inject();
  });
  // Initial inject attempt in case state is fast
  inject();

  return () => {
    closePanel();
    watchers.forEach((off) => off());
    button?.remove();
    popoverHost?.remove();
    button = null;
    popoverHost = null;
    shadow = null;
  };
}

// ---------- HTML rendering ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}

function panelHTML(s: PanelState): string {
  const dimmed = s.enabled ? '' : 'dimmed';
  const sectionsHTML = SECTIONS.map((sec) => sectionHTML(sec, s)).join('');
  return `
    <header class="hdr">
      <div class="title">YouTube Pro</div>
      <button class="x" data-act="close" aria-label="Close">×</button>
    </header>
    <div class="kill">
      <label class="kill-row">
        <span class="kill-label">Extension enabled</span>
        <span class="switch">
          <input type="checkbox" data-act="kill-switch" ${s.enabled ? 'checked' : ''} />
          <span class="slider"></span>
        </span>
      </label>
    </div>
    <div class="body ${dimmed}">
      ${sectionsHTML}
    </div>
    <footer class="ftr">youtube-pro</footer>
  `;
}

function sectionHTML(sec: Section, s: PanelState): string {
  return `
    <h3 class="section">${esc(sec.title)}</h3>
    ${sec.features.map((f) => rowHTML(f, s)).join('')}
  `;
}

function rowHTML(f: FeatureMeta, s: PanelState): string {
  const checked = s.flags[f.id] ? 'checked' : '';
  let extra = '';
  if (f.id === 'default-playback-speed' && s.flags['default-playback-speed']) {
    extra = `<div class="config"><select data-act="speed">${SPEEDS.map(
      (v) => `<option value="${v}" ${v === s.speed.rate ? 'selected' : ''}>${v}×</option>`,
    ).join('')}</select></div>`;
  } else if (f.id === 'volume-boost' && s.flags['volume-boost']) {
    extra = `<div class="config"><select data-act="boost">${BOOST_LEVELS.map(
      (v) =>
        `<option value="${v}" ${v === s.boost.multiplier ? 'selected' : ''}>${Math.round(v * 100)}%</option>`,
    ).join('')}</select></div>`;
  } else if (f.id === 'customize-grid' && s.flags['customize-grid']) {
    extra = `<div class="config">
      <label class="cfg-row"><span>Columns:</span>
        <select data-act="grid-cols">${GRID_COLUMNS.map(
          (v) =>
            `<option value="${v}" ${v === s.grid.columnsPerRow ? 'selected' : ''}>${v}</option>`,
        ).join('')}</select>
      </label>
      <label class="cfg-row"><input type="checkbox" data-act="grid-hide" ${s.grid.hideCardInfo ? 'checked' : ''} /><span>Hide card info (title, channel, views)</span></label>
    </div>`;
  } else if (f.id === 'save-to-playlist' && s.flags['save-to-playlist']) {
    extra = `<div class="config">
      <label class="cfg-row"><span>Playlist:</span><input type="text" data-act="playlist-name" value="${esc(s.savePlaylist.playlistName)}" placeholder="Watch later" /></label>
    </div>`;
  } else if (f.id === 'custom-css' && s.flags['custom-css']) {
    extra = `<div class="config">
      <textarea data-act="custom-css" rows="6" placeholder="/* Your custom CSS for youtube.com */" class="css-area">${esc(s.customCss.css)}</textarea>
    </div>`;
  }
  return `
    <label class="row">
      <input type="checkbox" data-feature="${f.id}" ${checked} />
      <span class="text">
        <span class="label">${esc(f.label)}</span>
        <span class="desc">${esc(f.desc)}</span>
        ${extra}
      </span>
    </label>
  `;
}

const PANEL_CSS = `
  :host { all: initial; }
  .panel {
    width: 360px;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--yt-spec-menu-background, #fff);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
    border-radius: 12px;
    box-shadow: 0 4px 32px rgba(0,0,0,0.2);
    font-family: "YouTube Sans", "Roboto", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    box-sizing: border-box;
  }
  .panel * { box-sizing: border-box; }
  .hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
    position: sticky; top: 0;
    background: var(--yt-spec-menu-background, #fff);
    z-index: 2;
  }
  .title { font-size: 16px; font-weight: 600; }
  .x {
    background: transparent; border: none; cursor: pointer;
    color: inherit; font-size: 22px; line-height: 1;
    padding: 4px 8px; border-radius: 4px;
  }
  .x:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.06)); }
  .kill {
    padding: 12px 16px;
    border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
  }
  .kill-row {
    display: flex; align-items: center; justify-content: space-between;
    cursor: pointer;
  }
  .kill-label { font-weight: 600; font-size: 14px; }
  .switch { position: relative; display: inline-block; width: 38px; height: 22px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; inset: 0;
    background: var(--yt-spec-text-disabled, #ccc);
    border-radius: 22px; transition: background .15s;
  }
  .slider::before {
    content: ""; position: absolute;
    height: 16px; width: 16px; left: 3px; top: 3px;
    background: #fff; border-radius: 50%;
    transition: transform .15s;
  }
  .switch input:checked + .slider { background: #c00; }
  .switch input:checked + .slider::before { transform: translateX(16px); }
  .body.dimmed > .section,
  .body.dimmed > .row { opacity: 0.4; pointer-events: none; }
  .section {
    margin: 0;
    padding: 12px 16px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--yt-spec-text-secondary, #606060);
  }
  .row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
  }
  .row:hover { background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.04)); }
  .row input[type="checkbox"] { margin-top: 2px; accent-color: #c00; }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .label { font-weight: 500; }
  .desc { font-size: 11px; color: var(--yt-spec-text-secondary, #606060); }
  .config { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
  .cfg-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .config select, .config input[type="text"] {
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 4px; padding: 4px 6px; font-size: 12px;
  }
  .config input[type="text"] { flex: 1; }
  .config input[type="checkbox"] { accent-color: #c00; }
  .config textarea.css-area {
    width: 100%;
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 4px; padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px; resize: vertical; min-height: 80px;
  }
  .ftr {
    padding: 8px 16px 12px;
    font-size: 10px;
    color: var(--yt-spec-text-disabled, #909090);
    text-align: center;
  }
`;
