# YouTube Pro — A Better YouTube Experience

A Chrome (and Firefox) extension that enhances the YouTube web experience by fixing the small UX annoyances and adding pro-level features the native site doesn't offer.

## What It Is

YouTube Pro is a browser extension built for power users who spend a lot of time on YouTube and want it to work the way they actually use it — not the way the algorithm wants them to. It layers improvements on top of the native YouTube interface without replacing it.

The goal is twofold:

1. **Reduce friction** — turn multi-step native flows (like adding to Watch Later) into one click.
2. **Add features YouTube doesn't have** — custom dashboards that filter your homepage to specific channels, per-channel playback speed memory, focus modes, transcripts, on-device AI summaries, and personal analytics.

This is *not* an ad blocker, a downloader, or a TOS-violating tool. It works alongside YouTube and respects the platform.

## Who It's For

- People who watch a lot of YouTube and feel the current UI gets in the way
- Subscribers who want true control over their feed (folders, filters, dashboards)
- Learners who use YouTube as a study tool and want notes, transcripts, and section looping
- Anyone tired of clicking through three menus to do something simple

## Project Status

**Functional.** All four roadmap phases are implemented — see `features.md`. ~50 independently-toggleable features ship across Feed & Discovery, Watch Page, Player, Playback, Per-Channel, Insights, on-device AI, Analytics, Notes & Library, Video Tools, and more. Every feature is on/off from the toolbar popup and the in-page header menu.

A small number of roadmap items are intentionally out of scope (companion mobile app, hosted preset marketplace, OAuth custom-feed mode) — see the "Build Status & Deferred Scope" section of `features.md`.

## Tech Stack

- **[WXT](https://wxt.dev)** — MV3-aware build/dev framework on Vite (replaces hand-rolled Vite + CRXJS).
- **Svelte 5 + TypeScript** — tiny runtime (~2 kB) so injected UI doesn't slow YouTube down.
- Cross-browser: Chrome (MV3) and Firefox (MV2) build out of the box.
- **On-device AI** — the AI features (summary, chapter generation, ask-the-video) use Chrome's built-in Gemini Nano (Prompt / Summarizer API). No external API, no keys, no OAuth.
- **Public APIs** — SponsorBlock and Return YouTube Dislike, both keyless.

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

> **Bundle note:** with ~50 features the content script is ~260 kB minified. Feature *code* is bundled regardless of toggles (a content-script chunk-loading constraint), but disabled features run no code — no observer subscriptions, no listeners.

## Distribution

- **Chrome Web Store** — `npm run zip` produces the upload artifact.
- **Firefox** — `npm run build:firefox` / `npm run zip:firefox`; MV2 output builds cleanly.

## Contributing

Pick a feature from `features.md`. Adding one is: a module under `src/features/`, a registry line in `src/lib/features.ts`, a flag in `src/lib/settings.ts`, and an entry in `src/lib/feature-catalog.ts` — the popup and in-page menu render from the catalog automatically. Keep the [performance rules in `CLAUDE.md`](./CLAUDE.md) — they are the moat.

## License

TBD
