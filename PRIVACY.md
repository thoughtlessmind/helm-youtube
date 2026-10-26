# Helm for YouTube — Privacy Policy

_Last updated: 26 October 2026_

Helm has no account, no server and no analytics. The developer receives no data from you.

## What Helm stores

Your settings, queue, video notes, channel groups, per-channel speeds and watch-time totals are kept in your browser's extension storage. Settings sync between your own devices through your Chrome profile (Chrome Sync). You can export everything from the popup (Settings → Backup), and removing the extension deletes it.

## Requests Helm makes

| Destination | What is sent | When |
|---|---|---|
| `www.youtube.com` (oEmbed) | A video ID | Adding a video to the queue when its title isn't on the page |
| `www.youtube.com` (channel pages, `/youtubei/v1/browse`) | A channel handle or ID | Picking a channel group on Home or Subscriptions |
| `i.ytimg.com` | A video ID | Thumbnails in the toolbar popup |
| `sponsor.ajay.app` (SponsorBlock) | The first 4 characters of a hash of the video ID | Each video you watch, only while **Skip sponsors** is on (off by default) |

Requests to YouTube go to the same service you are already using. Channel-group requests use your existing YouTube sign-in so videos you have watched show as watched; your sign-in cookies are read only on youtube.com and never stored or sent anywhere else.

The SponsorBlock request never contains the video ID itself: SponsorBlock answers for every video sharing that hash prefix and Helm picks out the one you're watching. Like any web request it includes your IP address. See [SponsorBlock's privacy policy](https://wiki.sponsor.ajay.app/w/Privacy_Policy).

## What Helm does not do

Helm does not collect, sell or share personal information, browsing history or authentication credentials, and does not use your data for anything other than the features above.

## Contact

[github.com/thoughtlessmind/helm-youtube/issues](https://github.com/thoughtlessmind/helm-youtube/issues)

Helm is not affiliated with, endorsed by, or sponsored by YouTube or Google LLC. YouTube is a trademark of Google LLC.
