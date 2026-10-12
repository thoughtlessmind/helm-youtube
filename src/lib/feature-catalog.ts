import type { FeatureFlags } from './settings';

/**
 * Single source of truth for the feature list shown in the toolbar popup
 * AND the in-page header menu. Both surfaces render from this catalog plus
 * a generic config renderer — so adding a feature is one entry here, never
 * a hand-written widget in two files.
 *
 * Adding a feature end to end:
 *   1. src/features/<id>.ts        — the Feature module
 *   2. src/lib/features.ts         — registry line
 *   3. src/lib/settings.ts         — FeatureFlags + FEATURE_DEFAULTS (+ config)
 *   4. this file                   — one CatalogEntry in the right section
 */

export interface SelectOption {
  value: string | number;
  label: string;
}

/**
 * A config control rendered under a feature row when it is enabled. `key`
 * maps into the feature's `FeatureConfig[id]` object. Numeric `select`
 * fields are detected from the option value types and coerced on write.
 */
export type ConfigField =
  | { key: string; type: 'select'; label?: string; options: SelectOption[] }
  | { key: string; type: 'checkbox'; label: string }
  | { key: string; type: 'text'; label?: string; placeholder?: string }
  | {
      key: string;
      type: 'number';
      label?: string;
      placeholder?: string;
      min?: number;
      max?: number;
      step?: number;
    };

export interface CatalogEntry {
  id: keyof FeatureFlags;
  label: string;
  desc: string;
  /** Controls shown when the feature is on. Omit for on/off-only features. */
  config?: ConfigField[];
}

export interface CatalogSection {
  title: string;
  features: CatalogEntry[];
}

// ─── Reusable option sets ─────────────────────────────────────────────────────

const SPEED_OPTIONS: SelectOption[] = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3,
].map((v) => ({ value: v, label: `${v}×` }));

const BOOST_OPTIONS: SelectOption[] = [1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((v) => ({
  value: v,
  label: `${Math.round(v * 100)}%`,
}));

const GRID_COLUMN_OPTIONS: SelectOption[] = [3, 4, 5, 6, 7, 8].map((v) => ({
  value: v,
  label: String(v),
}));

const THEME_OPTIONS: SelectOption[] = [
  { value: 'default', label: 'Default (YouTube)' },
  { value: 'dim', label: 'Dim' },
  { value: 'midnight-blue', label: 'Midnight Blue' },
  { value: 'nord', label: 'Nord' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'rose', label: 'Rose' },
];

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const CATALOG: CatalogSection[] = [
  {
    title: 'Feed & Discovery',
    features: [
      {
        id: 'hide-shorts',
        label: 'Hide Shorts',
        desc: 'Removes Shorts from feed, sidebar, search, and channel pages.',
      },
      {
        id: 'hide-metadata',
        label: 'Hide view counts & dates',
        desc: 'Reduce clickbait pull by hiding view counts and upload dates on thumbnails.',
      },
      {
        id: 'customize-grid',
        label: 'Customize grid',
        desc: 'Pack more videos per row on the homepage and hide card info for a denser feed.',
        config: [
          { key: 'columnsPerRow', type: 'select', label: 'Columns', options: GRID_COLUMN_OPTIONS },
          { key: 'hideCardInfo', type: 'checkbox', label: 'Hide card info (title, channel, views)' },
        ],
      },
      {
        id: 'thumbnail-save-button',
        label: 'Always-visible Watch Later',
        desc: 'Shows the Watch Later button on every thumbnail without needing to hover.',
      },
      {
        id: 'mute-channels',
        label: 'Mute channels',
        desc: 'Hide videos from specific channels in the feed and search without unsubscribing.',
      },
      {
        id: 'block-keywords',
        label: 'Block by keyword',
        desc: 'Hide videos whose title contains any blocked keyword.',
        config: [
          { key: 'keywords', type: 'text', label: 'Keywords', placeholder: 'clickbait, react, drama' },
        ],
      },
      {
        id: 'block-by-length',
        label: 'Block by length',
        desc: 'Hide videos shorter or longer than your preferred length. Live & Shorts are kept.',
        config: [
          { key: 'minMinutes', type: 'number', label: 'Min minutes', placeholder: '0', min: 0, step: 1 },
          { key: 'maxMinutes', type: 'number', label: 'Max minutes', placeholder: '0', min: 0, step: 1 },
        ],
      },
      {
        id: 'flag-watched',
        label: 'Flag watched videos',
        desc: 'Dim (or hide) videos you have already watched across feed, search, and sidebar.',
        config: [
          {
            key: 'mode',
            type: 'select',
            label: 'Mode',
            options: [
              { value: 'dim', label: 'Dim watched videos' },
              { value: 'hide', label: 'Hide watched videos' },
            ],
          },
        ],
      },
      {
        id: 'custom-dashboards',
        label: 'Custom dashboards',
        desc: 'Group channels into named dashboards and filter the homepage to one at a time.',
      },
    ],
  },
  {
    title: 'Subscriptions',
    features: [
      {
        id: 'favorite-channels',
        label: 'Favorite channels',
        desc: 'Star channels to pin them to the top of the subscriptions sidebar.',
      },
      {
        id: 'subscription-folders',
        label: 'Subscription folders',
        desc: 'Group channels into folders and filter the Subscriptions feed by folder.',
      },
    ],
  },
  {
    title: 'Watch Page',
    features: [
      {
        id: 'hide-end-screen-cards',
        label: 'Hide end-screen cards',
        desc: 'Removes the suggested-video overlay from the last 20s of videos.',
      },
      {
        id: 'hide-watch-page-sidebar',
        label: 'Hide watch-page sidebar',
        desc: 'Removes the right-rail recommendations while watching a video.',
      },
      {
        id: 'hide-up-next-panel',
        label: 'Hide "Up next" panel',
        desc: 'Removes the in-player autoplay countdown overlay.',
      },
      {
        id: 'hide-comments-by-default',
        label: 'Hide comments',
        desc: 'Hide the comments section on watch pages.',
      },
      {
        id: 'disable-autoplay',
        label: 'Disable autoplay',
        desc: 'Turns off the autoplay toggle on every watch page.',
      },
      {
        id: 'distraction-free-mode',
        label: 'Distraction-free mode',
        desc: 'On watch pages, hide everything except the player and title.',
      },
    ],
  },
  {
    title: 'Player',
    features: [
      {
        id: 'sticky-mini-player',
        label: 'Sticky mini-player',
        desc: 'Keep the video docked in a corner while you scroll through comments.',
        config: [
          {
            key: 'corner',
            type: 'select',
            label: 'Corner',
            options: [
              { value: 'bottom-right', label: 'Bottom-right' },
              { value: 'bottom-left', label: 'Bottom-left' },
            ],
          },
        ],
      },
      {
        id: 'resize-player',
        label: 'Resize player',
        desc: 'Set the watch-page player to a preferred width.',
        config: [
          {
            key: 'width',
            type: 'select',
            label: 'Player width',
            options: [
              { value: 'default', label: 'Default' },
              { value: 'narrow', label: 'Narrow' },
              { value: 'wide', label: 'Wide' },
              { value: 'full', label: 'Full width' },
            ],
          },
        ],
      },
      {
        id: 'picture-in-picture',
        label: 'Picture-in-picture (P)',
        desc: 'Press P to pop the video into a floating Picture-in-Picture window.',
      },
    ],
  },
  {
    title: 'Playback',
    features: [
      {
        id: 'default-playback-speed',
        label: 'Default playback speed',
        desc: 'Force every video to start at your preferred speed.',
        config: [{ key: 'rate', type: 'select', options: SPEED_OPTIONS }],
      },
      {
        id: 'persistent-volume',
        label: 'Persistent volume',
        desc: 'Restore your last volume on every video.',
      },
      {
        id: 'volume-boost',
        label: 'Volume boost',
        desc: 'Push audio above 100% via Web Audio API gain.',
        config: [{ key: 'multiplier', type: 'select', options: BOOST_OPTIONS }],
      },
      {
        id: 'loop-section',
        label: 'Loop section ([ ] \\)',
        desc: 'Press [ to set A, ] to set B, \\ to clear. Video loops between A→B.',
      },
      {
        id: 'auto-dismiss-still-watching',
        label: 'Auto-dismiss "Still watching?"',
        desc: "Auto-confirms YouTube's periodic playback-paused prompt.",
      },
    ],
  },
  {
    title: 'Per-Channel',
    features: [
      {
        id: 'per-channel-speed',
        label: 'Per-channel playback speed',
        desc: 'Remembers your playback speed for each channel and applies it automatically.',
      },
      {
        id: 'per-channel-skip-segments',
        label: 'Per-channel skip segments',
        desc: 'Auto-skip intros and outros per channel. Set durations from the in-page control.',
        config: [
          { key: 'showControl', type: 'checkbox', label: 'Show in-page editor on watch pages' },
        ],
      },
    ],
  },
  {
    title: 'Insights',
    features: [
      {
        id: 'sponsorblock',
        label: 'SponsorBlock segments',
        desc: 'Shows the real watch time with crowd-sourced sponsor segments subtracted.',
      },
      {
        id: 'dislike-count',
        label: 'Dislike count',
        desc: 'Restores the dislike count using the Return YouTube Dislike community API.',
      },
      {
        id: 'reading-time',
        label: 'Reading-time equivalent',
        desc: 'Shows how long the video would take to read — a quick sense of density.',
      },
      {
        id: 'transcript-panel',
        label: 'Transcript panel (T)',
        desc: 'A clickable, searchable transcript side panel that follows playback.',
      },
      {
        id: 'download-transcript',
        label: 'Download transcript',
        desc: "Download the current video's transcript as .txt or .srt.",
      },
    ],
  },
  {
    title: 'AI (on-device)',
    features: [
      {
        id: 'ai-summarize',
        label: 'AI summary',
        desc: 'Summarize any video with Chrome on-device AI — no internet or API key needed.',
      },
      {
        id: 'ai-chapters',
        label: 'AI chapters',
        desc: 'Auto-detect clickable chapter markers in any video using on-device AI.',
      },
      {
        id: 'ai-ask',
        label: 'Ask the video',
        desc: 'Chat with the current video — answers cite jump-to timestamps. On-device AI.',
      },
    ],
  },
  {
    title: 'Analytics',
    features: [
      {
        id: 'watch-analytics',
        label: 'Watch analytics',
        desc: 'Dashboard with daily/weekly watch time, a 7-day chart, and most-watched channels.',
      },
      {
        id: 'channel-watch-stat',
        label: 'Channel watch time',
        desc: "Shows how much time you've watched on each channel's page.",
      },
      {
        id: 'channel-stats',
        label: 'Channel stats',
        desc: 'Upload frequency, average length, and video count on channel pages.',
      },
      {
        id: 'watch-goals',
        label: 'Daily watch limit',
        desc: 'A soft, non-blocking reminder when today exceeds your daily watch limit.',
        config: [
          {
            key: 'dailyLimitMinutes',
            type: 'select',
            label: 'Daily limit',
            options: [
              { value: 30, label: '30 min' },
              { value: 60, label: '1h' },
              { value: 90, label: '1h 30m' },
              { value: 120, label: '2h' },
              { value: 180, label: '3h' },
              { value: 240, label: '4h' },
              { value: 0, label: 'Off' },
            ],
          },
        ],
      },
      {
        id: 'history-search',
        label: 'History search & filter',
        desc: 'Filter watch history by title, channel, length, and upload date.',
      },
    ],
  },
  {
    title: 'Video Tools',
    features: [
      {
        id: 'multi-video-grid',
        label: 'Multi-video grid (G)',
        desc: 'Watch up to 4 videos at once in a 1×1 / 2×1 / 2×2 grid; focus a cell to mute the rest.',
      },
      {
        id: 'compare-videos',
        label: 'Compare videos (V)',
        desc: 'Two videos side-by-side with synced Play / Pause / Restart.',
      },
    ],
  },
  {
    title: 'Notes & Library',
    features: [
      {
        id: 'video-tags',
        label: 'Video tags',
        desc: 'Attach custom text tags to any video and browse your personal tag library.',
      },
      {
        id: 'video-notes',
        label: 'Video notes',
        desc: 'Write and auto-save a private note for each video in a floating panel.',
      },
      {
        id: 'read-later-queue',
        label: 'Watch queue (Q)',
        desc: 'A read-later queue separate from Watch Later. Press Q to add, Shift+Q to open.',
      },
      {
        id: 'bulk-watch-later',
        label: 'Bulk Watch Later',
        desc: 'Sort, filter, bulk-delete, and export your Watch Later playlist.',
      },
    ],
  },
  {
    title: 'Shortcuts',
    features: [
      {
        id: 'copy-timestamped-link',
        label: 'Copy timestamped link (Y)',
        desc: 'Press Y on a video to copy a link to the current playback position.',
      },
      {
        id: 'screenshot-current-frame',
        label: 'Screenshot frame (S)',
        desc: 'Press S to download a PNG of the current frame, no overlay.',
      },
      {
        id: 'save-to-playlist',
        label: 'Save to playlist (W)',
        desc: 'Press W on a watch page to toggle the video into the named playlist.',
        config: [
          { key: 'playlistName', type: 'text', label: 'Playlist', placeholder: 'Watch later' },
        ],
      },
    ],
  },
  {
    title: 'Appearance',
    features: [
      {
        id: 'true-black-dark-mode',
        label: 'True black dark mode',
        desc: "Replaces YouTube's dark grey backgrounds with #000 for OLED.",
      },
      {
        id: 'theme-presets',
        label: 'Theme presets',
        desc: 'Recolor YouTube with a curated palette (Dim, Nord, Dracula, Sepia, Rose…).',
        config: [{ key: 'preset', type: 'select', label: 'Preset', options: THEME_OPTIONS }],
      },
    ],
  },
];

/** Flat list of every catalog entry, in section order. */
export const ALL_FEATURES: CatalogEntry[] = CATALOG.flatMap((s) => s.features);
