<script lang="ts">
  import {
    clearPlayed,
    moveInQueue,
    playNext,
    removeFromQueue,
    thumbUrl,
    type QueueItem,
  } from '../../lib/queue';
  import { fmtClock } from './lib';
  import { Reorder, moveItem } from '../../lib/reorder.svelte';

  let {
    items = $bindable(),
    currentId,
    nextId,
    paused,
    onPlay,
  }: {
    items: QueueItem[];
    /** Video playing in the shown tab. */
    currentId: string | null;
    /** First unplayed item that isn't the current one. */
    nextId: string | null;
    paused: boolean;
    onPlay: (videoId: string) => void;
  } = $props();

  const upCount = $derived(items.filter((i) => !i.playedAt && i.videoId !== currentId).length);
  const hasPlayed = $derived(items.some((i) => i.playedAt && i.videoId !== currentId));

  let list = $state<HTMLOListElement>();
  let announce = $state('');

  /** Optimistic local move, then persist. */
  const ro = new Reorder({
    ids: () => items.map((i) => i.videoId),
    root: () => list,
    move(id, to) {
      items = moveItem(items, items.findIndex((i) => i.videoId === id), to);
      void moveInQueue(id, to);
      announce = `${items[to].title}, position ${to + 1} of ${items.length}`;
    },
  });

</script>

<section aria-label="Queue" class="queue">
  <div class="head">
    <h2 class="label">Queue</h2>
    {#if upCount}<span class="badge">{upCount} up next</span>{/if}
    <div class="grow"></div>
    {#if hasPlayed}<button class="ghost" onclick={() => clearPlayed(currentId)}>Clear watched</button>{/if}
  </div>

  {#if !items.length}
    <div class="none">
      Nothing queued. On YouTube, open a video's ⋮ menu and choose Add to queue, or press Q while watching.
    </div>
  {/if}

  <ol class="scroll" bind:this={list}>
    {#each items as item (item.videoId)}
      {@const isCurrent = item.videoId === currentId}
      {@const watched = !!item.playedAt && !isCurrent}
      {@const over = ro.dragId && ro.dragId !== item.videoId && ro.overId === item.videoId}
      <li
        class="row"
        class:cur={isCurrent}
        class:dragging={ro.dragId === item.videoId}
        draggable="true"
        ondragstart={(e) => ro.start(e, item.videoId)}
        ondragover={(e) => ro.over(e, item.videoId)}
        ondrop={(e) => ro.drop(e, item.videoId)}
        ondragend={ro.end}
      >
        {#if over && !ro.after}<span class="drop before" aria-hidden="true"></span>{/if}
        <button
          class="grip"
          data-grip={item.videoId}
          aria-label="Reorder {item.title}. Drag, or press up and down arrow keys."
          title="Drag to reorder, or use arrow keys"
          onkeydown={(e) => ro.key(e, item.videoId)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="9" cy="6" r="1.6" fill="currentColor"></circle><circle cx="15" cy="6" r="1.6" fill="currentColor"></circle><circle cx="9" cy="12" r="1.6" fill="currentColor"></circle><circle cx="15" cy="12" r="1.6" fill="currentColor"></circle><circle cx="9" cy="18" r="1.6" fill="currentColor"></circle><circle cx="15" cy="18" r="1.6" fill="currentColor"></circle></svg>
        </button>
        <button class="thumb" aria-label="Play now: {item.title}" onclick={() => onPlay(item.videoId)}>
          <img src={thumbUrl(item.videoId)} alt="" draggable="false" class:dim={watched} />
          <span class="ov">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
          </span>
          {#if item.duration}<span class="dur">{fmtClock(item.duration)}</span>{/if}
          {#if watched}
            <span class="check">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
              <span class="sr-only">Watched</span>
            </span>
          {/if}
        </button>
        <div class="text">
          <div class="title" class:muted={watched}>{item.title}</div>
          <div class="sub">
            {#if isCurrent}
              <span class="playing"><span class="eq" class:paused aria-hidden="true"><span></span><span></span><span></span></span>Playing</span>
            {/if}
            {#if item.videoId === nextId}<span class="next">Next</span>{/if}
            <span class="ch">{item.channelName}</span>
          </div>
        </div>
        <div class="acts">
          {#if !isCurrent}
            <button
              class="ib sm"
              aria-label="Play next: {item.title}"
              title="Play next"
              onclick={() => playNext(item.videoId, currentId)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14"></path><path d="M12 20V9"></path><path d="M7 13l5-5 5 5"></path></svg>
            </button>
          {/if}
          <button class="ib sm" aria-label="Remove from queue: {item.title}" title="Remove" onclick={() => removeFromQueue(item.videoId)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
        {#if over && ro.after}<span class="drop after" aria-hidden="true"></span>{/if}
      </li>
    {/each}
  </ol>
  <div class="sr-only" role="status">{announce}</div>
</section>

<style>
  .queue {
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 4px 20px;
    min-height: 44px;
  }
  .grow {
    flex-grow: 1;
  }
  .ghost {
    color: var(--muted);
  }
  .none {
    margin: 6px 16px;
    padding: 18px 16px;
    border-radius: 14px;
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 2px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 2px;
    border-radius: 14px;
    transition: background-color 0.15s ease, opacity 0.15s ease;
  }
  .row:not(.cur):hover {
    background-color: rgba(127, 127, 140, 0.09);
  }
  .row.cur {
    background: var(--accent-soft);
  }
  .row.dragging {
    opacity: 0.35;
  }
  .drop {
    position: absolute;
    left: 10px;
    right: 10px;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .drop.before {
    top: -2px;
  }
  .drop.after {
    bottom: -2px;
  }
  .grip {
    width: 22px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--muted);
    flex-shrink: 0;
    opacity: 0.35;
    cursor: grab;
    transition: opacity 0.15s ease;
  }
  .row:hover .grip,
  .grip:focus-visible {
    opacity: 1;
  }
  .thumb {
    width: 76px;
    height: 43px;
    border-radius: 9px;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
    background: var(--surface);
    color: #fff;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb img.dim {
    opacity: 0.45;
  }
  .ov {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .thumb:hover .ov,
  .thumb:focus-visible .ov {
    opacity: 1;
  }
  .dur {
    position: absolute;
    right: 4px;
    bottom: 4px;
    font-size: 9.5px;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.78);
    font-variant-numeric: tabular-nums;
    line-height: 14px;
  }
  .check {
    position: absolute;
    left: 4px;
    top: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .text {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title.muted {
    color: var(--muted);
  }
  .sub {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .playing {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--accent-text);
    font-weight: 700;
  }
  .next {
    font-weight: 700;
    color: var(--text);
  }
  .ch {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .acts {
    display: flex;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .row:hover .acts,
  .row:focus-within .acts {
    opacity: 1;
  }
</style>
