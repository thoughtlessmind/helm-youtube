<script lang="ts">
  import { onMount } from 'svelte';
  import { getFlags, setFlag, type FeatureFlags } from '../../lib/settings';

  const features: { id: keyof FeatureFlags; label: string; desc: string }[] = [
    {
      id: 'hide-shorts',
      label: 'Hide Shorts',
      desc: 'Removes Shorts from feed, sidebar, search, and channel pages.',
    },
  ];

  let flags = $state<FeatureFlags>({});

  onMount(async () => {
    flags = await getFlags();
  });

  async function toggle(id: keyof FeatureFlags) {
    const next = !flags[id];
    flags = { ...flags, [id]: next };
    await setFlag(id, next);
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
          <span class="flex flex-col gap-0.5">
            <strong class="font-medium">{f.label}</strong>
            <small class="text-xs text-yt-text-muted">{f.desc}</small>
          </span>
        </label>
      </li>
    {/each}
  </ul>
</main>
