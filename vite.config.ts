import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: '3D iBMS 智慧建築監控平台',
        short_name: '3D iBMS',
        description: '3D 數位孿生 × AI 智慧設施管理平台',
        theme_color: '#060f20',
        background_color: '#060f20',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        importScripts: ['/sw-push.js'],
        globIgnores: ['**/*.wasm', '**/web-ifc*', '**/fragments*', '**/ifc/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'external-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),

    // 自訂中介層：直接從專案根目錄提供 IFC 大檔案
    {
      name: 'serve-ifc',
      configureServer(server) {
        server.middlewares.use('/ifc', (req, res, next) => {
          const name = decodeURIComponent((req.url ?? '/').slice(1))
          const fp = path.resolve('E:/3D監控管理平台', name)
          if (fs.existsSync(fp)) {
            const stat = fs.statSync(fp)
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('Content-Length', stat.size)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Accept-Ranges', 'bytes')
            if (req.method === 'HEAD') {
              res.end()
            } else {
              fs.createReadStream(fp).pipe(res)
            }
          } else {
            next()
          }
        })
      },
    },
  ],

  server: {
    port: 5176,
    host: true,
  },

  optimizeDeps: {
    exclude: ['web-ifc'],
  },

  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom'],
          'vendor-three':   ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-motion':  ['framer-motion'],
          'vendor-export':  ['jspdf', 'html2canvas', 'xlsx'],
        },
      },
    },
  },
})
