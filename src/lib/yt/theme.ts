/**
 * YouTube retired its `--yt-spec-*` color tokens in favour of
 * `--yt-sys-color-baseline--*`. Feature UI still reads the legacy names
 * (with light-theme fallbacks, so dark mode broke silently). Alias them
 * once here so the next rename is a one-file fix.
 *
 * Theme features (true-black, theme-presets) write the NEW tokens; these
 * aliases resolve against them, so injected panels follow the theme too.
 */
const STYLE_ID = 'yt-pro-theme-aliases';

const ALIASES: Record<string, string> = {
  'text-primary': 'text-primary',
  'text-secondary': 'text-secondary',
  'text-disabled': 'text-disabled',
  '10-percent-layer': 'outline',
  outline: 'outline',
  'badge-chip-background': 'additive-background',
  'additive-background': 'additive-background',
  'base-background': 'base-background',
  'general-background-a': 'base-background',
  'general-background-b': 'base-background',
  'general-background-c': 'raised-background',
  'raised-background': 'raised-background',
  'menu-background': 'menu-background',
  'call-to-action': 'call-to-action',
  'static-brand-red': 'static-brand-red',
  'brand-button-background': 'static-brand-red',
  'brand-icon-active': 'text-primary',
  'icon-active-other': 'text-primary',
  'icon-inactive': 'text-secondary',
};

export function installThemeAliases(): void {
  if (document.getElementById(STYLE_ID)) return;
  const decls = Object.entries(ALIASES)
    .map(([legacy, sys]) => `--yt-spec-${legacy}: var(--yt-sys-color-baseline--${sys});`)
    .join('\n  ');
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `html {\n  ${decls}\n}`;
  document.documentElement.appendChild(style);
}
