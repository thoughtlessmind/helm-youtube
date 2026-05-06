import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'YouTube Pro',
    description: 'A better YouTube experience — power-user features layered on top of youtube.com.',
    permissions: ['storage'],
    host_permissions: ['*://*.youtube.com/*'],
  },
});
