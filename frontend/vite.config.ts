import react from '@vitejs/plugin-react';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const cacheDir = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'medicare-hub-vite',
);

export default defineConfig({
  cacheDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
