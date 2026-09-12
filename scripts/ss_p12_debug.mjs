
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto('http://localhost:5176');
await page.waitForTimeout(2000);

// Open device list (click on a device in the 3D scene sidebar or find a device)
// Click the Alert panel to find a device, then open its passport
// First, let's try clicking the device management button
const btns = await page.locator('button').all();
console.log('buttons:', btns.length);

// Try to find and click 設備履歷護照 or similar
// First open device detail by clicking a device status indicator
// Let's navigate via the fleet/device list
await page.screenshot({ path: 'screenshot_p12_debug.png' });

await browser.close();
