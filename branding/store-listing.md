# Chrome Web Store listing

Paste-ready answers for the Developer Dashboard, tab by tab. Upload `.output/helm-<version>-chrome.zip` from `npm run zip` first: the title and summary come from it.

## Package tab

Upload the zip. Nothing else to fill.

## Store listing tab

### Product details

**Title** (from the package): Helm for YouTube

**Summary** (from the package, 130 of 132 chars): One queue shared by every YouTube tab, themes that restyle the site, sponsor skipping, channel groups, per-channel speed and more.

**Description**

```
Take the helm back from the algorithm. Helm adds the features youtube.com is missing, starting with one queue for all your tabs, and lets you restyle the whole site. Its controls sit in YouTube's own slots and match light and dark mode.

ONE QUEUE FOR EVERY TAB
• One queue shared by every YouTube tab and window, kept through reloads and restarts
• Add with YouTube's own "Add to queue", the button on a thumbnail's hover preview, or Q
• Shows as a panel next to the video and plays the next one automatically
• Watched videos stay ticked until you clear them
• Play, skip, seek and reorder from the toolbar popup, from any tab

THEMES
• Restyle YouTube with a palette, font and corner radius: Nord, Rosé, Forest, Solarized, Sepia, OLED Black or Terminal
• Switch themes from the popup header

PLAYBACK
• Default speed plus a remembered speed for each channel
• Skip sponsors with SponsorBlock: segments show on the progress bar, and every skip has Undo
• Volume boost past 100% · A→B loop · Skip "Still watching?"

YOUR CHANNELS AND NOTES
• Channel groups: pick a group on Home or Subscriptions to see just those channels' latest videos
• Private notes on any video, saved automatically
• Watch-time stats and a gentle daily reminder that never blocks anything

CLEAN UP YOUTUBE
• Hide Shorts and Playables everywhere
• Focus mode: hide the Home feed, recommendations, comments or view counts (each optional)
• Feed filters: hide videos by title keyword, length, or already watched
• Grid density: choose how many videos fit in a row

TOOLS
• Save a transcript (.txt / .srt) or copy it · Save the current frame as a PNG

Every feature switches on and off from the toolbar popup, and features you turn off run no code. No account, no tracking, no analytics. Back up and restore all your data as a JSON file.

Sponsor segments: SponsorBlock (sponsor.ajay.app), CC BY-NC-SA 4.0.

Helm is an independent project, not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. YouTube is a trademark of Google LLC.
```

**Category:** Functionality & UI (under "Make Chrome Yours"). If the list differs, pick the closest match.

**Language:** English

### Graphic assets

| Field | File |
|---|---|
| Store icon (128×128) | `public/icon/128.png` |
| Screenshots (1280×800), in this order | `screenshots/3-queue.png`, `screenshots/1-themes.png`, `screenshots/4-popup.png`, `screenshots/5-group-feed.png`, `screenshots/2-custom-rows.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |
| Global promo video | Leave empty |

### Additional fields

- **Official URL:** None. It needs a domain verified in Search Console.
- **Homepage URL:** https://github.com/thoughtlessmind/helm-youtube
- **Support URL:** https://github.com/thoughtlessmind/helm-youtube/issues
- **Mature content:** No

## Privacy tab

**Single purpose** (max 1,000 chars):

```
Helm improves the youtube.com viewing experience. It adds controls YouTube lacks, such as a queue shared across tabs, themes, per-channel playback speed, sponsor skipping, channel groups, notes and watch-time stats. It also hides distractions like Shorts and recommendations. Everything works inside YouTube's own pages and the toolbar popup.
```

**Permission justifications**

`storage`:

```
Saves Helm's settings and data in Chrome storage: feature switches, the queue, notes, channel groups, per-channel speeds and watch-time totals. Only settings sync, through the user's own Chrome profile. Nothing is sent to the developer.
```

Host permission:

```
https://www.youtube.com/* : Helm adds its features to YouTube pages, and the popup shows and controls what is playing in open YouTube tabs. Channel groups load a channel's latest videos from youtube.com itself. To do so, Helm reads YouTube's own sign-in cookie (SAPISID) on youtube.com to sign those same-origin requests, and never stores it or sends it anywhere else.

https://sponsor.ajay.app/* : "Skip sponsors" (on by default, can be turned off) looks up crowd-sourced sponsor segments from the public SponsorBlock API. It sends only the first 4 characters of the SHA-256 hash of the video ID.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage.** Data handled on the device still has to be disclosed. Tick:

- **Authentication information:** the SAPISID cookie read above
- **Web history:** the per-channel watch-time log, watched videos kept in the queue until cleared, and the hash prefix sent to SponsorBlock
- **Website content:** video titles and channel names saved in the queue, and transcripts

Leave the others unticked: personally identifiable info, health, financial and payment, personal communications, location, user activity.

**Certifications:** tick all three.

**Privacy policy URL:** https://github.com/thoughtlessmind/helm-youtube/blob/main/PRIVACY.md (the repo must be public first).

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

## Test instructions tab

Username and password: leave empty.

Additional instructions:

```
No account or sign-in is needed. Open https://www.youtube.com and play any video.

- Queue: press Q on a watch page, or use the queue button on a thumbnail's hover preview. The queue panel appears next to the video, and the toolbar popup controls playback.
- Themes: open the popup, click Theme in the header and pick a preset.
- Skip sponsors: open a video with sponsor segments (for example https://www.youtube.com/watch?v=fr0WIIZxvx0, sponsor at 2:01). The segment shows on the progress bar and is skipped with an Undo option.
- Channel groups (off by default; turn on in popup → Settings): create a group from "New group" above the Home grid and pick it to see those channels' latest videos. Signed out, it works without watch progress. Signed in, Helm signs these youtube.com requests with YouTube's own SAPISID cookie and never stores or sends it elsewhere.

Every feature can be switched on or off in popup → Settings.
```

## If review objects to the icon

The red rounded square with a white forward mark reads close to YouTube's logo. Recolor `branding/icon.svg`, `icon-16.svg` and `icon-32.svg` to indigo `#3D4FD6` and regenerate `public/icon/*.png`.
