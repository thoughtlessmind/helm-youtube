<script lang="ts">
  import { ALL_FEATURES } from '../../lib/feature-catalog';
  import { fmtDuration } from '../../lib/format';
  import type { PlayerState } from '../../lib/messages';
  import { thumbUrl, type QueueItem } from '../../lib/queue';
  import type { FeatureFlags } from '../../lib/settings';
  import Mark from './Mark.svelte';
  import { fmtClock } from './lib';

  /** Main's body while `extensionEnabled` is off. The player bridge still answers, so the mini player works. */
  let {
    st,
    pending,
    flags,
    onToggle,
    onGoto,
    onResume,
  }: {
    st: PlayerState | null;
    pending: QueueItem[];
    flags: FeatureFlags;
    onToggle: () => void;
    onGoto: () => void;
    onResume: () => void;
  } = $props();

  /** What Resume brings back: every feature whose own switch is on. */
  const offs = $derived(ALL_FEATURES.filter((f) => flags[f.id]).map((f) => f.name));
  const pendingSec = $derived(pending.reduce((s, i) => s + i.duration, 0));
  const dur = $derived(st && Number.isFinite(st.duration) && st.duration > 0 ? st.duration : 0);
</script>

<section class="hero scroll" aria-labelledby="paused-title">
  <!-- The master switch drawn large and off, the Helm mark as its knob. -->
  <div class="bigsw" aria-hidden="true"><Mark size={52} /></div>
  <h1 id="paused-title">Helm is paused</h1>
  <p>YouTube looks and works as it normally does. Your queue, notes and settings are kept.</p>
  <button class="pill big" onclick={onResume}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
    Resume Helm
  </button>
  {#if offs.length}
    <div class="offlab" id="paused-offs">{offs.length} feature{offs.length === 1 ? '' : 's'} off until you resume</div>
    <ul class="offs" aria-labelledby="paused-offs">
      {#each offs as name (name)}<li>{name}</li>{/each}
    </ul>
  {/if}
</section>

{#if st}
  <section class="mini" aria-label="Now playing">
    <img src={thumbUrl(st.videoId)} alt="" />
    <div class="m-text">
      <span class="m-status">
        <span class:playing={!st.paused}>{st.paused ? 'Paused' : 'Playing'}</span>
        · {fmtClock(st.currentTime)}{dur ? ` of ${fmtClock(dur)}` : ''}
      </span>
      <span class="m-title">{st.title}</span>
    </div>
    <button class="ib sm" aria-label={st.paused ? 'Play' : 'Pause'} title={st.paused ? 'Play' : 'Pause'} onclick={onToggle}>
      {#if st.paused}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect></svg>
      {/if}
    </button>
    <button class="ib sm quiet" aria-label="Go to the player tab" title="Go to the player tab" onclick={onGoto}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
    </button>
    <span class="prog" style:width="{dur ? Math.min(100, (st.currentTime / dur) * 100) : 0}%" aria-hidden="true"></span>
  </section>
{:else if pending.length}
  <section class="mini" aria-label="Queue">
    <img src={thumbUrl(pending[0].videoId)} alt="" />
    <div class="m-text">
      <span class="m-status">Queue kept for later</span>
      <span class="m-title">{pending.length} video{pending.length === 1 ? '' : 's'}{pendingSec ? ` · ${fmtDuration(pendingSec)}` : ''}</span>
    </div>
  </section>
{/if}

<style>
  .hero {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .bigsw {
    display: flex;
    width: 120px;
    height: 64px;
    padding: 6px;
    border-radius: 32px;
    background: var(--s2);
    flex-shrink: 0;
    --mk-bg: var(--faint);
    --mk-fg: var(--bg);
  }
  h1 {
    margin: 20px 0 0;
    font-size: 22px;
    line-height: 28px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  p {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 19px;
    color: var(--muted);
  }
  .big {
    width: 100%;
    height: 44px;
    margin-top: 20px;
    flex-shrink: 0;
    justify-content: center;
    font-size: 14px;
  }
  .offlab {
    margin-top: 22px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .offs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .offs li {
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--s1);
    color: var(--muted);
    font-size: 12px;
    line-height: 26px;
    font-weight: 500;
  }

  .mini {
    position: relative;
    margin: 0 12px 12px;
    padding: 8px 6px 8px 8px;
    border-radius: 16px;
    background: var(--s1);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .mini img {
    width: 64px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    display: block;
    flex-shrink: 0;
    background: var(--s3);
  }
  .m-text {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .m-status {
    font-size: 11px;
    line-height: 14px;
    color: var(--muted);
  }
  .playing {
    color: var(--accent-text);
    font-weight: 500;
  }
  .m-title {
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quiet {
    color: var(--muted);
  }
  .prog {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
  }
</style>
