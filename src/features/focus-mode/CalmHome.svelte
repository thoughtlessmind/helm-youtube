<svelte:options css="injected" />

<script module lang="ts">
  import type { QueueItem } from '../../lib/queue';

  export interface CalmState {
    /** "Show it once": the real feed is visible for this visit. */
    feedShown: boolean;
    /** Unplayed queue items; empty when the queue feature is off. */
    upNext: QueueItem[];
    /** Groups with channels; empty when channel groups are off. */
    groups: { id: string; name: string; channels: number }[];
  }
  export interface CalmActions {
    toggleFeed(): void;
    play(videoId: string): void;
    openGroup(id: string): void;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { thumbUrl } from '../../lib/queue';
  import { fmtClock, initials } from '../../lib/format';

  let { actions, initial }: { actions: CalmActions; initial: CalmState } = $props();

  // svelte-ignore state_referenced_locally
  let s = $state<CalmState>({ ...initial });
  /** The feature pushes every storage change through here. */
  export function update(next: CalmState) {
    s = next;
  }

  /** "See queue" lists every up-next item instead of the first three. */
  let showAll = $state(false);
  let list = $state<HTMLUListElement>();

  const first = $derived(s.upNext[0]);
  const rest = $derived(s.upNext.slice(1));
  const listed = $derived(showAll ? rest : rest.slice(0, 3));

  const channelsLabel = (n: number) => (n === 1 ? '1 channel' : `${n} channels`);

  async function seeQueue() {
    showAll = true;
    await tick();
    list?.querySelectorAll('button')[3]?.focus(); // first newly listed item
  }
</script>

<div class="calm">
  <div class="status">
    {#if s.feedShown}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.1" /><path d="M6.6 6.6A13.3 13.3 0 0 0 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
    {/if}
    <span>{s.feedShown ? 'Showing the feed for this visit' : 'Your home feed is hidden'}</span>
    <button class="ytp-btn is-link" onclick={() => actions.toggleFeed()}>
      {s.feedShown ? 'Hide again' : 'Show it once'}
    </button>
  </div>

  {#if !s.feedShown}
    {#if first}
      <section aria-labelledby="calm-q" class="q">
        <h2 id="calm-q">Continue your queue</h2>
        <div class="next">
          <button class="ytp-plain ytp-thumb th" aria-label="Play {first.title}" onclick={() => actions.play(first.videoId)}>
            <img src={thumbUrl(first.videoId)} alt="" />
            <span class="ytp-thumb-ov"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg></span>
            {#if first.duration}<span class="ytp-dur dur">{fmtClock(first.duration)}</span>{/if}
          </button>
          <div class="info">
            <h3 class="ytp-clamp2">{first.title}</h3>
            {#if first.channelName}
              <div class="ch">
                <span class="av" aria-hidden="true">{initials(first.channelName)}</span>
                <span>{first.channelName}</span>
              </div>
            {/if}
            <div class="meta">
              Next in your queue{rest.length ? ` · ${rest.length} more after this` : ''}
            </div>
            <div class="grow"></div>
            <div class="acts">
              <button class="ytp-btn is-primary play" onclick={() => actions.play(first.videoId)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                Play
              </button>
              {#if !showAll && rest.length > 3}
                <button class="ytp-btn is-link" onclick={seeQueue}>See queue</button>
              {/if}
            </div>
          </div>
        </div>

        {#if listed.length}
          <ul aria-label="Also in your queue" bind:this={list}>
            {#each listed as v (v.videoId)}
              <li>
                <button class="ytp-plain nx" aria-label="Play {v.title}, {v.channelName}" onclick={() => actions.play(v.videoId)}>
                  <span class="ytp-thumb sth">
                    <img src={thumbUrl(v.videoId)} alt="" loading="lazy" />
                    {#if v.duration}<span class="ytp-dur">{fmtClock(v.duration)}</span>{/if}
                  </span>
                  <span class="txt">
                    <span class="ytp-clamp2 t">{v.title}</span>
                    <span class="c">{v.channelName}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if s.groups.length}
      <section aria-labelledby="calm-g" class="g">
        <h2 id="calm-g">Your channel groups</h2>
        <div class="grid">
          {#each s.groups as g (g.id)}
            <button
              class="ytp-plain grp"
              aria-label="Show {g.name} feed, {channelsLabel(g.channels)}"
              onclick={() => actions.openGroup(g.id)}
            >
              <span class="gn">
                {#if g.id === 'favorites'}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>
                {/if}
                {g.name}
              </span>
              <span class="gm">{channelsLabel(g.channels)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <p class="foot">Focus mode is on · change it in YouTube Pro settings</p>
  {/if}
</div>

<style>
  /* Board px ÷ 0.8916 = real px. Colors: YouTube tokens only (thumbnail badges excepted). */
  :host {
    display: block;
    width: 100%;
  }
  .calm {
    box-sizing: border-box;
    max-width: 808px;
    margin: 0 auto;
    padding: 24px 16px 40px;
    color: var(--yt-sys-color-baseline--text-primary);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    color: var(--yt-sys-color-baseline--text-secondary);
  }
  .status > svg {
    width: 20px;
    height: 20px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .status .ytp-btn {
    margin-left: 2px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 20px;
    line-height: 28px;
    font-weight: 700;
  }
  .q {
    margin-top: 32px;
  }
  .g {
    margin-top: 40px;
  }
  .next {
    display: flex;
    gap: 16px;
    height: 202px;
  }
  .th {
    width: 359px;
    height: 202px;
    border-radius: 12px;
  }
  .th svg {
    width: 40px;
    height: 40px;
    fill: currentColor;
  }
  .dur {
    right: 8px;
    bottom: 8px;
    padding: 1px 4px;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding-top: 2px;
  }
  h3 {
    margin: 0;
    font-size: 18px;
    line-height: 26px;
    font-weight: 500;
  }
  .ch,
  .meta {
    font-size: 12px;
    line-height: 18px;
    color: var(--yt-sys-color-baseline--text-secondary);
  }
  .ch {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .av {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 500;
    color: var(--yt-sys-color-baseline--text-primary);
    background: var(--yt-sys-color-baseline--additive-background);
  }
  .meta {
    margin-top: 8px;
  }
  .grow {
    flex: 1;
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ytp-btn.play {
    padding: 0 16px 0 10px;
  }
  .ytp-btn.play svg {
    fill: currentColor;
  }
  ul {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  li {
    min-width: 0;
  }
  .nx {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    width: 100%;
    border-radius: 8px;
    transition: background-color 0.12s ease;
  }
  .nx:hover {
    background: var(--yt-sys-color-baseline--additive-background);
  }
  .nx:hover img {
    filter: brightness(0.8);
  }
  .sth {
    width: 135px;
    height: 76px;
  }
  .txt {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 2px 4px 0 0;
  }
  .t {
    font-size: 14px;
    line-height: 18px;
    font-weight: 500;
  }
  .c {
    font-size: 12px;
    line-height: 18px;
    color: var(--yt-sys-color-baseline--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .grp {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    height: 64px;
    box-sizing: border-box;
    padding: 0 16px;
    border-radius: 12px;
    background: var(--yt-sys-color-baseline--additive-background);
    transition: background-color 0.12s ease;
  }
  .grp:hover {
    background: var(--yt-sys-color-baseline--mono-tonal-hover);
  }
  .gn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gn svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
  .gm {
    font-size: 12px;
    line-height: 16px;
    color: var(--yt-sys-color-baseline--text-secondary);
  }
  @media (max-width: 720px) {
    .next {
      flex-direction: column;
      height: auto;
    }
    .th {
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
    }
    .acts {
      margin-top: 12px;
    }
    ul {
      grid-template-columns: 1fr;
    }
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .foot {
    margin: 40px 0 0;
    text-align: center;
    font-size: 12px;
    line-height: 18px;
    color: var(--yt-sys-color-baseline--text-secondary);
  }
</style>
