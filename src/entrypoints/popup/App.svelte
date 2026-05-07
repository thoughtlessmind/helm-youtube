<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getFlags,
    setFlag,
    getConfig,
    setConfig,
    type FeatureFlags,
    type FeatureConfig,
  } from '../../lib/settings';

  const features: { id: keyof FeatureFlags; label: string; desc: string }[] = [
    {
      id: 'hide-shorts',
      label: 'Hide Shorts',
      desc: 'Removes Shorts from feed, sidebar, search, and channel pages.',
    },
    {
      id: 'hide-end-screen-cards',
      label: 'Hide end-screen cards',
      desc: 'Removes the suggested-video overlay from the last 20s of videos.',
    },
    {
      id: 'auto-dismiss-still-watching',
      label: 'Auto-dismiss "Still watching?"',
      desc: 'Auto-confirms YouTube\'s periodic playback-paused prompt.',
    },
    {
      id: 'default-playback-speed',
      label: 'Default playback speed',
      desc: 'Force every video to start at your preferred speed.',
    },
    {
      id: 'disable-autoplay',
      label: 'Disable autoplay',
      desc: 'Turns off the autoplay toggle on every watch page.',
    },
    {
      id: 'hide-watch-page-sidebar',
      label: 'Hide watch-page sidebar',
      desc: 'Removes the right-rail recommendations while watching a video.',
    },
    {
      id: 'true-black-dark-mode',
      label: 'True black dark mode',
      desc: 'Replaces YouTube\'s dark grey backgrounds with #000 for OLED.',
    },
    {
      id: 'persistent-volume',
      label: 'Persistent volume',
      desc: 'Restore your last volume on every video.',
    },
    {
      id: 'copy-timestamped-link',
      label: 'Copy timestamped link (Y)',
      desc: 'Press Y on a video to copy a link to the current playback position.',
    },
    {
      id: 'screenshot-current-frame',
      label: 'Screenshot frame (S)',
      desc: 'Press S to download a PNG of the current frame, no overlay.',
    },
    {
      id: 'hide-up-next-panel',
      label: 'Hide "Up next" panel',
      desc: 'Removes the in-player autoplay countdown overlay.',
    },
    {
      id: 'volume-boost',
      label: 'Volume boost',
      desc: 'Push audio above 100% via Web Audio API gain.',
    },
    {
      id: 'hide-comments-by-default',
      label: 'Hide comments',
      desc: 'Hide the comments section on watch pages.',
    },
    {
      id: 'hide-metadata',
      label: 'Hide view counts & dates',
      desc: 'Reduce clickbait pull by hiding view counts and upload dates on thumbnails.',
    },
    {
      id: 'loop-section',
      label: 'Loop section ([ ] \\)',
      desc: 'Press [ to set A, ] to set B, \\ to clear. Video loops between A→B.',
    },
    {
      id: 'customize-grid',
      label: 'Customize grid',
      desc: 'Pack more videos per row on the homepage and hide card info for a denser feed.',
    },
  ];

  const GRID_COLUMNS = [3, 4, 5, 6, 7, 8];

  const BOOST_LEVELS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  let boost = $state<FeatureConfig['volume-boost']>({ multiplier: 1.5 });
  let grid = $state<FeatureConfig['customize-grid']>({ columnsPerRow: 3, hideCardInfo: false });

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

  let flags = $state<FeatureFlags>({});
  let speed = $state<FeatureConfig['default-playback-speed']>({ rate: 1 });

  onMount(async () => {
    flags = await getFlags();
    speed = await getConfig('default-playback-speed');
    boost = await getConfig('volume-boost');
    grid = await getConfig('customize-grid');
  });

  async function changeGridColumns(columnsPerRow: number) {
    grid = { ...grid, columnsPerRow };
    await setConfig('customize-grid', grid);
  }

  async function toggleGridHideInfo() {
    grid = { ...grid, hideCardInfo: !grid.hideCardInfo };
    await setConfig('customize-grid', grid);
  }

  async function changeBoost(multiplier: number) {
    boost = { multiplier };
    await setConfig('volume-boost', { multiplier });
  }

  async function toggle(id: keyof FeatureFlags) {
    const next = !flags[id];
    flags = { ...flags, [id]: next };
    await setFlag(id, next);
  }

  async function changeSpeed(rate: number) {
    speed = { rate };
    await setConfig('default-playback-speed', { rate });
  }
</script>

<main class="w-80 p-4">
  <header class="mb-3">
    <h1 class="text-base font-semibold m-0">YouTube Pro</h1>
  </header>

  <ul class="flex flex-col gap-2 list-none p-0 m-0">
    {#each features as f (f.id)}
      <li>
        <label
          class="flex gap-3 items-start p-3 rounded-lg cursor-pointer bg-yt-surface hover:bg-yt-surface-hover transition-colors"
        >
          <input
            type="checkbox"
            checked={!!flags[f.id]}
            onchange={() => toggle(f.id)}
            class="mt-0.5 accent-yt-red"
          />
          <span class="flex flex-col gap-0.5 flex-1">
            <strong class="font-medium">{f.label}</strong>
            <small class="text-xs text-yt-text-muted">{f.desc}</small>

            {#if f.id === 'default-playback-speed' && flags['default-playback-speed']}
              <select
                value={speed.rate}
                onchange={(e) => changeSpeed(Number((e.currentTarget as HTMLSelectElement).value))}
                onclick={(e) => e.preventDefault()}
                class="mt-2 w-24 bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
              >
                {#each SPEEDS as s (s)}
                  <option value={s}>{s}×</option>
                {/each}
              </select>
            {/if}

            {#if f.id === 'customize-grid' && flags['customize-grid']}
              <div class="mt-2 flex flex-col gap-2">
                <label class="flex items-center gap-2 text-xs">
                  <span class="text-yt-text-muted">Columns:</span>
                  <select
                    value={grid.columnsPerRow}
                    onchange={(e) => changeGridColumns(Number((e.currentTarget as HTMLSelectElement).value))}
                    onclick={(e) => e.stopPropagation()}
                    class="bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
                  >
                    {#each GRID_COLUMNS as c (c)}
                      <option value={c}>{c}</option>
                    {/each}
                  </select>
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={grid.hideCardInfo}
                    onchange={toggleGridHideInfo}
                    onclick={(e) => e.stopPropagation()}
                    class="accent-yt-red"
                  />
                  <span>Hide card info (title, channel, views)</span>
                </label>
              </div>
            {/if}

            {#if f.id === 'volume-boost' && flags['volume-boost']}
              <select
                value={boost.multiplier}
                onchange={(e) => changeBoost(Number((e.currentTarget as HTMLSelectElement).value))}
                onclick={(e) => e.preventDefault()}
                class="mt-2 w-24 bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
              >
                {#each BOOST_LEVELS as b (b)}
                  <option value={b}>{Math.round(b * 100)}%</option>
                {/each}
              </select>
            {/if}
          </span>
        </label>
      </li>
    {/each}
  </ul>
</main>
