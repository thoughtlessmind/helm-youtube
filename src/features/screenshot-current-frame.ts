import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { isWatchPage } from '../lib/yt/video';
import { createHost } from '../lib/yt/ui';
import { PLAYER_CSS, fmtTime, getPlayer, getVideo, mountInPlayer, playerVideoId, tooltip } from '../lib/yt/player';

/**
 * Frame screenshot: `S` or the camera button in the player controls (board WatchPlayer) saves
 * the current frame as a PNG named `<videoId> <m-ss>.png`. The player flashes white and a toast
 * names the file. Works for YouTube's non-DRM streams; a tainted canvas shows "Frame protected".
 */

const CAMERA_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

/** Camera-shutter flash over the player (skipped with reduced motion). */
function flash(): void {
  const player = getPlayer();
  if (!player || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.createElement('ytp-host');
  el.style.cssText = 'position:absolute;inset:0;z-index:61;background:#fff;opacity:0;pointer-events:none';
  player.append(el);
  void el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' }).finished.then(() => el.remove());
}

function capture(): void {
  const video = getVideo();
  if (!isWatchPage() || !video) return; // `s` elsewhere is just a letter
  if (!video.videoWidth) return flashToast('No video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return flashToast('Canvas unavailable');
  const name = `${playerVideoId() ?? 'youtube'} ${fmtTime(video.currentTime).replaceAll(':', '-')}.png`;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    flash();
    canvas.toBlob((blob) => {
      if (!blob) return flashToast('Capture failed');
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flashToast(`Frame saved · ${name}`);
    }, 'image/png');
  } catch {
    flashToast('Frame protected');
  }
}

const feature: Feature = {
  id: 'screenshot-current-frame',
  setup(ctx) {
    const { host, root } = createHost('ytp-screenshot-btn', PLAYER_CSS + ':host{display:flex}.shot{width:48px}');
    const btn = document.createElement('button');
    btn.className = 'pb shot';
    btn.setAttribute('aria-label', 'Screenshot (S)');
    btn.setAttribute('aria-keyshortcuts', 's');
    btn.innerHTML = CAMERA_ICON;
    btn.addEventListener('click', capture);
    root.append(btn);
    tooltip(btn, () => 'Screenshot (S)');

    const offs = [mountInPlayer(ctx, host, 'controls-right', 2), onKey('s', capture)];
    return () => offs.forEach((off) => off());
  },
};

export default feature;
