import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000'
      // WebSocket connects directly to :4000 in dev (see src/hooks/useFleet.js)
    }
  }
});
