import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(),
      },
    },
    server: {
      // Proxy the WASSAA API to the local backend dev server.
      proxy: {
        '/api/v1': {
          target: process.env.API_TARGET || 'http://localhost:8787',
          changeOrigin: true,
        },
      },
      // Optional: DISABLE_HMR=true turns off HMR and file watching when running
      // the app alongside automated tooling.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
