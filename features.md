# Features Roadmap (DEPRECATED)

> **Deprecated 2026-10-12.** Superseded by [`features-v2.md`](./features-v2.md); cut items
> and reasons are in [`features-removed.md`](./features-removed.md). Kept for history only —
> do not pick work from this file.

Features are organized from **Quick Wins** (small, high-impact, MVP candidates) to **Large Features** (more ambitious, often requiring APIs, OAuth, or significant UI work).

Start at the top, ship often, build up.

---

## Build Status & Deferred Scope

This roadmap is being worked top-to-bottom. **Done** = a feature module exists under
`src/features/`, is wired into the registry + settings + the in-page header menu, and
`npm run check` passes.

The following items are **explicitly out of scope** for the current build pass:

- ~~**Per-channel notification preferences**~~ — _Not built. YouTube exposes no stable
  per-channel notification surface to script against; the native bell already covers it._
- ~~**Companion mobile app**~~ — _Deferred. Separate platform (roadmap already flags it
  "maybe never")._
- ~~**Public preset marketplace**~~ — _Deferred. Requires a hosted backend._

**Custom Dashboards** ship in **filter mode only** (no OAuth): the user assigns channels to
a named view, and opening that view filters the homepage feed to show only videos from the
saved channels. No YouTube Data API / OAuth custom-feed mode.

**AI features** (auto-summarize, chapter generation, ask-the-video) ship using **Chrome's
built-in on-device AI only** — Gemini Nano via the Prompt / Summarizer API. No external API
provider is configured. They run behind `window`-level feature detection with a graceful
"model unavailable" state when Chrome's on-device model is not present.

Everything else in Phases 1–4 is in scope and being built.

---

## Phase 1 — Quick Wins (MVP)

These are small, self-contained features that mostly rely on DOM manipulation and `chrome.storage`. No external APIs or OAuth required. Each one can be built and shipped in a day or two.

### Quick Actions

- **One-click "Add to Watch Later"** button on every video thumbnail (homepage, search, sidebar). Removes the three-dot-menu → Save → Watch Later flow.
- **One-click "Add to favorite playlist"** — let the user pick a default playlist in settings, then add a button for it next to Watch Later.
- **Keyboard shortcut to save current video** to Watch Later or a chosen playlist.
- **Copy timestamped link** to current playback position with one keystroke.
- **Screenshot current frame** with one keystroke (clean, no UI overlay).

### UI Cleanup

- **Hide Shorts everywhere** — feed, sidebar, search, channel pages. Toggle in settings.
- **Hide recommendations sidebar** while watching a video.
- **Hide comments by default**, with a toggle to reveal.
- **Hide the "Up Next" autoplay panel.**
- **Remove end-screen video cards** that block the last 20 seconds of videos.
- **Hide view counts and/or upload dates** to reduce clickbait pull (optional).
- **Customize homepage grid** — bump videos-per-row above the default 3, optionally hide the title/channel/views block under each thumbnail for a denser feed.

### Friction Reducers

- **Auto-dismiss the "Are you still watching?"** prompt.
- **Disable autoplay by default** but keep a one-click toggle to re-enable per session.
- ~~**Stop the homepage from reshuffling** when you navigate back from a video.~~ _Skipped — YouTube's SPA already restores feed + scroll on back-nav in current Chrome; intervening would fight the framework for marginal gain._
- ~~**Preserve scroll position** when navigating back.~~ _Skipped — same reason as above._

### Playback

- **Persistent volume** across videos and sessions (YouTube already does this for some users but is inconsistent).
- **Volume boost beyond 100%** using Web Audio API gain.
- **Loop a custom section A→B** for music practice, language learning, etc.
- **Default playback speed** that applies to every video.

### Visual Polish

- **True black dark mode** for OLED displays.
- **Custom theme presets** — pick from a curated set of styled themes.

---

## Phase 2 — Mid-Sized Features

These need a bit more architecture: settings UI, storage schemas, possibly a popup/options page. Still no external APIs required.

### Per-Channel Settings

- **Remember playback speed per channel** (e.g., always 2x for podcasts, 1x for music).
- **Auto-skip first/last N seconds** of every video on a specific channel (intros/outros).
- **Per-channel notification preferences.**

### Subscription & Feed Control

- **Mute specific channels** in recommendations without unsubscribing.
- **Block videos by keyword** in title (e.g., hide anything with "REACTION" or "DRAMA").
- **Block videos under/over a certain length.**
- **Group subscriptions into folders/categories** (the foundation for custom dashboards).

### Personal Notes & Tags

- **Tag videos with custom labels** (separate from playlists).
- **Personal notes attached to videos** that persist across sessions.
- **Mark channels as "favorite"** and pin them to the top of subscriptions.
- **"Read later" style queue** separate from Watch Later.

### Productivity

- **Distraction-free mode** — just the video, nothing else on screen.
- **Sticky mini-player** when scrolling comments.
- **Resize the player** to any aspect ratio or size.
- **Picture-in-picture** that works on any page.

---

## Phase 3 — Large Features

These are the headline features. Most require either the YouTube Data API (with OAuth), third-party APIs, or significant custom UI work. Worth the effort because they're things YouTube genuinely doesn't offer.

### Custom Dashboards (Flagship Feature)

Let users create custom views and assign channels to them. Switching to a view filters the homepage to show only videos from those channels.

- Create, rename, delete, and reorder views
- Assign channels to views (a channel can belong to multiple views)
- Tab bar or dropdown near the top of the homepage to switch views
- **Two implementation modes:**
  - **Filter mode** (no auth): filter the existing homepage feed client-side
  - **Custom feed mode** (OAuth + YouTube Data API): build a true chronological feed of the latest uploads from the channels in the view
- **Per-view settings:** different default playback speed, autoplay behavior, or filters per view
- **Smart views:** rule-based ("show all channels tagged 'tech' uploaded in the last 7 days")
- **Export/import views** as JSON to share presets

### Bulk Watch Later Management

- **Sort by length, date added, channel.**
- **Bulk delete** watched videos, videos over X minutes, videos older than X days.
- **Randomize order.**
- **Export Watch Later** to CSV or JSON.

### Content Awareness

- **Show real video length minus sponsor segments** (integrate with SponsorBlock public API).
- **Show estimated reading-time-equivalent** ("this 40min video ≈ a 12min article").
- **Show transcript in a side panel** with click-to-jump on each line.
- **Download transcript** as `.txt` or `.srt`.
- **Show channel upload frequency** and average video length on channel pages.
- **Detect and flag re-uploads** or videos already watched.
- **Show dislike count** via Return YouTube Dislike API.

### AI-Powered Features

- **Auto-summarize the video** using the Claude API (transcript → summary).
- **Generate chapter markers** from the transcript when the creator didn't provide them.
- **Ask questions about the video** — chat with the transcript.
- **On-device video summary + chat (side panel)** — use Chrome's built-in AI (Prompt/Summarizer API, Gemini Nano) to summarize the current video locally and open a chat-like UI in the extension side panel for follow-up questions. Answers cite jump-to timestamps drawn from the transcript so the user can click through to the relevant moment. No external API or OAuth; runs offline once the model is downloaded. Reference video: https://www.youtube.com/watch?v=8iIvAMZ-XYU

### Multi-Video Modes

- **Multi-video grid view** — watch up to 4 streams at once, mute all but one.
- **Compare two videos side-by-side** with synced playback (great for tutorials, sports, music).

### Personal Analytics

- **Watch-time dashboard** — how much time on YouTube this week, by channel.
- **Most-watched channels** with trends over time.
- **"You've watched X hours of this channel"** stat displayed on channel pages.
- **Goal setting** — set a daily watch limit and get a soft warning.

### Search & History

- **Better search within your own watch history** with filters native YouTube doesn't support (channel, length, date range, keyword).

---

## Phase 4 — Stretch Goals

Speculative features that would be cool but aren't priorities until the foundation is solid.

- **Cross-device sync** of notes, tags, and views (already partially free via `chrome.storage.sync`)
- **Export everything** as a single backup JSON
- **Companion mobile app** to access notes/tags from anywhere (huge scope — maybe never)
- **Public preset marketplace** where users share custom dashboards, themes, and rule sets
- **Firefox and Edge support** — Manifest V3 mostly works on both with minor adjustments

---

## Notes on Prioritization

When picking what to build next, optimize for these in order:

1. **Does it work without OAuth?** — friction-free onboarding wins
2. **Does it survive YouTube UI changes?** — prefer features that don't depend on fragile selectors
3. **Is it visible value within 5 seconds of installing?** — first impressions matter for adoption
4. **Does it stand alone?** — modular features are easier to ship and toggle
