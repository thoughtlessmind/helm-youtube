<svelte:options css="injected" />

<!-- Stands in for YouTube's grid while the active group's videos load, or when there are none. -->
<script lang="ts">
  import { store, type Group } from './store.svelte';

  let { onEdit, onRetry }: { onEdit: (g: Group) => void; onRetry: () => void } = $props();

  const group = $derived(store.active);
</script>

{#if group}
  {#if store.gridStatus === 'error'}
    <div class="empty">
      <p>Couldn’t load videos from “{group.name}”</p>
      <button class="ytp-btn is-link" type="button" onclick={onRetry}>Try again</button>
    </div>
  {:else if store.gridStatus === 'empty'}
    <div class="empty">
      <p>No recent videos from channels in “{group.name}”</p>
      <button class="ytp-btn is-link" type="button" aria-haspopup="dialog" onclick={() => onEdit(group)}>Edit group</button>
    </div>
  {:else if store.gridStatus === 'loading'}
    <div class="grid" aria-busy="true" aria-label="Loading videos from {group.name}">
      {#each { length: 10 } as _}
        <div aria-hidden="true">
          <div class="thumb"></div>
          <div class="bar"></div>
          <div class="bar short"></div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  /* YouTube's grid variables reach in from ytd-rich-grid-renderer (customize-grid sets the columns). */
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--ytd-rich-grid-items-per-row, 4), minmax(0, 1fr));
    gap: 40px var(--ytd-rich-grid-item-margin, 16px);
    padding: 24px var(--ytd-rich-grid-gutter-margin, 16px) 40px; /* #contents' own inset */
  }
  .thumb { aspect-ratio: 16 / 9; border-radius: var(--ytp-radius, 12px); background: var(--yt-sys-color-baseline--additive-background); }
  .bar { height: 20px; margin-top: 12px; border-radius: 4px; background: var(--yt-sys-color-baseline--additive-background); }
  .bar.short { width: 60%; margin-top: 8px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 11px; padding: 120px 0; text-align: center; }
  .empty p { margin: 0; font-size: 16px; color: var(--yt-sys-color-baseline--text-secondary); }
</style>
