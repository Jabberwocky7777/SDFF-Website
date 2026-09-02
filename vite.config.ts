import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      // API + session cookie both flow through here to the Express server.
      // Log in once with a league access code; the cookie persists.
      '/api': { target: 'http://localhost:3001' },
    },
  },
})
