<svelte:options css="injected" />

<script lang="ts">
  import { onMount } from 'svelte';
  import { menuKeys, openPopover } from '../../lib/yt/ui';
  import { createGroup, label, memberKey, setMember, store } from './store.svelte';

  let { onManage }: { onManage: () => void } = $props();

  let panel: HTMLDivElement;
  let menu: HTMLDivElement;
  let newInput = $state<HTMLInputElement>();
  let creating = $state(false);
  let newName = $state('');
  let close = () => {};

  const ch = $derived(store.page);
  const chName = $derived(ch?.name || ch?.id || '');
  const member = $derived(ch ? store.groups.filter((g) => memberKey(g, ch)) : []);
  const pillText = $derived(member.length ? label(member[0]) : 'Group');
  const extra = $derived(member.length > 1 ? `+${member.length - 1}` : '');

  onMount(() => menuKeys(menu));

  function toggleOpen(e: Event) {
    creating = false;
    newName = '';
    close = openPopover(e.currentTarget as Element, panel, { side: store.onChannelPage ? 'below' : 'above', align: 'start' });
  }

  function onTriggerKey(e: KeyboardEvent) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !panel.matches(':popover-open')) {
      e.preventDefault();
      toggleOpen(e);
    }
  }

  function startCreate() {
    creating = true;
    newName = '';
    queueMicrotask(() => newInput?.focus());
  }

  function cancelCreate() {
    creating = false;
    newName = '';
    queueMicrotask(() => menu.querySelector<HTMLElement>('[data-newgroup]')?.focus());
  }

  function create() {
    const name = newName.trim();
    if (!name || !ch) return;
    // An existing name just adds the channel to that group.
    const hit = store.groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
    const id = hit?.id ?? createGroup(name);
    setMember(id, ch, true);
    cancelCreate();
  }

  function onNewKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    } else if (e.key === 'Escape') {
      e.preventDefault(); // keep the popover open, leave create mode
      e.stopPropagation();
      cancelCreate();
    }
  }
</script>

{#if ch}
  <button
    class="ytp-btn pill"
    class:large={store.onChannelPage}
    type="button"
    aria-haspopup="dialog"
    aria-expanded="false"
    aria-label={member.length
      ? `${pillText}${extra ? ` ${extra}` : ''}: channel groups for ${chName}`
      : `Group: add ${chName} to a channel group`}
    title="Add {chName} to a channel group"
    onclick={toggleOpen}
    onkeydown={onTriggerKey}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.7l2 2.2h8.3A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"></path><path d="M12 11.5v5M9.5 14h5"></path></svg>
    <span class="txt">{pillText}</span>
    {#if extra}<span class="extra">{extra}</span>{/if}
  </button>
{/if}

<div bind:this={panel} class="ytp-menu pop" popover="auto" role="dialog" aria-labelledby="gp-title">
  <div class="head">
    <h2 id="gp-title">Add {chName} to…</h2>
    <button class="ytp-btn is-text is-icon is-sm" type="button" aria-label="Close" onclick={() => close()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
    </button>
  </div>
  <div bind:this={menu} role="menu" aria-label="Channel groups">
    <div class="glist">
      {#each store.groups as g (g.id)}
        {@const on = !!ch && !!memberKey(g, ch)}
        <button class="ytp-menu-item" type="button" role="menuitemcheckbox" aria-checked={on} onclick={() => ch && setMember(g.id, ch, !on)}>
          {#if on}
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="currentColor"></rect><path class="tick" d="M7.5 12.3l3 3 6-6.3" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          {:else}
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.75"></rect></svg>
          {/if}
          <span class="gname">{label(g)}</span>
        </button>
      {/each}
    </div>
    <div class="ytp-menu-sep" role="separator"></div>
    {#if creating}
      <div class="create">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        <input
          bind:this={newInput}
          bind:value={newName}
          class="ytp-input is-underline"
          type="text"
          maxlength="40"
          placeholder="Group name"
          aria-label="New group name"
          onkeydown={onNewKey}
        />
        <button class="ytp-btn is-sm is-link" type="button" disabled={!newName.trim()} onclick={create}>Create</button>
      </div>
    {:else}
      <button class="ytp-menu-item" type="button" role="menuitem" data-newgroup onclick={startCreate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        New group
      </button>
    {/if}
    <button class="ytp-menu-item" type="button" role="menuitem" onclick={onManage}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle></svg>
      Manage groups
    </button>
  </div>
</div>

<style>
  .pill { max-width: 240px; }
  .pill.large { height: 40px; border-radius: 20px; }
  .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .extra { flex: none; margin-left: -2px; }
  .pop { width: 278px; box-sizing: border-box; }
  .head { display: flex; align-items: center; height: 40px; padding: 0 7px 4px 18px; }
  h2 { flex: 1; min-width: 0; margin: 0; font-size: 16px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .glist { max-height: 240px; overflow-y: auto; scrollbar-width: thin; }
  .gname { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tick { stroke: var(--yt-sys-color-baseline--menu-background); }
  .create { display: flex; align-items: center; gap: 11px; height: 45px; padding: 0 9px 0 16px; }
  .create > svg { width: 24px; height: 24px; flex: none; color: var(--yt-sys-color-baseline--text-secondary); }
  .create input { flex: 1; min-width: 0; padding: 4px 0; }
</style>
