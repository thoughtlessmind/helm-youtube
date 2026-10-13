<script lang="ts">
  import type { PlayerState } from '../../lib/messages';
  import { thumbUrl } from '../../lib/queue';
  import { fmtClock } from './lib';

  let {
    st,
    fromQueue,
    nextLabel,
    nextDisabled,
    onToggle,
    onSeek,
    onSeekBy,
    onPrev,
    onNext,
    onGoto,
  }: {
    st: PlayerState;
    fromQueue: boolean;
    nextLabel: string;
    nextDisabled: boolean;
    onToggle: () => void;
    onSeek: (to: number) => void;
    onSeekBy: (by: number) => void;
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
</script>

<section aria-label="Now playing" class="hero">
  <img class="ambient" src={art} alt="" aria-hidden="true" />
  <img class="art" src={art} alt="" />
  <div class="scrim" aria-hidden="true"></div>

  <button class="ib glass" aria-label="Go to the player tab" title="Go to the player tab" onclick={onGoto}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
  </button>

  <div class="meta">
    <div class="kicker status">
      <span class="eq" class:paused={st.paused} aria-hidden="true"><span></span><span></span><span></span></span>
      <span>{st.paused ? 'Paused' : 'Now playing'}</span>
      <span aria-hidden="true">·</span>
      <span class="speed">{st.rate}×</span>
      {#if fromQueue}
        <span aria-hidden="true">·</span>
        <span>From queue</span>
      {/if}
    </div>
    <div class="title">{st.title}</div>
    <div class="channel">{st.channelName}</div>
  </div>
</section>

<div class="transport">
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
    <span>-{fmtClock(dur - pos)}</span>
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
</div>

<style>
  .hero {
    position: relative;
    height: 236px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .ambient {
    position: absolute;
    left: -60px;
    top: -60px;
    width: 500px;
    height: 380px;
    object-fit: cover;
    filter: blur(48px) saturate(1.6);
    opacity: var(--ambient);
    background: var(--surface);
  }
  .art {
    position: absolute;
    left: 0;
    top: 0;
    width: 380px;
    height: 214px;
    object-fit: cover;
    background: var(--surface);
    mask-image: linear-gradient(to bottom, #000 40%, transparent 100%);
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(var(--bg-rgb), 0.45) 0%,
      rgba(var(--bg-rgb), 0) 24%,
      rgba(var(--bg-rgb), 0.15) 46%,
      rgba(var(--bg-rgb), 0.88) 76%,
      rgb(var(--bg-rgb)) 100%
    );
  }
  .glass {
    position: absolute;
    top: 12px;
    right: 12px;
    border-radius: 999px;
    width: 36px;
    height: 36px;
    background: rgba(12, 12, 16, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #fff;
    backdrop-filter: blur(16px) saturate(160%);
  }
  .glass svg {
    width: 16px;
    height: 16px;
  }
  .meta {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .speed {
    letter-spacing: 0;
    text-transform: none;
    color: var(--text);
  }
  .eq {
    color: var(--accent-text);
  }

  .transport {
    padding: 6px 20px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .seekwrap {
    position: relative;
    height: 18px;
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
    background: var(--track);
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
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .seekwrap:hover .knob,
  .seekwrap:focus-within .knob {
    opacity: 1;
  }
  .seekwrap input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 18px;
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
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 2px 0 4px;
  }
  .play {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: 0 8px 24px -8px var(--accent);
    transition: transform 0.12s ease, filter 0.15s ease;
  }
  .play:hover {
    filter: brightness(1.08);
  }
  .play:active {
    transform: scale(0.94);
  }
  .play svg {
    width: 24px;
    height: 24px;
  }
</style>
