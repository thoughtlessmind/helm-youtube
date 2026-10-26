<script lang="ts">
  import { storage } from '#imports';
  import { onMount } from 'svelte';
  import { ALL_FEATURES, CATALOG, type CatalogEntry, type ConfigId } from '../../lib/feature-catalog';
  import { exportBackup, importBackup, isBackupData } from '../../lib/backup';
  import { saveFile } from '../../lib/download';
  import { sendToTab } from '../../lib/messages';
  import { KEY as GROUPS_KEY, withFavorites, type Group } from '../../features/channel-groups/store.svelte';
  import { themeById } from '../../features/theme/themes';
  import {
    FEATURE_CONFIG_DEFAULTS,
    extensionEnabled,
    getConfig,
    getFlags,
    setConfig,
    setFlag,
    type FeatureFlags,
  } from '../../lib/settings';
  import ThemePicker from './ThemePicker.svelte';
  import { fmtMin, focusTab, getLog, minutesOn, minutesOver, youtubeTabs, type Page, type WatchLog } from './lib';

  let { go, tab }: { go: (p: Page) => void; tab?: string } = $props();

  type Cfg = Record<string, unknown>;
  const CONFIG_IDS = Object.keys(FEATURE_CONFIG_DEFAULTS) as ConfigId[];
  const version = browser.runtime.getManifest().version;

  let flags = $state<FeatureFlags>({});
  let enabled = $state(true);
  let cfg = $state<Record<string, Cfg>>({});
  let log = $state<WatchLog>({});
  let groupsLine = $state('');
  let query = $state('');
  let backupStatus = $state('');
  let fileInput = $state<HTMLInputElement>();
  let ready = $state(false);
  /** Open tab. `#settings` = opened in a browser tab for Import, so start where Backup is. */
  let current = $state(
    CATALOG.find((s) => s.tab === tab)?.tab ?? (location.hash === '#settings' ? 'Tools' : CATALOG[0].tab),
  );

  async function load() {
    const [f, on, l, groups, ...configs] = await Promise.all([
      getFlags(),
      extensionEnabled.getValue(),
      getLog(),
      storage.getItem<Group[]>(GROUPS_KEY),
      ...CONFIG_IDS.map((id) => getConfig(id)),
    ]);
    flags = f;
    enabled = on;
    log = l;
    cfg = Object.fromEntries(CONFIG_IDS.map((id, i) => [id, configs[i] as Cfg]));
    const list = withFavorites(groups);
    const g = list.length;
    const c = new Set(list.flatMap((x) => Object.keys(x.channels))).size;
    groupsLine = `${g} group${g === 1 ? '' : 's'} · ${c} channel${c === 1 ? '' : 's'}`;
    ready = true;
  }

  onMount(() => {
    void load();
    return extensionEnabled.watch((on) => (enabled = on));
  });

  const q = $derived(query.trim().toLowerCase());
  /** A search runs across every section; otherwise the open tab's section. */
  const sections = $derived(
    CATALOG.map((s) => ({
      ...s,
      features: s.features.filter((f) => !q || `${f.name} ${f.desc} ${s.title}`.toLowerCase().includes(q)),
    })).filter((s) => (q ? s.features.length : s.tab === current)),
  );

  async function toggle(f: CatalogEntry) {
    const on = !flags[f.id];
    flags[f.id] = on;
    await setFlag(f.id, on);
  }

  const val = (f: CatalogEntry, key: string) => cfg[f.id]?.[key];

  async function setOpt(f: CatalogEntry, key: string, value: unknown) {
    const id = f.id as ConfigId;
    // Merge into what's stored now, not what loaded on open: the page writes some keys itself
    // (speed chip's rate, queue panel's collapsed state, channel-groups' youtubeChips).
    const next = { ...(await getConfig(id)), [key]: value };
    cfg[id] = next;
    await setConfig(id, next as never);
  }

  const minutes = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

  async function setEnabled(on: boolean) {
    enabled = on;
    await extensionEnabled.setValue(on);
  }

  /** D9: open the in-page Manage-groups dialog in a YouTube tab. */
  async function manageGroups() {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    const isYT = (u?: string) => !!u && /^https?:\/\/([a-z0-9-]+\.)*youtube\.com\//.test(u);
    const tab = isYT(active?.url) ? active : (await youtubeTabs())[0];
    if (tab?.id != null && (await sendToTab(tab.id, { type: 'open-manage-groups' })) !== undefined) {
      await focusTab(tab);
      return;
    }
    await browser.tabs.create({ url: 'https://www.youtube.com/#ytp-manage-groups' });
  }

  async function doExport() {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' });
    saveFile(blob, `helm-backup-${new Date().toISOString().slice(0, 10)}.json`);
    backupStatus = 'Settings exported.';
  }

  // The toolbar popup closes when a file picker opens, so Import runs from a tab.
  function startImport() {
    if (location.hash === '#settings') fileInput?.click();
    else void browser.tabs.create({ url: browser.runtime.getURL('/popup.html#settings') });
  }

  async function doImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isBackupData(parsed)) {
        backupStatus = 'That file is not a Helm backup.';
        return;
      }
      await importBackup(parsed);
      await load();
      backupStatus = 'Settings restored.';
    } catch {
      backupStatus = 'Could not read that file.';
    }
  }
</script>

<div class="page settings">
  <header class="top sub">
    <button class="ib" aria-label="Back to now playing" onclick={() => go('main')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
    <h1>Settings</h1>
    {#if ready}<label class="master">
      {enabled ? 'On' : 'Paused'}
      <input
        class="sw"
        type="checkbox"
        role="switch"
        aria-label="Helm enabled"
        checked={enabled}
        onchange={(e) => setEnabled(e.currentTarget.checked)}
      />
    </label>{/if}
  </header>

  <label class="search">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
    <input type="search" placeholder="Search {ALL_FEATURES.length} features" aria-label="Search settings" bind:value={query} />
  </label>
  {#if !q}
    <nav class="tabs" aria-label="Sections">
      {#each CATALOG as s (s.tab)}
        <button class="tab" aria-pressed={s.tab === current} onclick={() => (current = s.tab)}>{s.tab}</button>
      {/each}
    </nav>
  {/if}

  <div class="scroll body">
    {#if !enabled}
      <div class="paused">
        <span>Helm is paused. YouTube looks and works as normal.</span>
        <button class="pill" onclick={() => setEnabled(true)}>Resume</button>
      </div>
    {/if}
    {#if ready}
    <div class="groups" class:dim={!enabled}>
      {#each sections as s (s.title)}
        <section aria-label={s.title}>
          <div class="sechead">
            {#if q}
              <h2>{s.title}</h2>
            {:else}
              <span>{s.features.filter((f) => flags[f.id]).length} of {s.features.length} on</span>
              <span>Saved as you go</span>
            {/if}
          </div>
          <div class="list">
            {#each s.features as f (f.id)}
              {@const on = !!flags[f.id]}
              <div class="feat row-line">
                <label class="fhead">
                  <span class="ftext">
                    <span class="fname">{f.name}</span>
                    <span class="fdesc">{f.desc}</span>
                  </span>
                  <input class="sw" type="checkbox" role="switch" checked={on} onchange={() => toggle(f)} />
                </label>
                {#if on && f.controls}
                  <div class="opts">
                    {#each f.controls as c, ci (ci)}
                      {#if c.type === 'watch-stats'}
                        <div class="kv"><span class="muted">Today</span><strong>{fmtMin(minutesOn(log, new Date()))}</strong></div>
                        <div class="kv"><span class="muted">This week</span><strong>{fmtMin(minutesOver(log, 7))}</strong></div>
                      {:else if c.type === 'keywords'}
                        <label>
                          <span class="olab">{c.label}</span>
                          <input
                            class="input"
                            type="text"
                            placeholder={c.placeholder}
                            maxlength="2000"
                            value={String(val(f, c.key) ?? '')}
                            onchange={(e) => setOpt(f, c.key, e.currentTarget.value.trim())}
                          />
                        </label>
                      {:else if c.type === 'length'}
                        <div>
                          <span class="olab">{c.label}</span>
                          <span class="pair">
                            <input
                              class="input"
                              type="number"
                              min="0"
                              placeholder="Min"
                              aria-label="Minimum length in minutes"
                              value={Number(val(f, c.minKey)) || ''}
                              onchange={(e) => setOpt(f, c.minKey, minutes(e.currentTarget.value))}
                            />
                            <span class="muted">to</span>
                            <input
                              class="input"
                              type="number"
                              min="0"
                              placeholder="Max"
                              aria-label="Maximum length in minutes"
                              value={Number(val(f, c.maxKey)) || ''}
                              onchange={(e) => setOpt(f, c.maxKey, minutes(e.currentTarget.value))}
                            />
                          </span>
                        </div>
                      {:else if c.type === 'select'}
                        <div>
                          <span class="olab" id="{f.id}-{c.key}">{c.label}</span>
                          <div class="seg" role="group" aria-labelledby="{f.id}-{c.key}">
                            {#each c.options as o (o.value)}
                              <button aria-pressed={o.value === val(f, c.key)} onclick={() => setOpt(f, c.key, o.value)}>{o.label}</button>
                            {/each}
                          </div>
                        </div>
                      {:else if c.type === 'checks'}
                        {#each c.items as it (it.key)}
                          <label class="chk">
                            <input
                              type="checkbox"
                              checked={!!val(f, it.key)}
                              onchange={(e) => setOpt(f, it.key, e.currentTarget.checked)}
                            />
                            {it.label}
                          </label>
                        {/each}
                      {:else if c.type === 'chips'}
                        <div>
                          <span class="olab">{c.label}</span>
                          <div class="chips">
                            {#each c.items as it (it.key)}
                              {@const picked = !!val(f, it.key)}
                              <label class="chip" class:on={picked}>
                                <input
                                  class="sr-only"
                                  type="checkbox"
                                  checked={picked}
                                  onchange={(e) => setOpt(f, it.key, e.currentTarget.checked)}
                                />
                                {#if picked}
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>
                                {/if}
                                {it.label}
                              </label>
                            {/each}
                          </div>
                        </div>
                      {:else if c.type === 'themes'}
                        <ThemePicker
                          label={c.label}
                          selected={themeById(String(val(f, c.key))).id}
                          onpick={(id) => setOpt(f, c.key, id)}
                        />
                      {:else if c.type === 'manage-groups'}
                        <div class="kv">
                          <span class="muted">{groupsLine}</span>
                          <button class="pill ghost" onclick={manageGroups}>Manage groups</button>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}

      {#if !sections.length}
        <p class="nomatch">No settings match “{query}”.</p>
      {/if}
    </div>

    {#if !q && current === 'Tools'}
      <section aria-label="Backup">
        <div class="sechead"><h2>Backup</h2></div>
        <div class="card backup">
          <p>Settings, notes, queue and channel groups in one file.</p>
          <div class="row">
            <button class="pill ghost" onclick={doExport}>Export</button>
            <button class="pill ghost" onclick={startImport}>Import</button>
            <span class="version">Helm {version}</span>
            <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={doImport} />
          </div>
          {#if backupStatus}<p class="status" role="status">{backupStatus}</p>{/if}
        </div>
      </section>
    {/if}
    {/if}
  </div>
</div>

<style>
  .master {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 6px;
    font-size: 12px;
    color: var(--muted);
    cursor: pointer;
  }
  .search {
    margin: 2px 16px 4px;
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--s1);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--faint);
    flex-shrink: 0;
  }
  .search:focus-within {
    box-shadow: 0 0 0 2px var(--focus);
  }
  .search input {
    flex-grow: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: transparent;
    border: 0;
    outline: none;
  }
  .search input::placeholder {
    color: var(--faint);
  }
  .tabs {
    display: flex;
    gap: 18px;
    padding: 0 16px;
    border-bottom: 1px solid var(--rule);
    flex-shrink: 0;
    white-space: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    position: relative;
    height: 40px;
    flex-shrink: 0;
    color: var(--faint);
    font-size: 13px;
    font-weight: 500;
    transition: color 0.15s ease;
  }
  .tab:hover,
  .tab[aria-pressed='true'] {
    color: var(--text);
  }
  .tab[aria-pressed='true']::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: var(--text);
  }
  .body {
    padding: 0 12px 16px;
  }
  .body .sechead {
    padding-top: 12px;
  }
  .paused {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 12px 12px 12px 16px;
    border-radius: 16px;
    background: var(--s2);
    font-size: 13px;
    line-height: 18px;
  }
  .paused span {
    flex-grow: 1;
  }
  .groups.dim {
    opacity: 0.55;
  }

  .feat {
    padding: 14px 0;
  }
  .fhead {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
  }
  .ftext {
    flex-grow: 1;
    min-width: 0;
  }
  .fhead .sw {
    margin-top: 1px;
  }
  .opts {
    margin-top: 12px;
    padding: 12px;
    border-radius: 14px;
    background: var(--s2);
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;
  }
  .olab {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--bg);
  }
  .seg button {
    flex: 1;
    min-width: 0;
    height: 30px;
    border-radius: 999px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .seg button:hover {
    color: var(--text);
  }
  .seg button[aria-pressed='true'] {
    background: var(--ctl);
    color: var(--ctl-on);
    font-weight: 600;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 10px;
    line-height: 18px;
    cursor: pointer;
  }
  .chk input {
    appearance: none;
    width: 18px;
    height: 18px;
    margin: 0;
    flex-shrink: 0;
    display: grid;
    place-content: center;
    border-radius: 5px;
    border: 1.5px solid var(--faint);
    cursor: pointer;
  }
  .chk input:checked {
    background: var(--ctl);
    border-color: var(--ctl);
  }
  .chk input:checked::after {
    content: '';
    width: 5px;
    height: 9px;
    margin-top: -2px;
    border: solid var(--ctl-on);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--s3);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .chip.on {
    background: var(--s3);
    border-color: transparent;
    color: var(--text);
  }
  .chip:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .input {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--s3);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .input:focus-visible {
    border-color: var(--focus);
  }
  .input::placeholder {
    color: var(--faint);
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pair .input {
    width: 72px;
  }
  .kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
  }
  .kv strong {
    font-weight: 600;
  }
  .kv .pill.ghost {
    background: var(--s3);
  }

  .nomatch {
    margin: 0;
    padding: 28px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  .backup p {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--muted);
  }
  .backup .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .backup .pill.ghost {
    background: var(--s3);
  }
  .version {
    margin-left: auto;
    font-size: 12px;
    color: var(--faint);
  }
  .backup .status {
    margin-top: 10px;
    font-size: 12px;
  }
</style>
