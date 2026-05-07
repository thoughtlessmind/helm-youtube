# Tasks

Implementation status for everything in `features.md`. Mirrors that file's structure. Update this list whenever a feature ships or its scope changes.

**Progress:** 12 / 21 Phase 1 · 0 / 14 Phase 2 · 0 / 19 Phase 3 · 0 / 5 Phase 4

---

## Phase 1 — Quick Wins (MVP)

### Quick Actions

- [ ] One-click "Add to Watch Later" button on every video thumbnail
- [ ] One-click "Add to favorite playlist" button
- [ ] Keyboard shortcut to save current video to Watch Later or chosen playlist
- [x] Copy timestamped link to current playback position — `copy-timestamped-link` (Y key)
- [x] Screenshot current frame — `screenshot-current-frame` (S key)

### UI Cleanup

- [x] Hide Shorts everywhere — `hide-shorts`
- [x] Hide recommendations sidebar while watching — `hide-watch-page-sidebar`
- [ ] Hide comments by default, with reveal toggle
- [x] Hide the "Up Next" autoplay panel — `hide-up-next-panel`
- [x] Remove end-screen video cards — `hide-end-screen-cards`
- [ ] Hide view counts and/or upload dates

### Friction Reducers

- [x] Auto-dismiss "Are you still watching?" prompt — `auto-dismiss-still-watching`
- [x] Disable autoplay by default — `disable-autoplay`
- [ ] Stop the homepage from reshuffling on back navigation
- [ ] Preserve scroll position on back navigation

### Playback

- [x] Persistent volume across videos and sessions — `persistent-volume`
- [x] Volume boost beyond 100% — `volume-boost`
- [ ] Loop a custom section A→B
- [x] Default playback speed — `default-playback-speed`

### Visual Polish

- [x] True black dark mode for OLED — `true-black-dark-mode`
- [ ] Custom CSS themes

---

## Phase 2 — Mid-Sized Features

### Per-Channel Settings

- [ ] Remember playback speed per channel
- [ ] Auto-skip first/last N seconds of every video on a specific channel
- [ ] Per-channel notification preferences

### Subscription & Feed Control

- [ ] Mute specific channels in recommendations without unsubscribing
- [ ] Block videos by keyword in title
- [ ] Block videos under/over a certain length
- [ ] Group subscriptions into folders/categories

### Personal Notes & Tags

- [ ] Tag videos with custom labels
- [ ] Personal notes attached to videos
- [ ] Mark channels as "favorite" and pin to top
- [ ] "Read later" style queue separate from Watch Later

### Productivity

- [ ] Distraction-free mode (just the video)
- [ ] Sticky mini-player when scrolling comments
- [ ] Resize the player to any aspect ratio or size
- [ ] Picture-in-picture that works on any page

---

## Phase 3 — Large Features

### Custom Dashboards (Flagship)

- [ ] Create, rename, delete, and reorder views
- [ ] Assign channels to views (many-to-many)
- [ ] Tab bar / dropdown to switch views on homepage
- [ ] Filter mode (no auth, client-side filtering)
- [ ] Custom feed mode (OAuth + YouTube Data API)
- [ ] Per-view settings (speed, autoplay, filters)
- [ ] Smart views (rule-based)
- [ ] Export/import views as JSON

### Bulk Watch Later Management

- [ ] Sort by length, date added, channel
- [ ] Bulk delete (watched / over X minutes / older than X days)
- [ ] Randomize order
- [ ] Export Watch Later to CSV or JSON

### Content Awareness

- [ ] Real video length minus sponsor segments (SponsorBlock API)
- [ ] Estimated reading-time-equivalent
- [ ] Transcript side panel with click-to-jump
- [ ] Download transcript as `.txt` or `.srt`
- [ ] Channel upload frequency + average video length on channel pages
- [ ] Detect and flag re-uploads or already-watched videos
- [ ] Show dislike count (Return YouTube Dislike API)

### AI-Powered Features

- [ ] Auto-summarize the video (Claude API)
- [ ] Generate chapter markers from transcript
- [ ] Ask questions about the video (chat with transcript)

### Multi-Video Modes

- [ ] Multi-video grid view (up to 4 streams)
- [ ] Compare two videos side-by-side with synced playback

### Personal Analytics

- [ ] Watch-time dashboard (this week, by channel)
- [ ] Most-watched channels with trends over time
- [ ] "You've watched X hours of this channel" stat on channel pages
- [ ] Goal setting (daily watch limit + soft warning)

### Search & History

- [ ] Better search within own watch history (channel, length, date, keyword)

---

## Phase 4 — Stretch Goals

- [ ] Cross-device sync of notes, tags, views (partly free via `chrome.storage.sync`)
- [ ] Export everything as a single backup JSON
- [ ] Companion mobile app
- [ ] Public preset marketplace
- [ ] Firefox and Edge support
