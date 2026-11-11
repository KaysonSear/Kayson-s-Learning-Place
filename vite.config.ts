import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'c-lab-local-library',
    configureServer(server) {
      server.middlewares.use('/library.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        fs.createReadStream(new URL('./content/library.json', import.meta.url)).pipe(response);
      });
    }
  }],
  build: {outDir:'dist-cloud'}
});
