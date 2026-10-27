# Helm for YouTube — Privacy Policy

_Last updated: 27 October 2026_

Helm has no account, no server and no analytics. The developer receives no data from you.

## What Helm stores

These stay in your browser's extension storage:

- your settings (feature switches, speeds, feed-filter keywords)
- the queue (video IDs, titles, channel names, lengths, and when each was watched) and your video notes. Watched videos stay in the queue until you clear them, including a video you open in place of a queued one
- channel groups, plus a cache of channel handles and their IDs
- per-channel playback speeds
- watch time: daily totals per channel for the last 90 days, and all-time totals per channel (no list of videos)

Settings sync between your own devices through your Chrome profile (Chrome Sync); everything else stays on this device. While a YouTube tab is open, the channel group you picked on a feed is also kept in that tab's session storage. You can export everything from the popup (Settings → Backup), and removing the extension deletes it.

## Requests Helm makes

| Destination | What is sent | When |
|---|---|---|
| `www.youtube.com` (oEmbed) | A video ID | Adding a video to the queue when its title isn't on the page |
| `www.youtube.com` (channel pages, `/youtubei/v1/browse`) | A channel handle or ID | Showing a channel group on Home or Subscriptions |
| `i.ytimg.com` | A video ID | Thumbnails in the popup, the queue panel and Focus mode's Home |
| `sponsor.ajay.app` (SponsorBlock) | The first 4 characters of the video ID's SHA-256 hash, and the segment categories to look up | Each video you watch while **Skip sponsors** is on (on by default; switch it off in the popup) |

Requests to YouTube go to the same service you are already using. Channel-group requests are signed with your existing YouTube sign-in, so videos you have watched show as watched: Helm reads YouTube's sign-in cookie on youtube.com, as YouTube's own page does, and never stores it or sends it anywhere else.

The SponsorBlock request never contains the video ID itself: SponsorBlock answers for every video sharing that hash prefix and Helm picks out the one you're watching. Like any web request it includes your IP address. See [SponsorBlock's privacy policy](https://wiki.sponsor.ajay.app/w/Privacy_Policy).

## What Helm does not do

Apart from Chrome Sync and the requests above, nothing Helm stores leaves your browser. Helm does not sell or share personal information, browsing history or sign-in data, sends nothing to the developer, and uses your data only for the features above.

## Contact

[github.com/thoughtlessmind/helm-youtube/issues](https://github.com/thoughtlessmind/helm-youtube/issues)

Helm is not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. YouTube is a trademark of Google LLC.
