import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to FastAPI to avoid CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  test: { environment: 'jsdom', globals: true },
});
