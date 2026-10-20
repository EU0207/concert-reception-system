import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: ['es2023', 'safari17'], sourcemap: false, modulePreload: { polyfill: false } },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
