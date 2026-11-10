// Verify the dsh-profiles panel renders in the personal + coding Web UIs.
// Screenshots land in artifacts/. Token URLs are read from the hosts' logs.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire('/home/josh/.dsh/profiles/web/package.json');
const { chromium } = require('playwright-core');

const out = '/home/josh/projects/DSH-playground/artifacts';
fs.mkdirSync(out, { recursive: true });

function lastToken(logPath, port) {
  const text = fs.readFileSync(logPath, 'utf8');
  const re = new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[A-Za-z0-9_-]+`, 'g');
  const hits = text.match(re) || [];
  if (!hits.length) throw new Error(`no token URL for :${port} in ${logPath}`);
  return hits[hits.length - 1];
}

const targets = [
  { name: 'personal', port: 7002, log: `${os.homedir()}/dsh/logs/personal.log` },
  { name: 'coding', port: 7000, log: `${os.homedir()}/dsh/logs/web.log` },
];

const summary = [];
const browser = await chromium.launch({
  executablePath: '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const target of targets) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)));

  const tokenUrl = lastToken(target.log, target.port);
  await page.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const url = page.url().replace(/token=[A-Za-z0-9_-]+/, 'token=<redacted>');
  // Dismiss the preview notice if this home has never been opened.
  for (const text of ['Continue', 'Got it', 'Close']) {
    const btn = page.getByRole('button', { name: text, exact: true });
    if (await btn.count()) {
      try { await btn.first().click({ timeout: 2500 }); await page.waitForTimeout(400); } catch {}
      break;
    }
  }
  await page.screenshot({ path: `${out}/${target.name}-home.png`, fullPage: false });

  let panelOk = false;
  let panelText = '';
  try {
    const entry = page.getByText('Profiles', { exact: true }).first();
    await entry.waitFor({ state: 'visible', timeout: 8000 });
    try { await entry.click({ timeout: 5000 }); } catch {
      await entry.evaluate((el) => (el.closest('button, [role="button"], a, li, div') || el).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    await page.waitForTimeout(1500);
    panelText = (await page.locator('body').innerText()).slice(0, 4000);
    panelOk = panelText.includes('First visit needs the startup link once');
    await page.screenshot({ path: `${out}/${target.name}-profiles.png`, fullPage: false });
  } catch (err) {
    errors.push('panel: ' + String(err).slice(0, 300));
  }

  summary.push({
    target: target.name,
    url,
    panelOk,
    sidebarHasProfiles: panelText.includes('Profiles'),
    cards: ['Coding', 'Personal'].filter((n) => panelText.includes(n)),
    onlineMentions: (panelText.match(/online/gi) || []).length,
    errors: errors.slice(0, 8),
  });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
