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

<main>
  <header>
    <h1>YouTube Pro</h1>
  </header>

  <ul>
    {#each features as f (f.id)}
      <li>
        <label>
          <input
            type="checkbox"
            checked={!!flags[f.id]}
            onchange={() => toggle(f.id)}
          />
          <span class="label">
            <strong>{f.label}</strong>
            <small>{f.desc}</small>
          </span>
        </label>
      </li>
    {/each}
  </ul>
</main>

<style>
  :global(body) {
    margin: 0;
  }
  main {
    width: 320px;
    padding: 16px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #eee;
    background: #0f0f0f;
  }
  header {
    margin-bottom: 12px;
  }
  h1 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    background: #1f1f1f;
    border-radius: 8px;
    cursor: pointer;
  }
  label:hover {
    background: #272727;
  }
  input[type='checkbox'] {
    margin-top: 2px;
    accent-color: #ff0033;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  small {
    color: #aaa;
    font-size: 12px;
  }
</style>
