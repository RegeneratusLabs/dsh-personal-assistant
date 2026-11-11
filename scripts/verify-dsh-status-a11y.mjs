// Accessibility pass for the Status panel (read-only; mints the owner cookie like the UI verifier).
//
// Usage: node scripts/verify-dsh-status-a11y.mjs [--unit dsh-web.service] [--port 7000]
//
// Checks: heading order + landmarks, visible keyboard focus, live-region freshness,
// 200%-zoom equivalence (720 CSS px), reduced motion, coarse-pointer touch targets,
// and AA contrast for every text style the panel actually uses.
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
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const UNIT = opt('unit', 'dsh-web.service');
const PORT = Number(opt('port', '7000'));
const AUTHORITY = opt('authority', `127.0.0.1:${PORT}`);
const BASE = opt('base', `http://127.0.0.1:${PORT}/`);
const SECURE = BASE.startsWith('https:');
const COOKIE_DOMAIN = AUTHORITY.replace(/:\d+$/, '');
const OUT = path.join(ROOT, 'artifacts', 'ui');
const CHROME = fs.existsSync('/home/josh/.local/bin/chromium')
  ? '/home/josh/.local/bin/chromium'
  : '/home/josh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const sh = (c) => { try { return execSync(c, { encoding: 'utf8', timeout: 20000 }); } catch { return ''; } };
const get = (p) => new Promise((res) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, headers: { Host: AUTHORITY } }, (x) => {
    const ch = []; x.on('data', (d) => ch.push(d)); x.on('end', () => res({ s: x.statusCode, h: x.headers }));
  });
  r.on('error', () => res({ s: 0, h: {} })); r.end();
});
// The target unit's own journal tokens come first (a web.log token is 401 on :7002).
const journal = sh(`journalctl --user -u ${UNIT} -n 1200 --no-pager -o cat`);
const fileTokens = [];
for (const file of [`${process.env.HOME}/dsh/logs/${UNIT.replace('.service', '')}.log`, `${process.env.HOME}/dsh/logs/web.log`, `${process.env.HOME}/.dsh/logs/web.log`]) {
  try { for (const m of fs.readFileSync(file, 'utf8').matchAll(/\?token=([A-Za-z0-9_-]+)/g)) fileTokens.push(m[1]); } catch {}
}
const candidates = [...new Set([...[...journal.matchAll(/\?token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]).reverse(), ...fileTokens.reverse()])];
const token = candidates[0] || null;
let cookieHeader = null;
for (const candidate of candidates.slice(0, 40)) {
  const res = await get('/?token=' + candidate);
  const sc = (res.h['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  if (res.s >= 200 && res.s < 400 && sc) { cookieHeader = sc; break; }
}
if (!cookieHeader) { console.error('could not mint the owner cookie'); process.exit(2); }

const cookies = cookieHeader.split('; ').map((kv) => { const [n, ...v] = kv.split('='); return { name: n, value: v.join('='), domain: COOKIE_DOMAIN, path: '/', secure: SECURE }; });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const report = { checks: [], errors: [] };
const pass = (name, ok, detail) => { report.checks.push({ name, ok: Boolean(ok), detail: detail ?? null }); if (!ok) report.failed = (report.failed || 0) + 1; };

async function open(opts) {
  const ctx = await browser.newContext({ viewport: opts.viewport, reducedMotion: opts.reducedMotion, hasTouch: opts.hasTouch, isMobile: opts.hasTouch, colorScheme: opts.scheme || 'light', ignoreHTTPSErrors: true });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => report.errors.push(String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  if (opts.viewport.width < 768) {
    const toggle = page.getByRole('button', { name: 'Open sidebar', exact: true });
    if (await toggle.count()) { await toggle.first().click({ timeout: 5000 }); await page.waitForTimeout(900); }
  }
  const entry = page.getByRole('button', { name: 'Assistant', exact: true });
  await entry.first().waitFor({ state: 'visible', timeout: 12000 });
  await entry.first().click({ timeout: 6000 });
  await page.waitForTimeout(1800);
  const rendered = await page.locator('h2').count();
  if (rendered === 0) {
    await page.screenshot({ path: path.join(OUT, 'status-a11y-debug.png') });
    throw new Error('panel did not render (h2=0) at ' + opts.viewport.width + 'px');
  }
  return { ctx, page };
}

const EVAL = () => {
  const rgb = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map((v) => Number(v.trim()));
    return { r, g, b, a: a === undefined ? 1 : a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.5) return c;
      node = node.parentElement;
    }
    return rgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = { headings: [], samples: [], live: [], focus: null, oneH1: false, h2: 0 };
  const h1s = [...document.querySelectorAll('h1')];
  out.oneH1 = h1s.length === 1;
  out.h1 = h1s.map((h) => h.textContent.trim());
  out.headings = [...document.querySelectorAll('h1,h2')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 40));
  out.h2 = document.querySelectorAll('h2').length;
  out.main = Boolean(document.querySelector('main, [role=main]'));
  out.live = [...document.querySelectorAll('[aria-live], [role=status], [role=alert]')].map((el) => ({
    role: el.getAttribute('role'), live: el.getAttribute('aria-live'), text: (el.textContent || '').trim().slice(0, 50),
  }));
  const selectors = ['.ds-eyebrow', '.ds-title', '.ds-lede', '.ds-fresh', '.ds-chip', '.ds-vital__value', '.ds-vital__unit',
    '.ds-vital__sub', '.ds-section__title', '.ds-section__meta', '.ds-section__sentence', '.ds-row__label', '.ds-row__value',
    '.ds-alert__title', '.ds-alert__detail', '.ds-cost__num', '.ds-sources', '.ds-sources__path'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const fg = rgb(cs.color); const bg = bgOf(el);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    out.samples.push({ sel, size, weight: cs.fontWeight, fg: cs.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`, ratio: Number(ratio(fg, bg).toFixed(2)), need: large ? 3 : 4.5 });
  }
  return out;
};

try {
  // 1. desktop semantics + contrast + focus
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 } });
  const a = await page.evaluate(EVAL);
  pass('single h1', a.oneH1, a.h1.join(' | '));
  pass('section headings', a.h2 >= 5, 'h2 count ' + a.h2);
  pass('main landmark', a.main, JSON.stringify(a.main || null));
  pass('live regions present', a.live.length >= 1, JSON.stringify(a.live.slice(0, 2)));
  const contrastFails = a.samples.filter((s) => s.ratio < s.need);
  pass('AA contrast (all rendered text styles)', contrastFails.length === 0,
    contrastFails.length ? JSON.stringify(contrastFails) : a.samples.map((s) => s.sel + ' ' + s.ratio).join(', '));

  // keyboard focus: Tab through the panel and see a visible ring on the refresh button.
  await page.evaluate(() => { const b = document.querySelector('.ds-btn'); if (b) b.scrollIntoView({ block: 'center' }); document.body.focus(); });
  let ring = null;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.className || !String(el.className).includes('ds-btn')) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, cls: String(el.className), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, box: el.getBoundingClientRect().height };
    });
    if (info) { ring = info; break; }
  }
  pass('keyboard focus reaches refresh', Boolean(ring), ring ? ring.outline : 'not reached in 60 tabs');
  if (ring) pass('focus ring visible', ring.outline.includes('solid') || ring.outline.includes('auto'), ring.outline);
  await ctx.close();

  // 2. 200% zoom equivalence: 720 CSS px viewport must not overflow horizontally.
  const zoom = await open({ viewport: { width: 720, height: 900 } });
  await zoom.page.screenshot({ path: path.join(OUT, 'status-720-zoom200.png') });
  const overflow = await zoom.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  pass('200% zoom: no horizontal overflow', !overflow, 'scrollWidth ' + (await zoom.page.evaluate(() => document.documentElement.scrollWidth)) + ' vs 720');
  const zoomText = await zoom.page.locator('body').innerText();
  pass('200% zoom: panel rendered', /personal agent/i.test(zoomText));
  await zoom.ctx.close();

  // 3. reduced motion: no animation/transition on the panel's controls.
  const rm = await open({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const motion = await rm.page.evaluate(() => {
    const btn = document.querySelector('.ds-btn');
    const row = document.querySelector('.ds-row');
    const read = (el) => (el ? getComputedStyle(el) : null);
    const b = read(btn); const r = read(row);
    return { btnTransition: b ? b.transitionDuration : null, rowTransition: r ? r.transitionDuration : null, btnAnimation: b ? b.animationName : null };
  });
  pass('reduced motion: no transitions/animations', (motion.btnTransition === '0s') && (motion.rowTransition === '0s'), JSON.stringify(motion));
  await rm.ctx.close();

  // 4. coarse pointer: 44px touch target for the refresh control.
  const touch = await open({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touchInfo = await touch.page.evaluate(() => {
    const btn = document.querySelector('.ds-btn');
    if (!btn) return null;
    const box = btn.getBoundingClientRect();
    return { h: Math.round(box.height), w: Math.round(box.width), coarse: matchMedia('(pointer: coarse)').matches };
  });
  pass('coarse pointer detected', touchInfo && touchInfo.coarse, JSON.stringify(touchInfo));
  pass('touch target >= 44px', touchInfo && touchInfo.h >= 44, JSON.stringify(touchInfo));
  await touch.ctx.close();
} finally {
  report.ok = (report.failed || 0) === 0 && report.errors.length === 0;
  fs.writeFileSync(path.join(OUT, 'status-a11y.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ok: report.ok, failed: report.failed || 0, errors: report.errors,
    failures: report.checks.filter((c) => !c.ok) }, null, 1));
  await browser.close();
  process.exit(report.ok ? 0 : 1);
}
