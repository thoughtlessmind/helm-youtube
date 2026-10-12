<svelte:options css="injected" />

<script lang="ts">
  import { tick } from 'svelte';
  import { FAV, channelCount, store, type Group } from './store.svelte';

  interface Props {
    onPick: (id: string) => void;
    onNew: () => void;
    onEdit: (g: Group) => void;
    onManage: () => void;
  }
  let { onPick, onNew, onEdit, onManage }: Props = $props();

  let tablist: HTMLDivElement;
  const tabs = $derived([{ id: '', name: 'All' }, ...store.groups.filter((g) => channelCount(g) > 0)]);
  const current = $derived(tabs.find((t) => t.id === store.selected) ?? tabs[0]);
  const currentGroup = $derived(store.groups.find((g) => g.id === current.id));

  async function pick(id: string, focus = false) {
    onPick(id);
    if (!focus) return;
    await tick();
    tablist.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
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
{#if store.empty && currentGroup}
  <div class="empty">
    <p>No new videos from channels in “{currentGroup.name}”</p>
    <button class="ytp-btn is-link" type="button" aria-haspopup="dialog" onclick={() => onEdit(currentGroup)}>Edit group</button>
  </div>
{/if}

<style>
  .chips { display: flex; align-items: center; gap: 12px; overflow-x: auto; padding: 3px; margin: -3px; scrollbar-width: none; }
  .tabs { display: flex; align-items: center; gap: 12px; }
  .ytp-chip { flex: none; }
  .star { width: 16px; height: 16px; }
  .lbl { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
  .out { background: none; box-shadow: inset 0 0 0 1px var(--yt-sys-color-baseline--outline); padding: 0 12px 0 9px; }
  .out:hover { background: var(--yt-sys-color-baseline--additive-background); }
  .out svg { width: 18px; height: 18px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 11px; padding: 120px 0; text-align: center; }
  .empty p { margin: 0; font-size: 16px; color: var(--yt-sys-color-baseline--text-secondary); }
</style>
