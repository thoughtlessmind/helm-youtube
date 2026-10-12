# YouTube Pro — A Better YouTube Experience

A Chrome (and Firefox) extension that enhances the YouTube web experience by fixing the small UX annoyances and adding pro-level features the native site doesn't offer.

## What It Is

YouTube Pro is a browser extension built for power users who spend a lot of time on YouTube and want it to work the way they actually use it — not the way the algorithm wants them to. It layers improvements on top of the native YouTube interface without replacing it.

The goal is twofold:

1. **Remove friction and noise** — hide Shorts and recommendations, filter the feed, skip sponsor segments.
2. **Add features YouTube doesn't have** — a persistent queue shared across tabs, channel groups, per-channel playback speed, video notes, and watch-time tracking.

Every feature passes one rule: youtube.com doesn't already do it. See [`features-v2.md`](./features-v2.md).

This is *not* an ad blocker, a downloader, or a TOS-violating tool. It works alongside YouTube and respects the platform.

## Who It's For

- People who watch a lot of YouTube and feel the current UI gets in the way
- Subscribers who want true control over their feed (channel groups, filters)
- Learners who use YouTube as a study tool and want notes, transcript export, and section looping
- Anyone tired of clicking through three menus to do something simple

## Project Status

**In progress.** The feature set was cut to 17 features on 2026-10-12 — see [`features-v2.md`](./features-v2.md) for the list and the work left on each, and [`features-removed.md`](./features-removed.md) for what was dropped and why (mostly things YouTube now does natively). Every feature is on/off from the toolbar popup and the in-page header menu.

## Tech Stack

- **[WXT](https://wxt.dev)** — MV3-aware build/dev framework on Vite (replaces hand-rolled Vite + CRXJS).
- **Svelte 5 + TypeScript** — tiny runtime (~2 kB) so injected UI doesn't slow YouTube down.
- Cross-browser: Chrome (MV3) and Firefox (MV2) build out of the box.
- **Public API** — SponsorBlock (keyless), called via the service worker. No OAuth.

## Commands

```
npm run dev            # watch build into .output/chrome-mv3/, hot reloads
npm run build          # production build (Chrome)
npm run build:firefox  # production build (Firefox)
npm run zip            # build + zip for the Chrome Web Store
npm run check          # svelte-check typecheck (TS + .svelte)
```

Load unpacked: `chrome://extensions` → Developer Mode → Load unpacked → point at `.output/chrome-mv3/`. Manifest/service-worker changes need a manual extension reload; content/UI changes hot-reload.

## Architecture

```
src/
├── entrypoints/
│   ├── youtube.content.ts    # Sole content script — bootstraps the registry
│   ├── background.ts         # Service worker
│   └── popup/                # Toolbar popup (Svelte)
├── features/                 # ONE FILE PER FEATURE, lazy-imported
└── lib/
    ├── features.ts           # Feature interface + registry
    ├── settings.ts           # Per-feature flags + config via wxt storage
    ├── feature-catalog.ts    # Single source of truth for the popup + header menu
    ├── backup.ts             # Export / import all settings as JSON
    └── yt/                   # Shared helpers (one observer, navigation bus, …)
```

Each feature is a self-contained module with a `setup(ctx)` that returns a teardown function. Disabled features pay zero runtime cost. The whole extension shares **exactly one** `MutationObserver` and one SPA-navigation listener. See `CLAUDE.md` for the full architecture and the rules for adding a feature.

> **Bundle note:** the content script is ~140 kB minified. Feature *code* is bundled regardless of toggles (a content-script chunk-loading constraint), but disabled features run no code — no observer subscriptions, no listeners.

## Distribution

- **Chrome Web Store** — `npm run zip` produces the upload artifact.
- **Firefox** — `npm run build:firefox` / `npm run zip:firefox`; MV2 output builds cleanly.

## Contributing

Pick work from `features-v2.md` (P1 first). Adding one is: a module under `src/features/`, a registry line in `src/lib/features.ts`, a flag in `src/lib/settings.ts`, and an entry in `src/lib/feature-catalog.ts` — the popup and in-page menu render from the catalog automatically. Keep the [performance rules in `CLAUDE.md`](./CLAUDE.md) — they are the moat.

## License

TBD
