/**
 * per-channel-skip-segments
 *
 * Automatically skips the intro (first N seconds) and/or outro (last N
 * seconds) of every video on a specific channel, with per-channel
 * configuration stored locally.
 *
 * WHY: Many channels have fixed intros/outros users always skip. SponsorBlock
 * handles generic sponsor segments community-wide; this feature covers the
 * personal case — "skip the first 15 seconds of every MKBHD video".
 *
 * HOW:
 * - Per-channel intro/outro seconds are stored under
 *   `local:ytpro:per-channel-skip-segments` as `channelId → {intro, outro}`.
 * - On the watch page, a compact shadow-DOM panel is injected near the player
 *   showing the channel name and two number inputs. Saves on `change`.
 * - `timeupdate` handler is hot-path: only reads from a captured local variable
 *   (`activeSkip`) resolved once per navigation, NOT from storage on every tick.
 * - Intro is skipped at most once per video load (skippedIntro flag, reset on
 *   `loadedmetadata`) to prevent seek loops.
 * - Outro seek target: `duration - 0.05` (safe margin; triggers YouTube's ended
 *   logic naturally). Guarded against infinite/zero duration.
 * - `showControl` FeatureConfig (checkbox, default true) hides/shows the
 *   in-page editor without disabling skip behaviour.
 */

import type { Feature } from '../lib/features';
import { storage } from '#imports';
import { getWatchChannel, isWatchPage } from '../lib/yt/video';
import { getConfig, watchConfig } from '../lib/settings';

// ---------- FeatureConfig augmentation ----------

declare module '../lib/settings' {
  interface FeatureConfig {
    'per-channel-skip-segments': {
      showControl: boolean;
    };
  }
}

// ---------- Types ----------

interface SkipEntry {
  intro: number;
  outro: number;
}

type SkipMap = Record<string, SkipEntry>;

// ---------- Constants ----------

const VIDEO_SEL = 'video.html5-main-video';
const STORAGE_KEY = 'local:ytpro:per-channel-skip-segments';
const PANEL_HOST_ID = 'yt-pro-skip-segments-host';
const PANEL_CSS = `
:host {
  all: initial;
  font-family: Roboto, Arial, sans-serif;
}
.panel {
  position: fixed;
  z-index: 2147483640;
  background: var(--yt-spec-base-background, #fff);
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.1));
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 220px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  color: var(--yt-spec-text-primary, #0f0f0f);
  font-size: 13px;
}
.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--yt-spec-text-secondary, #606060);
  margin-bottom: 8px;
}
.channel-name {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.row:last-child { margin-bottom: 0; }
label {
  flex: 1;
  color: var(--yt-spec-text-secondary, #606060);
}
input[type=number] {
  width: 58px;
  padding: 4px 6px;
  border: 1px solid var(--yt-spec-10-percent-layer, rgba(0,0,0,.2));
  border-radius: 6px;
  background: var(--yt-spec-base-background, #fff);
  color: var(--yt-spec-text-primary, #0f0f0f);
  font-size: 13px;
  text-align: right;
}
input[type=number]:focus {
  outline: 2px solid #065fd4;
  outline-offset: 1px;
}
.no-channel {
  color: var(--yt-spec-text-secondary, #606060);
  font-style: italic;
  font-size: 12px;
}
.toggle-btn {
  position: fixed;
  z-index: 2147483641;
  background: var(--yt-spec-badge-chip-background, rgba(0,0,0,.05));
  border: none;
  border-radius: 50%;
  width: 34px;
  height: 34px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--yt-spec-text-primary, #0f0f0f);
  transition: background .15s;
}
.toggle-btn:hover {
  background: var(--yt-spec-10-percent-layer, rgba(0,0,0,.1));
}
`;

// Scissors SVG icon for the toggle button
const SCISSORS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
  <path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z"/>
</svg>`;

const feature: Feature = {
  id: 'per-channel-skip-segments',

  async setup(ctx) {
    // Load initial config (showControl flag).
    let showControl = (await getConfig('per-channel-skip-segments')).showControl;

    // In-memory skip map — loaded once, kept in sync via storage.watch.
    let map: SkipMap = (await storage.getItem<SkipMap>(STORAGE_KEY)) ?? {};

    // The resolved skip entry for the currently-playing channel's video.
    // Hot-path: timeupdate reads only this, never storage.
    let activeSkip: SkipEntry | null = null;

    // Channel resolved for the current watch page.
    let currentChannel: { id: string; name: string } | null = null;

    // Per-load intro-skip gate (reset on loadedmetadata). Prevents seek loop.
    let skippedIntro = false;

    // Shadow-DOM control references.
    let panelHost: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let panelOpen = false;
    let toggleBtn: HTMLButtonElement | null = null;

    // --------- Video element helpers ---------

    const getVideo = (): HTMLVideoElement | null =>
      document.querySelector<HTMLVideoElement>(VIDEO_SEL);

    // --------- timeupdate hot path ---------

    const onTimeUpdate = () => {
      if (!activeSkip) return;
      const video = getVideo();
      if (!video) return;
      const { currentTime, duration } = video;

      // Intro skip — at most once per video load.
      if (!skippedIntro && activeSkip.intro > 0 && currentTime < activeSkip.intro) {
        // Guard: intro must be less than duration.
        if (Number.isFinite(duration) && duration > 0 && activeSkip.intro < duration) {
          skippedIntro = true;
          video.currentTime = activeSkip.intro;
        }
        return;
      }

      // Outro skip.
      if (
        activeSkip.outro > 0 &&
        Number.isFinite(duration) &&
        duration > 0 &&
        currentTime >= duration - activeSkip.outro &&
        currentTime < duration - 0.05
      ) {
        video.currentTime = duration - 0.05;
      }
    };

    const onLoadedMetadata = () => {
      skippedIntro = false; // reset so intro is skipped on new video load
    };

    const attach = (video: HTMLVideoElement) => {
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    };

    const detach = (video: HTMLVideoElement) => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };

    const current = getVideo();
    if (current) attach(current);

    // Re-attach if YouTube swaps the <video> element.
    const offMutation = ctx.observer.subscribe((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) attach(node);
        });
      }
    });

    // --------- Storage sync ---------

    const offStorage = storage.watch<SkipMap>(STORAGE_KEY, (val) => {
      map = val ?? {};
      // Refresh active skip if channel is already known.
      if (currentChannel) {
        activeSkip = map[currentChannel.id] ?? null;
        if (shadow && panelOpen) renderPanel();
      }
    });

    // --------- Channel resolution ---------

    const resolveChannel = () => {
      if (!isWatchPage()) {
        currentChannel = null;
        activeSkip = null;
        skippedIntro = false;
        if (panelOpen) closePanel();
        removeToggleBtn();
        return;
      }
      const ch = getWatchChannel();
      if (!ch) return; // metadata not yet rendered; onChange will retry
      if (ch.id === currentChannel?.id) return; // already resolved
      currentChannel = ch;
      activeSkip = map[ch.id] ?? null;
      skippedIntro = false;
      if (shadow && panelOpen) renderPanel();
    };

    const offChange = ctx.observer.onChange(() => resolveChannel());

    const offNav = ctx.navigation.onNavigate(() => {
      currentChannel = null;
      activeSkip = null;
      skippedIntro = false;
      if (panelOpen) closePanel();
      // Remove button immediately; resolveChannel will re-inject if on watch page.
      removeToggleBtn();
      resolveChannel();
      if (isWatchPage()) injectToggleBtn();
    });

    // --------- Shadow DOM panel ---------

    const ensurePanel = () => {
      if (panelHost && document.contains(panelHost)) return;
      panelHost = document.createElement('div');
      panelHost.id = PANEL_HOST_ID;
      Object.assign(panelHost.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        zIndex: '2147483640',
        pointerEvents: 'none',
        display: 'none',
      } as Partial<CSSStyleDeclaration>);
      shadow = panelHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = PANEL_CSS;
      shadow.appendChild(style);
      const panel = document.createElement('div');
      panel.className = 'panel';
      shadow.appendChild(panel);
      document.body.appendChild(panelHost);
    };

    const positionPanel = () => {
      if (!panelHost || !toggleBtn) return;
      const rect = toggleBtn.getBoundingClientRect();
      const panelEl = shadow?.querySelector<HTMLDivElement>('.panel');
      if (!panelEl) return;
      // Position above and to the right of the toggle button.
      const panelH = panelEl.offsetHeight || 130;
      let top = rect.top - panelH - 8;
      if (top < 8) top = rect.bottom + 8;
      let left = rect.right - (panelEl.offsetWidth || 230);
      if (left < 8) left = 8;
      panelEl.style.top = `${top}px`;
      panelEl.style.left = `${left}px`;
    };

    const renderPanel = () => {
      if (!shadow) return;
      const panel = shadow.querySelector<HTMLDivElement>('.panel');
      if (!panel) return;

      const entry = currentChannel ? (map[currentChannel.id] ?? { intro: 0, outro: 0 }) : null;

      if (!currentChannel) {
        panel.innerHTML = `<div class="panel-title">Skip Segments</div><div class="no-channel">Not on a watch page</div>`;
        return;
      }

      panel.innerHTML = `
        <div class="panel-title">Skip Segments</div>
        <div class="channel-name" title="${esc(currentChannel.name)}">${esc(currentChannel.name)}</div>
        <div class="row">
          <label for="yt-pro-intro">Skip intro (s)</label>
          <input id="yt-pro-intro" type="number" min="0" step="1" value="${entry?.intro ?? 0}">
        </div>
        <div class="row">
          <label for="yt-pro-outro">Skip outro (s)</label>
          <input id="yt-pro-outro" type="number" min="0" step="1" value="${entry?.outro ?? 0}">
        </div>
      `;

      const introInput = panel.querySelector<HTMLInputElement>('#yt-pro-intro')!;
      const outroInput = panel.querySelector<HTMLInputElement>('#yt-pro-outro')!;

      const save = async () => {
        if (!currentChannel) return;
        const intro = Math.max(0, Number(introInput.value) || 0);
        const outro = Math.max(0, Number(outroInput.value) || 0);
        const newEntry: SkipEntry = { intro, outro };
        map = { ...map, [currentChannel.id]: newEntry };
        activeSkip = newEntry;
        skippedIntro = false; // reset so new intro value takes effect immediately
        await storage.setItem<SkipMap>(STORAGE_KEY, map);
      };

      introInput.addEventListener('change', () => void save());
      outroInput.addEventListener('change', () => void save());
    };

    const openPanel = () => {
      ensurePanel();
      panelOpen = true;
      if (panelHost) {
        panelHost.style.display = 'block';
        panelHost.style.pointerEvents = 'auto';
      }
      renderPanel();
      // Defer position calc until after render so offsetHeight is known.
      requestAnimationFrame(() => positionPanel());
      document.addEventListener('mousedown', onOutsideClick, true);
      document.addEventListener('keydown', onEscape, true);
    };

    const closePanel = () => {
      panelOpen = false;
      if (panelHost) {
        panelHost.style.display = 'none';
        panelHost.style.pointerEvents = 'none';
      }
      document.removeEventListener('mousedown', onOutsideClick, true);
      document.removeEventListener('keydown', onEscape, true);
    };

    const onOutsideClick = (e: MouseEvent) => {
      if (!panelHost || !toggleBtn) return;
      const t = e.target as Node;
      if (panelHost.contains(t) || toggleBtn.contains(t)) return;
      closePanel();
    };

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) closePanel();
    };

    // --------- Toggle button injection ---------

    /** Find a suitable anchor near the player bottom bar. */
    const findButtonAnchor = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(
        'ytd-watch-flexy #below ytd-watch-metadata, #info ytd-watch-metadata, ytd-watch-metadata',
      );

    const injectToggleBtn = () => {
      if (!showControl) return;
      if (!isWatchPage()) return;
      if (toggleBtn && document.contains(toggleBtn)) return;

      const anchor = findButtonAnchor();
      if (!anchor) return;

      toggleBtn = document.createElement('button');
      toggleBtn.className = 'yt-pro-skip-toggle';
      toggleBtn.title = 'YouTube Pro: channel skip segments';
      toggleBtn.setAttribute('aria-label', 'Edit channel skip segments');
      toggleBtn.innerHTML = SCISSORS_ICON;

      // Position: fixed, placed near bottom-right of the player. We rely on
      // CSS fixed positioning anchored to viewport rather than inserting into
      // the player DOM (which YouTube re-renders aggressively).
      Object.assign(toggleBtn.style, {
        position: 'fixed',
        bottom: '80px',
        right: '16px',
        zIndex: '2147483641',
        background: 'var(--yt-spec-badge-chip-background, rgba(0,0,0,.08))',
        border: 'none',
        borderRadius: '50%',
        width: '34px',
        height: '34px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0',
        color: 'var(--yt-spec-text-primary, #0f0f0f)',
      } as Partial<CSSStyleDeclaration>);

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (panelOpen) closePanel(); else openPanel();
      });

      document.body.appendChild(toggleBtn);
    };

    const removeToggleBtn = () => {
      toggleBtn?.remove();
      toggleBtn = null;
      if (panelOpen) closePanel();
    };

    const offBtnChange = ctx.observer.onChange(() => {
      if (!showControl || !isWatchPage()) return;
      injectToggleBtn();
    });

    const offCfg = watchConfig('per-channel-skip-segments', (cfg) => {
      const next = cfg.showControl;
      if (next === showControl) return;
      showControl = next;
      if (showControl) {
        injectToggleBtn();
      } else {
        removeToggleBtn();
      }
    });

    // Initial injection.
    resolveChannel();
    injectToggleBtn();

    // --------- Teardown ---------
    return () => {
      offMutation();
      offStorage();
      offChange();
      offNav();
      offBtnChange();
      offCfg();
      closePanel();
      removeToggleBtn();
      panelHost?.remove();
      panelHost = null;
      shadow = null;
      document.querySelectorAll<HTMLVideoElement>(VIDEO_SEL).forEach(detach);
    };
  },
};

// ---------- Util ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;',
  );
}

export default feature;
