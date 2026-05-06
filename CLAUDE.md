# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

YouTube Pro — a Manifest V3 Chrome extension that layers UX improvements and power-user features on top of youtube.com. Not an ad blocker, downloader, or TOS-violating tool. See `README.md` for the pitch and `features.md` for the roadmap (organized Phase 1 → 4, MVP-first).

## Stack

- **WXT** ([wxt.dev](https://wxt.dev)) — MV3-aware build/dev framework on Vite. Replaces hand-rolled Vite + CRXJS.
- **Svelte 5** + **TypeScript** — chosen for tiny runtime (~2 kB) so injected UI doesn't slow YouTube. Same framework everywhere.
- Cross-browser: `npm run dev:firefox` / `npm run build:firefox` work out of the box via WXT.

## Commands

```
npm run dev          # watch build into .output/chrome-mv3/, hot reloads
npm run build        # production build
npm run zip          # build + zip for Chrome Web Store
npm run check        # svelte-check typecheck (TS + .svelte)
```

Load unpacked: `chrome://extensions` → Developer Mode → Load unpacked → point at `.output/chrome-mv3/`. Manifest/SW changes require a manual extension reload; content/UI hot-reloads.

## Architecture

```
src/
├── entrypoints/
│   ├── youtube.content.ts    # Sole content script — bootstraps the registry
│   ├── background.ts         # Service worker
│   └── popup/                # Toolbar popup (Svelte)
├── features/                 # ONE FILE PER FEATURE, lazy-imported
├── lib/
│   ├── features.ts           # Feature interface + registry (id → dynamic import)
│   ├── settings.ts           # Per-feature flags via wxt storage (sync)
│   └── yt/
│       ├── context.ts        # Bundles shared services for features
│       ├── observer.ts       # ONE shared MutationObserver, batched + idle-dispatched
│       └── navigation.ts     # SPA route changes via `yt-navigate-finish`
```

### How features work

1. Author a `Feature` object in `src/features/<id>.ts` exporting `default`. Its `setup(ctx)` returns an optional teardown.
2. Add `'<id>': () => import('../features/<id>')` to `featureRegistry` in `src/lib/features.ts`.
3. Add the flag to `FeatureFlags` in `src/lib/settings.ts`.

The content script reads enabled flags from `chrome.storage.sync`, dynamic-imports only those modules, and tears them down when the user disables them. **Disabled features cost zero** — their code is never fetched or parsed on youtube.com.

### Performance rules — these are the moat

- **Exactly one `MutationObserver`** for the whole extension, scoped to `ytd-app`. Features subscribe via `ctx.observer`. Do NOT add new observers in feature modules.
- Mutation callbacks run inside `requestIdleCallback` and are batched — never assume synchronous reaction to a DOM change.
- For "DOM changed, re-scan" use `ctx.observer.onChange(cb)` (debounced 100 ms).
- For SPA route changes use `ctx.navigation.onNavigate(cb)`. Do NOT poll `location.href` or hook `popstate` — YouTube fires `yt-navigate-finish`.
- Centralize selectors in `lib/yt/` so a YouTube redesign is a one-file fix. Prefer feature detection over class names.
- No polyfills, no lodash, no moment. Modern Chrome only.
- Keep injected UI in **shadow DOM** when added (TBD — first feature to need overlay UI sets the pattern). YouTube's stylesheet will clobber un-scoped styles.

### Storage split

- `chrome.storage.sync` → user prefs, feature flags, dashboards (small, roams across devices)
- `chrome.storage.local` → bulky data: notes, tags, watch analytics
- Always use the wxt `storage` helper (`storage.getItem('sync:key')` / `storage.watch(...)`), not raw `chrome.storage`.

### Service worker

MV3 SWs get terminated. Keep state in `chrome.storage`, not module-level vars. Talk to it from content scripts via `browser.runtime.sendMessage`.

## Feature prioritization (from `features.md`)

When picking work, order by: works without OAuth → survives YouTube UI changes → visible value <5s of install → stands alone. Phase 1 is the MVP target before touching mid/large features. External APIs (YouTube Data API, SponsorBlock, Return YT Dislike, Anthropic Claude) are Phase 3+ only.
