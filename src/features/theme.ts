import type { Feature } from '../lib/features';
import { getConfig, watchConfig } from '../lib/settings';
import { addStyle } from '../lib/yt/ui';
import { themeById, type Palette, type Theme } from './theme/themes';

/**
 * Recolor YouTube from a `THEMES` preset. YouTube colors come from two layers:
 * - `--yt-sys-color-baseline--*` tokens, read by older components and by our own UI;
 * - hashed `--t<16 hex>` vars, read by newer components. They hold raw colors, not var() refs,
 *   so each one is pointed at the token whose light|dark value pair it shares.
 * A light-only or dark-only theme never sets `html[dark]`: YouTube hard-reloads (`themeRefresh=1`)
 * on the next navigation when that disagrees with its saved Appearance. Instead it writes the
 * whole var set of its mode. `[dark]` / `[light]` islands inside the page are themed too.
 */

const SYS = '--yt-sys-color-baseline--';
const HASHED = /^--t[0-9a-f]{16}$/;

const mix = (a: string, pct: number, b = 'transparent') => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/** The palette's value for each mode-dependent token YouTube's surfaces read. */
const tokens = (p: Palette): Record<string, string> => ({
  'base-background': p.bg,
  'raised-background': p.raised,
  'menu-background': p.menu,
  'surface-container': p.raised,
  'frosted-glass-desktop': mix(p.bg, 90),
  'text-primary': p.text,
  'text-secondary': p.textMuted,
  'text-disabled': mix(p.textMuted, 60, p.bg),
  'text-primary-inverse': p.bg,
  'text-secondary-inverse': mix(p.bg, 70, p.text),
  'inverted-background': p.text,
  'inverted-background-hover': mix(p.text, 80, p.bg),
  'mono-filled-hover': mix(p.text, 85, p.bg),
  'outline': p.outline,
  'outline-opaque': mix(p.text, 15, p.bg),
  'additive-background': p.additive,
  'tonal-background': p.additive,
  'button-chip-background-hover': mix(p.text, 18),
  'mono-tonal-hover': mix(p.text, 18),
  'state-mono-standard-hovered': mix(p.text, 5),
  'state-mono-standard-pressed': mix(p.text, 10),
  'call-to-action': p.accent,
  'call-to-action-hover': mix(p.accent, 85, p.text),
  'call-to-action-inverse': p.bg, // toast/link text on `inverted-background` (= text)
  'suggested-action': mix(p.accent, 18, p.bg),
  'suggested-action-hover': mix(p.accent, 28, p.bg),
  'touch-response': p.text,
  'wordmark-text': p.text,
  'icon-active-other': p.text,
  'scrim-background-gradient-1': mix(p.bg, 0),
  'scrim-background-gradient-2': mix(p.bg, 30),
  'scrim-background-gradient-3': mix(p.bg, 60),
  'scrim-background-gradient-4': mix(p.bg, 90),
  'scrim-background-gradient-5': p.bg,
});

/** Every custom property as seen by an element carrying YouTube's `[light]` / `[dark]` scope. */
function readVars(mode: 'light' | 'dark'): Map<string, string> {
  const probe = document.createElement('i');
  probe.setAttribute(mode, '');
  probe.hidden = true;
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const vars = new Map<string, string>();
  for (const name of cs) if (name.startsWith('--')) vars.set(name, cs.getPropertyValue(name).trim());
  probe.remove();
  return vars;
}

/** Corners YouTube draws at its card/chip/button radius. Avatars and round icon buttons keep theirs. */
const ROUNDED = [
  'yt-thumbnail-view-model',
  'ytd-thumbnail #thumbnail',
  '.shortsLockupViewModelHostThumbnailParentContainer',
  'ytd-watch-flexy:not([theater]):not([fullscreen]) #ytd-player',
  'ytd-watch-metadata #description',
  'ytd-live-chat-frame#chat',
  '.ytSearchboxComponentSuggestionsContainer',
  'ytd-menu-popup-renderer',
  'ytd-multi-page-menu-renderer',
  '.ytChipShapeChip',
  'yt-chip-cloud-chip-renderer',
  '.ytSpecButtonShapeNextHost:not(.ytSpecButtonShapeNextIconButton,.ytSpecButtonShapeNextIconOnlyDefault,.ytSpecButtonShapeNextSegmentedStart,.ytSpecButtonShapeNextSegmentedEnd)',
  '.yt-spec-button-shape-next:not(.yt-spec-button-shape-next--icon-button,.yt-spec-button-shape-next--segmented-start,.yt-spec-button-shape-next--segmented-end)',
].join(',');
/** Joined pairs (like | dislike): only their outer corners round. */
const SEG_START = '.ytSpecButtonShapeNextSegmentedStart,.yt-spec-button-shape-next--segmented-start';
const SEG_END = '.ytSpecButtonShapeNextSegmentedEnd,.yt-spec-button-shape-next--segmented-end';

const radiusCss = (r: number) => `
${ROUNDED}{border-radius:${r}px!important}
:is(${ROUNDED},${SEG_START},${SEG_END}) :is(yt-touch-feedback-shape,.ytSpecTouchFeedbackShapeStroke,.ytSpecTouchFeedbackShapeFill,.ytSpecTouchFeedbackShapeHoverEffect){border-radius:inherit!important}
:is(${SEG_START},.ytSearchboxComponentInputBox){border-radius:${r}px 0 0 ${r}px!important}
:is(${SEG_END},.ytSearchboxComponentSearchButton){border-radius:0 ${r}px ${r}px 0!important}`;

const rule = (selector: string, decls: string[]) => `${selector}{${decls.map((d) => `${d}!important`).join(';')}}`;

export function themeCss(theme: Theme): string {
  const light = readVars('light');
  const dark = readVars('dark');
  const pair = (name: string) => `${light.get(name)}|${dark.get(name)}`;

  // Hashed var → the token with the same light|dark values (first match wins; collisions share a value).
  const tokenByPair = new Map<string, string>();
  for (const name of Object.keys(tokens(theme.light ?? theme.dark!))) {
    if (!tokenByPair.has(pair(SYS + name))) tokenByPair.set(pair(SYS + name), name);
  }
  const aliases: string[] = [];
  for (const name of light.keys()) {
    const token = HASHED.test(name) && tokenByPair.get(pair(name));
    if (token) aliases.push(`${name}:var(${SYS}${token})`);
  }

  const decls = (p: Palette) => [
    ...Object.entries(tokens(p)).map(([name, value]) => `${SYS}${name}:${value}`),
    ...aliases,
    // lib/yt/ui.ts dialogs would vanish into a page that has no raised surface.
    ...(p.raised === p.bg ? [`--ytp-dialog-outline:1px solid ${p.outline}`] : []),
  ];

  let css: string;
  if (theme.light && theme.dark) {
    css = rule('html:not([dark]),html [light]', decls(theme.light)) + rule('html[dark],html [dark]', decls(theme.dark));
  } else {
    const [own, other] = theme.light ? [light, dark] : [dark, light];
    const modeVars = [...own]
      .filter(([name, value]) => (name.startsWith(SYS) || HASHED.test(name)) && other.get(name) !== value)
      .map(([name, value]) => `${name}:${value}`);
    css = rule('html,html [dark],html [light]', [...modeVars, ...decls((theme.light ?? theme.dark)!)]);
    css += `html{color-scheme:${theme.light ? 'light' : 'dark'}!important}`; // scrollbars, native inputs
  }
  // Hard-coded colors: html's own background, the search box (light, or `…Dark` classes set by JS),
  // and a hovered card's title/metadata, inlined from the thumbnail in a shade for YouTube's own mode.
  const t = (name: string) => `var(${SYS}${name})!important`;
  css += `html{background-color:${t('base-background')}}
.ytLockupMetadataViewModelTitle:not(.ytLockupMetadataViewModelOverlay *){color:${t('text-primary')}}
.ytLockupMetadataViewModelMetadata:not(.ytLockupMetadataViewModelOverlay *){color:${t('text-secondary')}}
.ytSearchboxComponentInputBox{background-color:${t('base-background')};border-color:${t('outline')}}
.ytSearchboxComponentInputBox.ytSearchboxComponentInputBoxHasFocus{border-color:${t('call-to-action')}}
.ytSearchboxComponentSearchButton{background-color:${t('additive-background')};border-color:${t('outline')}}`;
  if (theme.font) css += `html body,html body *:not(.ytp-caption-segment){font-family:${theme.font}!important}`;
  if (theme.radius !== undefined) css += radiusCss(theme.radius);
  return css;
}

const feature: Feature = {
  async setup() {
    if (location.hostname !== 'www.youtube.com') return; // Music / Studio have their own tokens
    let style: HTMLStyleElement | undefined;
    // ponytail: hashed vars are read once per preset change; if YouTube lazy-loads CSS that declares
    // new ones, those stay un-themed until reload. Re-run on ctx.navigation.onNavigate if that shows up.
    const apply = ({ preset }: { preset: string }) => {
      style?.remove(); // readVars must see YouTube's values, not the previous theme's.
      style = addStyle(themeCss(themeById(preset)));
    };
    apply(await getConfig('theme'));
    const off = watchConfig('theme', apply);
    return () => {
      off();
      style?.remove();
    };
  },
};

export default feature;
