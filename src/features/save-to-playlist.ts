import type { Feature } from '../lib/features';
import { onKey } from '../lib/yt/keys';
import { flashToast } from '../lib/yt/toast';
import { getConfig, watchConfig } from '../lib/settings';

declare module '../lib/settings' {
  interface FeatureConfig {
    'save-to-playlist': { playlistName: string };
  }
}

/**
 * Press `W` on a watch page to toggle the current video into Watch Later
 * (or any playlist by name, configurable). Drives YouTube's own Save
 * dialog: clicks Save → finds the matching row → toggles its checkbox →
 * closes the dialog. Cheaper than the YT Data API and needs no OAuth.
 */

const SAVE_BUTTON_SELECTORS = [
  'ytd-watch-metadata #actions button[aria-label*="Save" i]',
  'ytd-watch-metadata button[aria-label*="Save" i]',
  '#actions button[aria-label*="Save" i]',
  'ytd-menu-renderer button[aria-label*="Save" i]',
];

function findSaveButton(): HTMLElement | null {
  for (const sel of SAVE_BUTTON_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  // Fallback: scan all buttons in the watch metadata for one labelled Save.
  const all = document.querySelectorAll<HTMLElement>('ytd-watch-metadata button');
  for (const el of all) {
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    if (label === 'save' || label.startsWith('save ')) return el;
  }
  return null;
}

async function waitFor<T extends Element>(
  sel: string,
  ms = 2000,
): Promise<T | null> {
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const el = document.querySelector<T>(sel);
      if (el) return resolve(el);
      if (performance.now() - start > ms) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function findPlaylistRow(name: string): HTMLElement | null {
  const target = name.toLowerCase().trim();
  const rows = document.querySelectorAll<HTMLElement>(
    'ytd-playlist-add-to-option-renderer',
  );
  for (const row of rows) {
    const label = row
      .querySelector<HTMLElement>('#label, yt-formatted-string#label')
      ?.textContent?.trim()
      .toLowerCase();
    if (label === target) return row;
  }
  return null;
}

function rowChecked(row: HTMLElement): boolean {
  const cb = row.querySelector<HTMLElement>('tp-yt-paper-checkbox');
  if (!cb) return false;
  return (
    cb.getAttribute('aria-checked') === 'true' || cb.hasAttribute('checked')
  );
}

function closeDialog() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
}

async function saveCurrentVideo(playlistName: string) {
  if (!location.pathname.startsWith('/watch')) {
    flashToast('Open a video first');
    return;
  }
  const saveBtn = findSaveButton();
  if (!saveBtn) {
    flashToast('Save button not found');
    return;
  }
  saveBtn.click();

  const dialog = await waitFor<HTMLElement>(
    'ytd-add-to-playlist-renderer ytd-playlist-add-to-option-renderer',
    2500,
  );
  if (!dialog) {
    flashToast('Save dialog did not open');
    return;
  }

  const row = findPlaylistRow(playlistName);
  if (!row) {
    closeDialog();
    flashToast(`"${playlistName}" not found`);
    return;
  }

  const wasChecked = rowChecked(row);
  if (!wasChecked) {
    const cb = row.querySelector<HTMLElement>('tp-yt-paper-checkbox') ?? row;
    cb.click();
  }
  closeDialog();
  flashToast(
    wasChecked ? `Already in ${playlistName}` : `Saved to ${playlistName}`,
  );
}

const feature: Feature = {
  id: 'save-to-playlist',
  async setup() {
    let { playlistName } = await getConfig('save-to-playlist');
    const stopWatch = watchConfig('save-to-playlist', (v) => {
      playlistName = v.playlistName;
    });
    const stopKey = onKey('w', () => {
      saveCurrentVideo(playlistName.trim() || 'Watch later');
    });
    return () => {
      stopKey();
      stopWatch();
    };
  },
};

export default feature;
