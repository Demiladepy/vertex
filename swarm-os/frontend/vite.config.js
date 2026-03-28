import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker the frontend container talks to the `backend` service.
// In local dev it's localhost.  Set BACKEND_HOST in the environment to override.
const BACKEND_HOST = process.env.BACKEND_HOST ?? 'localhost';

export default defineConfig({
  plugins: [react()],
  server: {
    port:            5173,
    strictPort:      true,
    proxy: {
      '/api': {
        target:      `http://${BACKEND_HOST}:3001`,
        changeOrigin: true,
      },
      '/ws': {
        target:      `ws://${BACKEND_HOST}:3001`,
        ws:           true,
        changeOrigin: true,
      },
    },
  },
});
