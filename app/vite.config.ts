import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs as its own local process (modules/CapitalHumano).
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
