<script module lang="ts">
  /** Nothing playing: the keys sheet or the day view, picked once per popup open. */
  const VIEW: 'keys' | 'day' = Math.random() < 0.5 ? 'keys' : 'day';
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { ALL_FEATURES, type FeatureId } from '../../lib/feature-catalog';
  import { thumbUrl, type QueueItem } from '../../lib/queue';
  import type { FeatureFlags } from '../../lib/settings';
  import { SUGGESTIONS, dayAgo, fmtClock, fmtMin, focusTab, minutesOn, openYouTube, type Page, type WatchLog } from './lib';

  let {
    flags,
    queue,
    log,
    limitMin,
    tab,
    go,
    onPlay,
    onToggle,
  }: {
    flags: FeatureFlags;
    queue: QueueItem[];
    log: WatchLog;
    limitMin: number;
    /** The most recently used YouTube tab, if any. */
    tab: { id?: number; windowId?: number; url?: string; title?: string } | null;
    go: (p: Page) => void;
    onPlay: (videoId: string) => void;
    onToggle: (id: FeatureId, on: boolean) => void;
  } = $props();

  /** Where the tab is, in the words of YouTube's own page titles. */
  const place = $derived.by(() => {
    if (!tab) return '';
    const u = new URL(tab.url ?? 'https://www.youtube.com/');
    if (u.pathname === '/') return 'Home';
    const q = u.searchParams.get('search_query');
    if (q) return `Search: ${q}`;
    return tab.title?.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '') || 'YouTube';
  });

  const KEYS: { id: FeatureId; caps: string[]; text: string; sub?: string }[] = [
    { id: 'read-later-queue', caps: ['Q'], text: 'Add the video to your queue', sub: 'Or choose Add to queue in its menu' },
    { id: 'screenshot-current-frame', caps: ['S'], text: 'Save the frame as a PNG' },
    { id: 'loop-section', caps: ['[', ']'], text: 'Loop a section', sub: '[ sets the start, ] the end' },
    { id: 'loop-section', caps: ['\\'], text: 'Stop the loop' },
  ];
  // The Q row stays when the queue is off: it turns the queue on.
  const keys = $derived(KEYS.filter((k) => flags[k.id] || k.id === 'read-later-queue'));
  const onNames = $derived(ALL_FEATURES.filter((f) => flags[f.id]).map((f) => f.name));
  const onSummary = $derived(
    onNames.length > 2 ? `${onNames[0]}, ${onNames[1]} and ${onNames.length - 2} more` : onNames.join(' and '),
  );

  /** Snapshot: a row stays put while its switch is flipped. */
  const picks = untrack(() => SUGGESTIONS.filter((s) => !flags[s.id]));
  const watched = $derived(
    flags['read-later-queue']
      ? queue
          .filter((i) => i.playedAt)
          .sort((a, b) => b.playedAt! - a.playedAt!)
          .slice(0, 3)
      : [],
  );
  const playedAt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  /** Bars use a 40px plot; the scale leaves the limit line room above it. */
  const PLOT = 40;
  const days = $derived(
    [6, 5, 4, 3, 2, 1, 0].map((back) => {
      const d = dayAgo(back);
      const min = minutesOn(log, d);
      return {
        min,
        today: back === 0,
        over: back > 0 && limitMin > 0 && min > limitMin,
        short: back === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      };
    }),
  );
  const todayMin = $derived(days[6].min);
  const top = $derived(Math.max(limitMin * 1.25, ...days.map((d) => d.min), 1));
  const weekLabel = $derived(
    `Minutes watched per day, last 7 days: ${fmtMin(days.reduce((s, d) => s + d.min, 0))} in all.` +
      (limitMin ? ` ${days.filter((d) => d.over).length} days over the ${fmtMin(limitMin)} limit.` : ''),
  );

  // The day view needs something to show; otherwise the keys sheet.
  const view = $derived(VIEW === 'day' && (flags['watch-time'] || watched.length || picks.length) ? 'day' : 'keys');
</script>

{#snippet chevron()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
{/snippet}

{#if tab}
  <section aria-label="Nothing playing" class="st">
    <div class="st-text">
      <span class="lab">Nothing playing</span>
      <h2>YouTube is open on {place}</h2>
    </div>
    <button class="pill" onclick={() => focusTab(tab)}>
      Go to tab
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
    </button>
  </section>
{:else}
  <section aria-label="Nothing playing" class="empty">
    <span class="lab">Nothing playing</span>
    <h2>No YouTube tab is open</h2>
    <button class="pill" onclick={() => openYouTube()}>
      Open YouTube
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg>
    </button>
  </section>
{/if}

{#if view === 'keys'}
  <section class="card keys" aria-labelledby="keys-h">
    <h2 id="keys-h">On any video, press</h2>
    <ul>
      {#each keys as k (k.caps.join())}
        {@const off = !flags[k.id]}
        <li class="krow">
          <span class="caps">{#each k.caps as c (c)}<kbd class="kbd" class:off>{c}</kbd>{/each}</span>
          <span class="ktext">
            {k.text}
            {#if off}<span class="ksub">The queue is off</span>{:else if k.sub}<span class="ksub">{k.sub}</span>{/if}
          </span>
          {#if off}
            <button class="pill ghost sm" aria-label="Turn on the queue" onclick={() => onToggle(k.id, true)}>Turn on</button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
  <div class="fill"></div>
  <button class="onrow" onclick={() => go('settings')}>
    <span class="ktext">
      <b>{onNames.length} {onNames.length === 1 ? 'feature' : 'features'} on</b>
      <span class="ksub">{onSummary || 'Pick what Helm changes on YouTube'}</span>
    </span>
    {@render chevron()}
  </button>
{:else}
  {#if flags['watch-time']}
    <section class="card daycard" aria-label="Today">
      <div class="t-head">
        <span class="lab">Today</span>
        <button class="link" onclick={() => go('stats')}>Watch time{@render chevron()}</button>
      </div>
      <div class="big">
        <b>{fmtMin(todayMin)}</b>
        {#if limitMin}
          <span>of {fmtMin(limitMin)}</span>
          <span class="left">
            {todayMin <= limitMin ? `${fmtMin(limitMin - todayMin)} left` : `${fmtMin(todayMin - limitMin)} over`}
          </span>
        {/if}
      </div>
      {#if limitMin}
        <div
          class="meter"
          role="meter"
          aria-label="Watched today"
          aria-valuemin="0"
          aria-valuemax={limitMin}
          aria-valuenow={Math.min(todayMin, limitMin)}
          aria-valuetext="{fmtMin(todayMin)} of {fmtMin(limitMin)}"
        >
          <span style:width="{Math.min(100, (todayMin / limitMin) * 100)}%"></span>
        </div>
      {/if}
      <!-- A brand-new week is all zeros: skip the chart so the suggestions show. -->
      {#if days.some((d) => d.min)}
        <div class="wk" role="img" aria-label={weekLabel}>
          <div class="plot">
            {#if limitMin}<span class="lim" style:bottom="{Math.round((limitMin / top) * PLOT)}px"></span>{/if}
            {#each days as d (d.short)}
              <span class="b" class:over={d.over} class:today={d.today} style:height="{Math.max(2, Math.round((d.min / top) * PLOT))}px"></span>
            {/each}
          </div>
          <div class="x" aria-hidden="true">
            {#each days as d (d.short)}<span class:cur={d.today}>{d.short}</span>{/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <div class="scroll more">
    {#if watched.length}
      <section aria-labelledby="watched-h">
        <h2 id="watched-h" class="sh">Watched from your queue</h2>
        <ul>
          {#each watched as w (w.videoId)}
            <li class="wrow">
              <div class="qthumb">
                <img src={thumbUrl(w.videoId)} alt="" />
                {#if w.duration}<span class="dur">{fmtClock(w.duration)}</span>{/if}
              </div>
              <div class="qtext">
                <div class="qtitle">{w.title}</div>
                <div class="qsub"><span>{w.channelName} · {playedAt(w.playedAt!)}</span></div>
              </div>
              <button class="ib sm quiet" aria-label="Play again: {w.title}" title="Play again" onclick={() => onPlay(w.videoId)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"></path><path d="M3.5 4v4.5H8"></path><path d="M10 8.8v6.4l5.2-3.2z" fill="currentColor" stroke="none"></path></svg>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if picks.length}
      <section class="card picks" aria-labelledby="picks-h">
        <h2 id="picks-h">Turn on when you want</h2>
        {#each picks as p (p.id)}
          <label class="prow">
            <span class="ptext">
              <span class="fname">{p.name}</span>
              <span class="fdesc">{p.desc}</span>
            </span>
            <input
              class="sw"
              type="checkbox"
              role="switch"
              checked={!!flags[p.id]}
              onchange={(e) => onToggle(p.id, e.currentTarget.checked)}
            />
          </label>
        {/each}
      </section>
      <button class="txtbtn all" onclick={() => go('settings')}>See all {ALL_FEATURES.length} features{@render chevron()}</button>
    {/if}
  </div>
{/if}

<style>
  /* Status: a YouTube tab to go back to, else open one. */
  .st,
  .empty {
    margin: 0 12px;
    border-radius: 20px;
    background: var(--s1);
    flex-shrink: 0;
  }
  .st {
    padding: 14px 14px 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .st-text {
    flex-grow: 1;
    min-width: 0;
  }
  .empty {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }
  .st h2,
  .empty h2 {
    margin-top: 2px;
    font-size: 15px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .empty h2 {
    margin: 4px 0 14px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .card {
    margin: 10px 12px 0;
    flex-shrink: 0;
  }
  .card > h2 {
    display: flex;
    align-items: center;
    height: 36px;
  }
  .pill.ghost {
    background: var(--s2);
  }
  .pill.sm {
    height: 32px;
    padding: 0 14px;
    font-size: 12px;
  }

  /* Keys */
  .keys {
    padding: 6px 16px 8px;
  }
  .krow {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }
  .caps {
    width: 62px;
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .caps .kbd {
    min-width: 28px;
    height: 28px;
    margin: 0;
    border-radius: 8px;
    font-size: 13px;
  }
  .kbd.off {
    background: var(--s2);
    color: var(--faint);
  }
  .ktext {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
  }
  .ksub {
    display: block;
    font-size: 12px;
    line-height: 16px;
    font-weight: 400;
    color: var(--muted);
  }
  .fill {
    flex-grow: 1;
  }
  .onrow {
    margin: 0 12px 10px;
    padding: 10px 6px 10px 16px;
    border-radius: 16px;
    background: var(--s1);
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  .onrow:last-child {
    margin-bottom: 12px;
  }
  .onrow:hover {
    background: var(--s2);
  }
  .onrow b {
    display: block;
    font-weight: 600;
  }
  .onrow svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--muted);
  }

  /* Day: today against the limit, the week, what you watched */
  .daycard {
    padding: 14px 16px 16px;
  }
  .t-head {
    display: flex;
    align-items: center;
    height: 20px;
  }
  .link {
    margin: 0 -4px 0 auto;
    height: 24px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }
  .link:hover {
    color: var(--text);
  }
  .link svg {
    width: 14px;
    height: 14px;
  }
  .big {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  .big b {
    font-size: 28px;
    line-height: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .left {
    margin-left: auto;
    color: var(--text);
    font-weight: 500;
  }
  .meter {
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    background: var(--s3);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }
  .wk {
    margin-top: 16px;
  }
  .plot,
  .x {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }
  .plot {
    position: relative;
    height: 40px;
    align-items: end;
  }
  .lim {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--faint);
  }
  .b {
    border-radius: 3px 3px 1px 1px;
    background: var(--bar);
  }
  .b.over {
    background: var(--bar-over);
  }
  .b.today {
    background: var(--accent);
  }
  .x {
    margin-top: 4px;
    font-size: 11px;
    line-height: 14px;
    color: var(--faint);
    text-align: center;
  }
  .x .cur {
    color: var(--text);
    font-weight: 600;
  }
  .more {
    margin-bottom: 10px;
    padding: 16px 0 4px;
  }
  .sh {
    padding: 0 16px 2px;
  }
  .wrow {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 8px 0 16px;
  }
  .quiet {
    color: var(--muted);
  }
  .picks {
    padding: 6px 16px 4px;
  }
  .more > section + .picks {
    margin-top: 12px;
  }
  .more > .picks:first-child {
    margin-top: 0;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 58px;
    cursor: pointer;
  }
  .ptext {
    flex-grow: 1;
    min-width: 0;
  }
  .all {
    margin: 8px 0 0 14px;
  }
</style>
