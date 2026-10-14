/**
 * Theme presets for the `theme` feature. Shared by the content script (builds the CSS) and the
 * popup (draws the swatch picker). A theme with only `light` or only `dark` looks that way whatever
 * YouTube's Appearance setting; one with both follows it.
 */

export interface Palette {
  /** Page background (`base-background`). */
  bg: string;
  /** Cards, header, panels (`raised-background`). */
  raised: string;
  /** Dropdowns and popup menus (`menu-background`). */
  menu: string;
  /** Primary text and icons. */
  text: string;
  /** Metadata, captions, inactive icons. */
  textMuted: string;
  /** Dividers and borders. */
  outline: string;
  /** Translucent fill for chips, hover and pressed states; usually rgba of `text`. */
  additive: string;
  /** Links, focus, primary buttons (`call-to-action`); `bg` is the text on it, so they must contrast. */
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  light?: Palette;
  dark?: Palette;
  /** CSS font-family stack (system fonts only). Omit to keep YouTube's Roboto. */
  font?: string;
  /** Corner radius in px for thumbnails, chips, buttons, menus. Omit to keep YouTube's. */
  radius?: number;
}

// System fonts only (modernfontstacks.com). Chrome ignores the ui-* keywords, hence the named fallbacks.
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Noto Sans', sans-serif";
const ROUNDED = "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif";
const BOOK = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'URW Palladio L', P052, Georgia, serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Liberation Mono', monospace";

export const THEMES: Theme[] = [
  {
    // Arctic Ice Studio's Nord: Polar Night / Snow Storm / Frost.
    id: 'nord',
    name: 'Nord',
    font: SANS,
    radius: 12,
    light: {
      bg: '#eceff4', raised: '#e5e9f0', menu: '#ffffff', text: '#2e3440', textMuted: '#4c566a',
      outline: 'rgba(46,52,64,0.15)', additive: 'rgba(46,52,64,0.08)', accent: '#476a94',
    },
    dark: {
      bg: '#2e3440', raised: '#353c4a', menu: '#434c5e', text: '#eceff4', textMuted: '#c0c8d6',
      outline: 'rgba(236,239,244,0.15)', additive: 'rgba(236,239,244,0.1)', accent: '#93c9d8',
    },
  },
  {
    // Blush paper and wine ink by day; a plum-black evening with petal-pink links.
    id: 'rose',
    name: 'Rosé',
    font: ROUNDED,
    radius: 16,
    light: {
      bg: '#fbf4f5', raised: '#f5e8eb', menu: '#ffffff', text: '#3a2229', textMuted: '#74515c',
      outline: 'rgba(58,34,41,0.14)', additive: 'rgba(58,34,41,0.07)', accent: '#a8336a',
    },
    dark: {
      bg: '#1d1418', raised: '#251a1f', menu: '#33242b', text: '#f7e6ec', textMuted: '#c8a7b3',
      outline: 'rgba(247,230,236,0.15)', additive: 'rgba(247,230,236,0.1)', accent: '#f2a2c0',
    },
  },
  {
    // Sage paper with pine ink; a night canopy with moss-lit links.
    id: 'forest',
    name: 'Forest',
    font: SANS,
    radius: 8,
    light: {
      bg: '#f2f4ee', raised: '#e8ece2', menu: '#ffffff', text: '#1d2a21', textMuted: '#4d5e51',
      outline: 'rgba(29,42,33,0.15)', additive: 'rgba(29,42,33,0.07)', accent: '#2d6a45',
    },
    dark: {
      bg: '#111914', raised: '#17211a', menu: '#223027', text: '#e2ebe3', textMuted: '#a1b3a5',
      outline: 'rgba(226,235,227,0.14)', additive: 'rgba(226,235,227,0.09)', accent: '#7fc79b',
    },
  },
  {
    // Ethan Schoonover's Solarized base tones; blue nudged for contrast (stock #268bd2 fails as link text).
    id: 'solarized',
    name: 'Solarized',
    font: SANS,
    radius: 6,
    light: {
      bg: '#fdf6e3', raised: '#eee8d5', menu: '#fffbef', text: '#073642', textMuted: '#4f646b',
      outline: 'rgba(7,54,66,0.15)', additive: 'rgba(7,54,66,0.08)', accent: '#1a649c',
    },
    dark: {
      bg: '#002b36', raised: '#073642', menu: '#0b4150', text: '#eee8d5', textMuted: '#a7b4b4',
      outline: 'rgba(238,232,213,0.15)', additive: 'rgba(238,232,213,0.1)', accent: '#64b0ea',
    },
  },
  {
    // A paperback page: cream stock, brown ink, sienna links. Light only.
    id: 'sepia',
    name: 'Sepia',
    font: BOOK,
    radius: 4,
    light: {
      bg: '#f4ecd8', raised: '#ece1c6', menu: '#fbf6ea', text: '#3b2e20', textMuted: '#69573f',
      outline: 'rgba(59,46,32,0.16)', additive: 'rgba(59,46,32,0.08)', accent: '#8a4a1c',
    },
  },
  {
    // Pure black for OLED panels, otherwise YouTube's own dark tones. Dark only.
    id: 'oled',
    name: 'OLED Black',
    dark: {
      bg: '#000000', raised: '#000000', menu: '#121212', text: '#f1f1f1', textMuted: '#aaaaaa',
      outline: 'rgba(255,255,255,0.2)', additive: 'rgba(255,255,255,0.1)', accent: '#3ea6ff',
    },
  },
  {
    // Green-phosphor CRT: square corners, monospace, bright cursor-green accent. Dark only.
    id: 'terminal',
    name: 'Terminal',
    font: MONO,
    radius: 0,
    dark: {
      bg: '#0a0f0b', raised: '#0f1611', menu: '#18241b', text: '#b4ecc0', textMuted: '#6fa67c',
      outline: 'rgba(180,236,192,0.18)', additive: 'rgba(180,236,192,0.1)', accent: '#3dff7f',
    },
  },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
