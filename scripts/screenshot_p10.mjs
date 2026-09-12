import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// 低幀率（3D 場景 + 軟體渲染）下 Playwright 的 actionability 檢查容易逾時，
// 統一改用 DOM 事件點擊 + 輪詢等待文字出現。
const clickByText = (text, tag = '*') => page.evaluate(([text, tag]) => {
  const cands = Array.from(document.querySelectorAll(tag))
    .filter(e => e.children.length === 0 || e.tagName === 'BUTTON')
  // 先找完全相符，再退回「包含」（分頁按鈕常帶 icon 或計數，如「🧬孿生診斷」「維修歷程 (3)」）
  const el = cands.find(e => (e.textContent ?? '').trim() === text)
    ?? cands.filter(e => (e.textContent ?? '').includes(text))
            .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0]
  if (!el) throw new Error(`找不到元素：${text}`)
  ;(el.closest('button') ?? el).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}, [text, tag])

const clickSelector = (sel, nth = 0) => page.evaluate(([sel, nth]) => {
  const el = document.querySelectorAll(sel)[nth]
  if (!el) throw new Error(`找不到選擇器：${sel}`)
  ;(el.closest('button') ?? el).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}, [sel, nth])

const waitForText = (text, timeout = 30000) => page.waitForFunction(
  t => Array.from(document.querySelectorAll('div,button,span')).some(e => (e.textContent ?? '').includes(t)),
  text, { timeout, polling: 300 })

const waitForSelector = (sel, timeout = 30000) => page.waitForFunction(
  s => !!document.querySelector(s), sel, { timeout, polling: 300 })


// 登入
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /系統管理員/ }).click()
await page.waitForTimeout(1400)

// 打開設備清單（SidebarItem 是 div 非 button）
await clickByText('設備清單')
await waitForSelector('span[style*="monospace"]')
await page.waitForTimeout(600)

// DeviceInventory 用 CSS-grid div 列，點擊第一個資產編號 monospace span
await clickSelector('span[style*="monospace"]')
await waitForText('孿生診斷')
await page.waitForTimeout(1200)

// 截圖：概覽 tab（預設）
await page.screenshot({ path: `${OUT}/10_drawer_overview.png` })
console.log('✓ 10_drawer_overview.png')

// 切換到孿生診斷 tab
await clickByText('孿生診斷', 'button')
await page.waitForTimeout(1400)
await page.screenshot({ path: `${OUT}/10_drawer_twin.png` })
console.log('✓ 10_drawer_twin.png')

// 切換到維修歷程 tab
await clickByText('維修歷程', 'button')
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/10_drawer_history.png` })
console.log('✓ 10_drawer_history.png')

await browser.close()
console.log('\nPhase 10 截圖完成 →', OUT)
