import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
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
            fs.createReadStream(fp).pipe(res)
          } else {
            next()
          }
        })
      },
    },
  ],
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    exclude: ['web-ifc'],
  },
  build: {
    target: 'esnext',
  },
})
