import { storage } from '#imports';
import type { Feature } from '../lib/features';

/**
 * Theme Presets — recolor YouTube by overriding its CSS custom property
 * (`--yt-sys-color-baseline--*`) family on the `html` element. Each preset is a
 * self-contained palette: base/raised/menu backgrounds, primary/secondary
 * text, and an accent color. We derive every YT spec token from those five
 * values so presets stay readable without per-token micro-tuning.
 *
 * Why CSS custom properties rather than class/attribute toggling?
 * YouTube already ships `--yt-sys-*` tokens as its theming layer. Patching
 * them at the `html` level is the lightest possible override — no selectors
 * need to name individual components, and the tokens cascade everywhere YT
 * already uses them, including dynamically inserted nodes.
 *
 * The `default` preset is a no-op (empty style block) so teardown and
 * "choose default" behave identically and don't fight YouTube's own dark/
 * light mode tokens.
 *
 * Contrast notes (checked with WCAG AA 4.5:1 minimum for normal text):
 *   dim           — bg #1a1a1a / text #e8e8e8  ≈ 12:1 ✓
 *   midnight-blue — bg #0d1b2a / text #ccd6f6  ≈ 10:1 ✓
 *   nord          — bg #2e3440 / text #eceff4  ≈ 11:1 ✓
 *   dracula       — bg #282a36 / text #f8f8f2  ≈ 13:1 ✓
 *   sepia         — bg #f4ede4 / text #3b2f22  ≈ 10:1 ✓
 *   rose          — bg #1f1217 / text #f0d6e8  ≈ 11:1 ✓
 */

// ─── Config type ──────────────────────────────────────────────────────────────

interface ThemePresetsConfig {
  preset: string;
}

const CONFIG_KEY = 'sync:config:theme-presets' as const;
const CONFIG_DEFAULT: ThemePresetsConfig = { preset: 'default' };

// ─── Preset catalogue ─────────────────────────────────────────────────────────

export interface ThemePreset {
  id: string;
  label: string;
}

/** Full list of available presets — exported for the popup dropdown. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default',       label: 'Default (YouTube)' },
  { id: 'dim',           label: 'Dim'               },
  { id: 'midnight-blue', label: 'Midnight Blue'     },
  { id: 'nord',          label: 'Nord'              },
  { id: 'dracula',       label: 'Dracula'           },
  { id: 'sepia',         label: 'Sepia'             },
  { id: 'rose',          label: 'Rose'              },
];

// ─── Token maps ───────────────────────────────────────────────────────────────

interface PaletteTokens {
  base:        string; // deepest background (page body)
  raised:      string; // cards, panels, raised surfaces
  menu:        string; // dropdowns, context menus
  overlay:     string; // modal overlays / scrim
  textPrimary:   string;
  textSecondary: string;
  accent:      string; // call-to-action, brand buttons
  accentText:  string; // text on top of accent backgrounds
}

/** Palette definitions. Keep each entry visually distinct and accessible. */
const PALETTES: Record<string, PaletteTokens | null> = {
  // null → default preset, inject nothing
  default: null,

  // Neutral charcoal — dark but warmer than YouTube's default black
  dim: {
    base:          '#1a1a1a',
    raised:        '#242424',
    menu:          '#2e2e2e',
    overlay:       'rgba(0,0,0,0.7)',
    textPrimary:   '#e8e8e8',
    textSecondary: '#aaaaaa',
    accent:        '#ff4040',
    accentText:    '#ffffff',
  },

  // Deep navy — cool, focused
  'midnight-blue': {
    base:          '#0d1b2a',
    raised:        '#162840',
    menu:          '#1e3454',
    overlay:       'rgba(5,12,24,0.8)',
    textPrimary:   '#ccd6f6',
    textSecondary: '#8892b0',
    accent:        '#64b5f6',
    accentText:    '#0d1b2a',
  },

  // Nord palette — cool slate, popular in dev tools
  nord: {
    base:          '#2e3440',
    raised:        '#3b4252',
    menu:          '#434c5e',
    overlay:       'rgba(30,34,40,0.85)',
    textPrimary:   '#eceff4',
    textSecondary: '#d8dee9',
    accent:        '#88c0d0',
    accentText:    '#2e3440',
  },

  // Dracula — classic purple/dark hacker aesthetic
  dracula: {
    base:          '#282a36',
    raised:        '#313442',
    menu:          '#3a3d4f',
    overlay:       'rgba(24,25,33,0.85)',
    textPrimary:   '#f8f8f2',
    textSecondary: '#6272a4',
    accent:        '#bd93f9',
    accentText:    '#282a36',
  },

  // Sepia — warm paper feel, comfortable for light-mode readers
  sepia: {
    base:          '#f4ede4',
    raised:        '#ede0d0',
    menu:          '#e8d5be',
    overlay:       'rgba(59,47,34,0.5)',
    textPrimary:   '#3b2f22',
    textSecondary: '#7a6652',
    accent:        '#b85c2c',
    accentText:    '#ffffff',
  },

  // Rose — deep plum/merlot with pink tones
  rose: {
    base:          '#1f1217',
    raised:        '#2b1923',
    menu:          '#37202e',
    overlay:       'rgba(15,8,12,0.8)',
    textPrimary:   '#f0d6e8',
    textSecondary: '#b08898',
    accent:        '#e06b9a',
    accentText:    '#1f1217',
  },
};

// ─── CSS generation ───────────────────────────────────────────────────────────

function buildCSS(presetId: string): string {
  const palette = PALETTES[presetId] ?? null;
  if (!palette) return ''; // 'default' — no override

  const { base, raised, menu, textPrimary, textSecondary, accent } = palette;

  // YouTube's live tokens are `--yt-sys-color-baseline--*`; the legacy
  // `--yt-spec-*` names our own panels read are aliased to these in
  // lib/yt/theme.ts, so they follow the preset automatically.
  const t = '--yt-sys-color-baseline-';
  return `
html {
  ${t}-base-background:   ${base}    !important;
  ${t}-raised-background: ${raised}  !important;
  ${t}-menu-background:   ${menu}    !important;
  ${t}-text-primary:      ${textPrimary}   !important;
  ${t}-text-secondary:    ${textSecondary} !important;
  ${t}-text-disabled:     ${textSecondary} !important;
  ${t}-call-to-action:    ${accent}  !important;
  ${t}-static-brand-red:  ${accent}  !important;
}
html body, html ytd-app, html #masthead-container, html ytd-mini-guide-renderer,
html ytd-guide-renderer, html ytd-watch-flexy, html ytd-browse {
  background-color: ${base} !important;
}
`;
}

// ─── Style injection helpers ──────────────────────────────────────────────────

const STYLE_ID = 'yt-pro-theme-presets';

function applyStyle(css: string): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

// ─── Feature ─────────────────────────────────────────────────────────────────

const feature: Feature = {
  id: 'theme-presets',

  async setup() {
    const stored = await storage.getItem<ThemePresetsConfig>(CONFIG_KEY);
    const cfg: ThemePresetsConfig = { ...CONFIG_DEFAULT, ...(stored ?? {}) };
    applyStyle(buildCSS(cfg.preset));

    const offConfig = storage.watch<ThemePresetsConfig>(CONFIG_KEY, (value) => {
      const next: ThemePresetsConfig = { ...CONFIG_DEFAULT, ...(value ?? {}) };
      applyStyle(buildCSS(next.preset));
    });

    return () => {
      offConfig();
      document.getElementById(STYLE_ID)?.remove();
    };
  },
};

export default feature;
