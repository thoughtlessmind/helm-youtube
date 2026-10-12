import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';

/**
 * Keyboard shortcut to toggle the current YouTube video into/out of
 * Picture-in-Picture (PiP).
 *
 * Key: `p` — YouTube's own player doesn't bind `p` (it uses
 * k/space=play, j=−10s, l=+10s, f=fullscreen, m=mute, c=captions,
 * t=theater, i=miniplayer, numbers=seek %).
 * `p` is free and mnemonic for "Picture-in-Picture".
 *
 * Behavior:
 *  - If the browser doesn't support PiP, show a toast and bail.
 *  - If no video element is found, show a toast and bail.
 *  - If a video is already in PiP (document.pictureInPictureElement),
 *    exit PiP (restores normal view).
 *  - Otherwise request PiP on the primary video element.
 *
 * No FeatureConfig — the feature is purely a hotkey with no tunable options.
 * No additional manifest permissions — PiP is a browser API available in
 * content-script context without any special permission.
 */

/** Primary video selector for the watch page player. */
const VIDEO_SEL = 'video.html5-main-video';

/** Fallback selector to catch any video on non-watch pages. */
const VIDEO_FALLBACK_SEL = 'video';

function findVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>(VIDEO_SEL) ??
    document.querySelector<HTMLVideoElement>(VIDEO_FALLBACK_SEL)
  );
}

async function togglePiP(): Promise<void> {
  // Guard: browser support
  if (!document.pictureInPictureEnabled) {
    flashToast('Picture-in-Picture not supported');
    return;
  }

  // If a video is already in PiP, exit it.
  if (document.pictureInPictureElement) {
    try {
      await document.exitPictureInPicture();
      flashToast('Exited Picture-in-Picture');
    } catch {
      flashToast('Could not exit Picture-in-Picture');
    }
    return;
  }

  const video = findVideo();
  if (!video) {
    flashToast('No video found');
    return;
  }

  try {
    await video.requestPictureInPicture();
    flashToast('Picture-in-Picture ▶');
  } catch {
    flashToast('Picture-in-Picture unavailable');
  }
}

const feature: Feature = {
  id: 'picture-in-picture',

  setup() {
    const stopKey = onKey('p', () => {
      void togglePiP();
    });

    return () => {
      stopKey();
    };
  },
};

export default feature;
