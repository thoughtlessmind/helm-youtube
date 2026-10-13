<script lang="ts">
  import { storage } from '#imports';
  import { ALL_FEATURES, type FeatureId } from '../../lib/feature-catalog';
  import { getConfig, getFlags, setFlag, type FeatureFlags } from '../../lib/settings';
  import { FIRST_RUN_KEY, openYouTube, type Page } from './lib';

  let { go }: { go: (p: Page) => void } = $props();

  let flags = $state<FeatureFlags>({});
  let rate = $state(1.25);
  let opened = $state(false);
  let ready = $state(false);

  void Promise.all([getFlags(), getConfig('playback-speed')]).then(([f, s]) => {
    flags = f;
    rate = s.rate;
    ready = true;
  });

  // Default-on features, phrased as what changed on YouTube (and what it says once turned off).
  const DEFAULTS = $derived<{ id: FeatureId; keys?: string[]; on: string; off: string }[]>([
    { id: 'hide-shorts', on: 'Shorts are gone from your feeds', off: 'Shorts show in your feeds' },
    { id: 'playback-speed', on: `Videos start at ${rate}× speed`, off: 'Videos start at normal speed' },
    { id: 'hide-end-screen-cards', on: 'End-screen cards are hidden', off: 'End-screen cards show' },
    { id: 'auto-dismiss-still-watching', on: '“Still watching?” is answered for you', off: '“Still watching?” can pause videos' },
    { id: 'loop-section', keys: ['[', ']'], on: 'loop a section', off: 'Section loop keys are off' },
    { id: 'screenshot-current-frame', keys: ['S'], on: 'saves a frame', off: 'Frame saving is off' },
  ]);
  const PICKS: { id: FeatureId; name: string; desc: string }[] = [
    { id: 'read-later-queue', name: 'Global queue', desc: 'One queue shared by every YouTube tab.' },
    { id: 'sponsorblock', name: 'SponsorBlock auto-skip', desc: 'Skips sponsor reads and filler.' },
    { id: 'focus-mode', name: 'Focus mode', desc: 'Hides feeds and recommendations.' },
    { id: 'watch-time', name: 'Watch time', desc: 'Daily stats with a gentle limit.' },
  ];

  const onCount = $derived(DEFAULTS.filter((f) => flags[f.id]).length);
  const pickCount = $derived(PICKS.filter((f) => flags[f.id]).length);

  const icon = (id: FeatureId) => ALL_FEATURES.find((f) => f.id === id)!.icon;

  async function toggle(id: FeatureId) {
    flags[id] = !flags[id];
    await setFlag(id, !!flags[id]);
  }

  async function leave(to: Page) {
    await storage.setItem(FIRST_RUN_KEY, true);
    go(to);
  }
</script>

<div class="page firstrun">
  <header class="hello">
    <span class="badge-ic" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
    </span>
    <div class="hello-text">
      <h1>YouTube Pro is on</h1>
      <p>Good defaults are already working. Nothing else to set up.</p>
    </div>
  </header>

  <div class="scroll body">
    {#if ready}
    <section aria-labelledby="fr-on">
      <div class="sec-head">
        <h2 id="fr-on" class="label">Already on</h2>
        <span class="badge">{onCount} of {DEFAULTS.length}</span>
      </div>
      <div class="card">
        {#each DEFAULTS as f (f.id)}
          {@const on = !!flags[f.id]}
          <label class="feat tall">
            <span class="tile" class:on aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={icon(f.id)}></path></svg>
            </span>
            <span class="line" class:muted={!on}>
              {#if on}{#each f.keys ?? [] as k (k)}<kbd>{k}</kbd>{/each}{/if}{on ? f.on : f.off}
            </span>
            <input class="sw" type="checkbox" role="switch" checked={on} onchange={() => toggle(f.id)} />
          </label>
        {/each}
      </div>
    </section>

    <section aria-labelledby="fr-picks">
      <div class="sec-head">
        <h2 id="fr-picks" class="label">Turn on when you want</h2>
        {#if pickCount}<span class="badge">{pickCount} added</span>{/if}
      </div>
      <div class="card">
        {#each PICKS as f (f.id)}
          {@const on = !!flags[f.id]}
          <label class="feat">
            <span class="tile" class:on aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={icon(f.id)}></path></svg>
            </span>
            <span class="pick-text">
              <span class="name">{f.name}</span>
              <span class="desc">{f.desc}</span>
            </span>
            <input class="sw" type="checkbox" role="switch" checked={on} onchange={() => toggle(f.id)} />
          </label>
        {/each}
      </div>
      <button class="more" onclick={() => leave('settings')}>
        See all {ALL_FEATURES.length} features
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
      </button>
    </section>
    {/if}
  </div>

  <footer class="foot">
    <button class="btn quiet" onclick={() => leave('main')}>Done</button>
    <button
      class="btn primary open"
      onclick={() => {
        void openYouTube(false);
        opened = true;
      }}
    >
      {opened ? 'Opened in a new tab' : 'Open YouTube'}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path></svg>
    </button>
  </footer>
</div>

<style>
  .firstrun {
    --surface: var(--surface-card);
    --accent-soft: var(--accent-soft-2);
  }
  .hello {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 20px 14px;
    flex-shrink: 0;
    background: radial-gradient(120% 140% at 0% 0%, var(--accent-soft) 0%, transparent 60%);
  }
  .badge-ic {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .hello-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .hello h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .hello p {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
  }
  .body {
    padding: 6px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .sec-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 4px 8px;
  }
  .card {
    border-radius: 16px;
    background: var(--surface);
    overflow: hidden;
  }
  .feat {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .feat.tall {
    min-height: 48px;
    padding: 10px 14px;
  }
  .feat + .feat {
    border-top: 1px solid var(--line);
  }
  .feat:hover {
    background-color: rgba(127, 127, 140, 0.06);
  }
  .tile {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tile);
    color: var(--muted);
    transition: background-color 0.18s ease, color 0.18s ease;
  }
  .tile.on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .line {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }
  .line.muted {
    color: var(--muted);
  }
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    margin-right: 4px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    font-weight: 700;
    vertical-align: 1px;
    background: var(--tile);
    border: 1px solid var(--line);
    color: var(--text);
  }
  .pick-text {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
  }
  .desc {
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
  }
  .more {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    padding: 12px 14px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-text);
    transition: background-color 0.15s ease;
  }
  .more:hover {
    background-color: rgba(127, 127, 140, 0.09);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    flex-shrink: 0;
  }
  .quiet {
    justify-content: center;
    min-width: 72px;
    color: var(--text);
  }
  .quiet:hover {
    background-color: rgba(127, 127, 140, 0.14);
    filter: none;
  }
  .open {
    flex-grow: 1;
    justify-content: center;
  }
</style>
