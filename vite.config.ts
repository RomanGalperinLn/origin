import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // The Node server holds the API keys; the browser only talks to /api.
    proxy: { '/api': 'http://localhost:8787' },
  },
  worker: { format: 'es' },
});
