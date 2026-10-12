<script lang="ts">
  import { onMount } from "svelte";
  import {
    getFlags,
    setFlag,
    getConfig,
    setConfig,
    getExtensionEnabled,
    setExtensionEnabled,
    watchExtensionEnabled,
    type FeatureFlags,
    type FeatureConfig,
  } from "../../lib/settings";
  import {
    CATALOG,
    ALL_FEATURES,
    type ConfigField,
  } from "../../lib/feature-catalog";
  import { exportBackup, importBackup, isBackupData } from "../../lib/backup";

  /** Feature ids that carry a config blob. */
  const CONFIG_IDS = ALL_FEATURES.filter((f) => f.config?.length).map(
    (f) => f.id,
  );

  let flags = $state<FeatureFlags>({});
  let extensionEnabled = $state<boolean>(true);
  let configs = $state<Record<string, Record<string, unknown>>>({});

  onMount(async () => {
    flags = await getFlags();
    extensionEnabled = await getExtensionEnabled();
    for (const id of CONFIG_IDS) {
      configs[id] = (await getConfig(
        id as keyof FeatureConfig,
      )) as Record<string, unknown>;
    }
    watchExtensionEnabled((on) => {
      extensionEnabled = on;
    });
  });

  async function toggleExtension() {
    extensionEnabled = !extensionEnabled;
    await setExtensionEnabled(extensionEnabled);
  }

  async function toggle(id: keyof FeatureFlags) {
    const next = !flags[id];
    flags = { ...flags, [id]: next };
    await setFlag(id, next);
  }

  async function updateConfig(id: string, key: string, value: unknown) {
    const next = { ...(configs[id] ?? {}), [key]: value };
    configs = { ...configs, [id]: next };
    await setConfig(
      id as keyof FeatureConfig,
      next as FeatureConfig[keyof FeatureConfig],
    );
  }

  const isNumeric = (field: ConfigField) =>
    field.type === "select" && typeof field.options[0]?.value === "number";

  // ─── Backup & restore ───────────────────────────────────────────────────
  let backupStatus = $state("");
  let fileInput: HTMLInputElement | undefined = $state();

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `youtube-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    backupStatus = "Settings exported.";
  }

  async function doImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isBackupData(parsed)) {
        backupStatus = "That file is not a YouTube Pro backup.";
        return;
      }
      await importBackup(parsed);
      flags = await getFlags();
      extensionEnabled = await getExtensionEnabled();
      for (const id of CONFIG_IDS) {
        configs[id] = (await getConfig(
          id as keyof FeatureConfig,
        )) as Record<string, unknown>;
      }
      backupStatus = "Settings restored.";
    } catch {
      backupStatus = "Could not read that file.";
    }
  }
</script>

<main class="w-80 p-4">
  <header class="mb-3">
    <h1 class="text-base font-semibold m-0">YouTube Pro</h1>
  </header>

  <label
    class="flex items-center justify-between p-3 mb-3 rounded-lg bg-yt-surface cursor-pointer"
  >
    <span class="font-medium">Extension enabled</span>
    <input
      type="checkbox"
      checked={extensionEnabled}
      onchange={toggleExtension}
      class="accent-yt-red"
    />
  </label>

  <div
    class="flex flex-col gap-3"
    class:opacity-40={!extensionEnabled}
    class:pointer-events-none={!extensionEnabled}
  >
    {#each CATALOG as section (section.title)}
      <section>
        <h2
          class="text-[11px] font-semibold uppercase tracking-wide text-yt-text-muted m-0 mb-1.5 px-1"
        >
          {section.title}
        </h2>
        <ul class="flex flex-col gap-2 list-none p-0 m-0">
          {#each section.features as f (f.id)}
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
                <span class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <strong class="font-medium">{f.label}</strong>
                  <small class="text-xs text-yt-text-muted">{f.desc}</small>

                  {#if f.config && flags[f.id]}
                    <div class="mt-2 flex flex-col gap-2">
                      {#each f.config as field (field.key)}
                        {#if field.type === "select"}
                          <label class="flex items-center gap-2 text-xs">
                            {#if field.label}
                              <span class="text-yt-text-muted"
                                >{field.label}:</span
                              >
                            {/if}
                            <select
                              value={String(configs[f.id]?.[field.key])}
                              onchange={(e) =>
                                updateConfig(
                                  f.id,
                                  field.key,
                                  isNumeric(field)
                                    ? Number(e.currentTarget.value)
                                    : e.currentTarget.value,
                                )}
                              onclick={(e) => e.stopPropagation()}
                              class="bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
                            >
                              {#each field.options as o (o.value)}
                                <option value={String(o.value)}>{o.label}</option
                                >
                              {/each}
                            </select>
                          </label>
                        {:else if field.type === "checkbox"}
                          <label
                            class="flex items-center gap-2 text-xs cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!!configs[f.id]?.[field.key]}
                              onchange={(e) =>
                                updateConfig(
                                  f.id,
                                  field.key,
                                  e.currentTarget.checked,
                                )}
                              onclick={(e) => e.stopPropagation()}
                              class="accent-yt-red"
                            />
                            <span>{field.label}</span>
                          </label>
                        {:else if field.type === "number"}
                          <label class="flex items-center gap-2 text-xs">
                            {#if field.label}
                              <span class="text-yt-text-muted"
                                >{field.label}:</span
                              >
                            {/if}
                            <input
                              type="number"
                              value={String(configs[f.id]?.[field.key] ?? "")}
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              oninput={(e) =>
                                updateConfig(
                                  f.id,
                                  field.key,
                                  e.currentTarget.value === ""
                                    ? 0
                                    : Number(e.currentTarget.value),
                                )}
                              onclick={(e) => e.stopPropagation()}
                              placeholder={field.placeholder ?? ""}
                              class="w-20 bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
                            />
                          </label>
                        {:else}
                          <label class="flex items-center gap-2 text-xs">
                            {#if field.label}
                              <span class="text-yt-text-muted"
                                >{field.label}:</span
                              >
                            {/if}
                            <input
                              type="text"
                              value={String(configs[f.id]?.[field.key] ?? "")}
                              oninput={(e) =>
                                updateConfig(
                                  f.id,
                                  field.key,
                                  e.currentTarget.value,
                                )}
                              onclick={(e) => e.stopPropagation()}
                              placeholder={field.placeholder ?? ""}
                              class="flex-1 bg-yt-bg text-yt-text border border-white/10 rounded px-2 py-1 text-xs"
                            />
                          </label>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </span>
              </label>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <section class="mt-3 pt-3 border-t border-white/10">
    <h2
      class="text-[11px] font-semibold uppercase tracking-wide text-yt-text-muted m-0 mb-1.5 px-1"
    >
      Backup
    </h2>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={doExport}
        class="flex-1 bg-yt-surface hover:bg-yt-surface-hover transition-colors rounded-lg px-3 py-2 text-xs font-medium"
      >
        Export all settings
      </button>
      <button
        type="button"
        onclick={() => fileInput?.click()}
        class="flex-1 bg-yt-surface hover:bg-yt-surface-hover transition-colors rounded-lg px-3 py-2 text-xs font-medium"
      >
        Import…
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        onchange={doImport}
        class="hidden"
      />
    </div>
    {#if backupStatus}
      <small class="block mt-1.5 px-1 text-xs text-yt-text-muted"
        >{backupStatus}</small
      >
    {/if}
  </section>
</main>
