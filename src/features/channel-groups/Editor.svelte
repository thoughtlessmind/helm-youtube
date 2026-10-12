<svelte:options css="injected" />

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { initials } from '../../lib/format';
  import type { Group } from './store.svelte';

  interface Props {
    title: string;
    submitLabel: string;
    group: Group | null;
    /** [id, name] of every channel the picker offers, sorted by name. */
    channels: [string, string][];
    onSave: (name: string, channels: Record<string, string>) => void;
    onCancel: () => void;
    /** Inside Manage groups: show a Back arrow; Esc goes back instead of closing. */
    onBack?: () => void;
  }
  let { title, submitLabel, group, channels, onSave, onCancel, onBack }: Props = $props();

  const uid = Math.random().toString(36).slice(2);
  // Edits a copy of the group as it was on open; nothing is saved until Create / Save.
  const initial = untrack(() => group);
  let name = $state(initial?.name ?? '');
  let picked = $state<Record<string, string>>({ ...(initial?.channels ?? {}) });
  let q = $state('');
  let nameInput: HTMLInputElement;

  const all = $derived.by(() => {
    const map = new Map(channels);
    for (const [id, n] of Object.entries(group?.channels ?? {})) if (!map.has(id)) map.set(id, n);
    return [...map].sort(([, a], [, b]) => a.localeCompare(b));
  });
  const shown = $derived(all.filter(([id, n]) => `${n} ${id}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = $derived(Object.keys(picked).length);
  const canSave = $derived(!!name.trim() && count > 0);

  onMount(() => nameInput.focus());

  function toggle(id: string, n: string, on: boolean) {
    if (on) picked[id] = n;
    else delete picked[id];
  }

  function submit() {
    if (canSave) onSave(name.trim(), { ...picked });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && onBack) {
      e.preventDefault(); // keeps the <dialog> open
      onBack();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" class:in-manage={!!onBack} onkeydown={onKeydown}>
  {#if onBack}
    <div class="back-head">
      <button class="ytp-btn is-text is-icon" type="button" aria-label="Back to all groups" onclick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"></path><path d="M11 6l-6 6 6 6"></path></svg>
      </button>
      <h2 id="ed-title-{uid}">{title}</h2>
    </div>
  {:else}
    <h2 id="ed-title-{uid}">{title}</h2>
  {/if}

  <label class="name">
    <span class="lbl">Name</span>
    <input
      bind:this={nameInput}
      bind:value={name}
      class="ytp-input is-underline"
      type="text"
      maxlength="40"
      placeholder="e.g. Learning"
      onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
    />
  </label>

  <div class="channels" role="group" aria-labelledby="ed-ch-{uid}">
    <div class="chead">
      <span id="ed-ch-{uid}" class="lbl">Channels</span>
      <span class="small" aria-live="polite">{count ? `${count} selected` : ''}</span>
    </div>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
      <input class="ytp-input" type="text" placeholder="Search channels" aria-label="Search channels" bind:value={q} />
    </div>
    <div class="clist">
      {#each shown as [id, n] (id)}
        <label class="crow">
          <input type="checkbox" checked={id in picked} onchange={(e) => toggle(id, n, e.currentTarget.checked)} />
          <span class="av" aria-hidden="true">{initials(n)}</span>
          <span class="txt">
            <span class="cn">{n}</span>
            {#if id.startsWith('@') && id !== n}<span class="small">{id}</span>{/if}
          </span>
        </label>
      {:else}
        <p class="none">{q.trim() ? `No channels match “${q.trim()}”` : 'No channels yet'}</p>
      {/each}
    </div>
  </div>

  <footer>
    <span class="hint small">{canSave ? '' : 'Add a name and at least one channel'}</span>
    <button class="ytp-btn is-text" type="button" onclick={onCancel}>Cancel</button>
    <button class="ytp-btn is-cta" type="button" disabled={!canSave} onclick={submit}>{submitLabel}</button>
  </footer>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 20px; min-height: 0; }
  .editor.in-manage { flex: 1 1 auto; }
  .back-head { display: flex; align-items: center; gap: 4px; margin: -6px 0 -6px -10px; }
  .lbl { font-size: 14px; color: var(--yt-sys-color-baseline--text-secondary); }
  .small { font-size: 12px; line-height: 16px; color: var(--yt-sys-color-baseline--text-secondary); }
  .name { display: flex; flex-direction: column; gap: 2px; }
  .name input { font-size: 16px; }
  .channels { display: flex; flex-direction: column; gap: 9px; min-height: 0; }
  .in-manage .channels { flex: 1 1 auto; }
  .chead { display: flex; align-items: baseline; justify-content: space-between; }
  .search { position: relative; }
  .search svg { position: absolute; left: 11px; top: 9px; width: 18px; height: 18px; color: var(--yt-sys-color-baseline--text-secondary); pointer-events: none; }
  .search input { padding-left: 36px; }
  .clist { height: 269px; overflow-y: auto; margin: 0 -9px; scrollbar-width: thin; }
  .in-manage .clist { height: auto; flex: 1 1 auto; min-height: 0; }
  .crow { display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 9px; border-radius: 8px; cursor: pointer; transition: background-color .1s; }
  .crow:hover { background: var(--yt-sys-color-baseline--additive-background); }
  .crow input { width: 20px; height: 20px; margin: 0; flex: none; accent-color: var(--yt-sys-color-baseline--call-to-action); cursor: pointer; }
  /* Native unchecked boxes follow YouTube's theme, not the OS one. */
  :global(:host-context(html[dark])) .crow input { color-scheme: dark; }
  .av { width: 36px; height: 36px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
    background: var(--yt-sys-color-baseline--additive-background); font-size: 13px; font-weight: 500; }
  .txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cn { font-size: 16px; line-height: 21px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { margin: 0; padding: 16px 9px; font-size: 14px; color: var(--yt-sys-color-baseline--text-secondary); }
  footer { display: flex; align-items: center; gap: 8px; }
  .hint { flex: 1 1 auto; }
</style>
