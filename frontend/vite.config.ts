import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,  // needed for Docker
    proxy: {
      // When running locally: proxies to backend on 8000
      // When in Docker: BACKEND_URL env var overrides target
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
