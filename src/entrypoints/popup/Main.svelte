<script lang="ts">
  import { onMount } from 'svelte';
  import { sendToTab, type PlayerState, type TabMessage } from '../../lib/messages';
  import {
    getPlayerTabId,
    getQueue,
    setPlayerTabId,
    thumbUrl,
    upNext,
    watchQueue,
    watchUrl,
    type QueueItem,
  } from '../../lib/queue';
  import { getConfig, getFlags, setFlag, type FeatureFlags } from '../../lib/settings';
  import NowPlaying from './NowPlaying.svelte';
  import QueueList from './QueueList.svelte';
  import {
    fmtClock,
    fmtMin,
    focusTab,
    getLog,
    minutesOn,
    openYouTube,
    logItem,
    youtubeTabs,
    type Page,
    type WatchLog,
  } from './lib';

  let { go }: { go: (p: Page) => void } = $props();

  interface Playing {
    id: number;
    windowId: number;
    state: PlayerState;
  }

  let loaded = $state(false);
  let queue = $state<QueueItem[]>([]);
  let flags = $state<FeatureFlags>({});
  let limitMin = $state(0);
  let log = $state<WatchLog>({});
  let playerTabId = $state<number | null>(null);
  /** The tab the card shows: the player tab, else the most recently used tab with a video. */
  let shown = $state<Playing | null>(null);
  /** Another tab that is playing ("Also playing in another tab"). Sticky once shown. */
  let other = $state<Playing | null>(null);

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const [ptab, tabs] = await Promise.all([getPlayerTabId(), youtubeTabs()]);
      const states = await Promise.all(
        tabs.map(async (t) => ({
          id: t.id!,
          windowId: t.windowId,
          state: await sendToTab<PlayerState | null>(t.id!, { type: 'player-state' }),
        })),
      );
      const live = states.filter((t): t is Playing => !!t.state);
      playerTabId = ptab;
      shown = live.find((t) => t.id === ptab) ?? live[0] ?? null;
      const rest = live.filter((t) => t.id !== shown?.id);
      other = rest.find((t) => t.id === other?.id) ?? rest.find((t) => !t.state.paused) ?? null;
    } finally {
      polling = false;
      loaded = true;
    }
  }

  onMount(() => {
    const offs = [watchQueue((q) => (queue = q)), logItem.watch((l) => (log = l))];
    void Promise.all([getQueue(), getFlags(), getConfig('watch-time'), getLog()]).then(([q, f, wt, l]) => {
      queue = q;
      flags = f;
      limitMin = wt.dailyLimitMinutes;
      log = l;
      void poll();
    });
    const timer = setInterval(poll, 1000);
    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
    };
  });

  const queueOn = $derived(!!flags['read-later-queue']);
  const st = $derived(shown?.state ?? null);
  const currentId = $derived(st?.videoId ?? null);
  const nextItem = $derived(queue.find((i) => !i.playedAt && i.videoId !== currentId) ?? null);
  const pending = $derived(upNext(queue));
  const todayMin = $derived(minutesOn(log, new Date()));

  async function control(msg: TabMessage) {
    if (!shown) return;
    await sendToTab(shown.id, msg);
    void poll();
  }

  function toggle(p: Playing) {
    const action = p.state.paused ? 'play' : 'pause';
    p.state.paused = !p.state.paused; // optimistic; the next poll confirms
    void sendToTab(p.id, { type: 'player-control', action }).then(poll);
  }

  function seek(to: number) {
    if (st) st.currentTime = to;
    void control({ type: 'player-seek', to });
  }

  function prev() {
    if (!st) return;
    if (st.currentTime > 3) return seek(0);
    const i = queue.findIndex((q) => q.videoId === currentId);
    if (i > 0) void playItem(queue[i - 1].videoId);
    else seek(0);
  }

  /** Plays in the player tab, else the tab shown in the card, else a new tab. */
  async function playItem(videoId: string) {
    const target = playerTabId ?? shown?.id ?? null;
    if (target == null) return playInNewTab(videoId);
    const handled = await sendToTab(target, { type: 'play-video', videoId });
    if (handled === undefined) {
      try {
        await browser.tabs.update(target, { url: watchUrl(videoId) });
      } catch {
        return playInNewTab(videoId); // the player tab is gone
      }
    }
    await setPlayerTabId(target);
    void poll();
  }

  async function playInNewTab(videoId: string) {
    // Created in the background first: activating it closes the popup, so record it before.
    const tab = await browser.tabs.create({ url: watchUrl(videoId), active: false });
    if (tab.id == null) return;
    await setPlayerTabId(tab.id);
    await focusTab(tab);
  }

  async function turnOnQueue() {
    await setFlag('read-later-queue', true);
    flags = await getFlags();
  }
</script>

{#snippet queueOff()}
  <div class="off">
    <span>Queue is off</span>
    <button class="ghost accent" onclick={turnOnQueue}>Turn on</button>
  </div>
{/snippet}

{#if loaded}
  <div class="page">
    {#if st && shown}
      <NowPlaying
        {st}
        fromQueue={queue.some((q) => q.videoId === st.videoId)}
        nextLabel={nextItem ? `Next: ${nextItem.title}` : 'Queue finished. YouTube autoplay takes over.'}
        nextDisabled={!nextItem}
        onToggle={() => shown && toggle(shown)}
        onSeek={seek}
        onSeekBy={(by) => {
          st.currentTime = Math.max(0, st.currentTime + by);
          void control({ type: 'player-seek', by });
        }}
        onPrev={prev}
        onNext={() => nextItem && playItem(nextItem.videoId)}
        onGoto={() => shown && focusTab(shown)}
      />

      {#if other}
        {@const o = other}
        <div class="other" role="group" aria-label="Another YouTube tab">
          <img src={thumbUrl(o.state.videoId)} alt="" />
          <div class="other-text">
            <span class="other-status">{o.state.paused ? 'Paused in another tab' : 'Also playing in another tab'}</span>
            <span class="other-title">{o.state.title}</span>
          </div>
          <button
            class="ib sm"
            aria-label="{o.state.paused ? 'Play' : 'Pause'} the other tab"
            title="{o.state.paused ? 'Play' : 'Pause'} the other tab"
            onclick={() => toggle(o)}
          >
            {#if o.state.paused}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"></rect></svg>
            {/if}
          </button>
          <button class="ib sm" aria-label="Go to that tab" title="Go to that tab" onclick={() => focusTab(o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
          </button>
        </div>
      {/if}

      {#if queueOn}
        <QueueList bind:items={queue} {currentId} nextId={nextItem?.videoId ?? null} paused={st.paused} onPlay={playItem} />
      {:else}
        <section aria-label="Queue" class="queue-off">{@render queueOff()}</section>
      {/if}
    {:else if queueOn && pending.length}
      {@const first = pending[0]}
      <div class="lines-2 page-body">
        <section aria-label="Nothing playing" class="idle-hero">
          <img class="ambient" src={thumbUrl(first.videoId)} alt="" aria-hidden="true" />
          <img class="art" src={thumbUrl(first.videoId)} alt="" />
          <div class="scrim" aria-hidden="true"></div>
          <div class="idle-meta">
            <div class="kicker">Nothing playing · up next</div>
            <div class="title">{first.title}</div>
            <div class="channel">{first.channelName}{first.duration ? ` · ${fmtClock(first.duration)}` : ''}</div>
            <div class="actions">
              <button class="btn primary" onclick={() => playItem(first.videoId)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
                Play queue
              </button>
              <button class="btn glass-btn" onclick={() => openYouTube()}>Open YouTube</button>
            </div>
          </div>
        </section>
        <section aria-label="Queue" class="idle-queue">
          <div class="idle-head">
            <h2 class="label">Queue</h2>
            <span class="badge">{pending.length} up next</span>
          </div>
          <ol class="scroll">
            {#each pending as item, i (item.videoId)}
              <li>
                <div class="ithumb">
                  <img src={thumbUrl(item.videoId)} alt="" />
                  {#if item.duration}<span class="dur">{fmtClock(item.duration)}</span>{/if}
                </div>
                <div class="itext">
                  <div class="ititle">{item.title}</div>
                  <div class="isub">
                    {#if i === 0}<span class="next">Next</span>{/if}
                    <span>{item.channelName}</span>
                  </div>
                </div>
              </li>
            {/each}
          </ol>
        </section>
      </div>
    {:else}
      <section aria-labelledby="nt-title" class="notab lines-2">
        <div class="nt-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h12M3 12h12M3 18h8M17 15l5 3-5 3z"></path></svg>
        </div>
        {#if queueOn}
          <h1 id="nt-title">Your queue is empty</h1>
          <p>
            On any YouTube video, open
            <span class="kebab" role="img" aria-label="the More actions menu"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"></circle><circle cx="12" cy="12" r="2" fill="currentColor"></circle><circle cx="12" cy="19" r="2" fill="currentColor"></circle></svg></span>
            → <strong>Add to queue</strong>
          </p>
        {:else}
          <h1 id="nt-title" class="sr-only">Queue</h1>
          {@render queueOff()}
        {/if}
        <button class="btn primary nt-open" onclick={() => openYouTube()}>
          Open YouTube
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg>
        </button>
      </section>
    {/if}
    <footer class="foot" class:solo={!flags['watch-time']}>
      {#if flags['watch-time']}
        <button class="stat" title="Watch time stats" onclick={() => go('stats')}>
          <span class="stat-text">
            <span><strong>{fmtMin(todayMin)}</strong> watched today{limitMin ? ` · ${fmtMin(limitMin)} limit` : ''}</span>
            {#if limitMin}
              <span class="meter" aria-hidden="true"><span style:width="{Math.min(100, (todayMin / limitMin) * 100)}%"></span></span>
            {/if}
          </span>
          <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      {/if}
      <button class="ib" aria-label="Settings" title="Settings" onclick={() => go('settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </footer>
  </div>
{/if}

<style>
  /* Footer */
  .foot.solo {
    justify-content: flex-end;
  }
  .page:has(.lines-2) .foot {
    border-top-color: var(--line-2);
  }
  .stat {
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    margin-left: -8px;
    border-radius: 10px;
    text-align: left;
    color: var(--muted);
    transition: background-color 0.15s ease;
  }
  .stat:hover {
    background-color: rgba(127, 127, 140, 0.09);
  }
  .stat-text {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  .stat strong {
    color: var(--text);
    font-weight: 700;
  }
  .meter {
    display: block;
    width: 160px;
    height: 3px;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--muted);
  }
  .chev {
    opacity: 0.55;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .stat:hover .chev,
  .stat:focus-visible .chev {
    opacity: 1;
    transform: translateX(2px);
  }

  /* Another tab */
  .other {
    margin: 0 12px 10px;
    padding: 6px 4px 6px 8px;
    border-radius: 12px;
    background: var(--surface);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .other img {
    width: 44px;
    height: 25px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--tile);
  }
  .other-text {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .other-status {
    font-size: 11px;
    color: var(--muted);
  }
  .other-title {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Queue off (D8) */
  .queue-off {
    flex-grow: 1;
    border-top: 1px solid var(--line);
  }
  .off {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 4px 20px;
    font-size: 12px;
    color: var(--muted);
  }
  .accent {
    color: var(--accent-text);
  }

  /* Nothing playing, queue has items (Empty board) */
  .page-body {
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .idle-hero {
    position: relative;
    height: 268px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .ambient {
    position: absolute;
    left: -60px;
    top: -60px;
    width: 500px;
    height: 400px;
    object-fit: cover;
    filter: blur(40px) saturate(1.4);
    opacity: var(--ambient-2);
  }
  .art {
    position: absolute;
    left: 0;
    top: 0;
    width: 380px;
    height: 214px;
    object-fit: cover;
    opacity: 0.55;
    filter: grayscale(0.35);
    mask-image: linear-gradient(to bottom, #000 35%, transparent 100%);
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(var(--bg-rgb), 0.5) 0%,
      rgba(var(--bg-rgb), 0.1) 30%,
      rgba(var(--bg-rgb), 0.85) 70%,
      rgb(var(--bg-rgb)) 100%
    );
  }
  .idle-meta {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .glass-btn {
    background: var(--glass-btn);
    border: 1px solid var(--line-2);
    color: var(--text);
    backdrop-filter: blur(16px);
  }
  .idle-queue {
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line-2);
  }
  .idle-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 6px 20px;
  }
  .idle-queue ol {
    list-style: none;
    margin: 0;
    padding: 2px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .idle-queue li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 12px;
    border-radius: 14px;
  }

  /* No YouTube tab, empty queue (NoTab board) */
  .notab {
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 40px 44px;
    text-align: center;
  }
  .nt-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-btn);
    border: 1px solid var(--line-2);
    color: var(--muted);
  }
  .notab h1 {
    margin: 18px 0 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .notab p {
    margin: 8px 0 0;
    max-width: 260px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted);
    text-wrap: balance;
  }
  .notab p strong {
    font-weight: 600;
    color: var(--text);
  }
  .notab .off {
    padding: 18px 0 0;
  }
  .kebab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin: 0 1px;
    border-radius: 6px;
    vertical-align: -5px;
    background: var(--glass-btn);
    border: 1px solid var(--line-2);
    color: var(--text);
  }
  .nt-open {
    margin-top: 22px;
  }
</style>
