<script lang="ts">
  import { themeById } from '../../features/theme/themes';
  import { getConfig, setConfig, setFlag } from '../../lib/settings';
  import ThemePicker from './ThemePicker.svelte';

  /** The `theme` flag and its preset, as Main loaded them; picking writes both back. */
  let { on = $bindable(), preset = $bindable() }: { on: boolean | undefined; preset: string } = $props();

  let dialog = $state<HTMLDialogElement>();
  let open = $state(false);
  const theme = $derived(themeById(preset));
  const fills = $derived([theme.light?.bg, theme.dark?.bg].filter((c) => c !== undefined));

  /** Same writes as Settings: Off turns the flag off; a theme stores the preset, then turns the flag on. */
  async function pick(id: string) {
    const turnOn = id !== 'off';
    on = turnOn;
    if (turnOn) {
      preset = id;
      await setConfig('theme', { ...(await getConfig('theme')), preset: id });
    }
    await setFlag('theme', turnOn);
  }
</script>

<button
  class="chip"
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label="YouTube theme: {on ? theme.name : 'Off'}. Change theme"
  title="YouTube theme"
  onclick={() => {
    dialog?.showModal();
    open = true;
  }}
>
  <svg viewBox="0 0 16 16" aria-hidden="true">
    {#if on}
      {#if fills.length === 2}
        <path d="M13.657 2.343A8 8 0 0 0 2.343 13.657Z" fill={fills[0]}></path>
        <path d="M13.657 2.343A8 8 0 0 1 2.343 13.657Z" fill={fills[1]}></path>
      {:else}
        <circle cx="8" cy="8" r="8" fill={fills[0]}></circle>
      {/if}
      <circle class="ring" cx="8" cy="8" r="7.5"></circle>
    {:else}
      <g class="none"><circle cx="8" cy="8" r="6.6"></circle><path d="M3.4 12.6L12.6 3.4"></path></g>
    {/if}
  </svg>
  {on ? theme.name : 'Theme'}
</button>

<!-- Modal: the top layer covers the popup; Esc and a scrim click close it, focus returns to the chip. -->
<dialog bind:this={dialog} class="sheet" closedby="any" aria-labelledby="theme-sheet-title" onclose={() => (open = false)}>
  <div class="sheet-head">
    <h2 id="theme-sheet-title">YouTube theme</h2>
    <button class="ib sm quiet" aria-label="Close" title="Close" onclick={() => dialog?.close()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>
    </button>
  </div>
  <p>Recolors YouTube: palette, font and corners. Off keeps YouTube’s own look.</p>
  <ThemePicker withOff selected={on ? theme.id : 'off'} onpick={pick} />
</dialog>

<style>
  .chip {
    height: 32px;
    padding: 0 12px 0 8px;
    border-radius: 999px;
    background: var(--s1);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    transition: background-color 0.15s ease;
  }
  .chip:hover {
    background: var(--s2);
  }
  .chip svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .ring {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.28;
  }
  .none {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.4;
  }

  .sheet {
    width: 100%;
    max-width: none;
    margin: auto 0 0;
    padding: 4px 16px 16px;
    border: 0;
    border-radius: 20px 20px 0 0;
    background: var(--sheet);
    color: var(--text);
  }
  .sheet[open] {
    animation: rise 0.2s ease-out;
  }
  .sheet::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  .sheet-head {
    display: flex;
    align-items: center;
    height: 44px;
  }
  .sheet-head h2 {
    margin: 0 auto 0 0;
    font-size: 16px;
    line-height: 22px;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .quiet {
    margin-right: -6px;
    color: var(--muted);
  }
  .sheet p {
    margin: 0 0 12px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
</style>
