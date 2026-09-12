/**
 * 3D 場景效能量測（draw call / 三角形 / 物件數 / FPS）
 *
 *   node scripts/perf_scene.mjs                    # headless（軟體渲染，僅比較 draw call）
 *   node scripts/perf_scene.mjs --headed           # 真實 GPU，FPS 才有意義
 *   node scripts/perf_scene.mjs --headed --nobatch # 關閉合批（優化前對照組）
 *
 * 前置：dev server (5176) 與後端 (8001) 已啟動。
 * FPS 於 headless 受軟體渲染限制，請以 --headed 的數字為準。
 */
import { chromium } from 'playwright'

const headed  = process.argv.includes('--headed')
const nobatch = process.argv.includes('--nobatch')
const url     = `http://localhost:5176/${nobatch ? '?nobatch' : ''}`

const browser = await chromium.launch(headed ? { headless: false, args: ['--use-angle=default'] } : {})
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

const logs = []
page.on('console', m => { const t = m.text(); if (t.includes('[IFC')) logs.push(t) })

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').fill('admin@ibms.com')
await page.locator('input[type="password"]').fill('admin123')
await page.locator('input[type="password"]').press('Enter')

// 等 IFC 解析 + 合批完成（未合批模式建立兩萬多個 Mesh，需要更久）
const stats = () => page.evaluate(() => window.__perfProbe?.() ?? null)
let s = null
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(2000)
  s = await stats()
  if (s && s.drawCalls > 300) break
}
await page.waitForTimeout(8000)   // 讓 LOD 控制器與相機穩定

const fps = await page.evaluate(() => new Promise(res => {
  let n = 0
  const t0 = performance.now()
  const tick = () => {
    n++
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick)
    else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1))
  }
  requestAnimationFrame(tick)
}))

const mode = `${headed ? '真實 GPU' : 'headless 軟體渲染'} · ${nobatch ? '未合批（對照）' : '已合批 + LOD'}`
console.log(`── ${mode} ──`)
for (const l of logs) console.log('  ', l.slice(0, 130))
console.log('  ', JSON.stringify({ fps, ...(await stats()) }))

await browser.close()
