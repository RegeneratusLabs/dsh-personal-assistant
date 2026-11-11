// Verify the Status panel (client half + host route) on a running DSH web host.
//
// Usage:
//   node scripts/verify-dsh-status-ui.mjs                      # mint a cookie for dsh-web.service on :7000
//   node scripts/verify-dsh-status-ui.mjs --unit dsh-web.service --port 7000
//   node scripts/verify-dsh-status-ui.mjs --url "http://127.0.0.1:7011/?token=..." [label]
//
// What it checks, in order:
//   1. the sidebar entry "Assistant" exists and opens the Status page;
//   2. the page renders the expected sections and vitals (from real data);
//   3. GET api/dsh-status/status answers ok:true with the agreed top-level shape;
//   4. no console errors / page errors while the panel is mounted;
//   5. light + dark at 1440, and 390px, with screenshots into artifacts/ui/.
//
// The launch token is read from the unit's log sink, exchanged for the owner
// cookie, and never printed. Read-only: no writes, no restarts.
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = '/home/josh/projects/DSH-playground';
let chromium;
try {
  ({ chromium } = createRequire('/home/josh/.dsh/profiles/web/package.json')('playwright-core'));
} catch {
  ({ chromium } = createRequire('/home/josh/camofox-browser/package.json')('playwright-core'));
}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const UNIT = opt('unit', 'dsh-web.service');
const PORT = Number(opt('port', '7000'));
const LABEL = opt('label', 'status');
const OUT = path.join(ROOT, 'artifacts', 'ui');
const CHROME = fs.existsSync('/home/josh/.local/bin/chromium')
  ? '/home/josh/.local/bin/chromium'
  : '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 20000 }); } catch { return ''; }
}
const get = (pathname) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'GET' }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
  });
  req.on('error', () => resolve({ status: 0, headers: {} }));
  req.end();
});

async function mintCookie() {
  // The host prints its one-time unlock URL with a launch token; exchange it for
  // the signed owner cookie exactly like a browser would.
  const sources = [
    sh(`journalctl --user -u ${UNIT} -n 1200 --no-pager -o cat`),
    ...['web.log', 'personal.log'].flatMap((name) =>
      [`${process.env.HOME}/dsh/logs/${name}`, `${process.env.HOME}/.dsh/logs/${name}`]
        .filter((file) => fs.existsSync(file))
        .map((file) => fs.readFileSync(file, 'utf8'))),
  ];
  const tokens = [];
  for (const text of sources) {
    for (const match of text.matchAll(/\?token=([A-Za-z0-9_-]+)/g)) tokens.push(match[1]);
  }
  for (const token of [...new Set(tokens)].reverse().slice(0, 25)) {
    const res = await get(`/?token=${token}`);
    if (res.status >= 200 && res.status < 400 && res.headers['set-cookie']) {
      return res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    }
  }
  return null;
}

const explicitUrl = opt('url', null);
const cookieHeader = explicitUrl ? null : await mintCookie();
if (!explicitUrl && !cookieHeader) {
  console.error(`no launch token for ${UNIT}; pass --url with the dsh web unlock URL`);
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const report = { label: LABEL, unit: UNIT, port: PORT, steps: {}, checks: [], errors: [] };
const pass = (name, ok, detail) => {
  report.checks.push({ name, ok: Boolean(ok), detail: detail || null });
  if (!ok) report.steps.failed = (report.steps.failed || 0) + 1;
};

async function openPage(scheme, width, height, cookies) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  if (cookies) await context.addCookies(cookies);
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') report.errors.push(msg.text().slice(0, 300)); });
  page.on('pageerror', (err) => report.errors.push('pageerror: ' + String(err).slice(0, 300)));
  const url = explicitUrl || `http://127.0.0.1:${PORT}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  return { context, page };
}

function cookiesFrom(header) {
  return header.split('; ').map((kv) => {
    const [name, ...rest] = kv.split('=');
    return { name, value: rest.join('='), domain: '127.0.0.1', path: '/' };
  });
}

async function openAssistant(page) {
  const entry = page.getByRole('button', { name: 'Assistant', exact: true });
  if (await entry.count()) {
    await entry.first().click({ timeout: 8000 });
  } else {
    await page.getByText('Assistant', { exact: true }).first().click({ timeout: 8000 });
  }
  await page.waitForTimeout(2000);
}

try {
  const cookies = cookieHeader ? cookiesFrom(cookieHeader) : null;
  const { context, page } = await openPage('light', 1440, 1000, cookies);
  const route = await page.evaluate(async () => {
    const res = await fetch(new URL('api/dsh-status/status', document.baseURI), { credentials: 'same-origin', cache: 'no-store' });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    return { status: res.status, body };
  });
  pass('route answers 200', route.status === 200, 'status=' + route.status);
  pass('route ok:true', route.body && route.body.ok === true);
  const sections = route.body ? Object.keys(route.body).sort() : [];
  for (const key of ['agent', 'health', 'memory', 'sources']) {
    pass('route has ' + key, sections.includes(key));
  }
  pass('route pinned to dsh-personal', route.body && route.body.agent && route.body.agent.unit === 'dsh-personal.service',
    route.body && route.body.agent ? route.body.agent.unit : 'no agent section');

  await openAssistant(page);
  await page.screenshot({ path: path.join(OUT, `${LABEL}-1440-light.png`) });
  const text = await page.locator('body').innerText();
  pass('panel title', /status/i.test(text));
  pass('panel eyebrow', /personal agent/i.test(text));
  pass('vitals present', /agent/i.test(text) && /alerts/i.test(text) && /memory/i.test(text) && /backup/i.test(text));
  pass('sections present', /needs attention/i.test(text) && /egress/i.test(text) && /token cost/i.test(text));
  pass('source footer', /sources fresh/i.test(text));
  pass('no literal route error', !/host half is not installed/i.test(text));

  // Manual refresh must be reachable by keyboard and must not throw.
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
  pass('refresh button', await refresh.count() > 0);
  if (await refresh.count()) {
    await refresh.first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    pass('refresh leaves no error', !(await page.locator('body').innerText()).includes('unavailable ('));
  }
  await context.close();

  const dark = await openPage('dark', 1440, 1000, cookies);
  await openAssistant(dark.page);
  await dark.page.screenshot({ path: path.join(OUT, `${LABEL}-1440-dark.png`) });
  await dark.context.close();

  const mobile = await openPage('light', 390, 844, cookies);
  // Drawer sidebar: open it from the shell's "Open sidebar" button, then the entry.
  const toggle = mobile.page.getByRole('button', { name: 'Open sidebar', exact: true });
  pass('mobile sidebar toggle', await toggle.count() > 0);
  if (await toggle.count()) {
    await toggle.first().click({ timeout: 5000 });
    await mobile.page.waitForTimeout(900);
  }
  const mobileEntry = mobile.page.getByRole('button', { name: 'Assistant', exact: true });
  pass('mobile entry visible', await mobileEntry.count() > 0);
  if (await mobileEntry.count()) {
    await mobileEntry.first().click({ timeout: 5000 });
    await mobile.page.waitForTimeout(2000);
  }
  const mobileText = await mobile.page.locator('body').innerText();
  pass('mobile panel rendered', /personal agent/i.test(mobileText) && /needs attention/i.test(mobileText));
  await mobile.page.screenshot({ path: path.join(OUT, `${LABEL}-390.png`) });
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  pass('no horizontal overflow at 390', !overflow);
  await mobile.context.close();
} finally {
  report.steps.consoleErrors = report.errors.length;
  report.ok = report.errors.length === 0 && (report.steps.failed || 0) === 0;
  fs.writeFileSync(path.join(OUT, `${LABEL}-verify.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ok: report.ok, failed: report.steps.failed || 0, errors: report.errors }, null, 1));
  await browser.close();
  process.exit(report.ok ? 0 : 1);
}
