import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'YouTube Pro',
    description: 'A better YouTube experience — power-user features layered on top of youtube.com.',
    permissions: ['storage'],
    host_permissions: ['*://*.youtube.com/*'],
  },
});
