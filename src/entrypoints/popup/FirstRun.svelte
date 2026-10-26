<script lang="ts">
  import { storage } from '#imports';
  import { ALL_FEATURES, type FeatureId } from '../../lib/feature-catalog';
  import { FEATURE_CONFIG_DEFAULTS, getConfig, getFlags, setFlag, type FeatureFlags } from '../../lib/settings';
  import { FIRST_RUN_KEY, openYouTube, type Page } from './lib';
  import Mark from './Mark.svelte';

  let { go }: { go: (p: Page) => void } = $props();

  let flags = $state<FeatureFlags>({});
  let rate = $state(FEATURE_CONFIG_DEFAULTS['playback-speed'].rate);
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
    rate === 1
      ? { id: 'playback-speed', on: 'Your speed is remembered per channel', off: 'Speed resets with every video' }
      : { id: 'playback-speed', on: `Videos start at ${rate}× speed`, off: 'Videos start at normal speed' },
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
    <Mark size={36} />
    <h1>Helm is on</h1>
    <p>Good defaults are already working on YouTube. Nothing to set up.</p>
  </header>

  <div class="scroll body">
    {#if ready}
    <section aria-labelledby="fr-on">
      <div class="sechead">
        <h2 id="fr-on">Already on</h2>
        <span>{onCount} of {DEFAULTS.length}</span>
      </div>
      <div class="list">
        {#each DEFAULTS as f (f.id)}
          {@const on = !!flags[f.id]}
          <label class="row row-line">
            <span class="line" class:muted={!on}>
              {#if on}{#each f.keys ?? [] as k (k)}<kbd class="kbd">{k}</kbd>{/each}{/if}{on ? f.on : f.off}
            </span>
            <input class="sw" type="checkbox" role="switch" checked={on} onchange={() => toggle(f.id)} />
          </label>
        {/each}
      </div>
    </section>

    <section aria-labelledby="fr-picks">
      <div class="sechead">
        <h2 id="fr-picks">Turn on when you want</h2>
        {#if pickCount}<span>{pickCount} added</span>{/if}
      </div>
      <div class="list">
        {#each PICKS as f (f.id)}
          <label class="row row-line tall">
            <span class="ftext">
              <span class="fname">{f.name}</span>
              <span class="fdesc">{f.desc}</span>
            </span>
            <input class="sw" type="checkbox" role="switch" checked={!!flags[f.id]} onchange={() => toggle(f.id)} />
          </label>
        {/each}
      </div>
    </section>
    {/if}
  </div>

  <footer class="foot">
    <button class="txtbtn" onclick={() => leave('settings')}>
      See all {ALL_FEATURES.length} features
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
    {#if opened}
      <button class="pill" onclick={() => leave('main')}>Done</button>
    {:else}
      <button
        class="pill"
        onclick={() => {
          void openYouTube(false);
          void storage.setItem(FIRST_RUN_KEY, true);
          opened = true;
        }}
      >
        Open YouTube
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg>
      </button>
    {/if}
  </footer>
</div>

<style>
  .hello {
    padding: 22px 20px 14px;
    flex-shrink: 0;
  }
  .hello h1 {
    margin: 14px 0 0;
    font-size: 22px;
    line-height: 28px;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
  .hello p {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 19px;
    color: var(--muted);
  }
  .body {
    padding: 0 12px 12px;
  }
  section + section {
    margin-top: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }
  .row.tall {
    min-height: 58px;
    padding: 8px 0;
  }
  .line {
    flex-grow: 1;
    font-size: 13px;
    line-height: 18px;
  }
  .ftext {
    flex-grow: 1;
    min-width: 0;
  }
  .foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid var(--rule);
  }
  .foot .txtbtn {
    margin-left: -10px;
  }
</style>
