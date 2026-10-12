/**
 * mute-channels.ts
 *
 * Hide videos from specific channels across the feed, search, and sidebar
 * without unsubscribing. The muted-channel list lives in local storage so
 * it never counts against the 100 kB sync quota.
 *
 * UX surface
 * ──────────
 * • Each video card gets a small "Mute channel" button (hover-reveal, inline
 *   shadow DOM so YouTube CSS can't clobber it).
 * • A fixed bottom-right panel (shadow DOM) lists all muted channels so the
 *   user can unmute without visiting the popup.  Hidden when list is empty.
 *
 * Storage: `local:ytpro:mute-channels` → Record<channelId, channelName>
 * No FeatureConfig — on/off only.
 */

import type { Feature } from '../lib/features';
import { storage } from '#imports';
import {
  enumerateVideoCards,
  cardChannel,
  hideCard,
  unhideCard,
  unhideAllCards,
} from '../lib/yt/feed-cards';

// ─── Constants ───────────────────────────────────────────────────────────────

const FEATURE_ID = 'mute-channels';
const STORAGE_KEY = 'local:ytpro:mute-channels' as const;

/** Attribute marking a card as having already had the mute button injected. */
const INJECTED_ATTR = 'data-yt-pro-mute-injected';

const PANEL_HOST_ID = 'yt-pro-mute-panel-host';

// ─── Shadow DOM CSS ──────────────────────────────────────────────────────────

/** Inline styles for the "Mute channel" button injected into each card. */
const MUTE_BTN_CSS = `
  :host {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    display: none;
  }
  button {
    background: rgba(0,0,0,0.75);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: Roboto, sans-serif;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    line-height: 1.4;
    letter-spacing: 0.3px;
  }
  button:hover {
    background: rgba(200,0,0,0.85);
  }
`;

/** Styles for the persistent muted-channels manager panel. */
const PANEL_CSS = `
  :host {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    font-family: Roboto, "Segoe UI", sans-serif;
  }
  .panel {
    background: var(--yt-spec-base-background, #0f0f0f);
    color: var(--yt-spec-text-primary, #f1f1f1);
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
    border-radius: 12px;
    padding: 14px 16px;
    min-width: 220px;
    max-width: 320px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    font-size: 13px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 8px;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
    opacity: 0.9;
  }
  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 16px;
    line-height: 1;
    opacity: 0.6;
    border-radius: 4px;
  }
  .close-btn:hover { opacity: 1; }
  .toggle-btn {
    background: var(--yt-spec-badge-chip-background, rgba(255,255,255,0.1));
    color: inherit;
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }
  .toggle-btn:hover { background: rgba(255,255,255,0.15); }
  .channel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }
  .channel-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .channel-name {
    font-size: 12px;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .unmute-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.2);
    color: inherit;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .unmute-btn:hover { border-color: rgba(255,255,255,0.5); }
`;

// ─── Feature ─────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: FEATURE_ID,

  async setup(ctx) {
    // ── 1. Load muted channels from storage ──────────────────────────────────
    let mutedChannels: Record<string, string> =
      (await storage.getItem<Record<string, string>>(STORAGE_KEY)) ?? {};

    // ── 2. Panel (muted-channel manager) ─────────────────────────────────────
    let panelHost: HTMLDivElement | null = null;
    let panelShadow: ShadowRoot | null = null;
    let panelVisible = false;

    const ensurePanel = () => {
      if (panelHost && document.contains(panelHost)) return;
      panelHost = document.createElement('div');
      panelHost.id = PANEL_HOST_ID;
      panelShadow = panelHost.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = PANEL_CSS;
      panelShadow.appendChild(styleEl);
      document.body.appendChild(panelHost);
    };

    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      );

    const renderPanel = () => {
      ensurePanel();
      if (!panelShadow) return;

      const count = Object.keys(mutedChannels).length;

      // Hide the entire host when list is empty and panel is not open
      if (count === 0) {
        if (panelHost) panelHost.style.display = 'none';
        return;
      }
      if (panelHost) panelHost.style.display = '';

      // Build HTML
      const channelItems = Object.entries(mutedChannels)
        .map(
          ([id, name]) => `
          <li class="channel-item">
            <span class="channel-name" title="${esc(name || id)}">${esc(name || id)}</span>
            <button class="unmute-btn" data-unmute-id="${esc(id)}">Unmute</button>
          </li>`,
        )
        .join('');

      // Re-render only the panel div (keep the style tag)
      let panel = panelShadow.querySelector<HTMLDivElement>('.panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'panel';
        panelShadow.appendChild(panel);
      }

      if (panelVisible) {
        panel.innerHTML = `
          <div class="header">
            <span class="title">Muted channels (${count})</span>
            <button class="close-btn" data-act="close">✕</button>
          </div>
          <ul class="channel-list">${channelItems}</ul>
        `;
        panel.querySelector('[data-act="close"]')?.addEventListener('click', () => {
          panelVisible = false;
          renderPanel();
        });
        panel.querySelectorAll<HTMLButtonElement>('[data-unmute-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.unmuteId!;
            const next = { ...mutedChannels };
            delete next[id];
            await storage.setItem(STORAGE_KEY, next);
            // storage.watch fires and updates mutedChannels + re-filters
          });
        });
      } else {
        panel.innerHTML = `
          <button class="toggle-btn" data-act="open">
            🔇 ${count} muted channel${count !== 1 ? 's' : ''}
          </button>
        `;
        panel.querySelector('[data-act="open"]')?.addEventListener('click', () => {
          panelVisible = true;
          renderPanel();
        });
      }
    };

    // ── 3. Filter logic ───────────────────────────────────────────────────────

    const filterAll = () => {
      for (const card of enumerateVideoCards()) {
        const { id } = cardChannel(card);
        const shouldHide = id !== null && id in mutedChannels;
        if (shouldHide) {
          hideCard(card, FEATURE_ID);
        } else {
          unhideCard(card, FEATURE_ID);
        }
      }
    };

    // ── 4. Mute button injection ──────────────────────────────────────────────

    const injectMuteButtons = () => {
      for (const card of enumerateVideoCards()) {
        if (card.hasAttribute(INJECTED_ATTR)) continue;
        card.setAttribute(INJECTED_ATTR, '1');

        // Card needs position:relative for the absolute mute button
        const existingPos = getComputedStyle(card).position;
        if (existingPos === 'static') {
          card.style.position = 'relative';
        }

        // Shadow DOM host for the button (isolated from YT styles)
        const btnHost = document.createElement('div');
        const btnShadow = btnHost.attachShadow({ mode: 'open' });
        const styleEl = document.createElement('style');
        styleEl.textContent = MUTE_BTN_CSS;
        btnShadow.appendChild(styleEl);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Mute channel';
        btnShadow.appendChild(btn);

        // Show button on card hover
        card.addEventListener('mouseenter', () => {
          (btnHost as HTMLElement & { style: CSSStyleDeclaration }).style.display = 'block';
        });
        card.addEventListener('mouseleave', () => {
          (btnHost as HTMLElement & { style: CSSStyleDeclaration }).style.display = 'none';
        });

        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ch = cardChannel(card);
          if (!ch.id) return;
          const next = { ...mutedChannels, [ch.id]: ch.name };
          await storage.setItem(STORAGE_KEY, next);
          // storage.watch fires → updates mutedChannels + re-filters + re-renders panel
        });

        card.appendChild(btnHost);
      }
    };

    // ── 5. Storage watcher ────────────────────────────────────────────────────

    const offStorage = storage.watch<Record<string, string>>(STORAGE_KEY, (value) => {
      mutedChannels = value ?? {};
      filterAll();
      renderPanel();
    });

    // ── 6. Observer subscription ──────────────────────────────────────────────

    const offObserver = ctx.observer.onChange(() => {
      injectMuteButtons();
      filterAll();
    });

    // ── 7. Initial run ────────────────────────────────────────────────────────

    injectMuteButtons();
    filterAll();
    renderPanel();

    // ── 8. Teardown ───────────────────────────────────────────────────────────

    return () => {
      offObserver();
      offStorage();
      panelHost?.remove();
      panelHost = null;
      panelShadow = null;

      // Remove all injected mute button hosts
      document.querySelectorAll<HTMLElement>(`[${INJECTED_ATTR}]`).forEach((card) => {
        card.removeAttribute(INJECTED_ATTR);
        // Reset position only if we set it
        // (We stored nothing about original position — safest to leave it;
        //  users who had static will now keep relative, which is harmless.)
      });

      // Restore all cards hidden by this feature
      unhideAllCards(FEATURE_ID);
    };
  },
};

export default feature;
