import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.ALMANAC_PORT ?? 4321);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
      '/media': `http://127.0.0.1:${apiPort}`,
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
