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
      '/api': {
        target: 'http://localhost:3001',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const creds = Buffer.from(`sdff:${process.env.SITE_PASSWORD ?? 'SDFF'}`).toString('base64')
            proxyReq.setHeader('Authorization', `Basic ${creds}`)
          })
        },
      },
    },
  },
})
