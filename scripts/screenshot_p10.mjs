import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// 登入
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /系統管理員/ }).click()
await page.waitForTimeout(1400)

// 打開設備清單（SidebarItem 是 div 非 button）
await page.locator('nav').getByText('設備清單').click()
await page.waitForTimeout(900)

// DeviceInventory 用 CSS-grid div 列，點擊第一個資產編號 monospace span
await page.locator('span[style*="monospace"]').first().click()
await page.waitForTimeout(1500)

// 截圖：概覽 tab（預設）
await page.screenshot({ path: `${OUT}/10_drawer_overview.png` })
console.log('✓ 10_drawer_overview.png')

// 切換到孿生診斷 tab
await page.getByRole('button', { name: /孿生診斷/ }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/10_drawer_twin.png` })
console.log('✓ 10_drawer_twin.png')

// 切換到維修歷程 tab
await page.getByRole('button', { name: /維修歷程/ }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/10_drawer_history.png` })
console.log('✓ 10_drawer_history.png')

await browser.close()
console.log('\nPhase 10 截圖完成 →', OUT)
