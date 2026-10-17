import { defineConfig } from 'vite';

// VITE_BASE is used for GitHub Pages project sites (e.g. /mt-compiler-playground/).
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
    proxy: {
      // Used once the backend exists; mock mode does not need it.
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
