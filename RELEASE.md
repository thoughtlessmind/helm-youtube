# Release checklist — Helm for YouTube v0.1.0

Status: `[x]` done · `[ ]` open · `[~]` partial / see issue sheet. Issues found go in the
[issue sheet](#issue-sheet) at the bottom; fixes reference its IDs.

## 1. Code checks

- [x] `npm run check` — svelte-check 0 errors / 0 warnings, theme contrast ≥ 4.5 on every palette
- [x] `npm run build` and `npm run zip` succeed (192 kB zip, 17 files); zip holds only manifest, popup, background, content scripts, chunks, assets, icons (no source maps, no `.env`, no dev files)
- [x] Dev-only code (the `ytpErrors` mirror, debug logging) absent from the production bundle
- [x] Perf rules hold: one `MutationObserver`, no `location.href` polling / `popstate` hooks, no `position: fixed` floating UI, all injected UI in shadow roots from `createHost()`
- [x] Every feature's teardown removes its DOM, styles, listeners and observer subscriptions (toggle each off in the popup)
- [x] Message handlers (`runtime.onMessage`, `window.postMessage`) check sender / source / origin and shape
- [x] No `innerHTML` with untrusted text (video titles, channel names, notes, transcript)
- [x] Service-worker fetch proxy stays restricted to `ALLOWED_HOSTS`
- [~] Storage: corrupt / missing / old-shape values don't crash a feature; backup import validates input (#32 fixed, #48 deferred)
- [x] Review the uncommitted channel-groups rework (native group grid), then commit it (#1, #21–26)

## 2. Chrome Web Store compliance

- [x] Manifest: name "Helm for YouTube", version set, description ≤ 132 chars, icons 16/32/48/128
- [x] Minimum permissions, each with a written justification (`storage`, `www.youtube.com`, `sponsor.ajay.app`) — see [Store submission material](#store-submission-material)
- [x] Content scripts limited to `www.youtube.com` (#5)
- [x] No remote code; no `eval` / `new Function`; default CSP
- [~] Privacy: every request listed in `PRIVACY.md`; needs a public URL + "Privacy practices" tab answers (#4)
- [x] Trademark (#2): "YouTube" never first in the name; no YouTube logo or red play button in icon / promo art; "not affiliated with YouTube" line in the listing
- [x] Single-purpose statement written
- [x] Listing assets: 128×128 icon, 5 screenshots (1280×800), promo tiles (440×280, 1400×560), long description — all 24-bit PNG, no alpha
- [x] README and `features.md` match shipped behaviour; LICENSE present

## 3. Live testing (load `.output/chrome-mv3/` unpacked)

Automated: `/tmp/cc/youtube-pro/live/driver.js` (Playwright, signed-out Chrome for Testing). Final run on the fixed tree: 57 PASS, 0 FAIL, 1 not testable (watch-time channel total: headless playback dies at ~44 s). Still manual: miniplayer / theater / fullscreen, two tabs, extension reload with tabs open, backup round-trip, queue reorder, Subscriptions group grid, watch-time totals, end-screen cards, "Still watching?".

Cross-cutting
- [x] Fresh install: first-run popup, defaults applied, nothing broken with only default features on
- [x] No errors in `document.documentElement.dataset.ytpErrors` (dev) / page console / SW console
- [x] SPA navigation Home → Watch → Channel → Search → Subscriptions → Back/Forward keeps every feature working
- [x] Light, dark and every theme preset look native (#49)
- [ ] Miniplayer, theater, fullscreen
- [~] Signed out (headless run) and signed in (your Chrome: group grid; needs a re-check after the extension reload)
- [ ] Two tabs / two windows (queue, player tab)
- [x] Master switch off → everything gone; on → everything back without reload
- [x] Each feature toggled off → its UI gone without reload; on → back
- [ ] Extension reload / update while YouTube tabs are open (orphaned content script stays quiet)
- [ ] Backup export → import round-trip
- [x] Long Home scroll stays smooth (20 s scroll: 982 ms long tasks on vs 817 ms off; no extension time in long frames); idle CPU near zero

Per feature
- [x] Hide Shorts — feed shelves, sidebar, search, channel tab
- [x] Focus mode — each option; transcript / chapters / live chat still open with recommendations hidden
- [~] Feed filters — keyword, min/max length, hide watched, "N hidden" toggle
- [x] Grid density — columns per row, live update
- [x] Playback speed — default, per-channel memory, miniplayer
- [x] SponsorBlock — segments on the bar, auto-skip per category, Undo toast
- [~] Global queue — add (⋮ menu, hover button, `Q`), auto-advance, reorder, multi-tab, survives reload
- [~] Channel groups — pill on watch / channel page, new / edit / manage / delete + Undo, group chip on Home + Subscriptions shows the group grid, swap to YouTube chips, "All" restores, Favorites pinned in the guide
- [ ] Hide end-screen cards
- [ ] Auto-dismiss "Still watching?"
- [x] Volume boost — multiplier, no distortion at 1×, teardown restores audio
- [x] Video notes — autosave, persists, per video
- [ ] Watch time — stats in popup, per-channel, channel-page total, daily-limit reminder snooze / dismiss
- [x] Transcript download — `.txt` / `.srt`, video without transcript
- [x] A→B loop — `[` `]` `\`
- [x] Frame screenshot — `S`, file name
- [x] Theme — each preset, font, radius, follows light / dark

## 4. Release steps

- [ ] All P0 / P1 issues fixed or consciously deferred
- [ ] Version bumped in `package.json`
- [ ] `npm run zip` → upload `.output/helm-<version>-chrome.zip`
- [ ] Store listing filled (description, screenshots, promo tiles, category, privacy practices, support URL)
- [ ] Tag the release commit (`v<version>`) and push

---

## Issue sheet

Severity: **P0** blocks release · **P1** fix before release · **P2** nice to have.
Status: open · fixing · fixed · deferred · won't fix.

| ID | Sev | Area | Issue | Found by | Status | Fix |
|---|---|---|---|---|---|---|
| 1 | P0 | Channel groups (WIP) | YouTube's RSS feeds 404 for every channel, so every group showed "No recent videos" | live test (signed in) | fixed | Sort by the cards' relative date ("4 days ago") parsed with `Intl.RelativeTimeFormat`, verified on 26 UI languages; RSS request dropped (`group-grid.ts`) |
| 2 | P0 | Store / branding | Icon, promo tiles and README logos were YouTube's logo mark (red rounded square + white play triangle) — trademark / impersonation rejection risk | store audit | fixed | New mark: a bold "H" whose crossbar runs into a forward arrow, white on indigo `#3D4FD6` (concept from Codex imagegen, rebuilt as vector). Pixel-snapped 16 / 32 px variants (`branding/icon-16.svg`, `icon-32.svg`; 48 renders from the 32 grid); icons, promo tiles and logos regenerated |
| 3 | P0 | Store listing | No screenshots (≥ 1 at 1280×800 required) | store audit | fixed | `branding/screenshots/`: queue panel, speed chip + SponsorBlock bar, channel-group grid, focus-mode calm home, popup — 1280×800 24-bit PNG, YouTube dark, signed out (script: `/tmp/cc/youtube-pro/shots/shots.js`) |
| 4 | P0 | Privacy | No privacy policy (required: SponsorBlock lookups leave the browser) | store audit | fixed | `PRIVACY.md`; needs a public URL (GitHub file / Pages) in the dashboard |
| 5 | P1 | Manifest | `*://*.youtube.com/*` also ran on music., studio., m., accounts.; default 1.25× speed would speed up YouTube Music | store audit | fixed | `https://www.youtube.com/*` in host permissions, both content scripts, popup tab query |
| 6 | P1 | Privacy | SponsorBlock got the raw video ID of every video watched | store audit | fixed | Hash-prefix endpoint (`/skipSegments/<sha256[0:4]>`), match filtered locally; verified live |
| 7 | P1 | Store review | `group-grid.ts` reads the SAPISID cookie and builds a SAPISIDHASH header — same-origin only, but reviewers / scanners flag cookie → auth header | store audit | won't fix | Kept: same-origin only, never stored or sent off youtube.com, needed for watched bars and "hide watched" on group cards; disclosed in PRIVACY.md and the host-permission justification |
| 8 | P2 | Defaults | Playback speed is on by default at 1.25× — every video speeds up right after install | store audit | fixed | Default speed 1× (per-channel memory still on by default); first-run screen says "Your speed is remembered per channel" |
| 9 | P2 | Docs | README privacy section omitted Helm's own youtube.com requests | store audit | fixed | README table updated, links PRIVACY.md |
| 10 | P2 | Manifest | Description vague and led with "YouTube" | store audit | fixed | "Hide Shorts, skip sponsors, keep one queue across tabs, group channels and remember speed per channel on youtube.com." (118 chars) |
| 11 | P2 | Manifest | No `minimum_chrome_version` though code needs Chrome 126 (`URL.parse`) | store audit | fixed | `minimum_chrome_version: '126'` |
| 12 | P2 | Permissions | `sponsor.ajay.app` is a required host permission though Skip sponsors is off by default (shows in the install warning) | store audit | deferred | Optional host permission + `permissions.request` on enable; needs handling for sync/backup-enabled state |
| 13 | P2 | Security | SW fetch proxy accepted `http:` URLs on allowlisted hosts | store audit | fixed | Require `https:` |
| 14 | P2 | Security | Queue's `postMessage` listener didn't check `e.origin` (group-grid's does) | store audit | fixed | Origin check added |
| 15 | P2 | Name | Many live "HELM" marks (e.g. Linux Foundation, software class) | store audit | won't fix | Full name "Helm for YouTube" is distinct in this niche; not legal advice |
| 16 | P2 | Tooling | Two `wxt build`s at once (different `YTP_OUT_DIR`) both rewrite `.wxt/tsconfig.json`; it got corrupted and the dev server died | release run | fixed | Comment in `wxt.config.ts`; regenerate with `rm .wxt/tsconfig.json && npx wxt prepare` |
| 17 | P1 | Lifecycle | Orphaned content script after an extension update/reload never cleans up: WXT only detects invalidation when `wxt.isInvalid` is read, and nothing reads it. Old UI stays, console fills with "Extension context invalidated", native ⋮ → Add to queue stays swallowed | code review (core) | fixed | Reads `wxt.isInvalid` on every shared-observer tick, so the existing teardown runs |
| 18 | P1 | Feed filters | "Hide watched" (on by default) applies on every page, so `/feed/history` and the You page show nothing, with no reveal toggle | code review (core) | fixed | History / You pages never filtered; hidden background pages keep their state |
| 19 | P1 | Focus mode | Hiding recommendations collapses `#secondary` even when it holds a playlist / native-queue panel or Helm's own "Show once" line | code review (core) | fixed | Playlist panel added to the allow-list. The "Show once" line stays one-column only (adding it would keep an empty column) |
| 20 | P1 | Focus mode | Hides the autoplay "Up next" overlay and its Cancel button: autoplay jumps to a recommendation ~8 s after the end with no way to stop it | code review (core) | fixed | Autoplay countdown + Cancel visible again; merch / ticket shelves still hidden |
| 21 | P1 | Channel groups (WIP) | Every Back to Home/Subscriptions re-shows the loading skeleton over a grid already showing the group (flash, likely loses restored scroll) | diff review | fixed | Re-ask for the group already shown skips the skeleton; MAIN reports `loading` only when it must fetch |
| 22 | P1 | Channel groups (WIP) | No concurrency cap: a 60-channel group fires 60 browse POSTs (+60 ~1 MB channel-page lookups first time) and puts up to 900 cards in the grid | diff review | fixed | Pool of 6 browse requests (4 channel-page lookups), grid capped at 120 cards (`lib/pool.ts`) |
| 23 | P2 | Channel groups (WIP) | Asking before the grid has data gives a terminal "Couldn't load videos" | diff review | fixed | Asks only once the grid has rendered cards |
| 24 | P2 | Channel groups (WIP) | All channel lookups failing (offline) shows "No recent videos" instead of the error + Try again | diff review | fixed | No resolvable channel → error state with Try again |
| 25 | P2 | Feed filters | "N hidden by filters" stays visible above the group feed's empty / error state | diff review | fixed | Already covered: the grid is `display:none` while the group feed stands in, which hides the toggle; stale comments fixed |
| 26 | P2 | Cleanup | Dead `isCardHidden`; stale comments / popup copy / docs from the old filter design and RSS | diff review | fixed | `isCardHidden` deleted; popup copy, CLAUDE.md, features-removed, channel-ids comment updated |
| 27 | P2 | Lifecycle | One feature's throwing teardown rejects the toggle queue forever (later toggles ignored until reload) | code review (core) | fixed | Teardown in try/catch, entry always removed, sync chain can't stay rejected |
| 28 | P2 | Navigation | A throwing navigation listener stops the rest from seeing the navigation | code review (core) | fixed | try/catch per listener |
| 29 | P2 | Popup | First-run screen reappears if closed via "Open YouTube" | code review (core) | fixed | "Open YouTube" marks first run seen |
| 30 | P2 | Popup | Length filter accepts min > max (hides everything); keywords uncapped (sync 8 KB item limit, silent failure) | code review (core) | fixed | Min/max swapped when reversed; keywords `maxlength=2000` |
| 31 | P2 | Popup | Settings writes the whole config object from state read at popup open, clobbering page-side changes (speed, panel collapsed) | code review (core) | fixed | `setOpt` merges into the stored config at write time |
| 32 | P2 | Backup | Import doesn't validate sync config values; a hand-edited `columnsPerRow` string is interpolated into page CSS | code review (core) | fixed | Clamped integer 0–8 |
| 33 | P2 | Channel groups | Editor save skips the duplicate-name check inline rename enforces | code review (core) | fixed | Editor blocks duplicate names with the same message as inline rename |
| 34 | P2 | Theme check | Contrast script doesn't test accent on its own hover tint (Nord light ~3.9:1) | code review (core) | deferred | Add tinted pairs to `check-theme-contrast.ts` |
| 35 | P2 | Perf | Observer + navigation listener run even with everything off | code review (core) | deferred | Create the context lazily |
| 36 | P2 | Channel groups (WIP) | Ties within one relative bucket ("3 days ago") keep channel order, not exact time; undated (premieres) go last | diff review | won't fix | Accepted approximation: no timestamp in the data |
| 37 | P0 | Auto-dismiss "Still watching?" (on by default) | Idle check runs on every DOM tick, not when the dialog appears: with the video paused, a user-opened "Unsubscribe?" / "Clear history?" confirm left open > 10 s gets auto-confirmed | code review (player) | fixed | Idleness judged once, when the dialog appears; only a dialog born idle is confirmed |
| 38 | P1 | Playback speed | Applies the user's speed to ads, and a rate change during a mid-roll can be saved as the channel's speed | code review (player) | fixed | No apply / save during ads; re-applied on the first `playing` after an ad |
| 39 | P1 | Queue / popup | Player-tab id is only cleared when the tab closes: if that tab navigated to another site, "Play" in the popup navigates that (non-YouTube) tab to a video, and other tabs never auto-advance | code review (player) | partly fixed | Popup checks the tab is still on www.youtube.com, else clears it. Not fixed: other tabs still don't auto-advance while the stale id points elsewhere (needs a tab-update listener) |
| 40 | P2 | Watch time | Today's total goes stale across midnight; a tab left open shows "daily limit reached" before you watch anything | code review (player) | fixed | Today's total looked up by date at render time |
| 41 | P2 | Watch time | Ad seconds count toward daily / per-channel totals | code review (player) | fixed | Not counted during ads; syncs on `playing` |
| 42 | P2 | A→B loop | Loop survives a video change without navigation (miniplayer, autoplay) and can bounce the next video | code review (player) | fixed | Loop tied to the video id; cleared when another video plays |
| 43 | P2 | Shortcuts | Key repeat not ignored: holding `S` saves dozens of screenshots | code review (player) | fixed | `onKey` ignores `e.repeat` |
| 44 | P2 | Playback speed | Previous video's channel speed applies to the next until navigation finishes; miniplayer videos get the wrong channel's override | code review (player) | fixed | Channel tied to the playing video id (watch metadata, else miniplayer); new video plays at the default until resolved |
| 45 | P2 | Volume boost | Turning it off from the popup while its AudioContext is suspended leaves the video silent until reload | code review (player) | fixed | Teardown resumes a suspended AudioContext and keeps the resume-on-gesture listeners until it runs |
| 46 | P2 | Video notes | One failed write stops all later saves in the tab; text typed < 400 ms before closing is lost | code review (player) | fixed | `.catch` on the write chain; `pagehide` writes the in-memory notes once loaded |
| 47 | P2 | Player tools | `[` / notes "Add time" / screenshot use the ad's time and frame during an ad | code review (player) | deferred | Bail out while an ad shows |
| 48 | P2 | Backup | Import doesn't shape-check watch log, notes, per-channel speeds (bad file → errors every flush) | code review (player + core) | deferred | Per-key guards on import |
| 49 | P1 | Theme | Sepia (light-only preset) under YouTube Dark: Ambient mode paints over the page, title / channel row / note card dark-on-dark | live test | fixed | Light-only presets hide `#cinematics` |
| 50 | P1 | Queue | A video queued while already playing never gets ✓: stays "up next", auto-advance replays it later | live test | fixed | Marked watched when it plays to the end (not at queue time, so "Q to finish later" still works) |
| 51 | P2 | UI kit | Keyboard-picking a Transcript menu item throws `InvalidStateError` (tooltip `showPopover` while the menu popover closes); download still works | live test | fixed | `pageTooltip` skips the show when another popover is mid-transition |
| 52 | P2 | Dev tooling | The dev-only `data-ytp-errors` mirror stayed empty while CDP caught an isolated-world exception, so CLAUDE.md's advice to rely on it is unreliable | live test | deferred | Investigate isolated-world `error` events; meanwhile use CDP / the extension's error page |
| 53 | P2 | Focus mode | Calm home footer said "change it in Helm settings" (extension branding on youtube.com) | live test | fixed | "change it in the extension's settings" |
| 54 | P2 | Hide Shorts | The collapsed mini guide still showed "Shorts": its label moved to the inner link, and the selector was English-only | screenshot run | fixed | Match the `/shorts` link in both guides |

---

## Store submission material

**Single purpose:** Helm improves the youtube.com viewing experience: it adds controls YouTube lacks (queue, channel groups, playback speed, sponsor skipping, notes, watch time) and hides distractions (Shorts, recommendations), all inside YouTube's own pages.

**Permission justifications**
- `storage` — Saves Helm's settings and data in Chrome storage: feature switches, the queue, notes, channel groups, per-channel speeds and watch-time totals. Settings sync through the user's own Chrome profile. Nothing is sent to the developer.
- `https://www.youtube.com/*` — Helm adds its features to YouTube pages, the popup shows and controls what is playing in open YouTube tabs, and channel groups load a channel's latest videos from youtube.com itself using the user's existing YouTube session.
- `https://sponsor.ajay.app/*` — The optional "Skip sponsors" feature (off by default) looks up crowd-sourced sponsor segments from the public SponsorBlock API using a 4-character hash prefix of the video ID.
- Remote code — No. All code ships in the package.

**Privacy practices tab:** no data types collected (queue, notes, groups and watch time stay in local / Chrome Sync storage; SponsorBlock gets only a hash prefix). Tick all three certifications. Privacy policy URL: public link to `PRIVACY.md`.

**Category:** Productivity. **Support URL:** https://github.com/thoughtlessmind/helm-youtube/issues

**Short description** (manifest, 118 chars): Hide Shorts, skip sponsors, keep one queue across tabs, group channels and remember speed per channel on youtube.com.

**Long description**

```
Helm takes the helm back from the algorithm. It adds the power-user features youtube.com is missing and hides the noise, with controls that sit in YouTube's own slots and match light and dark mode.

CLEAN UP YOUTUBE
• Hide Shorts everywhere: Home, search, sidebar, channel pages
• Focus mode: hide the Home feed, recommendations, comments, view counts (each optional)
• Feed filters: hide by title keyword, length, or already watched
• Grid density: choose videos per row
• Hide end-screen cards

PLAYBACK
• Default speed plus a remembered speed per channel
• Skip sponsors with SponsorBlock (optional), shown on the progress bar, with Undo
• Volume boost past 100% · A→B loop · Skip "Still watching?"

YOUR LIBRARY
• One queue shared by every YouTube tab and window; survives restarts and auto-advances
• Channel groups: pick a group on Home or Subscriptions to see just those channels' latest videos
• Private notes on any video
• Watch-time stats and a gentle daily reminder that never blocks

TOOLS
• Transcript download (.txt / .srt) · Frame screenshot (PNG) · Theme presets

Every feature switches on and off from the toolbar popup; features you turn off run no code. No account, no tracking, no analytics. Back up and restore your data as JSON.

Helm is an independent project, not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. YouTube is a trademark of Google LLC.
```
