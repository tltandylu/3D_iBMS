import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// ── 1. 主畫面（Sidebar 展開）
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/01_main.png`, fullPage: false })
console.log('✓ 01_main.png')

// ── 2. Sidebar 收合
await page.click('button[title="收合側邊欄"]', { timeout: 3000 }).catch(() =>
  page.locator('header button').first().click()
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/02_sidebar_collapsed.png` })
console.log('✓ 02_sidebar_collapsed.png')

// ── 3. Sidebar 展開 + AI 助理面板
await page.locator('header button').first().click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: /AI 助理/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/03_ai_assistant.png` })
console.log('✓ 03_ai_assistant.png')

// ── 4. Navbar 近拍（KPI 列）
await page.getByRole('button', { name: /AI 助理/ }).click() // 關閉面板
await page.waitForTimeout(300)
await page.screenshot({
  path: `${OUT}/04_navbar_kpi.png`,
  clip: { x: 0, y: 0, width: 1440, height: 64 },
})
console.log('✓ 04_navbar_kpi.png')

// ── 5. Sidebar 近拍（功能選單）
await page.screenshot({
  path: `${OUT}/05_sidebar_nav.png`,
  clip: { x: 0, y: 64, width: 240, height: 836 },
})
console.log('✓ 05_sidebar_nav.png')

await browser.close()
console.log('\n所有截圖完成 →', OUT)
