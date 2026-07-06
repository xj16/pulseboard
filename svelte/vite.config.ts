import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Mirrors the Vue client's proxy so the Svelte build talks to the same server.
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
