# CLAUDE.md

Helm: an MV3 Chrome extension that adds UX and power-user features to youtube.com. Store name **Helm for YouTube**; never put "YouTube" first (trademark). Not an ad blocker, downloader, or anything against YouTube's TOS. WXT + Svelte 5 + TypeScript.

## Dev loop

- `npm run check` = svelte-check + WCAG contrast of every theme palette. Load unpacked from `.output/chrome-mv3-dev/` (dev) or `.output/chrome-mv3/` (build).
- Run dev as `tail -f /dev/null | npm run dev`; without stdin WXT exits after the first reload. The gitignored `web-ext.config.ts` (`disabled: true`) stops WXT launching a signed-out browser; after a dev-server restart, click ↻ on the extension.
- Manifest/SW changes need a manual extension reload. After a content-script rebuild, reload the YouTube tab. If the watcher misses an edit, `touch src/entrypoints/youtube.content.ts`.
- One build at a time: each rewrites `.wxt/tsconfig.json`, and concurrent builds corrupt it. `YTP_OUT_DIR=<dir>` only changes the output dir.
- Content-script errors never reach the page console. Dev builds append caught ones to `document.documentElement.dataset.ytpErrors`, but it can miss uncaught isolated-world exceptions; check the extension's Errors page or CDP too.
- Target is Chrome ≥ 126 (`minimum_chrome_version` in `wxt.config.ts`). The `*:firefox` scripts are untested since the MAIN-world script and `storage.session.setAccessLevel` landed.

## Adding a feature

1. `src/features/<id>.ts` default-exports a `Feature`; `setup(ctx)` returns an optional teardown. Svelte parts go in `src/features/<id>/`.
2. Add `'<id>': () => import('../features/<id>')` to `featureRegistry` (`src/lib/features.ts`). Keep it a dynamic import.
3. Add the default on/off to `FEATURE_DEFAULTS` (`src/lib/settings.ts`). `FeatureFlags` derives from it.
4. Add a `CatalogEntry` to a section of `CATALOG` (`src/lib/feature-catalog.ts`); the popup's Settings page renders from it.
5. For config beyond on/off, add a default to `FEATURE_CONFIG_DEFAULTS` (`FeatureConfig` derives from it) and read it with `getConfig(id)` / `watchConfig(id, cb)` inside `setup()`.

Only enabled features run `setup()`; disabling calls the teardown. A disabled feature must cost nothing at runtime: no subscriptions, no listeners.

## Performance rules (the moat)

- Exactly one `MutationObserver` (`src/lib/yt/observer.ts`, on `ytd-app`). Never add another; subscribe with `ctx.observer.onChange(cb)`. Callbacks are idle-batched (`requestIdleCallback`) and debounced 100 ms, so never assume a synchronous reaction to a DOM change.
- Route changes: `ctx.navigation.onNavigate(cb)` (YouTube's `yt-navigate-finish`). Never poll `location.href` or hook `popstate`.
- Keep selectors in `src/lib/yt/` so a YouTube redesign is a one-file fix. Prefer feature detection over class names.
- No polyfills, lodash, or moment.

## Injected UI

- Every surface lives in a shadow root from `createHost()` (`src/lib/yt/ui.ts`; its header documents the `.ytp-*` kit and Svelte mounting), placed in a YouTube slot: `mountInPlayer` (`player.ts`), `placeInActionRow` / `placeAboveDescription` (`action-row.ts`). Reuse `openPopover`, `menuKeys`, `showDialog`, `flashToast`, `onKey`.
- No floating `position: fixed` buttons or panels. No extension branding on youtube.com.
- Colors come only from `--yt-sys-color-baseline--*` tokens, so light/dark and the theme presets just work.
- Svelte components use `<svelte:options css="injected" />` and mount into the host's shadow root. Unmount them in the teardown.

## Storage

Use the wxt `storage` helper (`storage.getItem('sync:…')`, `storage.watch`), never raw `chrome.storage`.

- `sync` (small, roams): `featureFlags`, `extensionEnabled`, `config:<id>`.
- `local`: bulky data, always under `helm:*`. Backup/export (`src/lib/backup.ts`) only picks up Helm's own prefixes.
- `session`: `helm:player-tab`.

## Execution contexts

- The SW (`background.ts`) gets terminated. Keep state in `chrome.storage`, never in module-level vars. Reach it with `browser.runtime.sendMessage`.
- Content-script `fetch` to a third-party origin is blocked in MV3. Use `fetchJson()` (`src/lib/fetch-json.ts`), which proxies through the SW. Add the host to `ALLOWED_HOSTS` in `background.ts` and to `host_permissions` in `wxt.config.ts`.
- `youtube-main.content.ts` runs in the MAIN world with no extension APIs; it talks to the isolated world via `window.postMessage`, DOM events and `<html data-ytp-*>` attributes.
- `lib/yt/player-bridge.ts` answers popup messages in every YouTube tab, even with the extension off.

## Feature scope

Ship a feature only if youtube.com doesn't already offer it and it removes a real pain point; check the live site first. No OAuth. The only external service is SponsorBlock.
