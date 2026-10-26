<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtDuration } from '../../lib/format';
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
  import Mark from './Mark.svelte';
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
  let tabCount = $state(0);
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
      tabCount = tabs.length;
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
  const pendingSec = $derived(pending.reduce((s, i) => s + i.duration, 0));
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
    // The id outlives the player tab leaving YouTube (cleared only on close): don't navigate another site's tab.
    if (playerTabId != null) {
      const tab = await browser.tabs.get(playerTabId).catch(() => null);
      if (!tab?.url?.startsWith('https://www.youtube.com/')) {
        playerTabId = null;
        await setPlayerTabId(null);
      }
    }
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
  <section aria-label="Up next" class="q">
    <div class="q-head"><h2>Up next</h2></div>
    <div class="slot">
      <p>The queue is off. Turn it on to line up videos across every YouTube tab.</p>
      <div><button class="pill ghost" onclick={turnOnQueue}>Turn on the queue</button></div>
    </div>
  </section>
{/snippet}

{#snippet openIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg>
{/snippet}

{#if loaded}
  <div class="page">
    <h1 class="sr-only">Helm</h1>
    <header class="top">
      <span class="brand"><Mark />Helm</span>
      {#if flags['watch-time']}
        <button
          class="time"
          title="Watch time"
          aria-label="Watched today: {fmtMin(todayMin)}{limitMin ? ` of a ${fmtMin(limitMin)} limit` : ''}. Open watch time."
          onclick={() => go('stats')}
        >
          {fmtMin(todayMin)}
          {#if limitMin}
            <span class="mini" aria-hidden="true"><span style:width="{Math.min(100, (todayMin / limitMin) * 100)}%"></span></span>
          {/if}
        </button>
      {/if}
      <button class="ib" aria-label="Settings" title="Settings" onclick={() => go('settings')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </header>

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
          <button class="ib sm quiet" aria-label="Go to that tab" title="Go to that tab" onclick={() => focusTab(o)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
          </button>
        </div>
      {/if}

      {#if queueOn}
        <QueueList bind:items={queue} {st} onPlay={playItem} />
      {:else}
        {@render queueOff()}
      {/if}
    {:else if queueOn && pending.length}
      {@const first = pending[0]}
      <section aria-label="Nothing playing" class="idle">
        <img class="idle-art" src={thumbUrl(first.videoId)} alt="" />
        <div class="np-status">Nothing playing · {pending.length} queued{pendingSec ? `, ${fmtDuration(pendingSec)}` : ''}</div>
        <div class="np-title">{first.title}</div>
        <div class="np-ch">{first.channelName}{first.duration ? ` · ${fmtClock(first.duration)}` : ''}</div>
        <div class="actions">
          <button class="pill" onclick={() => playItem(first.videoId)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"></path></svg>
            Play queue
          </button>
          <button class="pill ghost" onclick={() => openYouTube()}>Open YouTube{@render openIcon()}</button>
        </div>
      </section>
      {#if pending.length > 1}
        {@const restSec = pendingSec - first.duration}
        <section aria-label="Then" class="q">
          <div class="q-head">
            <h2>Then</h2>
            <span class="q-sub">{pending.length - 1} more{restSec ? ` · ${fmtDuration(restSec)}` : ''}</span>
          </div>
          <ol class="qlist scroll">
            {#each pending.slice(1) as item (item.videoId)}
              <li class="qrow">
                <div class="qthumb">
                  <img src={thumbUrl(item.videoId)} alt="" />
                  {#if item.duration}<span class="dur">{fmtClock(item.duration)}</span>{/if}
                </div>
                <div class="qtext">
                  <div class="qtitle">{item.title}</div>
                  <div class="qsub"><span>{item.channelName}</span></div>
                </div>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    {:else}
      <section aria-label="Nothing playing" class="empty">
        <span class="lab">Nothing playing</span>
        <h2>{tabCount ? 'No video is playing on YouTube' : 'No YouTube tab is open'}</h2>
        <button class="pill" onclick={() => openYouTube()}>Open YouTube{@render openIcon()}</button>
      </section>
      {#if queueOn}
        <QueueList bind:items={queue} st={null} onPlay={playItem} />
      {:else}
        {@render queueOff()}
      {/if}
    {/if}
  </div>
{/if}

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .time {
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--s1);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }
  .time:hover {
    background: var(--s2);
  }
  .mini {
    width: 28px;
    height: 4px;
    border-radius: 999px;
    background: var(--s3);
    overflow: hidden;
  }
  .mini span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }

  /* Another tab */
  .other {
    margin: 8px 12px 0;
    padding: 6px 4px 6px 8px;
    border-radius: 14px;
    background: var(--s1);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .other img {
    width: 48px;
    height: 27px;
    border-radius: 5px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--s3);
  }
  .other-text {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .other-status {
    font-size: 11px;
    line-height: 14px;
    color: var(--muted);
  }
  .other-title {
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

  /* Nothing playing, queue has items */
  .idle {
    padding: 4px 16px 0;
    flex-shrink: 0;
  }
  .idle-art {
    width: 348px;
    height: 196px;
    border-radius: 12px;
    object-fit: cover;
    display: block;
    background: var(--s3);
  }
  .idle .np-title {
    font-size: 16px;
    line-height: 22px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  /* Nothing playing, queue empty */
  .empty {
    margin: 0 12px;
    padding: 16px;
    border-radius: 20px;
    background: var(--s1);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .empty h2 {
    margin: 4px 0 14px;
    font-size: 15px;
    line-height: 20px;
    font-weight: 600;
  }
</style>
