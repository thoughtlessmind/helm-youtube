# Features

Finalized 2026-10-12. What was cut and why: [`features-removed.md`](./features-removed.md).

**Inclusion rule:** a feature ships only if (1) youtube.com does not already offer it —
checked against the live site on 2026-10-12 — and (2) it removes a real pain point. No OAuth.
The only external service is SponsorBlock.

## The list

**Priority:** P1 = value visible within seconds of install · P2 = core power feature ·
P3 = small utility.

| # | Feature | What it does | Why YouTube doesn't cover it | Module | P |
|---|---|---|---|---|---|
| 1 | **Hide Shorts** | Removes Shorts from feed, sidebar, search, channel pages | Native only offers a temporary "Show fewer Shorts" | `hide-shorts` | P1 |
| 2 | **Focus mode** | One feature, per-surface options: hide home feed, watch-page recommendations, comments, view counts/dates | Cinema mode enlarges the player; recommendations and the home feed are always shown | `focus-mode` | P1 |
| 3 | **Feed filters** | Hide videos by title keyword, by length, and already-watched ones | Native filtering is per-video "Not interested" only | `feed-filters` | P1 |
| 4 | **Grid density** | Choose videos per row on the homepage | Column count is fixed by window width | `customize-grid` | P1 |
| 5 | **Playback speed** | A default speed, plus per-channel overrides that are remembered | Speed resets; no per-channel memory | `playback-speed` | P1 |
| 6 | **SponsorBlock auto-skip** | Auto-skips crowd-sourced sponsor / self-promo / interaction / intro / outro segments, shown on the progress bar, with Undo | Not native (Premium "Jump ahead" is not sponsor skipping) | `sponsorblock` | P1 |
| 7 | **Global queue** | One persistent queue shared by every YouTube tab/window in the profile | Native queue is per-tab and lost on reload | `read-later-queue` | P1 |
| 8 | **Channel groups** | Group channels (favorites = a group); a group chip on Home/Subscriptions shows just its channels' latest videos, as native cards in YouTube's own grid | Subscriptions are one flat list | `channel-groups` | P2 |
| 9 | **Hide end-screen cards** | Removes the suggested-video overlay in the last ~20 s | No native off switch | `hide-end-screen-cards` | P2 |
| 10 | **Auto-dismiss "Still watching?"** | Auto-confirms the pause prompt | Not native | `auto-dismiss-still-watching` | P2 |
| 11 | **Volume boost** | Amplify above 100% for quiet videos | Native caps at 100%; Stable volume only normalizes | `volume-boost` | P2 |
| 12 | **Video notes** | Private auto-saved note per video | Not native | `video-notes` | P2 |
| 13 | **Watch time** | Daily/weekly watch-time stats, hours per channel, soft daily limit | No watch-time stats or limits on desktop | `watch-time` | P2 |
| 14 | **Transcript download** | Export the transcript as `.txt` / `.srt` | Native shows the transcript, can't export it | `download-transcript` | P3 |
| 15 | **A→B loop** | Loop a section with `[` `]` `\` | Native Loop is whole-video only | `loop-section` | P3 |
| 16 | **Frame screenshot** | `S` saves the current frame as PNG | Not native | `screenshot-current-frame` | P3 |
| 17 | **Theme** | Preset palette + font + corner radius (Nord, Rosé, Forest, Solarized, Sepia, OLED Black, Terminal); follows YouTube's light/dark, single-mode presets override it | Native is Light / Dark / Device only | `theme` | P3 |
| 18 | **Hide Playables** | Removes Playables (games) from the sidebar, Home shelves and feeds | Native only offers per-shelf "Not interested" | `hide-playables` | P3 |

## Behavior specs

### Focus mode
Options (each a checkbox): home feed · watch-page recommendations · comments · view
counts & upload dates. Hiding recommendations must hide only
`ytd-watch-next-secondary-results-renderer` — the `#secondary` column also hosts the
transcript/chapters panels and live chat, which never load while it is `display:none`.

### SponsorBlock auto-skip
Categories (configurable): sponsor, self-promo, interaction reminder, intro, outro. Show a
short "Skipped sponsor · Undo" toast. API calls go through the service worker
(`lib/fetch-json.ts`) — content-script fetches are cross-origin blocked.

### Global queue
- **Scope:** every tab and window of the Chrome profile; survives reload and restart
  (`chrome.storage.local`). Adding from any tab appears live in all others.
- **Adding:** YouTube's own ⋮ → **Add to queue** is redirected to this queue; plus a button on
  the thumbnail hover preview, and `Q`. Redirect matching must not depend on menu text (locales);
  if matching fails, YouTube's native behavior runs and `Q` and the preview button still work.
- **One player tab:** queued videos only ever play in a single *player tab* — the tab that
  last started a queued video (store its tab id in `chrome.storage.session`). Starting the
  queue with no player tab uses the YouTube tab shown in the popup, or opens a new tab if
  none is open; that tab becomes the player tab. If the player tab closes, the next start
  picks again. Every other YouTube tab is plain YouTube: it can **add** to the queue but
  never pulls from it.
- **Played items stay:** a queued video gets a ✓ when it plays (however it was opened).
  "Now playing" marks what the player tab is playing. Panel offers **Clear played** and
  **Clear all**.
- **Auto-advance:** when a video ends **in the player tab** and unplayed items exist, the
  first unplayed item plays there (overrides YouTube's autoplay). No unplayed items, or a
  video ending in any other tab → native behavior. Only the player tab advances, so two
  tabs can never race for the same next item.
- **Detour:** opening a non-queued video in the player tab while a queued one is unfinished
  puts it in that one's slot (✓, playing); the interrupted one moves down a step, unplayed.
  After a queued video *ends*, whatever opens next (YouTube autoplay)
  is native and not queued.
- **Watch-page panel:** our own panel in the slot YouTube uses for its queue (top of the
  watch page's right column, above recommendations), built to look like YouTube's: same
  type, row height, thumbnail size, and **only YouTube's theme tokens**
  (`--yt-sys-color-baseline--*`) so it is native in light and dark. No extension branding.
  - Shown **only in the player tab** and **only while something is up next**; hidden in
    every other tab and once everything is watched. Collapsed/expanded is remembered.
    With no player tab yet, every watch tab shows it; the first to start a queued item
    (panel click or auto-advance) becomes the player tab.
  - Header: "Queue", position + "N up next", Auto-advance switch, "Clear watched",
    collapse. Rows: current (now-playing indicator), watched (✓, dimmed), upcoming
    (numbered). Click thumbnail = play now; remove on hover; reorder by drag, plus arrow
    keys on the handle (dragging can't be the only way).
  - In tabs without the panel, adding to the queue shows YouTube-style "Added to queue"
    toast feedback.
  - Not YouTube's own queue panel: it can only be filled through YouTube's undocumented
    internal commands, can't show ✓/saved state, and resets on every reload.
- **Toolbar popup:** the big now-playing card shows the player tab (or, with none, the
  most recently used YouTube tab with a video). No tab switcher. If another YouTube tab is
  also playing, a slim "Also playing in another tab" row offers pause and "go to tab".
  Up next lists only what's left to play (watched videos fold into "Clear N watched"),
  under one bar of the whole queue and the time it ends at the current speed.

### Volume boost
Graph: `MediaElementSource → Gain → DynamicsCompressor (limiter) → destination`. Resume the
AudioContext on the first play/click; a suspended context silences the video.

## Where the UI lives
No floating buttons: every on-page control sits in one of YouTube's own places.

| Surface | What goes there |
|---|---|
| Watch page, next to Subscribe | "Group" button → add channel to groups / create group / manage |
| Watch page action row (left of Like) | "Notes" (opens a note card over the description) · "Transcript" (menu: .txt / .srt / copy) |
| Player controls row | per-channel speed chip ("1.5×", popover) · screenshot button · A→B loop chip |
| Player progress bar | SponsorBlock segments · A→B loop band and markers |
| Inside player, bottom-left | "Skipped sponsor · Undo" toast |
| Volume control | boost badge ("150%") |
| Watch page right column | Queue panel (player tab only, only while something is up next) |
| Thumbnail hover preview | "Add to queue" button, next to YouTube's mute / CC |
| Channel page | all-time watch time for that channel |
| Home chip bar | channel-group switcher (replaces YouTube's chips; a toggle at the strip's right end swaps back) + "N hidden by filters" toggle; "+ New group" dialog |
| Home feed (Focus mode) | calm replacement: continue queue, channel groups, "show once" |
| Any page, top of content | daily-limit reminder (Snooze / Dismiss) |
| Page bottom-left | YouTube-style toasts for confirmations |

All of it uses YouTube's `--yt-sys-color-baseline--*` tokens and Roboto sizing, so it is
native in light and dark.

## Parked — Chrome built-in AI (2026-10-14)
On-device Gemini Nano, no data leaves the machine. Summarize / Ask / chapters stay cut (native Ask).
Only feed classification is left that YouTube doesn't do:
1. **Feed filters → hide by language** — `LanguageDetector` (stable, web-exposed, small) on titles.
   Misses YouTube's auto-translated titles; skip short titles below a confidence floor.
2. **Feed filters → hide by topic** in plain words — `LanguageModel` + `responseConstraint`
   JSON schema, ~20 titles per prompt, verdict cached per video ID in `storage.local`.
3. **Channel groups → suggest groups** — one-shot `LanguageModel` sort of subscriptions; user reviews.

Constraints: desktop Chrome only (~22 GB disk, >4 GB VRAM or 16 GB RAM) → opt-in sub-option,
hidden when `availability()` is `'unavailable'`. First `create()` downloads GBs and needs a click
(start it from the popup). Check `LanguageModel` is reachable from the content script on the
target Chrome; else an offscreen document. Typings: old `src/lib/yt/chrome-ai.ts` (`cdba701`).
