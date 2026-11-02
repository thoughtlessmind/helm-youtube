<script lang="ts">
  import { storage } from '#imports';
  import { themeById, type Palette } from '../../features/theme/themes';
  import { ALL_FEATURES, type FeatureId } from '../../lib/feature-catalog';
  import { FEATURE_CONFIG_DEFAULTS, FEATURE_DEFAULTS, getConfig, getFlags, setFlag, type FeatureFlags } from '../../lib/settings';
  import { FIRST_RUN_KEY, SUGGESTIONS, openYouTube, saveTheme, type Page } from './lib';
  import Mark from './Mark.svelte';
  import ThemePicker from './ThemePicker.svelte';

  let { go }: { go: (p: Page) => void } = $props();

  /** Opened in its own tab on install (popup.html#setup), not as the toolbar popup. */
  const inTab = location.hash === '#setup';

  let step = $state(0);
  let flags = $state<FeatureFlags>({});
  let rate = $state(FEATURE_CONFIG_DEFAULTS['playback-speed'].rate);
  let preset = $state(FEATURE_CONFIG_DEFAULTS.theme.preset);
  /** The popup sits over a YouTube tab, so a theme shows there as it's picked. */
  let onYouTube = $state(false);
  let ready = $state(false);

  void Promise.all([
    getFlags(),
    getConfig('playback-speed'),
    getConfig('theme'),
    inTab ? [] : browser.tabs.query({ active: true, currentWindow: true }),
  ]).then(([f, s, t, tabs]) => {
    flags = f;
    rate = s.rate;
    preset = t.preset;
    onYouTube = !!tabs[0]?.url?.startsWith('https://www.youtube.com/');
    ready = true;
  });

  type Line = { id: FeatureId; keys?: string[]; on: string; off: string };
  // Default-on features, phrased as what changed on YouTube (and what it says once turned off).
  const GROUPS = $derived<{ title: string; lines: Line[] }[]>([
    {
      title: 'In your feeds',
      lines: [
        { id: 'hide-shorts', on: 'Shorts are gone', off: 'Shorts show' },
        { id: 'hide-playables', on: 'Playables are gone', off: 'Playables show' },
      ],
    },
    {
      title: 'While you watch',
      lines: [
        { id: 'sponsorblock', on: 'Sponsor reads are skipped', off: 'Sponsor reads play' },
        rate === 1
          ? { id: 'playback-speed', on: 'Your speed is remembered per channel', off: 'Speed resets with every video' }
          : { id: 'playback-speed', on: `Videos start at ${rate}× speed`, off: 'Videos start at normal speed' },
        { id: 'auto-dismiss-still-watching', on: '“Still watching?” is answered for you', off: '“Still watching?” can pause videos' },
        { id: 'download-transcript', on: 'Transcripts can be saved', off: 'Transcript download is off' },
        { id: 'watch-time', on: 'Watch time is counted on this device', off: 'Watch time isn’t counted' },
      ],
    },
    {
      title: 'Keys on a video page',
      lines: [
        { id: 'read-later-queue', keys: ['Q'], on: 'adds it to your queue', off: 'The queue is off' },
        { id: 'loop-section', keys: ['[', ']'], on: 'loop a section', off: 'Section loop keys are off' },
        { id: 'screenshot-current-frame', keys: ['S'], on: 'saves a frame', off: 'Frame saving is off' },
      ],
    },
  ]);
  const EXTRAS = SUGGESTIONS.filter((s) => !FEATURE_DEFAULTS[s.id] && s.id !== 'theme');

  const STEPS = $derived([
    {
      title: 'Welcome to Helm',
      sub: 'It’s already working on YouTube. This is what changed; switch off anything you don’t want.',
    },
    {
      title: 'Try a theme',
      sub: onYouTube
        ? 'Recolor YouTube: palette, font and corners. Pick one and watch this tab change.'
        : 'Recolor YouTube: palette, font and corners. Pick one to preview it.',
    },
    { title: 'Extras, when you want them', sub: 'Off for now. Turn one on here, or later in Settings.' },
  ]);

  // The theme preview follows the device's light/dark, as YouTube does by default.
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const YOUTUBE: Record<'light' | 'dark', Palette> = {
    light: { bg: '#fff', raised: '#fff', menu: '#fff', text: '#0f0f0f', textMuted: '#606060', outline: 'rgba(0,0,0,0.1)', additive: 'rgba(0,0,0,0.05)', accent: '#065fd4' },
    dark: { bg: '#0f0f0f', raised: '#0f0f0f', menu: '#282828', text: '#f1f1f1', textMuted: '#aaa', outline: 'rgba(255,255,255,0.2)', additive: 'rgba(255,255,255,0.1)', accent: '#3ea6ff' },
  };
  const look = $derived.by(() => {
    const t = flags.theme ? themeById(preset) : null;
    const p = t ? ((dark ? t.dark : t.light) ?? t.light ?? t.dark)! : YOUTUBE[dark ? 'dark' : 'light'];
    return { ...p, font: t?.font ?? 'Roboto, Arial, sans-serif', radius: t?.radius ?? 12 };
  });

  async function toggle(id: FeatureId) {
    flags[id] = !flags[id];
    await setFlag(id, !!flags[id]);
  }

  function pickTheme(id: string) {
    flags.theme = id !== 'off';
    if (flags.theme) preset = id;
    void saveTheme(id);
  }

  /** Marks setup done and lands on YouTube (or the popup's main page when it's already there). */
  async function finish() {
    await storage.setItem(FIRST_RUN_KEY, true);
    if (inTab) location.assign('https://www.youtube.com/');
    else if (onYouTube) go('main');
    else void openYouTube(); // the popup closes as the new tab takes focus
  }

  async function allFeatures() {
    await storage.setItem(FIRST_RUN_KEY, true);
    go('settings');
  }
</script>

<div class="page firstrun">
  <header class="hello">
    <div class="kicker">
      <Mark size={28} />
      <span>Setup · Step {step + 1} of {STEPS.length}</span>
    </div>
    <div class="progress" aria-hidden="true">
      {#each STEPS as _, i (i)}<span class:done={i <= step}></span>{/each}
    </div>
    <h1>{STEPS[step].title}</h1>
    <p>{STEPS[step].sub}</p>
  </header>

  <div class="scroll body">
    {#if ready}
      {#if step === 0}
        {#each GROUPS as g (g.title)}
          <section aria-label={g.title}>
            <div class="sechead"><h2>{g.title}</h2></div>
            <div class="list">
              {#each g.lines as f (f.id)}
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
        {/each}
      {:else if step === 1}
        <!-- A small YouTube Home in the picked look: palette, font, corners. -->
        <div
          class="yt"
          aria-hidden="true"
          style:--yt-bg={look.bg}
          style:--yt-text={look.text}
          style:--yt-muted={look.textMuted}
          style:--yt-add={look.additive}
          style:--yt-line={look.outline}
          style:--yt-r="{look.radius}px"
          style:font-family={look.font}
        >
          <div class="yt-top"><span class="yt-logo"></span><span class="yt-search">Search</span><span class="yt-av"></span></div>
          <div class="yt-chips"><span class="on">All</span><span>Music</span><span>Podcasts</span><span>Live</span></div>
          <div class="yt-grid">
            {#each ['How rivers carve canyons', 'Ten-minute focus timer', 'Building a tiny cabin'] as t (t)}
              <div>
                <div class="yt-th"></div>
                <div class="yt-t">{t}</div>
                <div class="yt-m">2.1M views · 3 days ago</div>
              </div>
            {/each}
          </div>
        </div>
        <ThemePicker withOff selected={flags.theme ? preset : 'off'} onpick={pickTheme} />
        <p class="note">Change it any time from the theme button at the top of this popup.</p>
      {:else}
        <div class="list">
          {#each EXTRAS as f (f.id)}
            <label class="row row-line tall">
              <span class="ftext">
                <span class="fname">{f.name}</span>
                <span class="fdesc">{f.desc}</span>
              </span>
              <input class="sw" type="checkbox" role="switch" checked={!!flags[f.id]} onchange={() => toggle(f.id)} />
            </label>
          {/each}
        </div>
        <button class="txtbtn all" onclick={allFeatures}>
          See all {ALL_FEATURES.length} features
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
        </button>
      {/if}
    {/if}
  </div>

  <footer class="foot">
    {#if step === 0}
      <button class="txtbtn" onclick={finish}>Skip setup</button>
    {:else}
      <button class="txtbtn" onclick={() => step--}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
        Back
      </button>
    {/if}
    {#if step < STEPS.length - 1}
      <button class="pill" onclick={() => step++}>
        Next
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
      </button>
    {:else}
      <button class="pill" onclick={finish}>
        {onYouTube && !inTab ? 'Finish setup' : 'Finish and open YouTube'}
      </button>
    {/if}
  </footer>
</div>

<style>
  .hello {
    padding: 18px 20px 14px;
    flex-shrink: 0;
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .progress {
    display: flex;
    gap: 4px;
    margin-top: 14px;
  }
  .progress span {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: var(--s3);
    transition: background-color 0.2s ease;
  }
  .progress span.done {
    background: var(--text);
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
  .all {
    margin-top: 8px;
  }
  .note {
    margin: 10px 4px 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }

  /* Theme preview: a scaled-down YouTube Home. */
  .yt {
    margin-bottom: 10px;
    padding: 10px 12px 12px;
    border-radius: 16px;
    background: var(--yt-bg);
    color: var(--yt-text);
    box-shadow: inset 0 0 0 1px var(--yt-line);
    transition: background-color 0.2s ease, color 0.2s ease;
  }
  .yt-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .yt-logo {
    width: 20px;
    height: 14px;
    border-radius: 4px;
    background: #ff0033;
  }
  .yt-search {
    flex-grow: 1;
    margin: 0 16px;
    padding: 0 10px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--yt-line);
    font-size: 10px;
    line-height: 20px;
    color: var(--yt-muted);
  }
  .yt-av {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--yt-add);
  }
  .yt-chips {
    display: flex;
    gap: 6px;
    margin: 10px 0;
  }
  .yt-chips span {
    padding: 0 8px;
    border-radius: min(8px, var(--yt-r));
    background: var(--yt-add);
    font-size: 10px;
    line-height: 20px;
    font-weight: 500;
  }
  .yt-chips .on {
    background: var(--yt-text);
    color: var(--yt-bg);
  }
  .yt-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .yt-th {
    aspect-ratio: 16 / 9;
    border-radius: var(--yt-r);
    background: var(--yt-add);
  }
  .yt-t {
    margin-top: 6px;
    font-size: 10px;
    line-height: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yt-m {
    margin-top: 2px;
    font-size: 9px;
    line-height: 12px;
    color: var(--yt-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
