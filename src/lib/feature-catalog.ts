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

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const CATALOG: CatalogSection[] = [
  {
    title: 'Feed',
    features: [
      {
        id: 'hide-shorts',
        label: 'Hide Shorts',
        desc: 'Removes Shorts from feed, sidebar, search, and channel pages.',
      },
      {
        id: 'focus-mode',
        label: 'Focus mode',
        desc: 'Hide the parts of YouTube that pull you into the next video.',
        config: [
          { key: 'recommendations', type: 'checkbox', label: 'Watch-page recommendations' },
          { key: 'comments', type: 'checkbox', label: 'Comments' },
          { key: 'metadata', type: 'checkbox', label: 'View counts & upload dates' },
        ],
      },
      {
        id: 'feed-filters',
        label: 'Feed filters',
        desc: 'Hide videos by title keyword, by length, or that you already watched.',
        config: [
          { key: 'keywords', type: 'text', label: 'Keywords', placeholder: 'clickbait, react, drama' },
          { key: 'minMinutes', type: 'number', label: 'Min minutes', placeholder: '0', min: 0, step: 1 },
          { key: 'maxMinutes', type: 'number', label: 'Max minutes', placeholder: '0', min: 0, step: 1 },
          {
            key: 'watched',
            type: 'select',
            label: 'Watched',
            options: [
              { value: 'show', label: 'Show' },
              { value: 'dim', label: 'Dim' },
              { value: 'hide', label: 'Hide' },
            ],
          },
        ],
      },
      {
        id: 'customize-grid',
        label: 'Grid density',
        desc: 'Pack more videos per row on the homepage and hide card info for a denser feed.',
        config: [
          { key: 'columnsPerRow', type: 'select', label: 'Columns', options: GRID_COLUMN_OPTIONS },
          { key: 'hideCardInfo', type: 'checkbox', label: 'Hide card info (title, channel, views)' },
        ],
      },
      {
        id: 'channel-groups',
        label: 'Channel groups',
        desc: 'Group channels (Favorites is a group) and filter Home and Subscriptions by group.',
      },
    ],
  },
  {
    title: 'Playback',
    features: [
      {
        id: 'playback-speed',
        label: 'Playback speed',
        desc: 'A default speed for every video, plus a remembered speed per channel.',
        config: [
          { key: 'rate', type: 'select', label: 'Default', options: SPEED_OPTIONS },
          { key: 'perChannel', type: 'checkbox', label: 'Remember speed per channel' },
        ],
      },
      {
        id: 'sponsorblock',
        label: 'SponsorBlock segments',
        desc: 'Shows the real watch time with crowd-sourced sponsor segments subtracted.',
      },
      {
        id: 'read-later-queue',
        label: 'Watch queue (Q)',
        desc: 'A read-later queue separate from Watch Later. Press Q to add, Shift+Q to open.',
      },
      {
        id: 'hide-end-screen-cards',
        label: 'Hide end-screen cards',
        desc: 'Removes the suggested-video overlay from the last 20s of videos.',
      },
      {
        id: 'auto-dismiss-still-watching',
        label: 'Auto-dismiss "Still watching?"',
        desc: "Auto-confirms YouTube's periodic playback-paused prompt.",
      },
      {
        id: 'volume-boost',
        label: 'Volume boost',
        desc: 'Push audio above 100% via Web Audio API gain.',
        config: [{ key: 'multiplier', type: 'select', options: BOOST_OPTIONS }],
      },
      {
        id: 'loop-section',
        label: 'A→B loop ([ ] \\)',
        desc: 'Press [ to set A, ] to set B, \\ to clear. Video loops between A→B.',
      },
    ],
  },
  {
    title: 'Notes & Stats',
    features: [
      {
        id: 'video-notes',
        label: 'Video notes',
        desc: 'Write and auto-save a private note for each video in a floating panel.',
      },
      {
        id: 'watch-time',
        label: 'Watch time',
        desc: 'Daily and weekly watch time, hours per channel, and an optional soft daily limit.',
        config: [
          {
            key: 'dailyLimitMinutes',
            type: 'select',
            label: 'Daily limit',
            options: [
              { value: 0, label: 'Off' },
              { value: 30, label: '30 min' },
              { value: 60, label: '1h' },
              { value: 90, label: '1h 30m' },
              { value: 120, label: '2h' },
              { value: 180, label: '3h' },
              { value: 240, label: '4h' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Tools',
    features: [
      {
        id: 'download-transcript',
        label: 'Transcript download',
        desc: "Download the current video's transcript as .txt or .srt.",
      },
      {
        id: 'screenshot-current-frame',
        label: 'Frame screenshot (S)',
        desc: 'Press S to download a PNG of the current frame, no overlay.',
      },
      {
        id: 'true-black-dark-mode',
        label: 'True black',
        desc: "Replaces YouTube's dark grey backgrounds with #000 for OLED.",
      },
    ],
  },
];

/** Flat list of every catalog entry, in section order. */
export const ALL_FEATURES: CatalogEntry[] = CATALOG.flatMap((s) => s.features);
