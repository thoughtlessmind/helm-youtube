import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';

/**
 * Press `S` to download a PNG of the current video frame, no UI overlay.
 *
 * Uses an offscreen canvas. Filename includes the video id (from the v=
 * param) and the integer second so multiple shots from the same video
 * are distinguishable.
 *
 * Note: works for non-DRM streams (the public YouTube CDN). If the
 * canvas is tainted (rare on YT.com proper), we surface a toast.
 */

function videoIdFromURL(): string {
  const url = new URL(location.href);
  return url.searchParams.get('v') ?? 'youtube';
}

const feature: Feature = {
  id: 'screenshot-current-frame',
  setup() {
    return onKey('s', () => {
      const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
      if (!video || !video.videoWidth) {
        flashToast('No video');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        flashToast('Canvas unavailable');
        return;
      }
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return flashToast('Capture failed');
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = `${videoIdFromURL()}-${Math.floor(video.currentTime)}s.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          flashToast('Frame saved');
        }, 'image/png');
      } catch {
        flashToast('Frame protected');
      }
    });
  },
};

export default feature;
