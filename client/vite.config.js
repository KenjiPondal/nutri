import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // also reachable on the local network (e.g. your phone on the same Wi-Fi)
    // Allow HTTPS tunnels used for testing on a phone
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.loca.lt'],
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
