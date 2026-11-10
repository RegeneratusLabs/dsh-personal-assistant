// Verify dsh-media-desk renders in a DSH Web UI.
// Usage: node scripts/verify-media-desk-ui.mjs <token-url> [outPrefix]
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('/home/josh/.dsh/profiles/web/package.json');
const { chromium } = require('playwright-core');

const tokenUrl = process.argv[2];
const prefix = process.argv[3] || 'media-desk-verify';
const out = '/home/josh/projects/DSH-playground/artifacts';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 300)); });
page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)));

await page.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4500);
// Dismiss first-run notices if present.
for (const text of ['Continue', 'Got it', 'Close', '知道了', '继续', '关闭']) {
  const btn = page.getByRole('button', { name: text, exact: true });
  if (await btn.count()) {
    try { await btn.first().click({ timeout: 2000 }); await page.waitForTimeout(500); } catch {}
  }
}
await page.screenshot({ path: `${out}/${prefix}-home.png` });
const body = await page.locator('body').innerText();
const hasEntry = body.includes('Media Desk');
const result = { hasEntry, sidebar: body.slice(0, 1200), errors: errors.slice(0, 10) };

if (hasEntry) {
  const entry = page.getByText('Media Desk', { exact: true }).first();
  try {
    await entry.click({ timeout: 5000 });
  } catch {
    await entry.evaluate((el) => (el.closest('button, [role="button"], a, li, div') || el).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/${prefix}-panel.png` });
  const panel = await page.locator('body').innerText();
  result.panel = panel.slice(0, 2000);
  result.panelHasDesk = /Ideas|Content|Schedule|Insights|Styles|灵感|内容|排期/.test(panel);
}
console.log(JSON.stringify(result, null, 2));
await browser.close();
