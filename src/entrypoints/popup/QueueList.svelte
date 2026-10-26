<script lang="ts">
  import type { PlayerState } from '../../lib/messages';
  import { fmtDuration } from '../../lib/format';
  import { clearPlayed, moveInQueue, playNext, removeFromQueue, thumbUrl, type QueueItem } from '../../lib/queue';
  import { fmtClock } from './lib';
  import { Reorder, moveItem } from '../../lib/reorder.svelte';

  let {
    items = $bindable(),
    st,
    onPlay,
  }: {
    items: QueueItem[];
    /** The video in the shown tab; null when nothing plays. */
    st: PlayerState | null;
    onPlay: (videoId: string) => void;
  } = $props();

  const currentId = $derived(st?.videoId ?? null);
  const fromQueue = $derived(items.some((i) => i.videoId === currentId));
  /** Rows are what's left to play: the playing video is in the card above, watched ones fold into "Clear". */
  const shown = $derived(items.filter((i) => !i.playedAt && i.videoId !== currentId));
  const watched = $derived(items.filter((i) => i.playedAt && i.videoId !== currentId).length);

  const clockIn = (sec: number) =>
    new Date(Date.now() + sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sub = $derived.by(() => {
    const n = shown.length;
    const queued = shown.reduce((s, i) => s + i.duration, 0);
    if (!st || !fromQueue) return `${n} queued${queued ? ` · ${fmtDuration(queued)}` : ''}`;
    const known = st.duration > 0 && shown.every((i) => i.duration > 0);
    const left = st.duration - st.currentTime + queued;
    return `${n} after this one${known ? ` · ends ${clockIn(left / st.rate)} at ${st.rate}×` : ''}`;
  });

  /** The whole queue as one bar: one segment per video, sized by length. */
  const segs = $derived(
    items.map((i) => {
      const cur = i.videoId === currentId;
      return {
        id: i.videoId,
        // ponytail: an unknown length counts as 10 min.
        grow: i.duration || 600,
        cls: cur ? 'cur' : i.playedAt ? 'done' : '',
        fill: cur ? (st?.duration ? Math.min(100, (st.currentTime / st.duration) * 100) : 0) : i.playedAt ? 100 : 0,
      };
    }),
  );

  let list = $state<HTMLOListElement>();
  let announce = $state('');

  /** Optimistic local move, then persist. `to` is a row position; played items keep their places. */
  const ro = new Reorder({
    ids: () => shown.map((i) => i.videoId),
    root: () => list,
    move(id, to) {
      const at = items.findIndex((i) => i.videoId === shown[to].videoId);
      items = moveItem(items, items.findIndex((i) => i.videoId === id), at);
      void moveInQueue(id, at);
      announce = `${items[at].title}, position ${to + 1} of ${shown.length}`;
    },
  });
</script>

{#if shown.length}
  <section aria-label="Up next" class="q">
    <div class="q-head">
      <h2>Up next</h2>
      {#if watched}<button class="txtbtn" onclick={() => clearPlayed(currentId)}>Clear {watched} watched</button>{/if}
    </div>
    <div class="q-sub">{sub}</div>

    <div class="tl" aria-hidden="true">
      {#each segs as s (s.id)}<span class={s.cls} style:flex-grow={s.grow}><i style:width="{s.fill}%"></i></span>{/each}
    </div>
    <ol class="qlist scroll" bind:this={list}>
      {#each shown as item, i (item.videoId)}
        {@const over = ro.dragId && ro.dragId !== item.videoId && ro.overId === item.videoId}
        <li
          class="qrow"
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
          <button class="qthumb" aria-label="Play now: {item.title}" onclick={() => onPlay(item.videoId)}>
            <img src={thumbUrl(item.videoId)} alt="" draggable="false" />
            <span class="ov">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
            </span>
            {#if item.duration}<span class="dur">{fmtClock(item.duration)}</span>{/if}
          </button>
          <div class="qtext">
            <div class="qtitle">{item.title}</div>
            <div class="qsub">
              {#if i === 0}<span class="tag">Next</span>{/if}
              <span>{item.channelName}</span>
            </div>
          </div>
          <div class="acts">
            {#if i > 0}
              <button class="ib sm" aria-label="Play next: {item.title}" title="Play next" onclick={() => playNext(item.videoId, currentId)}>
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
{:else}
  <!-- Nothing left to play: one hint row pinned to the bottom; the player above takes the room. -->
  <section aria-label="Up next" class="qline">
    <kbd class="kbd">Q</kbd>
    <div class="ql-text">
      <div class="ql-head">
        <h2>Nothing queued</h2>
        {#if watched}<button class="txtbtn" onclick={() => clearPlayed(currentId)}>Clear {watched} watched</button>{/if}
      </div>
      <p>Press Q on a video, or choose Add to queue in its menu.</p>
    </div>
  </section>
{/if}

<style>
  .qline {
    margin: auto 12px 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--s1);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .qline .kbd {
    width: 28px;
    height: 28px;
    margin: 0;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .ql-text {
    flex-grow: 1;
    min-width: 0;
  }
  .ql-head {
    display: flex;
    align-items: center;
    height: 18px;
  }
  .ql-head h2 {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
  }
  .ql-head .txtbtn {
    margin: 0 -8px 0 auto;
  }
  .qline p {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .tl {
    display: flex;
    gap: 2px;
    height: 4px;
    margin: 10px 0 6px;
    flex-shrink: 0;
  }
  .tl span {
    flex-basis: 0;
    min-width: 2px;
    border-radius: 1px;
    background: var(--s3);
    overflow: hidden;
  }
  .tl i {
    display: block;
    height: 100%;
  }
  .tl .done i {
    background: var(--faint);
  }
  .tl .cur i {
    background: var(--accent);
  }
  .qrow:hover,
  .qrow:focus-within {
    background: var(--s1);
  }
  .qrow.dragging {
    opacity: 0.35;
  }
  .drop {
    position: absolute;
    left: 10px;
    right: 10px;
    height: 2px;
    border-radius: 2px;
    background: var(--text);
  }
  .drop.before {
    top: -1px;
  }
  .drop.after {
    bottom: -1px;
  }
  .grip {
    width: 16px;
    height: 40px;
    margin-right: -2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--faint);
    flex-shrink: 0;
    opacity: 0.55;
    cursor: grab;
    transition: opacity 0.15s ease;
  }
  .qrow:hover .grip,
  .grip:focus-visible {
    opacity: 1;
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
  .qthumb:hover .ov,
  .qthumb:focus-visible .ov {
    opacity: 1;
  }
  /* Row actions overlay the title's end on hover, so titles keep the full width at rest. */
  .acts {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    padding-left: 8px;
    border-radius: 999px;
    background: var(--s1);
    color: var(--muted);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  .qrow:hover .acts,
  .qrow:focus-within .acts {
    opacity: 1;
    pointer-events: auto;
  }
</style>
