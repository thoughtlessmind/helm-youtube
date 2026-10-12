<svelte:options css="injected" />

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Editor from './Editor.svelte';
  import {
    FAV,
    channelCount,
    createGroup,
    initials,
    isDuplicateName,
    saveGroups,
    store,
    updateGroup,
    type Group,
  } from './store.svelte';

  interface Props {
    /** [id, name] of every channel the picker offers. */
    channels: [string, string][];
    onClose: () => void;
  }
  let { channels, onClose }: Props = $props();

  let root: HTMLDivElement;
  let picking = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let draft = $state('');
  let adding = $state(false);
  let newName = $state('');
  let pending = $state<{ g: Group; i: number } | null>(null);
  let announce = $state('');
  let dragId = $state<string | null>(null);
  let over = $state<{ id: string; after: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let skipBlur = false;

  const groups = $derived(store.groups);
  const pickGroup = $derived(groups.find((g) => g.id === picking) ?? null);
  const newDup = $derived(isDuplicateName(newName, null));

  onMount(() => focus('[data-grip]'));
  onDestroy(() => clearTimeout(toastTimer));

  async function focus(sel: string, select = false) {
    await tick();
    const el = root?.querySelector<HTMLElement>(sel);
    el?.focus();
    if (select && el instanceof HTMLInputElement) el.select();
  }

  const at = (id: string) => groups.findIndex((g) => g.id === id);

  function moveTo(id: string, to: number) {
    const list = [...groups];
    const from = at(id);
    if (from < 0 || to < 0 || to >= list.length || to === from) return false;
    const [g] = list.splice(from, 1);
    list.splice(to, 0, g);
    saveGroups(list);
    announce = `${g.name} moved to position ${to + 1} of ${list.length}`;
    return true;
  }

  function step(id: string, d: -1 | 1, focusSel: (to: number, len: number) => string) {
    const to = at(id) + d;
    if (moveTo(id, to)) focus(focusSel(to, groups.length));
  }

  function onGripKey(e: KeyboardEvent, id: string) {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    step(id, d, () => `[data-grip="${id}"]`);
  }

  // ── Drag ────────────────────────────────────────────────────────────────
  function onDragStart(e: DragEvent, id: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    dragId = id;
  }
  function onDragOver(e: DragEvent, id: string) {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    if (over?.id !== id || over.after !== after) over = { id, after };
  }
  function onDrop(e: DragEvent, id: string) {
    e.preventDefault();
    if (dragId && dragId !== id && over) {
      const from = at(dragId);
      let to = at(id) + (over.after ? 1 : 0);
      if (from < to) to -= 1;
      moveTo(dragId, to);
    }
    dragId = null;
    over = null;
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  function startRename(g: Group) {
    adding = false;
    renaming = g.id;
    draft = g.name;
    skipBlur = false;
    focus(`[data-rn="${g.id}"]`, true);
  }
  function saveRename(refocus: boolean) {
    const id = renaming;
    if (!id) return;
    const name = draft.trim();
    if (name && !isDuplicateName(name, id)) updateGroup(id, { name });
    renaming = null;
    if (refocus) {
      skipBlur = true;
      focus(`[data-rename="${id}"]`);
    }
  }
  function onRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isDuplicateName(draft, renaming)) saveRename(true);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // keep the dialog open
      const id = renaming;
      skipBlur = true;
      renaming = null;
      focus(`[data-rename="${id}"]`);
    }
  }
  function onRenameBlur() {
    if (skipBlur) skipBlur = false;
    else saveRename(false);
  }

  // ── New group ───────────────────────────────────────────────────────────
  function startAdd() {
    renaming = null;
    adding = true;
    newName = '';
    focus('[data-new]');
  }
  function create() {
    const name = newName.trim();
    if (!name || newDup) return;
    const id = createGroup(name);
    adding = false;
    newName = '';
    announce = `Created “${name}”. Add channels next.`;
    focus(`[data-edit="${id}"]`);
  }
  function onNewKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      adding = false;
      newName = '';
      focus('[data-newrow]');
    }
  }

  // ── Delete + Undo ───────────────────────────────────────────────────────
  function del(g: Group) {
    if (g.id === FAV) return;
    const i = at(g.id);
    const rest = groups.filter((x) => x.id !== g.id);
    saveGroups(rest);
    if (renaming === g.id) renaming = null;
    pending = { g, i };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (pending = null), 6000);
    const next = rest[i] ?? rest[i - 1];
    focus(next ? `[data-grip="${next.id}"]` : '[data-newrow]');
  }
  function undo() {
    const p = pending;
    if (!p) return;
    clearTimeout(toastTimer);
    const list = [...groups];
    list.splice(Math.min(p.i, list.length), 0, p.g);
    saveGroups(list);
    pending = null;
    announce = `Restored “${p.g.name}”`;
    focus(`[data-del="${p.g.id}"]`);
  }

  // ── Edit channels ───────────────────────────────────────────────────────
  function closePicker() {
    const id = picking;
    picking = null;
    focus(`[data-edit="${id}"]`);
  }

  function onKeydown(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement).tagName === 'INPUT';
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && pending && !typing) {
      e.preventDefault();
      undo();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="manage" bind:this={root} onkeydown={onKeydown}>
  {#if pickGroup}
    <Editor
      title="Edit group"
      submitLabel="Save"
      group={pickGroup}
      {channels}
      onBack={closePicker}
      onCancel={closePicker}
      onSave={(name, chs) => {
        updateGroup(pickGroup.id, { name, channels: chs });
        closePicker();
      }}
    />
  {:else}
    <div class="intro">
      <h2 id="mg-title">Manage groups</h2>
      <p id="mg-sub">Drag to reorder. The group switcher follows this order.</p>
    </div>
    <ol class="list" aria-labelledby="mg-title">
      {#each groups as g, i (g.id)}
        {@const n = channelCount(g)}
        {@const rn = renaming === g.id}
        {@const dup = rn && isDuplicateName(draft, g.id)}
        <li
          class="row"
          class:dragging={dragId === g.id}
          draggable={!rn}
          ondragstart={(e) => onDragStart(e, g.id)}
          ondragover={(e) => onDragOver(e, g.id)}
          ondrop={(e) => onDrop(e, g.id)}
          ondragend={() => ((dragId = null), (over = null))}
        >
          {#if dragId && dragId !== g.id && over?.id === g.id}
            <span class="drop" class:after={over.after} aria-hidden="true"></span>
          {/if}
          <button
            class="grip"
            type="button"
            data-grip={g.id}
            aria-label="Reorder {g.name}, position {i + 1} of {groups.length}. Drag, or press up and down arrow keys."
            title="Drag to reorder, or use arrow keys"
            onkeydown={(e) => onGripKey(e, g.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6" fill="currentColor"></circle><circle cx="15" cy="6" r="1.6" fill="currentColor"></circle><circle cx="9" cy="12" r="1.6" fill="currentColor"></circle><circle cx="15" cy="12" r="1.6" fill="currentColor"></circle><circle cx="9" cy="18" r="1.6" fill="currentColor"></circle><circle cx="15" cy="18" r="1.6" fill="currentColor"></circle></svg>
          </button>
          <div class="body">
            {#if rn}
              <input
                class="gin ytp-input is-underline"
                data-rn={g.id}
                type="text"
                maxlength="40"
                aria-label="Group name"
                aria-invalid={dup}
                aria-describedby="mg-meta-{i}"
                bind:value={draft}
                onkeydown={onRenameKey}
                onblur={onRenameBlur}
              />
            {:else}
              <span class="gname">
                {#if g.id === FAV}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 16.95 6.62 19.8l1.03-6L3.3 9.6l6-.9z" fill="currentColor"></path></svg>
                {/if}
                <span class="ellip">{g.name}</span>
              </span>
            {/if}
            <span id="mg-meta-{i}" class="meta" class:err={dup}>
              {#if !dup && n}
                <span class="avs" aria-hidden="true">
                  {#each Object.values(g.channels).slice(0, 3) as cn}<span class="av">{initials(cn)}</span>{/each}
                </span>
              {/if}
              {dup ? 'Another group already has this name' : n ? `${n} ${n === 1 ? 'channel' : 'channels'}` : 'No channels yet'}
            </span>
          </div>
          <div class="acts">
            <button class="ytp-btn is-text is-icon is-sm dim mv" type="button" data-up={g.id} aria-label="Move {g.name} up" title="Move up" disabled={i === 0}
              onclick={() => step(g.id, -1, (to) => `[data-${to === 0 ? 'down' : 'up'}="${g.id}"]`)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>
            </button>
            <button class="ytp-btn is-text is-icon is-sm dim mv" type="button" data-down={g.id} aria-label="Move {g.name} down" title="Move down" disabled={i === groups.length - 1}
              onclick={() => step(g.id, 1, (to, len) => `[data-${to === len - 1 ? 'up' : 'down'}="${g.id}"]`)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
            </button>
            <button class="ytp-btn is-text is-icon dim" type="button" data-rename={g.id} aria-label="Rename {g.name}" title="Rename" onclick={() => startRename(g)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"></path><path d="M14 7l3 3"></path></svg>
            </button>
            <button class="ytp-btn is-text is-icon dim" type="button" data-edit={g.id} aria-label="Edit channels in {g.name}" title="Edit channels"
              onclick={() => ((renaming = null), (adding = false), (picking = g.id))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7"></path><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5"></path></svg>
            </button>
            <button
              class="ytp-btn is-text is-icon dim"
              type="button"
              data-del={g.id}
              aria-label={g.id === FAV ? `${g.name} can’t be deleted` : `Delete ${g.name}`}
              aria-disabled={g.id === FAV}
              title={g.id === FAV ? `${g.name} can’t be deleted` : `Delete ${g.name}`}
              onclick={() => del(g)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4.5h6V7"></path><path d="M6.5 7l1 13h9l1-13"></path><path d="M10 11v5.5M14 11v5.5"></path></svg>
            </button>
          </div>
        </li>
      {/each}
      {#if adding}
        <li class="row">
          <span class="plus" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>
          </span>
          <div class="body">
            <input
              class="gin ytp-input is-underline"
              data-new
              type="text"
              maxlength="40"
              placeholder="Group name"
              aria-label="New group name"
              aria-invalid={newDup}
              aria-describedby="mg-new-meta"
              bind:value={newName}
              onkeydown={onNewKey}
            />
            <span id="mg-new-meta" class="meta" class:err={newDup}>
              {newDup ? 'Another group already has this name' : 'Enter to create · Esc to cancel'}
            </span>
          </div>
          <button class="ytp-btn is-sm is-link" type="button" disabled={!newName.trim() || newDup} onclick={create}>Create</button>
        </li>
      {/if}
    </ol>
    <footer>
      <button class="ytp-btn is-text newrow" type="button" data-newrow onclick={startAdd}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        New group
      </button>
      <span class="spacer"></span>
      <button class="ytp-btn is-cta" type="button" onclick={onClose}>Done</button>
    </footer>
  {/if}

  <div class="sr" aria-live="polite">{announce}</div>
  <div class="toast-slot" role="status" aria-live="polite" aria-atomic="true">
    {#if pending}
      <div class="toast">
        <span>Deleted “{pending.g.name}”</span>
        <button class="undo" type="button" onclick={undo}>Undo</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .manage { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 20px; }
  .intro { display: flex; flex-direction: column; gap: 4px; }
  .intro p { margin: 0; font-size: 14px; line-height: 20px; color: var(--yt-sys-color-baseline--text-secondary); }
  .list { list-style: none; margin: -7px; padding: 0; flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  .row { position: relative; display: flex; align-items: center; gap: 9px; height: 63px; box-sizing: border-box; padding: 0 2px;
    border-radius: 8px; transition: background-color .1s, opacity .1s; }
  .row:hover { background: var(--yt-sys-color-baseline--additive-background); }
  .row.dragging { opacity: .35; }
  .drop { position: absolute; left: 9px; right: 9px; top: -1px; height: 2px; border-radius: 2px; background: var(--yt-sys-color-baseline--call-to-action); }
  .drop.after { top: auto; bottom: -1px; }
  .grip { width: 28px; height: 44px; flex: none; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0;
    border: 0; border-radius: 6px; background: none; color: var(--yt-sys-color-baseline--text-secondary); cursor: grab; }
  .grip:hover { color: var(--yt-sys-color-baseline--text-primary); }
  .grip:focus-visible { outline-offset: -2px; }
  .grip svg { width: 18px; height: 18px; }
  .plus { width: 28px; flex: none; display: flex; justify-content: center; color: var(--yt-sys-color-baseline--text-secondary); }
  .plus svg { width: 20px; height: 20px; }
  .body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .gname { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 16px; font-weight: 500; line-height: 25px; }
  .gname svg { width: 16px; height: 16px; flex: none; }
  .ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gin { height: 25px; padding: 0; font-size: 16px; font-weight: 500; }
  .gin[aria-invalid="true"] { border-color: var(--yt-sys-color-baseline--error-indicator); box-shadow: 0 1px 0 var(--yt-sys-color-baseline--error-indicator); }
  .meta { display: flex; align-items: center; gap: 7px; height: 22px; font-size: 12px; color: var(--yt-sys-color-baseline--text-secondary); }
  .meta.err { color: var(--yt-sys-color-baseline--error-indicator); }
  .avs { display: flex; padding-left: 4px; }
  .av { width: 22px; height: 22px; margin-left: -4px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px var(--yt-sys-color-baseline--raised-background); font-size: 9.5px; font-weight: 500;
    color: var(--yt-sys-color-baseline--text-primary); background: var(--yt-sys-color-baseline--badge-chip-background, var(--yt-sys-color-baseline--additive-background)); }
  .acts { display: flex; align-items: center; flex: none; }
  .dim { color: var(--yt-sys-color-baseline--text-secondary); }
  .dim:hover { color: var(--yt-sys-color-baseline--text-primary); }
  .dim[aria-disabled="true"] { color: var(--yt-sys-color-baseline--text-disabled); background: none; cursor: default; }
  .mv { opacity: 0; transition: opacity .1s, background-color .1s; }
  .row:hover .mv, .row:focus-within .mv { opacity: 1; }
  footer { display: flex; align-items: center; gap: 8px; }
  .newrow { margin-left: -10px; }
  .spacer { flex: 1 1 auto; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .toast-slot { position: absolute; left: 24px; bottom: 72px; z-index: 2; }
  .toast { display: flex; align-items: center; gap: 12px; min-height: 48px; box-sizing: border-box; padding: 0 9px 0 16px; border-radius: 8px;
    background: var(--yt-sys-color-baseline--inverted-background); color: var(--yt-sys-color-baseline--text-primary-inverse);
    font-size: 14px; white-space: nowrap; box-shadow: 0 4px 16px var(--yt-sys-color-baseline--shadow-medium, rgba(0,0,0,.4));
    animation: toast-in .18s ease-out; }
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }
  .undo { margin: 0; padding: 8px 10px; border: 0; border-radius: 18px; background: none; font: inherit; font-weight: 500; cursor: pointer;
    color: var(--yt-sys-color-baseline--call-to-action-inverse, #065fd4); }
  .undo:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } .row, .mv { transition: none; } }
</style>
