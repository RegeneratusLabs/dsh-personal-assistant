// Verify the Capabilities panel on a live host: the sidebar entry opens, both
// sections render, the connector and the panel's own bundle are listed, and the
// page has no console errors. Desktop and 390px screenshots land in artifacts/.
//
// Usage:
//   node scripts/verify-capabilities-ui.mjs "<token-url>" [label]
//
// The token URL is never printed.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('/home/josh/.dsh/profiles/web/package.json');
const { chromium } = require('playwright-core');

const tokenUrl = process.argv[2];
const label = process.argv[3] || 'capabilities';
if (!tokenUrl) {
  console.error('usage: node scripts/verify-capabilities-ui.mjs "<token-url>" [label]');
  process.exit(2);
}

const out = '/home/josh/projects/dsh-personal-assistant/artifacts';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text().slice(0, 300));
});
page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)));

const summary = { label, steps: {}, errors };
try {
  await page.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  for (const text of ['Continue', 'Got it', 'Close']) {
    const btn = page.getByRole('button', { name: text, exact: true });
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 2000 });
        await page.waitForTimeout(300);
      } catch {}
      break;
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const entry = page.getByText('Capabilities', { exact: true }).first();
  await entry.waitFor({ state: 'visible', timeout: 10000 });
  await entry.click({ timeout: 5000 });
  await page.waitForTimeout(3000);

  const text = await page.locator('body').innerText();
  summary.steps.title = text.includes('Capabilities');
  summary.steps.connectors = text.includes('Connectors');
  summary.steps.plugins = text.includes('Plugins');
  summary.steps.gmail = text.includes('Gmail');
  summary.steps.advanced = text.includes('Advanced — MCP servers');
  summary.steps.panelBundle = text.includes('@local/dsh-capabilities');
  summary.steps.connected = text.includes('connected');
  await page.screenshot({ path: `${out}/${label}-desktop.png`, fullPage: true });

  // The Connect button opens the provider sign-in page in a popup. Do not
  // complete the flow here; close it and leave the account pending.
  const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
  const connectButton = page.getByRole('button', { name: 'Connect Gmail' }).first();
  if (await connectButton.count()) {
    await connectButton.click({ timeout: 5000 });
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForTimeout(2500);
      const url = popup.url();
      summary.steps.signInPopup = Boolean(url) && url !== 'about:blank';
      summary.steps.signInHost = (() => {
        try { return new URL(url).hostname; } catch { return ''; }
      })();
      await popup.close();
    } else {
      summary.steps.signInPopup = false;
    }
    await page.waitForTimeout(1500);
    const after = await page.locator('body').innerText();
    summary.steps.pendingState = /waiting for sign-in/i.test(after);
    await page.screenshot({ path: `${out}/${label}-pending.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  const mobile = await page.locator('body').innerText();
  summary.steps.mobileSections = mobile.includes('Connectors') && mobile.includes('Plugins');
  await page.screenshot({ path: `${out}/${label}-390.png`, fullPage: true });
} catch (error) {
  summary.failure = String(error).slice(0, 500);
} finally {
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
if (summary.failure || errors.length) process.exitCode = 1;
