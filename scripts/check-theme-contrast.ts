// WCAG 2.1 contrast floor for every theme palette. Run: node scripts/check-theme-contrast.ts
// @ts-ignore -- Node needs the .ts extension; the bundler tsconfig rejects it.
import { THEMES } from '../src/features/theme/themes.ts';

const MIN = 4.5;
const PAIRS = [
  'text/bg', 'text/raised', 'text/menu',
  'textMuted/bg', 'textMuted/raised', 'textMuted/menu',
  'accent/bg', 'accent/raised', 'accent/menu',
];

/** Relative luminance of a #rgb / #rrggbb color; NaN for anything else (so it fails the check). */
const luminance = (hex: string): number => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return NaN;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const failures: string[] = [];
for (const theme of THEMES) {
  for (const mode of ['light', 'dark'] as const) {
    const p = theme[mode] as Record<string, string> | undefined;
    if (!p) continue;
    const ratios = PAIRS.map((pair) => {
      const [fg, bg] = pair.split('/');
      const r = contrast(p[fg], p[bg]);
      if (!(r >= MIN)) failures.push(`${theme.id}.${mode}: ${fg} ${p[fg]} on ${bg} ${p[bg]} = ${r.toFixed(2)}`);
      return r;
    });
    console.log(`${`${theme.id}.${mode}`.padEnd(16)} min ${Math.min(...ratios).toFixed(2)}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} pair(s) below ${MIN}:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAll palettes pass (>= ${MIN}).`);
