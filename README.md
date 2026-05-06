# YouTube Pro — A Better YouTube Experience

A Chrome extension that enhances the YouTube web experience by fixing the small UX annoyances and adding pro-level features that the native app doesn't offer.

## What It Is

YouTube Pro is a browser extension built for power users who spend a lot of time on YouTube and want it to work the way they actually use it — not the way the algorithm wants them to. It layers improvements on top of the native YouTube interface without replacing it.

The goal is twofold:

1. **Reduce friction** — turn multi-step native flows (like adding to Watch Later) into one click.
2. **Add features YouTube doesn't have** — like custom dashboards that filter your homepage to specific channels, per-channel playback speed memory, focus modes, and personal analytics.

This is *not* an ad blocker, a downloader, or a TOS-violating tool. It works alongside YouTube and respects the platform.

## Who It's For

- People who watch a lot of YouTube and feel the current UI gets in the way
- Subscribers who want true control over their feed (folders, filters, chronological order)
- Learners who use YouTube as a study tool and want notes, transcripts, and section looping
- Anyone tired of clicking through three menus to do something simple

## Project Status

Early planning phase. See `FEATURES.md` for the full feature roadmap, organized from quick wins (MVP candidates) to larger ambitious features.

## Tech Stack

### Core
- **Manifest V3** — the current Chrome extension standard
- **Vanilla JavaScript** (or **TypeScript** for type safety as the project grows)
- **HTML + CSS** for popup and options UI

### Recommended Tooling
- **Vite** or **Webpack** — bundler for organizing source files into the extension build
- **TypeScript** — strongly recommended once we move past the smallest features
- **ESLint + Prettier** — code quality and formatting
- **CRXJS Vite plugin** — makes Manifest V3 development much smoother with hot reload

### Chrome Extension APIs We'll Use
- **Content Scripts** — to inject UI and behavior into YouTube pages
- **`chrome.storage.sync`** — to save user preferences and custom dashboards across devices
- **`chrome.storage.local`** — for larger data like personal notes and analytics
- **Service Worker** (background script) — for events that need to run outside the page context
- **`chrome.runtime` messaging** — communication between content scripts and the service worker
- **`chrome.commands`** — for keyboard shortcuts

### YouTube-Specific Techniques
- **`MutationObserver`** — YouTube is a single-page app with heavy lazy-loading, so we'll watch the DOM for new video cards as the user scrolls or navigates
- **CSS injection** — for theming, hiding elements, and visual tweaks
- **DOM automation** — for triggering native YouTube actions programmatically (e.g., the Watch Later quick-add)

### Optional / For Larger Features
- **YouTube Data API v3** — needed for the custom dashboard feature when we want true chronological feeds, and for any feature that needs to read/write playlists reliably. Requires OAuth 2.0.
- **SponsorBlock public API** — for showing real video length minus sponsor segments
- **Return YouTube Dislike API** — for restoring dislike counts
- **Anthropic Claude API** — for the AI-powered video summary feature (longer-term)

### Testing & Distribution
- **Manual testing in Chrome** during development (load unpacked)
- **Chrome Web Store** for distribution ($5 one-time developer registration fee)
- Optionally **Firefox / Edge** support later — both accept Manifest V3 extensions with minor tweaks

## Project Structure (Planned)

```
youtube-pro/
├── manifest.json            # Extension manifest (V3)
├── src/
│   ├── content/             # Content scripts injected into YouTube
│   │   ├── index.ts         # Entry point
│   │   ├── features/        # One file per feature
│   │   └── utils/           # DOM helpers, observers, selectors
│   ├── background/          # Service worker
│   ├── popup/               # Toolbar popup UI
│   ├── options/             # Settings page
│   └── styles/              # Injected CSS
├── public/                  # Icons and static assets
├── dist/                    # Built extension (gitignored)
└── package.json
```

## Development Workflow

1. Clone the repo and run `npm install`
2. Run `npm run dev` to start the watcher
3. In Chrome, go to `chrome://extensions`, enable Developer Mode, and click "Load unpacked"
4. Point it at the `dist/` folder
5. Open YouTube — the extension will be active

Reload the extension from `chrome://extensions` after pulling changes that affect the manifest or service worker. Content script changes hot-reload automatically with CRXJS.

## Contributing

Pick a feature from `FEATURES.md`, start with the "Quick Wins" section if you're new to the codebase. Each feature should ideally live in its own module under `src/content/features/` so they can be toggled independently from the settings page.

## License

TBD
