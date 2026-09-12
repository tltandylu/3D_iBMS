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
await page.waitForTimeout(1200)

// 開啟能源報表
await page.locator('nav').getByText('能源報表').click()
await page.waitForTimeout(1200)

// 截圖：能源報表主畫面（含新匯出按鈕）
await page.screenshot({ path: `${OUT}/11_energy_report.png` })
console.log('✓ 11_energy_report.png')

await browser.close()
console.log('\nPhase 11 截圖完成 →', OUT)
