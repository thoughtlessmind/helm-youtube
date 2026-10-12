# Features — v2

Finalized 2026-10-12. Supersedes [`features.md`](./features.md) (deprecated). What was cut
and why: [`features-removed.md`](./features-removed.md).

**Inclusion rule:** a feature ships only if (1) youtube.com does not already offer it —
checked against the live site on 2026-10-12 — and (2) it removes a real pain point. No OAuth.
The only external service is SponsorBlock.

## The list

**Priority:** P1 = value visible within seconds of install · P2 = core power feature ·
P3 = small utility.

| # | Feature | What it does | Why YouTube doesn't cover it | Built from (today) | Work left | P |
|---|---|---|---|---|---|---|
| 1 | **Hide Shorts** | Removes Shorts from feed, sidebar, search, channel pages | Native only offers a temporary "Show fewer Shorts" | `hide-shorts` | — | P1 |
| 2 | **Focus mode** | One feature, per-surface options: hide home feed, watch-page recommendations, comments, view counts/dates | Cinema mode enlarges the player; recommendations and the home feed are always shown | `focus-mode` | Add **hide home feed** option (new) | P1 |
| 3 | **Feed filters** | Hide videos by title keyword, by length, and already-watched ones | Native filtering is per-video "Not interested" only | `feed-filters` | — | P1 |
| 4 | **Grid density** | Choose videos per row on the homepage | Column count is fixed by window width | `customize-grid` | — | P1 |
| 5 | **Playback speed** | A default speed, plus per-channel overrides that are remembered | Speed resets; no per-channel memory | `playback-speed` | — | P1 |
| 6 | **SponsorBlock auto-skip** | Auto-skips crowd-sourced sponsor / self-promo / intro / outro segments; shows sponsor-free length | Not native (Premium "Jump ahead" is not sponsor skipping) | `sponsorblock` (badge only) | Add auto-skip + category choice; also replaces per-channel intro/outro skipping | P1 |
| 7 | **Global queue** | One persistent queue shared by every YouTube tab/window in the profile | Native queue is per-tab and lost on reload | `read-later-queue` (persistence + cross-tab sync exist) | Rework per spec below | P1 |
| 8 | **Channel groups** | Group channels (favorites = a group), filter Subscriptions/home by group | Subscriptions are one flat list | `channel-groups` | — | P2 |
| 9 | **Hide end-screen cards** | Removes the suggested-video overlay in the last ~20 s | No native off switch | `hide-end-screen-cards` | — | P2 |
| 10 | **Auto-dismiss "Still watching?"** | Auto-confirms the pause prompt | Not native | `auto-dismiss-still-watching` | — | P2 |
| 11 | **Volume boost** | Amplify above 100% for quiet videos | Native caps at 100%; Stable volume only normalizes | `volume-boost` | Add a limiter (stops clipping); resume a suspended AudioContext on first play (else silent video) | P2 |
| 12 | **Video notes** | Private auto-saved note per video | Not native | `video-notes` | — (persistence verified 2026-10-12) | P2 |
| 13 | **Watch time** | Daily/weekly watch-time stats, hours per channel, soft daily limit | No watch-time stats or limits on desktop | `watch-time` | — | P2 |
| 14 | **Transcript download** | Export the transcript as `.txt` / `.srt` | Native shows the transcript, can't export it | `download-transcript` | Browser test | P3 |
| 15 | **A→B loop** | Loop a section with `[` `]` `\` | Native Loop is whole-video only | `loop-section` | — | P3 |
| 16 | **Frame screenshot** | `S` saves the current frame as PNG | Not native | `screenshot-current-frame` | — | P3 |
| 17 | **True black** | `#000` backgrounds for OLED | Native dark is `#0f0f0f` | `true-black-dark-mode` | — | P3 |

## Specs for features with open design

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
- **Adding:** YouTube's own ⋮ → **Add to queue** is redirected to this queue; plus `Q` and a
  watch-page button. Redirect matching must not depend on menu text (locales); if matching
  fails, YouTube's native behavior runs and `Q`/button still work.
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
- **Watch-page panel:** our own panel in the slot YouTube uses for its queue (top of the
  watch page's right column, above recommendations), built to look like YouTube's: same
  type, row height, thumbnail size, and **only YouTube's theme tokens**
  (`--yt-sys-color-baseline--*`) so it is native in light and dark. No extension branding.
  - Shown **only in the player tab** and **only while something is up next**; hidden in
    every other tab and once everything is watched. Collapsed/expanded is remembered.
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

### Volume boost
Graph: `MediaElementSource → Gain → DynamicsCompressor (limiter) → destination`. Resume the
AudioContext on the first play/click; a suspended context silences the video.

## Cross-cutting work
- **No floating buttons — use YouTube's own surfaces.** Notes, queue and watch-time each add
  a fixed-position button today, with hard-coded offsets that overlap. Replace them all with
  native-looking UI in YouTube's existing places (mockups: canvas "On youtube.com"):
  | Surface | What goes there |
  |---|---|
  | Watch page, next to Subscribe | "Group" button → add channel to groups / create group / manage |
  | Watch page action row (left of Like) | "Notes" (opens a note card over the description) · "Transcript" (menu: .txt / .srt / copy) |
  | Player controls row | per-channel speed chip ("1.5×", popover) · screenshot button · A→B loop chip |
  | Player progress bar | SponsorBlock segments · A→B loop band and markers |
  | Inside player, bottom-left | "Skipped sponsor · Undo" toast |
  | Volume control | boost badge ("150%") |
  | Watch page right column | Queue panel (player tab only, only while something is up next) |
  | Home chip bar | channel-group switcher + "N hidden by filters" toggle; "+ New group" dialog |
  | Home feed (Focus mode) | calm replacement: continue queue, channel groups, "show once" |
  | Any page, top of content | daily-limit reminder (Snooze / Dismiss) |
  | Page bottom-left | YouTube-style toasts for confirmations |
  All of it uses YouTube's `--yt-sys-color-baseline--*` tokens and Roboto sizing, so it is
  native in light and dark.
- **Catalog regroup.** After the merges, `lib/feature-catalog.ts` sections should match this
  list.
