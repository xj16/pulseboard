import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The dev server proxies /socket.io and /api to the Node backend so the
// client can be developed on :5173 while the server runs on :4000.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
