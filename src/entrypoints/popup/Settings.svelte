<script lang="ts">
  import { storage } from '#imports';
  import { onMount } from 'svelte';
  import { CATALOG, type CatalogEntry, type ConfigId } from '../../lib/feature-catalog';
  import { exportBackup, importBackup, isBackupData } from '../../lib/backup';
  import { saveFile } from '../../lib/download';
  import { sendToTab } from '../../lib/messages';
  import { KEY as GROUPS_KEY, withFavorites, type Group } from '../../features/channel-groups/store.svelte';
  import { THEMES, themeById } from '../../features/theme/themes';
  import {
    FEATURE_CONFIG_DEFAULTS,
    extensionEnabled,
    getConfig,
    getFlags,
    setConfig,
    setFlag,
    type FeatureFlags,
  } from '../../lib/settings';
  import { fmtMin, focusTab, getLog, minutesOn, minutesOver, youtubeTabs, type Page, type WatchLog } from './lib';

  let { go }: { go: (p: Page) => void } = $props();

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
  const sections = $derived(
    CATALOG.map((s) => ({
      title: s.title,
      features: s.features.filter((f) => !q || `${f.name} ${f.desc} ${s.title}`.toLowerCase().includes(q)),
    })).filter((s) => s.features.length),
  );

  async function toggle(f: CatalogEntry) {
    const on = !flags[f.id];
    flags[f.id] = on;
    await setFlag(f.id, on);
  }

  const val = (f: CatalogEntry, key: string) => cfg[f.id]?.[key];

  function setOpt(f: CatalogEntry, key: string, value: unknown) {
    const id = f.id as ConfigId;
    const next = { ...$state.snapshot(cfg[id]), [key]: value };
    cfg[id] = next;
    void setConfig(id, next as never);
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
  <header class="subhead">
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

  <div class="search-wrap">
    <label class="search">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
      <input type="search" placeholder="Search settings" aria-label="Search settings" bind:value={query} />
    </label>
  </div>

  <div class="scroll body">
    {#if !enabled}
      <div class="paused">
        <span>Helm is paused. YouTube looks and works as normal.</span>
        <button class="btn-sm primary-sm" onclick={() => setEnabled(true)}>Resume</button>
      </div>
    {/if}
    {#if ready}
    <div class="groups" class:dim={!enabled}>
      {#each sections as s (s.title)}
        <section aria-label={s.title}>
          <h2 class="label sec">{s.title}</h2>
          <div class="card">
            {#each s.features as f (f.id)}
              {@const on = !!flags[f.id]}
              <div class="feat">
                <label class="feat-head">
                  <span class="tile" class:on aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={f.icon}></path></svg>
                  </span>
                  <span class="feat-text">
                    <span class="name">{f.name}</span>
                    <span class="desc">{f.desc}</span>
                  </span>
                  <input class="sw" type="checkbox" role="switch" checked={on} onchange={() => toggle(f)} />
                </label>
                {#if on && f.controls}
                  <div class="opts">
                    {#each f.controls as c, ci (ci)}
                      {#if c.type === 'watch-stats'}
                        <div class="field"><span class="muted">Today</span><strong>{fmtMin(minutesOn(log, new Date()))}</strong></div>
                        <div class="field"><span class="muted">This week</span><strong>{fmtMin(minutesOver(log, 7))}</strong></div>
                      {:else if c.type === 'keywords'}
                        <label class="field">
                          <span>{c.label}</span>
                          <input
                            type="text"
                            placeholder={c.placeholder}
                            value={String(val(f, c.key) ?? '')}
                            onchange={(e) => setOpt(f, c.key, e.currentTarget.value.trim())}
                            style:width="160px"
                          />
                        </label>
                      {:else if c.type === 'length'}
                        <div class="field">
                          <span>{c.label}</span>
                          <span class="pair">
                            <input
                              type="number"
                              min="0"
                              placeholder="Min"
                              aria-label="Minimum length in minutes"
                              value={Number(val(f, c.minKey)) || ''}
                              onchange={(e) => setOpt(f, c.minKey, minutes(e.currentTarget.value))}
                            />
                            <span class="muted">to</span>
                            <input
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
                        <label class="field">
                          <span>{c.label}</span>
                          <select onchange={(e) => setOpt(f, c.key, Number(e.currentTarget.value))}>
                            {#each c.options as o (o.value)}
                              <option value={o.value} selected={o.value === val(f, c.key)}>{o.label}</option>
                            {/each}
                          </select>
                        </label>
                      {:else if c.type === 'checks'}
                        {#each c.items as it (it.key)}
                          <label class="opt">
                            <input
                              type="checkbox"
                              checked={!!val(f, it.key)}
                              onchange={(e) => setOpt(f, it.key, e.currentTarget.checked)}
                            />
                            {it.label}
                          </label>
                        {/each}
                      {:else if c.type === 'chips'}
                        <span class="muted chips-label">{c.label}</span>
                        <div class="chips">
                          {#each c.items as it (it.key)}
                            <label class="chip" class:on={!!val(f, it.key)}>
                              <input
                                type="checkbox"
                                checked={!!val(f, it.key)}
                                onchange={(e) => setOpt(f, it.key, e.currentTarget.checked)}
                              />
                              {it.label}
                            </label>
                          {/each}
                        </div>
                      {:else if c.type === 'themes'}
                        <div class="themes" role="radiogroup" aria-label={c.label}>
                          {#each THEMES as t (t.id)}
                            <label class="theme">
                              <input
                                type="radio"
                                name="{f.id}-{c.key}"
                                checked={themeById(String(val(f, c.key))).id === t.id}
                                onchange={() => setOpt(f, c.key, t.id)}
                              />
                              <!-- Light pane fills the swatch; a dark pane is clipped over its lower-right half. -->
                              <span class="swatch" aria-hidden="true" style:--tr={t.radius == null ? undefined : `${t.radius}px`}>
                                {#each [t.light, t.dark].filter((p) => p !== undefined) as p, i (i)}
                                  <span class="pane" style:background={p.bg} style:color={p.text}>
                                    <span class="aa" style:font-family={t.font}>Aa<span class="pill" style:background={p.accent}></span></span>
                                    <span class="bar" style:background={p.textMuted}></span>
                                  </span>
                                {/each}
                              </span>
                              <span class="t-name">{t.name}</span>
                              <span class="t-tag">{t.light && t.dark ? 'Light · Dark' : t.light ? 'Light only' : 'Dark only'}</span>
                            </label>
                          {/each}
                        </div>
                      {:else if c.type === 'manage-groups'}
                        <div class="field">
                          <span class="muted">{groupsLine}</span>
                          <button class="btn-sm" onclick={manageGroups}>Manage groups</button>
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
        <div class="nomatch">No settings match “{query}”.</div>
      {/if}

      {#if !q}
        <section aria-label="Backup">
          <h2 class="label sec">Backup</h2>
          <div class="card backup">
            <span class="muted note">Settings, notes, queue and channel groups in one file.</span>
            <div class="row">
              <button class="btn-sm" onclick={doExport}>Export</button>
              <button class="btn-sm" onclick={startImport}>Import</button>
              <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={doImport} />
            </div>
            {#if backupStatus}<span class="muted note" role="status">{backupStatus}</span>{/if}
          </div>
          <div class="version">Helm {version}</div>
        </section>
      {/if}
    </div>
    {/if}
  </div>
</div>

<style>
  .settings {
    --surface: var(--surface-card);
    --accent-soft: var(--accent-soft-2);
  }
  .master {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .search-wrap {
    padding: 4px 16px 8px;
    flex-shrink: 0;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 40px;
    border-radius: 12px;
    background: var(--surface);
    color: var(--muted);
  }
  .search:focus-within {
    box-shadow: 0 0 0 2px var(--focus);
  }
  .search input {
    flex-grow: 1;
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: transparent;
    border: 0;
    outline: none;
    min-width: 0;
  }
  .body {
    padding: 4px 16px 20px;
  }
  .paused {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    margin-bottom: 14px;
    border-radius: 14px;
    background: var(--accent-soft);
  }
  .paused span {
    flex-grow: 1;
    font-size: 12px;
    line-height: 1.45;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .groups.dim {
    opacity: 0.45;
  }
  .sec {
    margin: 0 4px 8px;
  }
  .feat {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .feat-head {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }
  .opts {
    margin-left: 44px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--inset);
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
  }
  .field strong {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .field select,
  .field input {
    font: inherit;
    font-size: 12px;
    color: inherit;
    background: rgba(127, 127, 140, 0.12);
    border: 1px solid rgba(127, 127, 140, 0.22);
    border-radius: 9px;
    padding: 6px 9px;
    outline: none;
  }
  .field select:focus-visible,
  .field input:focus-visible {
    border-color: var(--focus);
  }
  .field select option {
    color: #121218;
  }
  .field input[type='number'] {
    width: 54px;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    min-height: 28px;
  }
  .opt input,
  .chip input {
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--accent);
  }
  .opt input {
    width: 16px;
    height: 16px;
  }
  .chips-label {
    margin-bottom: 2px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 11px 6px 9px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .chip.on {
    background: var(--accent-soft);
    border-color: transparent;
  }
  .chip input {
    width: 14px;
    height: 14px;
  }
  .chip:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .theme {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 4px 4px 6px;
    border-radius: 12px;
    border: 1px solid var(--line);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .theme:hover {
    background: rgba(127, 127, 140, 0.1);
  }
  .theme:has(input:checked) {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .theme:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .theme input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
  }
  .swatch {
    position: relative;
    display: grid;
    height: 48px;
    overflow: hidden;
    /* The theme's own corner radius, scaled to swatch size; unset → YouTube's 12px. */
    border-radius: min(10px, calc(var(--tr, 12px) / 2));
  }
  .swatch::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .pane {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 7px;
  }
  /* Dark half: the light pane's layout turned 180°, so the two never crowd the diagonal. */
  .pane + .pane {
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
    flex-direction: column-reverse;
    align-items: flex-end;
  }
  .aa {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }
  .pill {
    width: 9px;
    height: 5px;
    border-radius: 3px;
  }
  .bar {
    width: 18px;
    height: 3px;
    border-radius: 2px;
  }
  .t-name,
  .t-tag {
    padding: 0 3px;
  }
  .t-name {
    margin-top: 5px;
    font-weight: 600;
    line-height: 1.25;
  }
  .t-tag {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .btn-sm {
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(127, 127, 140, 0.14);
    transition: background-color 0.15s ease;
  }
  .btn-sm:hover {
    background: rgba(127, 127, 140, 0.24);
  }
  .primary-sm,
  .primary-sm:hover {
    background: var(--accent);
    color: var(--on-accent);
  }
  .nomatch {
    padding: 28px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  .backup {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .note {
    font-size: 12px;
    line-height: 1.45;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .version {
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    padding: 16px 0 0;
  }
</style>
