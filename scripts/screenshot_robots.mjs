/**
 * AMR / AGV 車隊模組截圖與煙霧測試
 * 用法：node scripts/screenshot_robots.mjs
 *   前置：dev server (5176) 與後端 (8001) 皆已啟動
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5176'
const OUT  = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page    = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// 低幀率（軟體渲染）下 Playwright 的 actionability 檢查會逾時，改以 DOM 事件點擊
const clickByText = (text, tag = '*') => page.evaluate(([text, tag]) => {
  const el = Array.from(document.querySelectorAll(tag))
    .filter(e => e.children.length === 0 || e.tagName === 'BUTTON')
    .find(e => (e.textContent ?? '').trim() === text)
  if (!el) throw new Error(`找不到元素：${text}`)
  ;(el.closest('button') ?? el).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}, [text, tag])

// 低幀率下 lazy chunk 可能還沒載完，改以輪詢等待文字出現
const waitForText = (text, timeout = 30000) => page.waitForFunction(
  t => Array.from(document.querySelectorAll('div,button,span'))
        .some(e => (e.textContent ?? '').includes(t)),
  text, { timeout, polling: 300 })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))

await page.goto(BASE, { waitUntil: 'networkidle' })
// 以真實帳密登入取得 JWT（demo 快捷按鈕僅建立本地 session，不具後端權杖）
await page.locator('input[type="email"]').fill('admin@ibms.com')
await page.locator('input[type="password"]').fill('admin123')
await page.locator('input[type="password"]').press('Enter')
await page.waitForTimeout(3000)

// 遙測是否進入前端 store（3 秒內封包累積量 / 漂移棄幀）
const probe = await page.evaluate(async () => {
  const before = window.__robotProbe?.() ?? null
  await new Promise(r => setTimeout(r, 3000))
  const after = window.__robotProbe?.() ?? null
  return { before, after }
})
const rate = probe.after && probe.before
  ? ((probe.after.packets - probe.before.packets) / 3 / Math.max(1, probe.after.count)).toFixed(1)
  : '?'
console.log(`遙測：${probe.after?.count} 台 · ${rate} Hz/台 · 漂移棄幀 ${probe.after?.drift}`)

// 等 BIM 載入遮罩結束，避免蓋住 3D 場景
await page.waitForTimeout(9000)

// ── 3D 場景：拉近觀察車體、光環與軌跡 ──────────────────────────────
await page.mouse.move(820, 500)
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(120) }
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/13d_robot_scene.png` })
console.log('✓ 13d_robot_scene.png')

// ── 車隊監控面板 ──────────────────────────────────────────────────
await clickByText('機器人車隊')
await waitForText('AMR / AGV 車隊即時追蹤')
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/13a_robot_fleet_panel.png` })
console.log('✓ 13a_robot_fleet_panel.png')

// ── 坐標校準：錨點最小平方求解 ─────────────────────────────────────
await clickByText('坐標校準', 'button')
await waitForText('現場標定程序')
await page.waitForTimeout(600)
await clickByText('最小平方求解', 'button')
await waitForText('求解結果')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/13b_robot_calibration.png` })
console.log('✓ 13b_robot_calibration.png')

// ── 鎖定跟隨視角 ──────────────────────────────────────────────────
await clickByText('車隊監控', 'button')
await waitForText('即時 KPI')
await page.waitForTimeout(500)
await clickByText('AMR-P01')
await page.waitForTimeout(400)
await clickByText('🎯 鎖定跟隨（車體後上方）', 'button')
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/13c_robot_chase_view.png` })
console.log('✓ 13c_robot_chase_view.png')

// ── 動線編輯器：開啟 → 新增站點 ───────────────────────────────────────
await clickByText('機器人車隊')
await waitForText('AMR / AGV 車隊即時追蹤')
await clickByText('動線編輯', 'button')
await waitForText('空白處點擊新增站點')
const svgBox = await page.locator('svg').first().boundingBox()
const before = await page.evaluate(() => document.querySelectorAll('svg g circle').length)
await page.mouse.click(svgBox.x + 130, svgBox.y + 130)
await page.waitForTimeout(700)
const after = await page.evaluate(() => document.querySelectorAll('svg g circle').length)
console.log(`✓ 動線編輯器：點擊新增站點（站點數 ${before} → ${after}）`)
await page.screenshot({ path: `${OUT}/13g_robot_route_editor.png` })
console.log('✓ 13g_robot_route_editor.png')

// 不儲存，還原草稿後回到車隊監控並開啟動線疊圖
await clickByText('還原', 'button')
await page.waitForTimeout(500)
await clickByText('車隊監控', 'button')
await waitForText('動線與站點疊圖')
await page.evaluate(() => {
  const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('動線與站點疊圖'))
  lbl?.querySelector('input')?.click()
})
await page.waitForTimeout(500)
await page.mouse.click(700, 862)          // 點遮罩關閉面板（避開告警 toast 的 ✕）
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/13h_robot_route_overlay.png` })
console.log('✓ 13h_robot_route_overlay.png（3D 動線疊圖）')

// ── 即時機器人視角：啟動 → 切換機載 → 巡看下一台 → Esc 停止 ──────────
await clickByText('機器人車隊')
await waitForText('AMR / AGV 車隊即時追蹤')
await clickByText('▶ 即時視角', 'button')
await waitForText('■ 停止')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/13e_robot_live_view.png` })
console.log('✓ 13e_robot_live_view.png（啟動即時視角）')

await clickByText('👁 機載', 'button')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/13f_robot_fpv.png` })
console.log('✓ 13f_robot_fpv.png（第一人稱機載視角）')

await clickByText('›', 'button')                       // 巡看下一台
await page.waitForTimeout(1500)
await page.keyboard.press('Escape')                    // Esc 停止
await page.waitForTimeout(1000)
const stopped = await page.evaluate(() => !Array.from(document.querySelectorAll('button'))
  .some(b => (b.textContent ?? '').trim() === '■ 停止'))
console.log(stopped ? '✓ Esc 停止即時視角，控制列已收起' : '✗ 控制列未收起')

if (errors.length) {
  console.log('\n⚠ console 錯誤：')
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  -', e)
} else {
  console.log('\n✓ 無 console 錯誤')
}

await browser.close()
