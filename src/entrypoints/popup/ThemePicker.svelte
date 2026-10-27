<script lang="ts">
  import { THEMES, type Palette, type Theme } from '../../features/theme/themes';

  /** Swatch-card radiogroup over `THEMES`; `withOff` leads with YouTube's own look as id `off`. */
  let {
    selected,
    onpick,
    withOff = false,
    label = 'Theme',
  }: { selected: string; onpick: (id: string) => void; withOff?: boolean; label?: string } = $props();

  type Swatch = Pick<Palette, 'bg' | 'text' | 'textMuted' | 'accent'>;
  type Card = Pick<Theme, 'id' | 'name' | 'font' | 'radius'> & { light?: Swatch; dark?: Swatch; tag?: string };

  const ROBOTO = 'Roboto, Arial, sans-serif';
  const OFF: Card = {
    id: 'off',
    name: 'Off',
    tag: 'YouTube’s own',
    font: ROBOTO,
    light: { bg: '#fff', text: '#0f0f0f', textMuted: '#606060', accent: '#065fd4' },
    dark: { bg: '#0f0f0f', text: '#f1f1f1', textMuted: '#aaa', accent: '#3ea6ff' },
  };
  const cards: Card[] = $derived(withOff ? [OFF, ...THEMES] : THEMES);
</script>

<div class="themes" role="radiogroup" aria-label={label}>
  {#each cards as t (t.id)}
    <label class="theme">
      <input type="radio" name="theme" checked={selected === t.id} onchange={() => onpick(t.id)} />
      <!-- Light pane fills the swatch; a dark pane is clipped over its lower-right half. -->
      <span class="swatch" aria-hidden="true" style:--tr={t.radius == null ? undefined : `${t.radius}px`}>
        {#each [t.light, t.dark].filter((p) => p !== undefined) as p, i (i)}
          <span class="pane" style:background={p.bg} style:color={p.text}>
            <!-- No font = YouTube's Roboto. -->
            <span class="aa" style:font-family={t.font ?? ROBOTO}>Aa<span class="dot" style:background={p.accent}></span></span>
            <span class="ln" style:background={p.textMuted}></span>
          </span>
        {/each}
      </span>
      <span class="t-name">{t.name}</span>
      <span class="t-tag">{t.tag ?? (t.light && t.dark ? 'Light · Dark' : t.light ? 'Light only' : 'Dark only')}</span>
    </label>
  {/each}
</div>

<style>
  .themes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .theme {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 5px 5px 8px;
    border-radius: 14px;
    background: var(--raised);
    font-size: 12px;
    line-height: 16px;
    cursor: pointer;
  }
  .theme:has(input:checked) {
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .theme:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .theme input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
  }
  .swatch {
    position: relative;
    display: grid;
    height: 48px;
    overflow: hidden;
    /* The theme's own corner radius, scaled to swatch size; unset → YouTube's 12px. */
    border-radius: min(10px, calc(var(--tr, 12px) / 2));
  }
  .swatch::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.22);
  }
  .pane {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 7px 8px;
  }
  /* Dark half: the light pane's layout turned 180°, so the two never crowd the diagonal. */
  .pane + .pane {
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
    flex-direction: column-reverse;
    align-items: flex-end;
  }
  .aa {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }
  .dot {
    width: 9px;
    height: 5px;
    border-radius: 3px;
  }
  .ln {
    width: 18px;
    height: 3px;
    border-radius: 2px;
  }
  .t-name,
  .t-tag {
    padding: 0 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-name {
    margin-top: 6px;
    font-weight: 600;
  }
  .t-tag {
    font-size: 11px;
    line-height: 14px;
    color: var(--muted);
  }
</style>
