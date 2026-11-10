// Verify the dsh-profiles panel in both Web UIs over the Tailscale authorities.
// Token URLs are reconstructed from each host's startup log (they rotate on restart).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire('/home/josh/.dsh/profiles/web/package.json');
const { chromium } = require('playwright-core');

const out = '/home/josh/projects/DSH-playground/artifacts';
fs.mkdirSync(out, { recursive: true });

const HOST = 'homelab.taildace6c.ts.net';

function tokenFromLog(logPath) {
  const text = fs.readFileSync(logPath, 'utf8');
  const hits = text.match(/token=([A-Za-z0-9_-]+)/g) || [];
  if (!hits.length) throw new Error(`no token in ${logPath}`);
  return hits[hits.length - 1].slice('token='.length);
}

const targets = [
  { name: 'coding', base: `https://${HOST}/`, log: `${os.homedir()}/dsh/logs/web.log` },
  { name: 'personal', base: `https://${HOST}:8454/`, log: `${os.homedir()}/dsh/logs/personal.log` },
];

const summary = [];
const browser = await chromium.launch({
  executablePath: '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const target of targets) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

  const token = tokenFromLog(target.log);
  await page.goto(`${target.base}?token=${token}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Dismiss the preview notice on a fresh browser profile.
  for (const text of ['Continue', 'Got it', 'Close']) {
    const btn = page.getByRole('button', { name: text, exact: true });
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 2500 });
        await page.waitForTimeout(400);
      } catch {}
      break;
    }
  }

  const authenticated = !page.url().includes('token=');
  await page.screenshot({ path: `${out}/${target.name}-home-tailnet.png` });

  let panelOk = false;
  let panelText = '';
  try {
    const entry = page.getByText('Profiles', { exact: true }).first();
    await entry.waitFor({ state: 'visible', timeout: 10000 });
    try {
      await entry.click({ timeout: 5000 });
    } catch {
      await entry.evaluate((el) => (el.closest('button, [role="button"], a, li, div') || el).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
    await page.waitForTimeout(1500);
    panelText = (await page.locator('body').innerText()).slice(0, 4000);
    panelOk = panelText.includes('First visit needs the startup link once');
    await page.screenshot({ path: `${out}/${target.name}-profiles-tailnet.png` });
  } catch (err) {
    errors.push('panel: ' + String(err).slice(0, 200));
  }

  summary.push({
    target: target.name,
    authority: target.base.replace(/^https:\/\//, '').replace(/\/$/, ''),
    authenticated,
    panelOk,
    hasTailnetCardUrls: panelText.includes(HOST),
    cards: ['Coding', 'Personal'].filter((n) => panelText.includes(n)),
    statuses: ['online', 'unreachable', 'checking'].filter((s) => panelText.toLowerCase().includes(s)),
    errors: errors.filter((e) => !e.includes('401')).slice(0, 5),
  });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
