import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Default to PORT=55001 to match your running server.
      // Can be overridden via env: VITE_API_TARGET or VITE_API_HOST/VITE_API_PORT.
      '/api': process.env.VITE_API_TARGET || `http://${process.env.VITE_API_HOST || '127.0.0.1'}:${process.env.VITE_API_PORT || '55001'}`
    }
  }
})
