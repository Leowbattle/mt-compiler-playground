import { defineConfig } from 'vite';

// VITE_BASE is used for GitHub Pages project sites (e.g. /mt-compiler-playground/).
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
    proxy: {
      // Local dev: forward /ws to the backend.
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
