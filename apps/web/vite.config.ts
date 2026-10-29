import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = `http://localhost:${process.env.SERVER_PORT ?? 8080}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Keep the browser's Host header so the server's same-origin check passes in dev.
    proxy: {
      '/api': { target, changeOrigin: false },
      '/media': { target, changeOrigin: false },
      '/ws': { target, ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
});
