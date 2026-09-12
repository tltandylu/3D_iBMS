import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /系統管理員/ }).click()
await page.waitForTimeout(1500)

// Open Device Inventory via sidebar ("設備清單")
await page.locator('nav').getByText('設備清單').click()
await page.waitForTimeout(1200)

// Screenshot: device inventory
await page.screenshot({ path: `${OUT}/12a_device_inventory.png` })
console.log('✓ 12a_device_inventory.png')

// Click first passport (📋) button in the first row
await page.locator('button[title="設備履歷"]').first().click()
await page.waitForTimeout(1400)

// Screenshot: equipment passport (Phase 12 new features: QR code, health trend, real costs, PDF button)
await page.screenshot({ path: `${OUT}/12b_equipment_passport.png` })
console.log('✓ 12b_equipment_passport.png')

await browser.close()
console.log('\nPhase 12 截圖完成 →', OUT)
