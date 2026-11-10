// Verify the Host-control settings section: it renders, it reads live status,
// and the Restart DSH button restarts the host and comes back.
//
// Usage: node scripts/verify-host-control-ui.mjs "<token-url>" [label]
//   e.g. node scripts/verify-host-control-ui.mjs "$(journalctl --user -u dsh-ht-test --no-pager -o cat | grep -o 'http://127.0.0.1:7011/?token=[A-Za-z0-9_-]*' | tail -1)" scratch
//
// Screenshots land in artifacts/. The URL token is never printed.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('/home/josh/.dsh/profiles/web/package.json');
const { chromium } = require('playwright-core');

const tokenUrl = process.argv[2];
const label = process.argv[3] || 'host-control';
if (!tokenUrl) {
  console.error('usage: node scripts/verify-host-control-ui.mjs "<token-url>" [label]');
  process.exit(2);
}

const out = '/home/josh/projects/DSH-playground/artifacts';
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
  await page.waitForTimeout(3000);
  // Dismiss the first-run dialog (getting started / preview notice) if present.
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
  const closeDialog = page.locator('[aria-label*="lose" i], [aria-label*="ismiss" i]').first();
  if (await closeDialog.count()) {
    try {
      await closeDialog.click({ timeout: 2000 });
      await page.waitForTimeout(300);
    } catch {}
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Settings lives in the sidebar's account menu.
  await page.getByRole('button', { name: 'Account menu' }).click({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${label}-settings.png` });

  // The section is a nav entry labelled by the plugin's locale string.
  const section = page.getByText('Host control', { exact: true }).first();
  await section.waitFor({ state: 'visible', timeout: 8000 });
  await section.click({ timeout: 5000 });
  await page.waitForTimeout(2500);
  let text = await page.locator('body').innerText();
  summary.steps.statusVisible = text.includes('Waiting for a restart');
  summary.steps.unitShown = /dsh-[A-Za-z0-9_.@-]+\.service/.test(text);
  summary.steps.buttonShown = text.includes('Restart DSH');
  summary.steps.nothingPending = text.includes('Nothing waiting for a restart');
  await page.screenshot({ path: `${out}/${label}-section.png` });

  // Restart: the button asks for confirmation first.
  await page.getByRole('button', { name: 'Restart DSH', exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(600);
  text = await page.locator('body').innerText();
  summary.steps.confirmShown = text.includes('Restart DSH now?');
  summary.steps.failedListShown = text.includes('Failed to load');
  await page.screenshot({ path: `${out}/${label}-confirm.png` });

  await page.getByRole('button', { name: 'Restart now', exact: true }).click({ timeout: 5000 });

  // The old socket dies, the page reconnects, and the section re-reads status.
  let backOnline = false;
  for (let i = 0; i < 45; i += 1) {
    await page.waitForTimeout(2000);
    try {
      const body = await page.locator('body').innerText();
      if (body.includes('Host is back.')) {
        backOnline = true;
        break;
      }
    } catch {
      /* page is between documents during reconnect */
    }
  }
  summary.steps.restartedAndReconnected = backOnline;
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${label}-after-restart.png` });
} catch (error) {
  summary.errors.push('driver: ' + String(error).slice(0, 400));
  try {
    await page.screenshot({ path: `${out}/${label}-failure.png` });
  } catch {}
}

await context.close();
await browser.close();
console.log(JSON.stringify(summary, null, 2));
