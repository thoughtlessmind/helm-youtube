/**
 * video-tags — attach custom text tags to any YouTube video.
 *
 * Injects a compact shadow-DOM tag bar inline inside `ytd-watch-metadata`
 * (appended as a direct child, below the existing metadata). Each tag
 * renders as a chip with an × remove button. An input field lets the user
 * add new tags. All data persists in `local:ytpro:video-tags` keyed by
 * video id. The bar is hidden on non-watch pages and reloads whenever the
 * watch video changes.
 *
 * Storage shape:  `local:ytpro:video-tags`  →  Record<videoId, string[]>
 * FeatureConfig:  none
 * Permissions:    none new
 * Catalog:        Notes & Tags / "Video Tags"
 */

import { storage } from '#imports';
import type { Feature } from '../lib/features';
import { getVideoId, isWatchPage } from '../lib/yt/video';

// ─── Constants ───────────────────────────────────────────────────────────────

const HOST_ID = 'yt-pro-video-tags-host';
const STORAGE_KEY = 'local:ytpro:video-tags' as const;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 40;

/** Candidate selectors for the watch metadata container (feature detection). */
const METADATA_SELECTORS = [
  'ytd-watch-metadata',
  '#above-the-fold',
  '#primary-inner ytd-video-primary-info-renderer',
];

// ─── CSS (scoped inside shadow root) ─────────────────────────────────────────

const SHADOW_CSS = `
  :host {
    all: initial;
    display: block;
    font-family: "YouTube Sans", Roboto, system-ui, sans-serif;
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: inherit; }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 0 4px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.07));
    color: var(--yt-spec-text-primary, #0f0f0f);
    border: none;
    border-radius: 14px;
    padding: 3px 8px 3px 10px;
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    cursor: default;
    user-select: none;
  }

  html[dark] .chip,
  [dark] .chip {
    background: rgba(255,255,255,0.12);
    color: #f1f1f1;
  }

  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    padding: 0;
    margin: 0;
    font-size: 14px;
    line-height: 1;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    transition: opacity 0.15s, background 0.15s;
  }
  .chip-remove:hover { opacity: 1; background: rgba(0,0,0,0.08); }

  .add-form {
    display: inline-flex;
    align-items: center;
    gap: 0;
  }

  .add-input {
    border: 1.5px solid var(--yt-spec-text-secondary, #606060);
    border-radius: 14px 0 0 14px;
    background: transparent;
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 10px;
    outline: none;
    width: 120px;
    transition: border-color 0.15s;
  }
  .add-input:focus {
    border-color: var(--yt-spec-call-to-action, #065fd4);
  }

  html[dark] .add-input,
  [dark] .add-input {
    color: #f1f1f1;
    border-color: rgba(255,255,255,0.35);
  }
  html[dark] .add-input:focus,
  [dark] .add-input:focus {
    border-color: #3ea6ff;
  }

  .add-btn {
    border: 1.5px solid var(--yt-spec-text-secondary, #606060);
    border-left: none;
    border-radius: 0 14px 14px 0;
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05));
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .add-btn:hover {
    background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.1));
  }

  html[dark] .add-btn,
  [dark] .add-btn {
    color: #f1f1f1;
    border-color: rgba(255,255,255,0.35);
    background: rgba(255,255,255,0.06);
  }
`;

// ─── Feature ──────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'video-tags',

  setup(ctx) {
    // In-memory cache of the full tags dict. Reduces storage reads.
    let tagCache: Record<string, string[]> = {};
    let currentVideoId: string | null = null;

    // DOM handles.
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let inputEl: HTMLInputElement | null = null;

    const teardowns: Array<() => void> = [];

    // ── Storage ─────────────────────────────────────────────────────────────

    const loadCache = async () => {
      tagCache = (await storage.getItem<Record<string, string[]>>(STORAGE_KEY)) ?? {};
    };

    const saveCache = () => storage.setItem(STORAGE_KEY, tagCache);

    const tagsFor = (vid: string): string[] => tagCache[vid] ?? [];

    const addTag = async (vid: string, tag: string) => {
      const trimmed = tag.trim().slice(0, MAX_TAG_LEN);
      if (!trimmed) return;
      const existing = tagsFor(vid);
      if (existing.includes(trimmed)) return;
      if (existing.length >= MAX_TAGS) return;
      tagCache[vid] = [...existing, trimmed];
      await saveCache();
      render();
    };

    const removeTag = async (vid: string, tag: string) => {
      const existing = tagsFor(vid);
      tagCache[vid] = existing.filter((t) => t !== tag);
      if (tagCache[vid].length === 0) delete tagCache[vid];
      await saveCache();
      render();
    };

    // ── DOM: find host insertion point ───────────────────────────────────────

    const findContainer = (): HTMLElement | null => {
      for (const sel of METADATA_SELECTORS) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };

    // ── Shadow DOM rendering ─────────────────────────────────────────────────

    const ensureHost = (): boolean => {
      if (host && document.contains(host)) return true;
      const container = findContainer();
      if (!container) return false;

      host = document.createElement('div');
      host.id = HOST_ID;
      shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = SHADOW_CSS;
      shadow.appendChild(style);

      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.id = 'bar';
      shadow.appendChild(bar);

      container.appendChild(host);
      return true;
    };

    const render = () => {
      if (!shadow) return;
      const bar = shadow.getElementById('bar');
      if (!bar) return;

      const vid = currentVideoId;
      const tags = vid ? tagsFor(vid) : [];

      // Build chip elements.
      const chips = tags.map((tag) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = tag;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'chip-remove';
        removeBtn.title = `Remove tag "${tag}"`;
        removeBtn.setAttribute('aria-label', `Remove tag ${tag}`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          if (vid) void removeTag(vid, tag);
        });
        chip.appendChild(removeBtn);
        return chip;
      });

      // Build add form.
      const form = document.createElement('span');
      form.className = 'add-form';

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'add-input';
      inp.placeholder = 'Add tag…';
      inp.maxLength = MAX_TAG_LEN;
      inp.setAttribute('aria-label', 'New tag');
      // Prevent page-level key handlers (e.g. loop-section) from firing.
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      inp.addEventListener('keyup', (e) => e.stopPropagation());
      inp.addEventListener('keypress', (e) => e.stopPropagation());
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (vid) void addTag(vid, inp.value);
          inp.value = '';
        }
      });
      inputEl = inp;

      const addBtn = document.createElement('button');
      addBtn.className = 'add-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add tag';
      addBtn.setAttribute('aria-label', 'Add tag');
      addBtn.addEventListener('click', () => {
        if (vid) void addTag(vid, inp.value);
        inp.value = '';
        inp.focus();
      });

      form.appendChild(inp);
      form.appendChild(addBtn);

      // Rebuild bar contents.
      bar.replaceChildren(...chips, form);
    };

    // ── Mount / nav logic ────────────────────────────────────────────────────

    const inject = () => {
      if (!isWatchPage()) {
        if (host) host.style.display = 'none';
        return;
      }
      if (host) host.style.display = '';
      if (!ensureHost()) return; // metadata not rendered yet; onChange will retry
      render();
    };

    const onNavigate = (url: string) => {
      void (async () => {
        currentVideoId = getVideoId();
        inject();
      })();
    };

    // ── Bootstrap ────────────────────────────────────────────────────────────

    void (async () => {
      await loadCache();

      // Watch for storage updates from other tabs/windows.
      teardowns.push(
        storage.watch<Record<string, string[]>>(STORAGE_KEY, (v) => {
          if (v) tagCache = v;
          render();
        }),
      );

      currentVideoId = getVideoId();
      inject();

      // Re-attempt mount if metadata renders late.
      teardowns.push(ctx.observer.onChange(() => inject()));
      teardowns.push(ctx.navigation.onNavigate(onNavigate));
    })();

    // ── Teardown ─────────────────────────────────────────────────────────────

    return () => {
      teardowns.forEach((off) => off());
      host?.remove();
      host = null;
      shadow = null;
      inputEl = null;
    };
  },
};

export default feature;
