# Chrome Web Store listing

Paste-ready answers for the Developer Dashboard. Assets are in this folder: `public/icon/128.png` (icon), `screenshots/` (1280×800), `promo-small-440x280.png`, `promo-marquee-1400x560.png`.

**Single purpose:** Helm improves the youtube.com viewing experience: it adds controls YouTube lacks (queue, channel groups, playback speed, sponsor skipping, notes, watch time) and hides distractions (Shorts, recommendations), all inside YouTube's own pages.

**Permission justifications**
- `storage`: Saves Helm's settings and data in Chrome storage: feature switches, the queue, notes, channel groups, per-channel speeds and watch-time totals. Only settings sync through the user's own Chrome profile. Nothing is sent to the developer.
- Host permissions (one field): `https://www.youtube.com/*`: Helm adds its features to YouTube pages, and the popup shows and controls what is playing in open YouTube tabs. Channel groups load a channel's latest videos from youtube.com itself; to do so Helm reads YouTube's own sign-in cookie (SAPISID) on youtube.com to sign those same-origin requests, and never stores it or sends it anywhere else. `https://sponsor.ajay.app/*`: "Skip sponsors" (on by default, can be turned off) looks up crowd-sourced sponsor segments from the public SponsorBlock API, sending only the first 4 characters of the SHA-256 hash of the video ID.
- Remote code: No. All code ships in the package.

**Privacy practices tab:** Data handled on the device still has to be disclosed. Tick:
- Authentication information (the SAPISID cookie read above)
- Web history (per-channel watch-time log; the hash prefix sent to SponsorBlock)
- Website content (video titles and channel names saved in the queue, transcripts)

Then tick all three certifications. Privacy policy URL: https://github.com/thoughtlessmind/helm-youtube/blob/main/PRIVACY.md (needs the repo public and `PRIVACY.md` on `main`).

**Other fields:** Category: Productivity (pick the closest sub-category the dashboard offers, e.g. "Functionality & UI"). Language: English. Mature content: No. Support URL: https://github.com/thoughtlessmind/helm-youtube/issues. Homepage: the repo.

**Short description** (manifest, 117 chars): Hide Shorts, skip sponsors, keep one queue across tabs, group channels and remember speed per channel on youtube.com.

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
• Skip sponsors with SponsorBlock, shown on the progress bar, with Undo
• Volume boost past 100% · A→B loop · Skip "Still watching?"

YOUR LIBRARY
• One queue shared by every YouTube tab and window; survives restarts and auto-advances
• Channel groups: pick a group on Home or Subscriptions to see just those channels' latest videos
• Private notes on any video
• Watch-time stats and a gentle daily reminder that never blocks

TOOLS
• Save transcript (.txt / .srt) · Frame screenshot (PNG) · Theme presets

Every feature switches on and off from the toolbar popup; features you turn off run no code. No account, no tracking, no analytics. Back up and restore your data as JSON.

Sponsor segments: SponsorBlock (sponsor.ajay.app), CC BY-NC-SA 4.0.

Helm is an independent project, not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. YouTube is a trademark of Google LLC.
```

**If review objects to the icon** (red rounded square with a white forward mark reads close to YouTube's): recolor `branding/icon.svg`, `icon-16.svg`, `icon-32.svg` to indigo `#3D4FD6` and regenerate `public/icon/*.png`.
