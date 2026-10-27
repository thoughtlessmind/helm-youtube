<svelte:options css="injected" />

<script lang="ts">
  import { tick } from 'svelte';
  import { pageTooltip } from '../../lib/yt/ui';
  import { FAV, channelCount, store } from './store.svelte';

  interface Props {
    onPick: (id: string) => void;
    onNew: () => void;
    onManage: () => void;
    onSwap: () => void;
  }
  let { onPick, onNew, onManage, onSwap }: Props = $props();

  const youtubeShown = $derived(store.chipBar && store.youtubeChips);
  const swapLabel = $derived(youtubeShown ? 'Show channel groups' : 'Show YouTube topics');

  function swap(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    onSwap();
    btn.focus(); // the row just moved within the strip, which drops focus
  }

  let tablist = $state<HTMLDivElement>();
  const tabs = $derived([{ id: '', name: 'All' }, ...store.groups.filter((g) => channelCount(g) > 0)]);
  const current = $derived(tabs.find((t) => t.id === store.selected) ?? tabs[0]);

  async function pick(id: string, focus = false) {
    onPick(id);
    if (!focus) return;
    await tick();
    tablist?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  function onKey(e: KeyboardEvent) {
    const n = tabs.length;
    const i = Math.max(0, tabs.indexOf(current));
    const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    pick(tabs[j].id, true);
  }
</script>

{#if !youtubeShown}
  <div class="chips">
    <div bind:this={tablist} class="tabs" role="tablist" aria-label="Channel groups">
      {#each tabs as t (t.id)}
        {@const on = t === current}
        <button class="ytp-chip" type="button" role="tab" aria-selected={on} tabindex={on ? 0 : -1} onclick={() => pick(t.id)} onkeydown={onKey}>
          {#if t.id === FAV}
            <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 16.95 6.62 19.8l1.03-6L3.3 9.6l6-.9z" fill="currentColor"></path></svg>
          {/if}
          <span class="lbl">{t.name}</span>
        </button>
      {/each}
    </div>
    <button class="ytp-chip out" type="button" aria-haspopup="dialog" onclick={onNew}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
      New group
    </button>
    <button class="ytp-chip out" type="button" aria-haspopup="dialog" onclick={onManage}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle></svg>
      Manage groups
    </button>
  </div>
{/if}
{#if store.chipBar}
  <button class="ytp-chip out swap" type="button" aria-label={swapLabel} onclick={swap} {@attach (el) => pageTooltip(el, () => swapLabel)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"></path></svg>
  </button>
{/if}

<style>
  .chips { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 12px; overflow-x: auto; padding: 3px; margin: -3px; scrollbar-width: none; }
  .tabs { display: flex; align-items: center; gap: 12px; }
  .ytp-chip { flex: none; }
  .star { width: 16px; height: 16px; }
  .lbl { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
  .out { background: none; box-shadow: inset 0 0 0 1px var(--yt-sys-color-baseline--outline); padding: 0 12px 0 9px; }
  .out:hover { background: var(--yt-sys-color-baseline--additive-background); }
  .out svg { width: 18px; height: 18px; }
  .swap { order: 2; width: 32px; padding: 0; justify-content: center; } /* after the filters part: the strip's right end */
</style>
