<script lang="ts">
  import type { PlayerState } from '../../lib/messages';
  import { thumbUrl } from '../../lib/queue';
  import { fmtClock } from './lib';

  let {
    st,
    big = false,
    fromQueue,
    nextLabel,
    nextDisabled,
    onToggle,
    onSeek,
    onSeekBy,
    onRate,
    onPrev,
    onNext,
    onGoto,
  }: {
    st: PlayerState;
    /** Nothing left in the queue: the player takes the room (16:9 art on top, no card). */
    big?: boolean;
    fromQueue: boolean;
    nextLabel: string;
    nextDisabled: boolean;
    onToggle: () => void;
    onSeek: (to: number) => void;
    onSeekBy: (by: number) => void;
    onRate: (rate: number) => void;
    onPrev: () => void;
    onNext: () => void;
    onGoto: () => void;
  } = $props();

  /** Value while the user drags the seek bar, so the 1 s poll doesn't fight them. */
  let scrub = $state<number | null>(null);
  const dur = $derived(Number.isFinite(st.duration) && st.duration > 0 ? st.duration : 0);
  const pos = $derived(Math.min(scrub ?? st.currentTime, dur || Infinity));
  const pct = $derived(dur ? `${((pos / dur) * 100).toFixed(2)}%` : '0%');
  const art = $derived(thumbUrl(st.videoId));

  /** YouTube's own speed menu; a rate set elsewhere (e.g. 2.5) joins the list so it still shows. */
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const rates = $derived(SPEEDS.includes(st.rate) ? SPEEDS : [...SPEEDS, st.rate].sort((a, b) => a - b));
</script>

<section aria-label="Now playing" class="np" class:big>
  {#if big}<img class="art" src={art} alt="" />{/if}
  <div class="np-status">
    <span class="eq" class:paused={st.paused} aria-hidden="true"><span></span><span></span><span></span></span>
    <span class:playing={!st.paused}>{st.paused ? 'Paused' : 'Playing'}</span>
    <span class="rate">
      <select aria-label="Playback speed" title="Playback speed" onchange={(e) => onRate(Number(e.currentTarget.value))}>
        {#each rates as r (r)}<option value={r} selected={r === st.rate}>{r}×</option>{/each}
      </select>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
    </span>
    {#if fromQueue}<span>· From queue</span>{/if}
    <button class="ib sm goto" aria-label="Go to the player tab" title="Go to the player tab" onclick={onGoto}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
    </button>
  </div>
  <div class="video">
    {#if !big}<img class="art" src={art} alt="" />{/if}
    <div class="text">
      <div class="np-title">{st.title}</div>
      <div class="np-ch">{st.channelName}</div>
    </div>
  </div>

  <div class="seekwrap">
    <div class="track"></div>
    <div class="fill" style:width={pct}></div>
    <div class="knob" style:left={pct}></div>
    <input
      type="range"
      min="0"
      max={Math.floor(dur)}
      step="1"
      value={Math.floor(pos)}
      disabled={!dur}
      aria-label="Seek"
      aria-valuetext="{fmtClock(pos)} of {fmtClock(dur)}"
      oninput={(e) => (scrub = Number(e.currentTarget.value))}
      onchange={(e) => {
        onSeek(Number(e.currentTarget.value));
        scrub = null;
      }}
    />
  </div>
  <div class="times">
    <span>{fmtClock(pos)}</span>
    <span>−{fmtClock(dur - pos)}</span>
  </div>

  <div class="controls">
    <button class="ib" aria-label="Previous" title="Previous" onclick={onPrev}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6v12L9 12z" fill="currentColor"></path><path d="M6 6v12"></path></svg>
    </button>
    <button class="ib" aria-label="Back 10 seconds" title="Back 10 seconds" onclick={() => onSeekBy(-10)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"></path><path d="M3.5 4v4.5H8"></path><text x="12.6" y="15.4" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text></svg>
    </button>
    <button class="play" aria-label={st.paused ? 'Play' : 'Pause'} onclick={onToggle}>
      {#if st.paused}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect></svg>
      {/if}
    </button>
    <button class="ib" aria-label="Forward 10 seconds" title="Forward 10 seconds" onclick={() => onSeekBy(10)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"></path><path d="M20.5 4v4.5H16"></path><text x="11.4" y="15.4" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">10</text></svg>
    </button>
    <button class="ib" aria-label={nextLabel} title={nextLabel} onclick={onNext} disabled={nextDisabled}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6v12l9-6z" fill="currentColor"></path><path d="M18 6v12"></path></svg>
    </button>
  </div>
</section>

<style>
  .np {
    margin: 0 12px;
    padding: 10px 14px;
    border-radius: 20px;
    background: var(--s1);
    flex-shrink: 0;
  }
  .big {
    margin: 0;
    padding: 4px 16px 0;
    border-radius: 0;
    background: none;
  }
  .big .art {
    width: 348px;
    height: 196px;
    border-radius: 12px;
  }
  .big .np-title {
    font-size: 16px;
    line-height: 22px;
  }
  .playing {
    color: var(--accent-text);
    font-weight: 500;
  }
  /* Speed: a native select dressed as a chip, one step up from the card. */
  .rate {
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--text);
  }
  .rate select {
    appearance: none;
    height: 24px;
    padding: 0 22px 0 9px;
    border: 0;
    border-radius: 999px;
    background: var(--s2);
    color: inherit;
    font: inherit;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .rate select:hover {
    background: var(--s3);
  }
  .rate svg {
    position: absolute;
    right: 7px;
    width: 12px;
    height: 12px;
    pointer-events: none;
  }
  .goto {
    margin-left: auto;
    margin-right: -6px;
    color: var(--muted);
  }
  .video {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 2px;
  }
  .art {
    width: 128px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    display: block;
    background: var(--s3);
  }
  .text {
    flex-grow: 1;
    min-width: 0;
  }

  .seekwrap {
    position: relative;
    height: 16px;
    margin-top: 12px;
    display: flex;
    align-items: center;
  }
  .track,
  .fill {
    position: absolute;
    left: 0;
    height: 4px;
    border-radius: 999px;
  }
  .track {
    right: 0;
    background: var(--s3);
  }
  .fill {
    background: var(--accent);
  }
  .knob {
    position: absolute;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: var(--accent);
    transition: transform 0.15s ease;
  }
  .seekwrap:hover .knob,
  .seekwrap:focus-within .knob {
    transform: scale(1.25);
  }
  .seekwrap input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 16px;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .seekwrap:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    line-height: 16px;
    color: var(--faint);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px 0;
  }
  .controls .ib {
    width: 40px;
    height: 40px;
  }
  .controls .ib svg {
    width: 22px;
    height: 22px;
  }
  .play {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--ctl);
    color: var(--ctl-on);
    transition: transform 0.12s ease, opacity 0.15s ease;
  }
  .play:hover {
    opacity: 0.9;
  }
  .play:active {
    transform: scale(0.94);
  }
  .play svg {
    width: 24px;
    height: 24px;
  }
</style>
