import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // Lets a test build use its own output dir (YTP_OUT_DIR=/tmp/... wxt build). One build at a time:
  // each rewrites .wxt/tsconfig.json, and two at once can corrupt it.
  outDir: process.env.YTP_OUT_DIR ?? '.output',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Helm for YouTube',
    short_name: 'Helm',
    description:
      'Hide Shorts, skip sponsors, keep one queue across tabs, group channels and remember speed per channel on youtube.com.',
    // URL.parse (126), CSS anchor positioning (125), MAIN-world content scripts (111).
    minimum_chrome_version: '126',
    permissions: ['storage'],
    host_permissions: [
      // www only: Music, Studio and mobile have their own UIs (and Music its own player).
      'https://www.youtube.com/*',
      // SponsorBlock feature — crowd-sourced sponsor segment lookups.
      'https://sponsor.ajay.app/*',
    ],
  },
});
