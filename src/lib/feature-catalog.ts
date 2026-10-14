import type { FeatureConfig, FeatureFlags } from './settings';

/**
 * The feature list exactly as the popup's Settings board draws it: sections,
 * per-feature copy and icon, and the controls shown under a feature while it
 * is on. Settings renders from this; FirstRun reuses the icons.
 */

export type FeatureId = keyof FeatureFlags;
export type ConfigId = keyof FeatureConfig;

export interface Option {
  value: number;
  label: string;
}

/** Controls, rendered in this order inside the feature's options panel. Keys are `FeatureConfig[id]` keys, kept loose. */
export type Control =
  | { type: 'checks'; items: { key: string; label: string }[] }
  | { type: 'chips'; label: string; items: { key: string; label: string }[] }
  | { type: 'select'; key: string; label: string; options: Option[] }
  | { type: 'keywords'; key: string; label: string; placeholder: string }
  | { type: 'length'; minKey: string; maxKey: string; label: string }
  | { type: 'manage-groups' }
  /** Swatch-card radiogroup over `THEMES`; stores the theme id. */
  | { type: 'themes'; key: string; label: string }
  /** Today / This week from the watch-time log. */
  | { type: 'watch-stats' };

export interface CatalogEntry {
  id: FeatureId;
  name: string;
  desc: string;
  /** SVG path data, 24×24 viewBox, stroked. */
  icon: string;
  controls?: Control[];
}

export interface CatalogSection {
  title: string;
  features: CatalogEntry[];
}

const opts = (pairs: [number, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG: CatalogSection[] = [
  {
    title: 'Clean up YouTube',
    features: [
      { id: 'hide-shorts', name: 'Hide Shorts', desc: 'Remove Shorts from Home, search, sidebar and channel pages.',
        icon: 'M3 3l18 18M8 3h8a2 2 0 0 1 2 2v9M18 18v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6' },
      {
        id: 'focus-mode',
        name: 'Focus mode',
        desc: 'Hide the parts of YouTube built to keep you scrolling.',
        icon: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
        controls: [
          {
            type: 'checks',
            items: [
              { key: 'homeFeed', label: 'Home feed' },
              { key: 'recommendations', label: 'Recommendations next to videos' },
              { key: 'comments', label: 'Comments' },
              { key: 'metadata', label: 'View counts and upload dates' },
            ],
          },
        ],
      },
      {
        id: 'feed-filters',
        name: 'Feed filters',
        desc: 'Hide videos by keyword, by length, or once watched.',
        icon: 'M4 5h16l-6 7.5V19l-4 2v-8.5z',
        controls: [
          { type: 'keywords', key: 'keywords', label: 'Keywords', placeholder: 'drama, reaction' },
          { type: 'length', minKey: 'minMinutes', maxKey: 'maxMinutes', label: 'Length, minutes' },
          { type: 'checks', items: [{ key: 'hideWatched', label: 'Hide videos I’ve watched' }] },
        ],
      },
      {
        id: 'customize-grid',
        name: 'Grid density',
        desc: 'Choose how many videos fit in a row on Home.',
        icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
        controls: [
          {
            type: 'select',
            key: 'columnsPerRow',
            label: 'Videos per row',
            options: opts([[0, 'Reset'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8']]),
          },
        ],
      },
      { id: 'hide-end-screen-cards', name: 'Hide end-screen cards', desc: 'No video tiles covering the last seconds.',
        icon: 'M3 5h18v14H3zM12 12h6v4h-6z' },
    ],
  },
  {
    title: 'Playback',
    features: [
      {
        id: 'playback-speed',
        name: 'Playback speed',
        desc: 'Start at your speed, and remember one per channel.',
        icon: 'M12 14l4-4M4.9 19a9 9 0 1 1 14.2 0',
        controls: [
          {
            type: 'select',
            key: 'rate',
            label: 'Default speed',
            options: opts([[1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [1.75, '1.75×'], [2, '2×']]),
          },
          { type: 'checks', items: [{ key: 'perChannel', label: 'Remember speed for each channel' }] },
        ],
      },
      {
        id: 'sponsorblock',
        name: 'Skip sponsors',
        desc: 'Auto-skip sponsor reads and filler, via SponsorBlock.',
        icon: 'M5 5l9 7-9 7zM19 5v14',
        controls: [
          {
            type: 'chips',
            label: 'Skip these segments',
            items: [
              { key: 'sponsor', label: 'Sponsor' },
              { key: 'selfpromo', label: 'Self-promo' },
              { key: 'interaction', label: 'Like/subscribe asks' },
              { key: 'intro', label: 'Intros' },
              { key: 'outro', label: 'Outros' },
            ],
          },
        ],
      },
      {
        id: 'volume-boost',
        name: 'Volume boost',
        desc: 'Go past 100% on quiet videos.',
        icon: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
        controls: [
          {
            type: 'select',
            key: 'multiplier',
            label: 'Boost to',
            options: opts([[1.25, '125%'], [1.5, '150%'], [2, '200%'], [3, '300%']]),
          },
        ],
      },
      { id: 'auto-dismiss-still-watching', name: 'Skip “Still watching?”', desc: 'Keep playing without the pause prompt.',
        icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0' },
      { id: 'loop-section', name: 'A→B loop', desc: 'Loop a section. [ sets the start, ] the end, \\ clears.',
        icon: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3' },
    ],
  },
  {
    title: 'Your library',
    features: [
      {
        id: 'read-later-queue',
        name: 'Queue',
        desc: 'One queue for every YouTube tab, kept after reload.',
        icon: 'M3 6h12M3 12h12M3 18h8M17 15l5 3-5 3z',
        controls: [
          {
            type: 'checks',
            items: [
              { key: 'autoAdvance', label: 'Play the next queued video when one ends' },
              { key: 'nativeAdd', label: 'Send YouTube’s “Add to queue” here' },
            ],
          },
        ],
      },
      {
        id: 'channel-groups',
        name: 'Channel groups',
        desc: 'Group channels and filter your feed by group.',
        icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        controls: [{ type: 'manage-groups' }],
      },
      { id: 'video-notes', name: 'Video notes', desc: 'Keep a private note on any video.',
        icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h4' },
    ],
  },
  {
    title: 'Watch time',
    features: [
      {
        id: 'watch-time',
        name: 'Watch time',
        desc: 'Daily and weekly stats, with a gentle daily limit.',
        icon: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
        controls: [
          { type: 'watch-stats' },
          {
            type: 'select',
            key: 'dailyLimitMinutes',
            label: 'Daily limit',
            options: opts([[0, 'Off'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h']]),
          },
        ],
      },
    ],
  },
  {
    title: 'Tools and appearance',
    features: [
      { id: 'download-transcript', name: 'Transcript download', desc: 'Save a video’s transcript as .txt or .srt.',
        icon: 'M4 5h16M4 10h16M4 15h8M17 13v8M14 18l3 3 3-3' },
      { id: 'screenshot-current-frame', name: 'Frame screenshot', desc: 'Press S to save the current frame as a PNG.',
        icon: 'M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 13m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0' },
      {
        id: 'theme',
        name: 'Theme',
        desc: 'Recolor YouTube: palette, font and corners.',
        icon: 'M12 3a9 9 0 0 0 0 18c1 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
        controls: [{ type: 'themes', key: 'preset', label: 'Theme' }],
      },
    ],
  },
];

/** Flat list of every catalog entry, in section order. */
export const ALL_FEATURES: CatalogEntry[] = CATALOG.flatMap((s) => s.features);
