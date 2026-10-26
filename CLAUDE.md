# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Helm (store name: **Helm for YouTube**; never put "YouTube" first — trademark) — a Manifest V3 Chrome extension that layers UX improvements and power-user features on top of youtube.com. Not an ad blocker, downloader, or TOS-violating tool. See `README.md` for the pitch, `features.md` for the feature list and behavior specs, and `features-removed.md` for what was cut and why.

## Stack

- **WXT** ([wxt.dev](https://wxt.dev)) — MV3-aware build/dev framework on Vite.
- **Svelte 5** + **TypeScript** — chosen for tiny runtime (~2 kB) so injected UI doesn't slow YouTube. Same framework everywhere.
- Firefox: `npm run dev:firefox` / `npm run build:firefox` exist via WXT but are untested since the MAIN-world content script and `storage.session.setAccessLevel` were added. Chrome is the launch target.

## Commands

```
npm run dev          # watch build into .output/chrome-mv3-dev/, hot reloads
npm run build        # production build
npm run zip          # build + zip for Chrome Web Store
npm run check        # svelte-check typecheck (TS + .svelte) + theme contrast check
```

Load unpacked: `chrome://extensions` → Developer Mode → Load unpacked → point at `.output/chrome-mv3-dev/` (dev) or `.output/chrome-mv3/` (build). Manifest/SW changes require a manual extension reload; content/UI hot-reloads.

Dev loop gotchas:
- Run the dev server as `tail -f /dev/null | npm run dev` — without the stdin pipe WXT exits after the first reload. `web-ext.config.ts` (gitignored) sets `disabled: true` so WXT doesn't launch its own signed-out browser; if the dev server restarts, click ↻ on the extension once.
- WXT's watcher sometimes misses edits — `touch src/entrypoints/youtube.content.ts` forces a rebuild. Reload the YouTube tab after each content-script rebuild.
- Content-script errors don't reach the page console. In dev builds they are mirrored to `document.documentElement.dataset.ytpErrors` — read that.

## Architecture

```
src/
├── entrypoints/
│   ├── youtube.content.ts       # Isolated-world content script — bootstraps the registry
│   ├── youtube-main.content.ts  # Small MAIN-world helper: queue (⋮ → Add to queue, SPA navigate), channel-group grid (lib/yt/group-grid.ts)
│   ├── background.ts            # Service worker
│   └── popup/                   # Toolbar popup (Svelte)
├── features/                 # ONE MODULE PER FEATURE (<id>.ts, plus an <id>/ folder for Svelte parts), lazy-imported
├── lib/
│   ├── features.ts           # Feature interface + registry (id → dynamic import)
│   ├── settings.ts           # Per-feature flags + config via wxt storage (sync)
│   ├── feature-catalog.ts    # What the popup's Settings page renders
│   ├── queue.ts              # Global queue store (shared by the feature and the popup)
│   ├── messages.ts           # Popup ↔ tab message types
│   ├── backup.ts             # Export / import of all Helm keys
│   ├── fetch-json.ts         # Third-party fetch proxied through the SW
│   └── yt/
│       ├── context.ts        # Bundles shared services for features
│       ├── observer.ts       # ONE shared MutationObserver, batched + idle-dispatched
│       └── navigation.ts     # SPA route changes via `yt-navigate-finish`
```

### How features work

1. Author a `Feature` object in `src/features/<id>.ts` exporting `default`. Its `setup(ctx)` returns an optional teardown.
2. Add `'<id>': () => import('../features/<id>')` to `featureRegistry` in `src/lib/features.ts`.
3. Add the flag to `FeatureFlags` + a default in `FEATURE_DEFAULTS` in `src/lib/settings.ts`.
4. Add a `CatalogEntry` in `src/lib/feature-catalog.ts` — the popup's Settings page renders from it.
5. If the feature needs config beyond on/off (e.g. a chosen speed): add a key to `FeatureConfig` + default, then use `getConfig(id)` / `watchConfig(id, cb)` inside `setup()` to react reactively.

The content script reads enabled flags from `chrome.storage.sync`, dynamic-imports only those modules, and tears them down when the user disables them. **Disabled features pay zero runtime cost** — `setup()` never runs, no observer subscriptions, no listeners. (Note: due to content-script chunk-loading constraints, the bundle still includes all feature code; runtime cost is the part we control.)

### Shared helpers in `src/lib/yt/`

- `context.ts` — bundles the observer and navigation bus; created once per content-script lifetime
- `observer.ts` — single batched MutationObserver. Use `ctx.observer.onChange(cb)` (debounced 100 ms re-scan)
- `navigation.ts` — `ctx.navigation.onNavigate(url => …)` for SPA route changes (`yt-navigate-finish`)
- `keys.ts` — `onKey('y', handler)` page-level keyboard shortcut helper that auto-skips when the user is typing in an input/textarea/contenteditable
- `toast.ts` — `flashToast('Added to queue', { action: { label: 'Undo', onClick } })` — YouTube-style bottom-left toast
- `ui.ts` — YouTube-native kit: `createHost(id, extraCss?, html?)` (shadow host + `NATIVE_CSS` classes `.ytp-btn`, `.ytp-chip`, `.ytp-menu`, `.ytp-dialog`, …), `openPopover`, `menuKeys`, `showDialog`. Every on-page surface uses it
- `player.ts` — `mountInPlayer(ctx, host, slot, order)` for the player's controls row / progress bar / overlay; `action-row.ts` — slots left of Like and above the description
- `player-bridge.ts` — answers the popup's messages (`lib/messages.ts`) in every YouTube tab, flags or not

### Performance rules — these are the moat

- **Exactly one `MutationObserver`** for the whole extension, scoped to `ytd-app`. Features subscribe via `ctx.observer`. Do NOT add new observers in feature modules.
- Mutation callbacks run inside `requestIdleCallback` and are batched — never assume synchronous reaction to a DOM change.
- For "DOM changed, re-scan" use `ctx.observer.onChange(cb)` (debounced 100 ms).
- For SPA route changes use `ctx.navigation.onNavigate(cb)`. Do NOT poll `location.href` or hook `popstate` — YouTube fires `yt-navigate-finish`.
- Centralize selectors in `lib/yt/` so a YouTube redesign is a one-file fix. Prefer feature detection over class names.
- No polyfills, no lodash, no moment. Modern Chrome only.
- Injected UI lives in a **shadow root** from `createHost()` (YouTube's stylesheet clobbers un-scoped styles), placed in a YouTube slot — **no floating `position: fixed` buttons/panels, no extension branding on youtube.com**. Colors only from `--yt-sys-color-baseline--*` tokens so light/dark and the `theme` presets just work. Stateful UI may be a Svelte component with `<svelte:options css="injected" />` mounted into that root (see the top of `ui.ts`); unmount it in the teardown.

### Storage split

- `chrome.storage.sync` → `featureFlags`, `extensionEnabled`, `config:<id>` (small, roams across devices)
- `chrome.storage.local` → bulky data under `helm:*`: queue, notes, channel groups, per-channel speed, watch time, `@handle` → `UC…` id cache
- `chrome.storage.session` → `helm:player-tab`
- Always use the wxt `storage` helper (`storage.getItem('sync:key')` / `storage.watch(...)`), not raw `chrome.storage`.

### Service worker

MV3 SWs get terminated. Keep state in `chrome.storage`, not module-level vars. Talk to it from content scripts via `browser.runtime.sendMessage`.

Content-script `fetch` to a third-party origin is cross-origin blocked in MV3 (host permissions don't apply there). Use `fetchJson()` from `lib/fetch-json.ts`, which proxies through the SW; add the host to `ALLOWED_HOSTS` in `background.ts` and to `host_permissions`.

## Feature scope

A feature ships only if youtube.com doesn't already offer it and it removes a real pain point — check the live site before building. No OAuth. The only external service is SponsorBlock.
