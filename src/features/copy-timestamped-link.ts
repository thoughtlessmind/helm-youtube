import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';

/**
 * Press `Y` to copy a YouTube link with `&t=<seconds>s` appended,
 * pointing at the current playback position.
 */

function buildTimestampedURL(): string | null {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return null;
  const url = new URL(location.href);
  // Strip any existing time params so we don't stack them.
  url.searchParams.delete('t');
  url.searchParams.delete('time_continue');
  const seconds = Math.max(0, Math.floor(video.currentTime));
  url.searchParams.set('t', `${seconds}s`);
  return url.toString();
}

const feature: Feature = {
  id: 'copy-timestamped-link',
  setup() {
    return onKey('y', async () => {
      const url = buildTimestampedURL();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        flashToast('Link copied');
      } catch {
        flashToast('Copy failed');
      }
    });
  },
};

export default feature;
