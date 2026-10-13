<svelte:options css="injected" />

<script module lang="ts">
  import type { QueueItem } from '../../lib/queue';

  export interface PanelState {
    items: QueueItem[];
    currentId: string | null;
    autoAdvance: boolean;
    collapsed: boolean;
  }
  export interface PanelActions {
    play(videoId: string): void;
    remove(videoId: string): void;
    move(videoId: string, toIndex: number): void;
    setAutoAdvance(on: boolean): void;
    setCollapsed(collapsed: boolean): void;
    clearWatched(): void;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { thumbUrl } from '../../lib/queue';
  import { fmtClock } from '../../lib/format';
  import { Reorder, moveItem } from '../../lib/reorder.svelte';

  let { actions, initial }: { actions: PanelActions; initial: PanelState } = $props();

  // svelte-ignore state_referenced_locally
  let s = $state<PanelState>({ ...initial });
  /** The feature pushes every storage/navigation change through here. */
  export function update(next: PanelState) {
    s = next;
  }

  let list = $state<HTMLOListElement>();
  let status = $state('');

  const upNextCount = $derived(s.items.filter((i) => !i.playedAt).length);
  const curIdx = $derived(s.items.findIndex((i) => i.videoId === s.currentId));
  const next = $derived(s.items.find((i) => !i.playedAt && i.videoId !== s.currentId));
  const hasWatched = $derived(s.items.some((i) => i.playedAt && i.videoId !== s.currentId));
  const rows = $derived.by(() => {
    let n = 0;
    return s.items.map((item) => {
      const isCurrent = item.videoId === s.currentId;
      if (!item.playedAt) n += 1;
      return { item, isCurrent, watched: !!item.playedAt && !isCurrent, num: n };
    });
  });

  /** Local reorder first (focus + drop feedback stay instant), then persist. */
  const ro = new Reorder({
    ids: () => s.items.map((i) => i.videoId),
    root: () => list,
    move(videoId, to) {
      s.items = moveItem(s.items, s.items.findIndex((i) => i.videoId === videoId), to);
      actions.move(videoId, to);
      status = `Moved to position ${to + 1} of ${s.items.length}`;
    },
  });

  async function remove(i: number, videoId: string) {
    s.items = s.items.filter((x) => x.videoId !== videoId);
    actions.remove(videoId);
    await tick();
    const btns = list?.querySelectorAll<HTMLElement>('.rm');
    btns?.[Math.min(i, btns.length - 1)]?.focus();
  }
</script>

<section aria-label="Queue">
  <div class="head" class:collapsed={s.collapsed}>
    <div class="title-row">
      <h2>Queue</h2>
      <button
        class="ytp-plain ib"
        aria-label={s.collapsed ? 'Expand queue' : 'Collapse queue'}
        title={s.collapsed ? 'Expand queue' : 'Collapse queue'}
        aria-expanded={!s.collapsed}
        onclick={() => actions.setCollapsed(!s.collapsed)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={s.collapsed ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
        </svg>
      </button>
    </div>
    {#if s.collapsed}
      <div class="sub ellipsis">{next ? `Next: ${next.title} · ${upNextCount} up next` : 'All watched'}</div>
    {:else}
      <div class="sub">
        {curIdx >= 0 ? `${curIdx + 1} / ${s.items.length} · ` : ''}{upNextCount ? `${upNextCount} up next` : 'All watched'}
      </div>
      <div class="controls">
        <label class="auto">
          <input
            class="ytp-switch"
            type="checkbox"
            role="switch"
            checked={s.autoAdvance}
            onchange={(e) => actions.setAutoAdvance(e.currentTarget.checked)}
          />
          Auto-advance
        </label>
        {#if hasWatched}
          <button class="ytp-btn is-text is-sm" onclick={() => actions.clearWatched()}>Clear watched</button>
        {/if}
      </div>
    {/if}
  </div>

  {#if !s.collapsed}
    <ol bind:this={list}>
      {#each rows as { item, isCurrent, watched, num }, i (item.videoId)}
        <li
          class="row"
          class:cur={isCurrent}
          class:dragging={ro.dragId === item.videoId}
          data-id={item.videoId}
          draggable="true"
          ondragstart={(e) => ro.start(e, item.videoId)}
          ondragover={(e) => ro.over(e, item.videoId)}
          ondrop={(e) => ro.drop(e, item.videoId)}
          ondragend={ro.end}
        >
          {#if ro.dragId && ro.dragId !== item.videoId && ro.overId === item.videoId}
            <span class="ytp-drop" class:is-after={ro.after} aria-hidden="true"></span>
          {/if}
          <div class="ind">
            <span class="ind-state">
              {#if isCurrent}
                <span class="eq" role="img" aria-label="Now playing"><span></span><span></span><span></span></span>
              {:else if watched}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Watched"><path d="M20 6L9 17l-5-5" /></svg>
              {:else}
                {num}
              {/if}
            </span>
            <button
              class="ytp-plain grip"
              data-grip={item.videoId}
              aria-label={`Reorder ${item.title}. Drag, or press up and down arrow keys.`}
              title="Drag to reorder, or use arrow keys"
              onkeydown={(e) => ro.key(e, item.videoId)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
            </button>
          </div>
          <button class="ytp-plain ytp-thumb thumb" class:dim={watched} aria-label={`Play now: ${item.title}`} onclick={() => actions.play(item.videoId)}>
            <img src={thumbUrl(item.videoId)} alt="" draggable="false" loading="lazy" />
            <span class="ytp-thumb-ov" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            </span>
            {#if item.duration > 0}<span class="ytp-dur">{fmtClock(item.duration)}</span>{/if}
          </button>
          <div class="meta" class:dim={watched}>
            <div class="ytp-clamp2 t">{item.title}</div>
            <div class="ch ellipsis">{item.channelName}</div>
          </div>
          <button
            class="ytp-plain ib sm rm"
            aria-label={`Remove from queue: ${item.title}`}
            title="Remove from queue"
            onclick={() => remove(i, item.videoId)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
  <span class="ytp-sr" role="status">{status}</span>
</section>

<style>
  /* Sizes: WatchQueue/QueueStates boards ÷ 0.8916, checked against YouTube's own queue panel. */
  section {
    --text: var(--yt-sys-color-baseline--text-primary);
    --muted: var(--yt-sys-color-baseline--text-secondary);
    --fill: var(--yt-sys-color-baseline--additive-background);
    border: 1px solid var(--yt-sys-color-baseline--outline);
    border-radius: 12px;
    overflow: hidden;
    background: var(--yt-sys-color-baseline--base-background);
    color: var(--text);
    font-family: Roboto, Arial, sans-serif;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 6px 8px 16px;
    background: var(--fill);
  }
  .head.collapsed {
    padding-bottom: 11px;
  }
  .title-row,
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
    line-height: 28px;
    font-weight: 700;
  }
  .sub {
    margin-top: -4px;
    font-size: 12px;
    line-height: 18px;
    color: var(--muted);
  }
  .head.collapsed .sub {
    padding-right: 10px;
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .controls {
    justify-content: space-between;
    margin: 4px 0 0 -2px;
    min-height: 32px;
  }
  .auto {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 2px;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    cursor: pointer;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    transition: background-color 0.12s ease;
  }
  .ib:hover {
    background: var(--fill);
  }
  .ib svg {
    width: 24px;
    height: 24px;
  }
  .ib.sm {
    width: 34px;
    height: 34px;
  }
  .ib.sm svg {
    width: 18px;
    height: 18px;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: 386px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--yt-sys-color-baseline--text-disabled) transparent;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 64px;
    box-sizing: border-box;
    padding: 4px 4px 4px 0;
    transition: background-color 0.12s ease, opacity 0.12s ease;
  }
  .row.cur,
  .row:not(.cur):hover {
    background: var(--fill);
  }
  .row.dragging {
    opacity: 0.35;
  }
  .ind {
    position: relative;
    flex: none;
    width: 28px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 18px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ind-state {
    display: flex;
  }
  .row:hover .ind-state,
  .ind:focus-within .ind-state {
    visibility: hidden;
  }
  .grip {
    position: absolute;
    inset: 6px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--muted);
    fill: currentColor;
    cursor: grab;
    opacity: 0;
  }
  .row:hover .grip,
  .grip:focus-visible {
    opacity: 1;
  }
  .eq {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
    color: var(--text);
  }
  .eq span {
    display: block;
    width: 2px;
    height: 12px;
    border-radius: 1px;
    background: currentColor;
    transform-origin: bottom;
    animation: eq 0.9s ease-in-out infinite;
  }
  .eq span:nth-child(2) {
    animation-delay: -0.3s;
  }
  .eq span:nth-child(3) {
    animation-delay: -0.6s;
  }
  @keyframes eq {
    0%,
    100% {
      transform: scaleY(0.3);
    }
    50% {
      transform: scaleY(1);
    }
  }
  .thumb {
    width: 100px;
    height: 56px;
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dim {
    opacity: 0.5;
  }
  .t {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
  }
  .ch {
    font-size: 12px;
    line-height: 18px;
    color: var(--muted);
  }
  .rm {
    opacity: 0;
  }
  .row:hover .rm,
  .row:focus-within .rm {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .eq span {
      transform: scaleY(0.7);
    }
  }
</style>
