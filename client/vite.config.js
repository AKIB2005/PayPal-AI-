import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api goes to the Express server. In production Express serves client/dist itself.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } }
});
