<script lang="ts">
  import { storage } from '#imports';
  import { FIRST_RUN_KEY, type Page } from './lib';
  import Main from './Main.svelte';
  import Settings from './Settings.svelte';
  import Stats from './Stats.svelte';
  import FirstRun from './FirstRun.svelte';

  let page = $state<Page | null>(null);
  // `#settings` = opened in a tab (for Import: a file picker closes the toolbar popup).
  if (location.hash === '#settings') page = 'settings';
  else storage.getItem<boolean>(FIRST_RUN_KEY).then((seen) => (page = seen ? 'main' : 'firstrun'));

  const go = (p: Page) => (page = p);
</script>

{#if page === 'main'}
  <Main {go} />
{:else if page?.startsWith('settings')}
  <Settings {go} tab={page.split(':')[1]} />
{:else if page === 'stats'}
  <Stats {go} />
{:else if page === 'firstrun'}
  <FirstRun {go} />
{/if}
