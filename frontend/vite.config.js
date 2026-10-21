import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite dev server config.
// The proxy forwards every /api request to the FastAPI backend on port 8000,
// so the frontend never has to deal with CORS during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
