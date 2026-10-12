import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // Lets parallel test builds use their own output dir (YTP_OUT_DIR=/tmp/... wxt build).
  outDir: process.env.YTP_OUT_DIR ?? '.output',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'YouTube Pro',
    description: 'A better YouTube experience — power-user features layered on top of youtube.com.',
    permissions: ['storage'],
    host_permissions: [
      '*://*.youtube.com/*',
      // SponsorBlock feature — crowd-sourced sponsor segment lookups.
      'https://sponsor.ajay.app/*',
    ],
  },
});
