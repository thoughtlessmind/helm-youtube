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
import { CATALOG, ALL_FEATURES, type ConfigField } from '../feature-catalog';

/**
 * In-page header menu — a YouTube Pro button in the masthead that opens a
 * settings popover. Renders entirely from the shared feature catalog, so
 * new features need no edits here.
 */

const BUTTON_ID = 'ytp-pro-header-btn';
const POPOVER_ID = 'ytp-pro-popover-host';

const TUNE_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M3 17v2h6v-2H3zm0-7v2h10v-2H3zm0-7v2h14V3H3zm18 14v-2h-6v2h6zm-6-7v2h6v-2h-6zm-2-3h2V5h2V3h-2V1h-2v2h-2v2h2v2zm-4 5h2v-2h2v-2h-2V8h-2v2H7v2h2v2z"/></svg>`;

/** Feature ids that carry a config blob (have a `config` array in the catalog). */
const CONFIG_FEATURE_IDS = ALL_FEATURES.filter((f) => f.config?.length).map(
  (f) => f.id,
);

type ConfigMap = Record<string, Record<string, unknown>>;

interface PanelState {
  open: boolean;
  enabled: boolean;
  flags: FeatureFlags;
  configs: ConfigMap;
}

function isNumericField(field: ConfigField): boolean {
  return (
    field.type === 'select' && typeof field.options[0]?.value === 'number'
  );
}

export function mountHeaderMenu(ctx: YTContext): () => void {
  let button: HTMLButtonElement | null = null;
  let popoverHost: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;

  const state: PanelState = {
    open: false,
    enabled: true,
    flags: {},
    configs: {},
  };

  // ---------- State load + watch ----------
  const loadState = async () => {
    state.enabled = await getExtensionEnabled();
    state.flags = await getFlags();
    for (const id of CONFIG_FEATURE_IDS) {
      state.configs[id] = (await getConfig(
        id as keyof FeatureConfig,
      )) as Record<string, unknown>;
    }
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
  for (const id of CONFIG_FEATURE_IDS) {
    watchers.push(
      storage.watch<Record<string, unknown>>(`sync:config:${id}`, (v) => {
        if (v) state.configs[id] = { ...state.configs[id], ...v };
        if (state.open) renderPanel();
      }),
    );
  }

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
    panel
      .querySelector<HTMLButtonElement>('[data-act="close"]')
      ?.addEventListener('click', () => closePanel());

    const killSwitch = panel.querySelector<HTMLInputElement>('[data-act="kill-switch"]');
    killSwitch?.addEventListener('change', async () => {
      state.enabled = killSwitch.checked;
      await setExtensionEnabled(killSwitch.checked);
      renderPanel();
    });

    panel.querySelectorAll<HTMLInputElement>('[data-feature]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.feature as keyof FeatureFlags;
        state.flags = { ...state.flags, [id]: cb.checked };
        await setFlag(id, cb.checked);
        renderPanel();
      });
    });

    // Generic config controls — select / checkbox / text.
    panel
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cfg-feature]')
      .forEach((el) => {
        const evt =
          el instanceof HTMLInputElement &&
          (el.type === 'text' || el.type === 'number')
            ? 'input'
            : 'change';
        el.addEventListener(evt, async () => {
          const id = el.dataset.cfgFeature as keyof FeatureConfig;
          const key = el.dataset.cfgKey!;
          let value: unknown;
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            value = el.checked;
          } else if (el.dataset.numeric === 'true') {
            value = Number(el.value);
          } else {
            value = el.value;
          }
          const next = { ...(state.configs[id] ?? {}), [key]: value };
          state.configs[id] = next;
          await setConfig(id, next as FeatureConfig[typeof id]);
        });
      });
  };

  // ---------- Bootstrap ----------
  void loadState().then(() => inject());
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
  const sectionsHTML = CATALOG.map((sec) => {
    const rows = sec.features.map((f) => rowHTML(f, s)).join('');
    return `<h3 class="section">${esc(sec.title)}</h3>${rows}`;
  }).join('');
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

function rowHTML(
  f: { id: keyof FeatureFlags; label: string; desc: string; config?: ConfigField[] },
  s: PanelState,
): string {
  const checked = s.flags[f.id] ? 'checked' : '';
  const showConfig = f.config?.length && s.flags[f.id];
  const cfg = s.configs[f.id] ?? {};
  const extra = showConfig
    ? `<div class="config">${f.config!.map((field) => fieldHTML(f.id, field, cfg)).join('')}</div>`
    : '';
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

function fieldHTML(
  id: string,
  field: ConfigField,
  cfg: Record<string, unknown>,
): string {
  const attrs = `data-cfg-feature="${esc(id)}" data-cfg-key="${esc(field.key)}"`;
  const current = cfg[field.key];
  if (field.type === 'select') {
    const numeric = typeof field.options[0]?.value === 'number';
    const opts = field.options
      .map(
        (o) =>
          `<option value="${esc(String(o.value))}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`,
      )
      .join('');
    const label = field.label ? `<span>${esc(field.label)}:</span>` : '';
    return `<label class="cfg-row">${label}<select ${attrs} data-numeric="${numeric}">${opts}</select></label>`;
  }
  if (field.type === 'checkbox') {
    return `<label class="cfg-row"><input type="checkbox" ${attrs} ${current ? 'checked' : ''} /><span>${esc(field.label)}</span></label>`;
  }
  if (field.type === 'number') {
    const label = field.label ? `<span>${esc(field.label)}:</span>` : '';
    const rng = `${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} ${field.step != null ? `step="${field.step}"` : ''}`;
    return `<label class="cfg-row">${label}<input type="number" ${attrs} data-numeric="true" ${rng} value="${esc(String(current ?? ''))}" placeholder="${esc(field.placeholder ?? '')}" /></label>`;
  }
  // text
  const label = field.label ? `<span>${esc(field.label)}:</span>` : '';
  return `<label class="cfg-row">${label}<input type="text" ${attrs} value="${esc(String(current ?? ''))}" placeholder="${esc(field.placeholder ?? '')}" /></label>`;
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
  .config select, .config input[type="text"], .config input[type="number"] {
    background: var(--yt-spec-general-background-a, #f9f9f9);
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,0.15));
    border-radius: 4px; padding: 4px 6px; font-size: 12px;
  }
  .config input[type="text"] { flex: 1; }
  .config input[type="number"] { width: 80px; }
  .config input[type="checkbox"] { accent-color: #c00; }
  .ftr {
    padding: 8px 16px 12px;
    font-size: 10px;
    color: var(--yt-spec-text-disabled, #909090);
    text-align: center;
  }
`;
