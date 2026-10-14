# Features — removed

Decided 2026-10-12 during the v2 feature audit. Kept list: [`features.md`](./features.md).
"Native" means the equivalent was confirmed on the live youtube.com UI that day.

## Built, then removed

| Module | Reason | YouTube equivalent |
|---|---|---|
| `thumbnail-save-button` | Native | Watch Later on thumbnail hover; ⋮ → Save to Watch Later |
| `save-to-playlist` (W key) | Native | ⋮ → Save to playlist |
| `mute-channels` | Native | ⋮ → Don't recommend channel |
| `copy-timestamped-link` (Y key) | Native | Player right-click → Copy video URL at current time |
| `disable-autoplay` | Native | Player autoplay toggle (remembered) |
| `bulk-watch-later` | Native | Watch Later: 5 sort orders, Videos/Shorts filter, Remove watched videos |
| `transcript-panel` | Native | Description → Show transcript (searchable, click-to-jump) |
| `ai-summarize` | Native | Watch-page **Ask** button (Gemini) |
| `ai-ask` | Native | Watch-page **Ask** button (Gemini) |
| `ai-chapters` | Native | Auto chapters ("In this video") |
| `picture-in-picture` | Native | Player right-click → Miniplayer; Chrome's built-in PiP |
| `sticky-mini-player` | Native | Miniplayer |
| `resize-player` | Native | Default / Cinema mode / Full screen |
| `persistent-volume` | Native | Player remembers volume |
| `dislike-count` | Not needed | YouTube removed dislikes in 2021; only an extrapolated estimate (Return YouTube Dislike) was possible |
| `per-channel-skip-segments` | Superseded | SponsorBlock auto-skip covers intro/outro, per video |
| `video-tags` | Low value | Playlists already let a video carry many labels |
| `history-search` | Low value | History page already has search |
| `reading-time` | Low value | Novelty |
| `channel-stats` | Low value | Curiosity only; fragile scraping |
| `multi-video-grid` | Low value | Niche, heavy (multiple embeds) |
| `compare-videos` | Low value | Niche |

**Kept as a base, not removed:** `read-later-queue` becomes the Global queue.

## Options cut from kept features (2026-10-13 UI pass)

| Option | Reason |
|---|---|
| Grid density → "hide card info" | Kept settings to what the reviewed design shows |
| Feed filters → "dim watched" | Folded into the single "Hide videos I've watched" checkbox |
| Playback speed → choices above 2× | Kept settings to what the reviewed design shows |
| Volume boost → 100% / 175% / 250% steps | Kept settings to what the reviewed design shows |
| SponsorBlock → "sponsor-free length" badge | No slot for it in the design or the surface table |
| Focus mode → "hide description" (from the old distraction-free mode) | Not carried over |
| Channel groups → JSON export of groups | The global backup in Settings covers it |

## Planned, never built — dropped

| Item | Reason |
|---|---|
| One-click "favorite playlist" thumbnail button | Native ⋮ → Save to playlist |
| Per-channel notification preferences | Native subscription bell (All / Personalized / None) |
| Stop homepage reshuffle / preserve scroll on back | Native SPA already restores both |
| OAuth custom-feed mode for dashboards | Requires OAuth; Channel groups filter mode covers it |
| Smart views, per-view settings, export/import of views | Complexity without proven need |
| Companion mobile app | Separate platform |
| Public preset marketplace | Needs a hosted backend |
