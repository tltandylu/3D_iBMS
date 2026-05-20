import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// ── 0. 登入頁
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/00_login.png` })
console.log('✓ 00_login.png')

// ── 以 Admin 快速登入
await page.getByRole('button', { name: /系統管理員/ }).click()
await page.waitForTimeout(1200)

// ── 1. 主畫面（Admin，Sidebar 展開）
await page.screenshot({ path: `${OUT}/01_main.png` })
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

// ── 4. Navbar 近拍（KPI 列 + UserMenu）
await page.getByRole('button', { name: /AI 助理/ }).click()
await page.waitForTimeout(300)
await page.screenshot({
  path: `${OUT}/04_navbar_kpi.png`,
  clip: { x: 0, y: 0, width: 1440, height: 64 },
})
console.log('✓ 04_navbar_kpi.png')

// ── 5. Sidebar 近拍（Admin — 全部解鎖）
await page.screenshot({
  path: `${OUT}/05_sidebar_admin.png`,
  clip: { x: 0, y: 64, width: 240, height: 836 },
})
console.log('✓ 05_sidebar_admin.png')

// ── 6. User Menu 展開近拍（下拉仍開著）
const userBtn = page.locator('header').getByRole('button').filter({ hasText: /管理員/ })
await userBtn.click()
await page.waitForTimeout(350)
await page.screenshot({
  path: `${OUT}/06_user_menu.png`,
  clip: { x: 1150, y: 0, width: 290, height: 280 },
})
console.log('✓ 06_user_menu.png')

// ── 7. 直接點登出（下拉仍開著，不需再次點開）
await page.getByRole('button', { name: /登出/ }).click()
await page.waitForTimeout(800)

// 以 Viewer 登入
await page.getByRole('button', { name: /資料檢視者/ }).click()
await page.waitForTimeout(1000)

await page.screenshot({
  path: `${OUT}/07_sidebar_viewer.png`,
  clip: { x: 0, y: 64, width: 240, height: 836 },
})
console.log('✓ 07_sidebar_viewer.png')

await browser.close()
console.log('\n所有截圖完成 →', OUT)
