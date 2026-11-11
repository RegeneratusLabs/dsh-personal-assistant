/**
 * Host half of the Status/Health bundle.
 *
 * One effect on the authenticated `/api` channel: `GET /api/dsh-status/status`
 * returns ONE aggregated, sanitized JSON document about the *personal assistant*
 * (`dsh-personal.service`, `~/.dsh-personal`, Hindsight bank `dsh-personal`),
 * which is a different process from the one serving this route.
 *
 * Design rules (see `research/ui-data-inventory.md` §D):
 *
 *  - Read-only. No writes, no model-facing tool, no restart, no delete. The only
 *    subprocesses are one pinned `systemctl show`, two pinned `list-timers`
 *    reads and the three approved telemetry scripts, all through `execFile`
 *    with argv arrays (never a shell string).
 *  - Every target is a constant or an environment default, never request input:
 *    unit, bank, agent home, repo root, backup root, listener. The only query
 *    input understood is `?fresh=1`, which bypasses the server cache.
 *  - The handler never throws: each source is wrapped, a failed refresh serves
 *    the last good value with `stale: true`, and an envelope failure still
 *    returns a JSON body (`503 {ok:false,error:'internal',detail}`).
 *  - Allowlist output. Hostnames of this machine, `owner_user`, cgroup paths,
 *    sha256 digests, symlink targets, script stderr and token-shaped strings
 *    never leave this file.
 *  - No dependency on `ctx` beyond `connection`; nothing here needs a Cordis
 *    service, so the route can be exercised with a fake context.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** This bundle's package name; also the Loader row id it is installed under. */
const PKG = '@local/dsh-status';

/** Cordis plugin identity. `connection` is the only service this plugin reads. */
export const name = 'dsh-status';
export const inject = ['connection'];
/** The exact Fetch route below `/api`. */
const ROUTE_PATH = '/api/dsh-status/status';
/** A systemd unit name safe to pass as one argv element. */
const UNIT_RE = /^[A-Za-z0-9_.@-]+\.service$/;

/* ------------------------------------------------------------------ *
 * Pinned targets — never request parameters.
 * ------------------------------------------------------------------ */

/** The assistant's unit (not the unit this route happens to run under). */
const UNIT = 'dsh-personal.service';
/** The assistant's profile inside its own DSH home. */
const AGENT_PROFILE = 'personal';
/** The assistant's Hindsight bank. `josh` is Hermes-owned and must never be used. */
const BANK = 'dsh-personal';
/** Hindsight on loopback; no auth header, no `/v1/default/banks` listing. */
const HINDSIGHT_ORIGIN = 'http://127.0.0.1:9177';
/** The assistant's own web listener. A 401 here means "reachable". */
const AGENT_ORIGIN = 'http://127.0.0.1:7002';
/** Freshness limit for the newest backup, matching `check-alerts.sh`. */
const BACKUP_MAX_AGE_HOURS = 48;

const SCHEMA_VERSION = 1;
/** Whole-response budget. Per-source timeouts keep the real total well below it. */
const BUDGET_MS = 8000;
const TIMEOUT = { systemctl: 1500, http: 2000, script: 6000, version: 3000 };
/** After a failed refresh, serve the last good value for this long instead of retrying. */
const RETRY_BACKOFF_MS = 3000;
/** How long a script that already failed is remembered (log noise control). */
const WARN_ONCE = new Set();

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/**
 * Per-section TTLs (`ui-data-inventory.md` §D.4).
 * `systemd-unit`/`serving`/`listener`/`plugins` are the 5 s `agent` group,
 * `systemd-timers` is the 15 s `health.jobs` section.
 */
export const TTL_MS = {
  'systemd-unit': 5000,
  serving: 5000,
  listener: 5000,
  plugins: 5000,
  'systemd-timers': 15000,
  hindsight: 10000,
  alerts: 30000,
  egress: 60000,
  cost: 60000,
  curator: 60000,
  backup: 300000,
  retention: 300000,
  identity: 60000,
  notifications: 60000,
};

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

const ISO = (ms) => new Date(ms).toISOString();

/** Round-trip through Number, mapping missing/garbage to null. */
function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse an ISO-ish timestamp into a canonical UTC ISO string, or null. */
function isoOrNull(value) {
  if (typeof value !== 'string' || value === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ISO(ms) : null;
}

/** `Key=Value` lines (as printed by `systemctl show`). */
function parseKeyValue(text) {
  const facts = {};
  for (const line of String(text || '').split('\n')) {
    const sep = line.indexOf('=');
    if (sep > 0) facts[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return facts;
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** `{size, mtimeMs}` or null; never follows a symlink target into the payload. */
function statFile(file) {
  try {
    const stat = statSync(file);
    return stat.isFile() ? { size: stat.size, mtimeMs: stat.mtimeMs } : null;
  } catch {
    return null;
  }
}

function listNames(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function errorMessage(error) {
  const text = error && error.message ? error.message : String(error);
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** Log a given problem at most once per process. */
function warnOnce(key, message) {
  if (WARN_ONCE.has(key)) return;
  WARN_ONCE.add(key);
  console.error(`[dsh-status] ${message}`);
}

/* ------------------------------------------------------------------ *
 * Sanitisation — allowlist output only.
 * ------------------------------------------------------------------ */

/** Long opaque strings (hex digests, base64 blobs, opaque ids). */
const LONG_OPAQUE_RE = /\b[A-Za-z0-9_-]{32,}\b/g;
/** Provider-shaped keys. */
const SK_RE = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
/** `Bearer <token>` before the generic key/value rule, which would eat the word "Bearer". */
const BEARER_RE = /\b(bearer)\s+([A-Za-z0-9._~+/=-]{6,})/gi;
/** `token=…`, `authorization: …`, `api_key: …` (but never the word "Bearer"). */
const SECRET_KEY_RE = /\b(bearer|token|secret|password|passwd|api[_-]?key|authorization|basic)\b(\s*[:=]\s*|\s+)(?!bearer\b)([A-Za-z0-9._~+/=-]{6,})/gi;

/** Mask token-shaped substrings inside one string. */
function maskString(input) {
  let text = String(input);
  text = text.replace(SK_RE, '[redacted]');
  text = text.replace(BEARER_RE, (_match, key) => `${key} [redacted]`);
  text = text.replace(SECRET_KEY_RE, (_match, key, sep) => `${key}${sep}[redacted]`);
  text = text.replace(LONG_OPAQUE_RE, '[redacted]');
  return text;
}

/**
 * Mask token-shaped substrings, recursively through plain data.
 * Applied to every string this route emits, including error details.
 */
export function maskTokens(value) {
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) return value.map((item) => maskTokens(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = maskTokens(inner);
    return out;
  }
  return value;
}

/** Replace the invoking user's home prefix with `~`, so a username never ships. */
export function displayPath(value, homeDir = os.homedir()) {
  if (typeof value !== 'string' || value === '') return null;
  const home = path.resolve(homeDir);
  if (value === home) return '~';
  const prefix = home.endsWith(path.sep) ? home : home + path.sep;
  return value.startsWith(prefix) ? `~${path.sep}${value.slice(prefix.length)}` : value;
}

/** Replace absolute local paths with stable placeholders. */
function scrubPaths(text, targets) {
  let out = String(text);
  const pairs = [
    [targets && targets.repoRoot, '<repo>'],
    [targets && targets.agentHome, '<agent-home>'],
    [targets && targets.backupRoot, '<backups>'],
    [targets && targets.servingHome, '<serving-home>'],
    [os.homedir(), '~'],
  ];
  for (const [needle, label] of pairs) {
    if (typeof needle === 'string' && needle.length > 1) out = out.split(needle).join(label);
  }
  return out;
}

/** Scrub local paths, then mask tokens. The only text sanitiser used for output. */
export function cleanText(value, targets) {
  if (typeof value !== 'string') return value;
  return maskString(scrubPaths(value, targets || {}));
}

/* ------------------------------------------------------------------ *
 * Health levels
 * ------------------------------------------------------------------ */

/** `ok < warn < alert < degraded`. `degraded` = "a source is unavailable". */
export const LEVELS = ['ok', 'warn', 'alert', 'degraded'];

/** Map a check/status string onto a health level. Unknown statuses warn, never pass silently. */
export function severityOf(status) {
  switch (String(status === null || status === undefined ? '' : status).toLowerCase()) {
    case 'ok':
    case 'pass':
    case 'passed':
    case 'healthy':
    case 'success':
      return 'ok';
    case 'skip':
    case 'skipped':
    case 'idle':
      return 'ok';
    case 'warn':
    case 'warning':
    case 'degraded':
    case 'pending':
      return 'warn';
    case 'alert':
    case 'error':
    case 'fail':
    case 'failed':
    case 'critical':
      return 'alert';
    default:
      return 'warn';
  }
}

/** The worse of two (or many) levels. */
export function worstLevel(levels) {
  let worst = 'ok';
  for (const level of levels || []) {
    if (!LEVELS.includes(level)) continue;
    if (LEVELS.indexOf(level) > LEVELS.indexOf(worst)) worst = level;
  }
  return worst;
}

/**
 * Overall health level from the five sections §D.2 names
 * (alerts / backup / egress / hindsight / jobs). Anything unavailable degrades.
 */
export function computeHealthLevel(parts = {}) {
  return worstLevel([
    parts.alerts || 'ok',
    parts.backup || 'ok',
    parts.egress || 'ok',
    parts.memory || 'ok',
    parts.jobs || 'ok',
  ]);
}

/* ------------------------------------------------------------------ *
 * Backup age
 * ------------------------------------------------------------------ */

/** Hours since a backup finished, or null when the timestamp is unusable. */
export function backupAgeHours(finishedAt, now = Date.now()) {
  const ms = typeof finishedAt === 'number' ? finishedAt : Date.parse(String(finishedAt || ''));
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (now - ms) / 3_600_000);
}

/** Human age: `3d 4h`, `5h 12m`, `7m`. */
export function formatAgeHours(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  const minutes = Math.max(0, Math.round(hours * 60));
  const days = Math.floor(minutes / 1440);
  const restHours = Math.floor((minutes % 1440) / 60);
  const restMinutes = minutes % 60;
  if (days > 0) return `${days}d ${restHours}h`;
  if (restHours > 0) return `${restHours}h ${restMinutes}m`;
  return `${restMinutes}m`;
}

/**
 * Backup freshness verdict: `ok` under 75 % of the limit, `warn` up to the
 * limit, `alert` past it, `degraded` when no backup exists at all.
 */
export function evaluateBackup({ finishedAt, now = Date.now(), limitHours = BACKUP_MAX_AGE_HOURS } = {}) {
  const ageHours = backupAgeHours(finishedAt, now);
  if (ageHours === null) {
    return { ok: false, ageHours: null, ageText: null, limitHours, level: 'degraded' };
  }
  const level = ageHours > limitHours ? 'alert' : ageHours > limitHours * 0.75 ? 'warn' : 'ok';
  return { ok: true, ageHours: Math.round(ageHours * 10) / 10, ageText: formatAgeHours(ageHours), limitHours, level };
}

/* ------------------------------------------------------------------ *
 * Section cache — per-section TTL, single-flight, stale fallback
 * ------------------------------------------------------------------ */

/**
 * A tiny per-section cache.
 *
 * `load(id, loader, {fresh})` serves a live entry, joins an in-flight refresh
 * (single-flight), or starts one. A failed loader keeps the last good value and
 * remembers the error for `retryMs`, during which `load` returns that value with
 * `stale: true` instead of hammering a broken source. All time comes from the
 * injected `now`, so the tests can use a fake clock.
 */
export function createSectionCache(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const ttlFor = typeof options.ttlFor === 'function' ? options.ttlFor : (id) => TTL_MS[id] ?? 5000;
  const retryMs = Number.isFinite(options.retryMs) ? options.retryMs : RETRY_BACKOFF_MS;
  const entries = new Map();

  function entryFor(id) {
    let entry = entries.get(id);
    if (!entry) {
      entry = { value: undefined, asOf: 0, expiresAt: 0, retryAt: 0, lastError: null, inflight: null };
      entries.set(id, entry);
    }
    return entry;
  }

  function peek(id) {
    const entry = entries.get(id);
    if (!entry || entry.asOf === 0) return null;
    return {
      value: entry.value,
      asOf: entry.asOf,
      expiresAt: entry.expiresAt,
      expired: now() >= entry.expiresAt,
      error: entry.lastError,
    };
  }

  async function load(id, loader, loadOptions = {}) {
    const fresh = Boolean(loadOptions.fresh);
    const entry = entryFor(id);
    const t = now();
    if (!fresh && entry.asOf !== 0) {
      if (t < entry.expiresAt) return { value: entry.value, asOf: entry.asOf, cached: true, stale: false };
      if (t < entry.retryAt) {
        return { value: entry.value, asOf: entry.asOf, cached: true, stale: true, error: entry.lastError };
      }
    }
    if (entry.inflight) {
      const joined = await entry.inflight;
      return { ...joined, cached: true };
    }
    const promise = (async () => {
      try {
        const value = await loader();
        const asOf = now();
        entry.value = value;
        entry.asOf = asOf;
        entry.expiresAt = asOf + ttlFor(id);
        entry.retryAt = 0;
        entry.lastError = null;
        return { value, asOf, cached: false, stale: false };
      } catch (error) {
        entry.retryAt = now() + retryMs;
        entry.lastError = errorMessage(error);
        throw error;
      }
    })();
    entry.inflight = promise;
    try {
      return await promise;
    } finally {
      if (entry.inflight === promise) entry.inflight = null;
    }
  }

  return {
    load,
    peek,
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

/** Module-level cache: one per process, shared by every request. */
const cache = createSectionCache();

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

/**
 * Resolve the pinned targets. Environment overrides exist for tests and for a
 * relocated host; no value here ever comes from a request.
 */
export function resolveTargets(env = process.env, homeDir = os.homedir()) {
  const agentHome = env.DSH_PERSONAL_HOME ? path.resolve(env.DSH_PERSONAL_HOME) : path.join(homeDir, '.dsh-personal');
  const repoRoot = env.DSH_STATUS_REPO ? path.resolve(env.DSH_STATUS_REPO) : path.join(homeDir, 'projects', 'DSH-playground');
  const servingHome = env.DSH_HOME ? path.resolve(env.DSH_HOME) : path.join(homeDir, '.dsh');
  return {
    agentHome,
    repoRoot,
    backupRoot: path.join(homeDir, 'backups', 'dsh-personal'),
    servingHome,
  };
}

/* ------------------------------------------------------------------ *
 * Process / argv helpers
 * ------------------------------------------------------------------ */

function argvValue(flag) {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (typeof item !== 'string') continue;
    if (item === flag && i + 1 < argv.length) return argv[i + 1];
    if (item.startsWith(`${flag}=`)) return item.slice(flag.length + 1);
  }
  return null;
}

/** The `--user` unit this process runs under, from `/proc/self/cgroup`. */
function unitFromCgroup() {
  try {
    for (const line of readFileSync('/proc/self/cgroup', 'utf8').split('\n')) {
      const parts = (line.split(':').pop() || '').split('/').filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        // `user@1000.service` is the per-user manager every child lives under, not a host unit.
        if (UNIT_RE.test(parts[i]) && !/^user@\d+\.service$/.test(parts[i])) return parts[i];
      }
    }
  } catch {
    /* not Linux, or unreadable */
  }
  return null;
}

/** Loopback origin of this process's own listener, from argv when it is there. */
function servingOrigin() {
  const host = argvValue('--host');
  const port = argvValue('--port');
  if (!port || !/^\d{1,5}$/.test(port)) return null;
  const bind = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${bind}:${port}`;
}

/** The profile this process booted from: `--profile`, then the manifest that owns this bundle. */
function servingProfile(targets) {
  const fromArgv = argvValue('--profile');
  if (fromArgv) return fromArgv;
  const base = path.join(targets.servingHome, 'profiles');
  for (const name of listNames(base)) {
    const manifest = readJsonFile(path.join(base, name, 'package.json'));
    if (manifest && manifest.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, PKG)) {
      return name;
    }
  }
  return existsSync(path.join(base, 'web', 'package.json')) ? 'web' : null;
}

/* ------------------------------------------------------------------ *
 * Subprocess + HTTP helpers
 * ------------------------------------------------------------------ */

/**
 * Run one command with an argv array (never a shell string). Resolves with
 * stdout even on a non-zero exit — `check-alerts.sh` exits 1 when it *has*
 * alerts and still prints its JSON body.
 */
function execFileCapture(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : String(error.code || 'error')) : 0;
        resolve({ ok: !error, code, stdout: String(stdout === undefined || stdout === null ? '' : stdout) });
      });
    } catch (error) {
      resolve({ ok: false, code: 'spawn-failed', stdout: '', error });
    }
  });
}

/** Race a thunk against a timeout without leaking an unhandled rejection. */
function withTimeout(task, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${ms} ms`));
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    Promise.resolve()
      .then(task)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

/** GET a JSON document with a hard timeout; non-2xx becomes an Error with `.status`. */
async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT.http),
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * Run one approved repo script and parse its JSON body. The script path is a
 * pinned constant below `<repo>/scripts/...`; a missing script degrades the
 * section instead of crashing the route.
 */
async function runJsonScript(scriptPath, args, label) {
  if (!existsSync(scriptPath)) throw new Error(`${label} script not found`);
  const res = await execFileCapture(scriptPath, args, TIMEOUT.script);
  const text = res.stdout.trim();
  if (text === '') {
    warnOnce(`script:${label}`, `${label} produced no JSON (exit ${res.code})`);
    throw new Error(`${label} produced no output (exit ${res.code})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} output was not JSON`);
  }
}

/* ------------------------------------------------------------------ *
 * Source loaders — each returns a plain value or throws
 * ------------------------------------------------------------------ */

/** §B.1 — one pinned `systemctl --user show` for the agent unit. */
async function loadUnit() {
  const res = await execFileCapture(
    'systemctl',
    [
      '--user', 'show',
      '-p', 'ActiveState',
      '-p', 'SubState',
      '-p', 'MainPID',
      '-p', 'ActiveEnterTimestamp',
      '-p', 'NRestarts',
      '--timestamp=unix',
      UNIT,
    ],
    TIMEOUT.systemctl,
  );
  const facts = parseKeyValue(res.stdout);
  if (!facts.ActiveState) throw new Error(`systemctl show returned no state (exit ${res.code})`);
  const sinceSeconds = Number(String(facts.ActiveEnterTimestamp || '').replace(/^@/, ''));
  return {
    known: true,
    active: facts.ActiveState === 'active',
    subState: facts.SubState || null,
    pid: toInt(facts.MainPID),
    since: Number.isFinite(sinceSeconds) && sinceSeconds > 0 ? ISO(sinceSeconds * 1000) : null,
    restarts: toInt(facts.NRestarts) ?? 0,
  };
}

/** This process's own unit/home/profile/origin — the "serving" half of the panel. */
async function loadServing(targets) {
  const unit = unitFromCgroup();
  let active = null;
  if (unit && UNIT_RE.test(unit)) {
    const res = await execFileCapture('systemctl', ['--user', 'show', '-p', 'ActiveState', unit], TIMEOUT.systemctl);
    const facts = parseKeyValue(res.stdout);
    active = facts.ActiveState ? facts.ActiveState === 'active' : null;
  }
  return {
    unit: unit && UNIT_RE.test(unit) ? unit : null,
    home: targets.servingHome,
    profile: servingProfile(targets),
    origin: servingOrigin(),
    active,
  };
}

/** §C.11 — no health endpoint exists; a loopback GET where 401 still proves a listener. */
async function loadListener() {
  try {
    const res = await fetch(`${AGENT_ORIGIN}/`, {
      signal: AbortSignal.timeout(TIMEOUT.http),
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    return { reachable: true, status: res.status };
  } catch {
    return { reachable: false, status: null };
  }
}

/** §B.3 — saved selection on disk only (live-vs-saved is host-control's route). */
async function loadPlugins(targets) {
  const manifestPath = path.join(targets.agentHome, 'profiles', AGENT_PROFILE, 'package.json');
  const manifest = readJsonFile(manifestPath);
  if (!manifest) throw new Error('agent profile manifest unreadable');
  const bundles = Array.isArray(manifest?.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
  const dependencies = manifest.dependencies && typeof manifest.dependencies === 'object' ? Object.keys(manifest.dependencies) : [];
  const modulesDir = path.join(path.dirname(manifestPath), 'node_modules');
  const installed = dependencies.filter((dep) => existsSync(path.join(modulesDir, ...String(dep).split('/'), 'package.json')));
  return { profile: AGENT_PROFILE, selected: bundles.length, installed: installed.length };
}

/** §B.2 — user and system `dsh-*` timers; timestamps are microseconds. */
async function loadTimers() {
  const [user, system] = await Promise.all([
    execFileCapture('systemctl', ['--user', 'list-timers', 'dsh-*', '--output=json', '--no-pager'], TIMEOUT.systemctl),
    execFileCapture('systemctl', ['list-timers', 'dsh-*', '--output=json', '--no-pager'], TIMEOUT.systemctl),
  ]);
  const items = [];
  const add = (res, scope) => {
    const text = res.stdout.trim();
    if (text === '') return;
    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      return;
    }
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const unit = String(row.unit || '');
      if (!unit) continue;
      items.push({ unit, scope, next: microToIso(row.next), last: microToIso(row.last) });
    }
  };
  add(user, 'user');
  add(system, 'system');
  if (items.length === 0 && !user.ok && !system.ok) throw new Error('list-timers unavailable');
  items.sort((a, b) => a.unit.localeCompare(b.unit) || a.scope.localeCompare(b.scope));
  return { items };
}

/** systemd JSON timers use microseconds since the epoch; `0` means "never". */
function microToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return ISO(Math.round(n / 1000));
}

/** §B.9 — health + typed bank stats + 7-day LLM usage. Never `/v1/default/banks`. */
async function loadHindsight() {
  let health;
  try {
    health = await getJson(`${HINDSIGHT_ORIGIN}/health`);
  } catch (error) {
    const reason = error && error.status ? `HTTP ${error.status}` : 'connection failed';
    throw new Error(`Hindsight unreachable (${reason})`);
  }
  let stats = null;
  let statsError = null;
  try {
    stats = await getJson(`${HINDSIGHT_ORIGIN}/v1/default/banks/${BANK}/stats`);
  } catch (error) {
    statsError = error && error.status === 404 ? `Bank '${BANK}' not found` : `bank stats HTTP ${(error && error.status) || 'failed'}`;
  }
  let usage = null;
  try {
    usage = await getJson(`${HINDSIGHT_ORIGIN}/v1/default/banks/${BANK}/llm-requests/stats?period=7d`);
  } catch {
    usage = null;
  }
  const buckets = usage && Array.isArray(usage.buckets) ? usage.buckets : [];
  let requests = 0;
  let tokens = 0;
  let errors = 0;
  let success = 0;
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'object') continue;
    requests += Number(bucket.total) || 0;
    tokens += Number(bucket?.tokens?.total) || 0;
    errors += Number(bucket?.statuses?.error) || 0;
    success += Number(bucket?.statuses?.success) || 0;
  }
  return {
    reachable: true,
    health: typeof health.status === 'string' ? health.status : null,
    bank: BANK,
    statsError,
    stats: stats
      ? {
          nodes: toInt(stats.total_nodes),
          documents: toInt(stats.total_documents),
          observations: toInt(stats.total_observations),
          links: toInt(stats.total_links),
          pendingOperations: toInt(stats.pending_operations),
          failedOperations: toInt(stats.failed_operations),
          lastWriteAt: isoOrNull(stats.last_memory_write_at),
          lastConsolidatedAt: isoOrNull(stats.last_consolidated_at),
        }
      : null,
    llmUsage7d: usage ? { requests, tokens, errors, success } : null,
  };
}

/** §B.4 — the authoritative alert list. Pinned flags; exit status is ignored by design. */
async function loadAlerts(targets) {
  const script = path.join(targets.repoRoot, 'scripts', 'telemetry', 'check-alerts.sh');
  const json = await runJsonScript(
    script,
    [
      '--json',
      '--unit', UNIT,
      '--scope', 'user',
      '--bank', BANK,
      '--lookback-hours', '24',
      '--backup-max-age-hours', String(BACKUP_MAX_AGE_HOURS),
    ],
    'check-alerts',
  );
  const checks = Array.isArray(json.checks) ? json.checks : [];
  return {
    alerts: toInt(json.alerts) ?? 0,
    warnings: toInt(json.warnings) ?? 0,
    errors: toInt(json.errors) ?? 0,
    exitCode: toInt(json.exit_code),
    asOf: isoOrNull(json.generated_at),
    checks: checks.map((check) => ({
      id: String((check && check.id) || ''),
      status: String((check && check.status) || ''),
      title: String((check && check.title) || ''),
      detail: String((check && check.detail) || ''),
    })),
  };
}

/** §B.5 — 24 h observed egress. Destination IPs and cgroup/user are dropped here. */
async function loadEgress(targets) {
  const script = path.join(targets.repoRoot, 'scripts', 'egress', 'summarize-egress.sh');
  const json = await runJsonScript(script, ['summary', '--json', '--no-ptr'], 'summarize-egress');
  const destinations = Array.isArray(json.destinations) ? json.destinations : [];
  const top = destinations
    .slice()
    .sort((a, b) => (Number(b && b.events) || 0) - (Number(a && a.events) || 0))
    .slice(0, 5)
    .map((destination) => ({
      host: hostFromMatch(destination && destination.match),
      events: toInt(destination && destination.events),
      lastSeen: isoOrNull(destination && destination.last_seen),
    }));
  return {
    status: typeof json.status === 'string' ? json.status : 'unknown',
    window: json && json.window && json.window.boot ? 'boot' : '24h',
    destinations: toInt(json?.counts?.destinations),
    events: toInt(json?.counts?.events),
    unexpected: toInt(json?.counts?.unexpected_destinations),
    denied: toInt(json?.counts?.denied_destinations),
    countersReadable: Boolean(json && json.nft_counters && json.nft_counters.readable),
    top,
  };
}

/** `match: "host:api.deepseek.com"` → the hostname; raw IPs and blanks become null. */
function hostFromMatch(match) {
  if (typeof match !== 'string') return null;
  const trimmed = match.replace(/^host:/, '').trim();
  return trimmed === '' || /^[0-9.]+$/.test(trimmed) || trimmed.includes(':') ? null : trimmed;
}

/** §B.7 — token meter (tokens only; no price table exists). */
async function loadCost(targets) {
  const file = path.join(targets.agentHome, 'telemetry', 'cost-today.json');
  const json = readJsonFile(file);
  if (!json) throw new Error('cost file missing');
  const entries = Array.isArray(json.entries) ? json.entries.filter((entry) => entry && typeof entry.date === 'string') : [];
  if (entries.length === 0) throw new Error('cost file has no entries');
  const last = entries[entries.length - 1];
  return {
    unit: typeof json.unit === 'string' ? json.unit : 'tokens',
    today: toInt(last.value),
    date: last.date,
    history: entries.slice(-30).map((entry) => ({ date: String(entry.date), value: toInt(entry.value) })),
  };
}

/** §B.7 — newest counts-only curator report (never the digest Markdown). */
async function loadCurator(targets) {
  const dir = path.join(targets.agentHome, 'telemetry');
  const names = listNames(dir).filter((name) => /^curate-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  if (names.length === 0) throw new Error('no curator report');
  const name = names[names.length - 1];
  const json = readJsonFile(path.join(dir, name));
  if (!json) throw new Error('curator report unreadable');
  const after = (json.after && typeof json.after === 'object' ? json.after : null) || (json.before && typeof json.before === 'object' ? json.before : {});
  const usage = json.llm_usage_7d && typeof json.llm_usage_7d === 'object' ? json.llm_usage_7d : null;
  return {
    reportDate: name.slice('curate-'.length, -'.json'.length),
    generatedAt: isoOrNull(json.generated_at),
    nodes: toInt(after.total_nodes),
    documents: toInt(after.total_documents),
    observations: toInt(after.total_observations),
    pendingConsolidation: toInt(after.pending_consolidation),
    failedConsolidation: toInt(after.failed_consolidation),
    lastConsolidatedAt: isoOrNull(after.last_consolidated_at),
    llmUsage7d: usage ? { requests: toInt(usage.requests), tokens: toInt(usage.tokens) } : null,
  };
}

/**
 * §B.8 — newest backup manifest, allowlisted fields only.
 * `hostname`, `owner_user`, `dsh.home`/`bin`, `repo.dir`, symlink targets and
 * every `sha256` are dropped here and never enter the cached value.
 */
async function loadBackup(targets) {
  const candidates = [];
  for (const kind of ['daily', 'weekly']) {
    const kindDir = path.join(targets.backupRoot, kind);
    for (const name of listNames(kindDir)) {
      const manifestPath = path.join(kindDir, name, 'manifest.json');
      const json = readJsonFile(manifestPath);
      if (!json) continue;
      const stat = statFile(manifestPath);
      const backup = json.backup && typeof json.backup === 'object' ? json.backup : {};
      const finishedAt = isoOrNull(backup.finished_at) || (stat ? ISO(stat.mtimeMs) : null);
      const sortKey = (finishedAt ? Date.parse(finishedAt) : 0) || (stat ? stat.mtimeMs : 0);
      candidates.push({
        kind: typeof backup.kind === 'string' ? backup.kind : kind,
        id: String(backup.id || name),
        finishedAt,
        hindsight: json.hindsight && typeof json.hindsight.status === 'string' ? json.hindsight.status : null,
        secretsCheck: json.secrets_check && typeof json.secrets_check.status === 'string' ? json.secrets_check.status : null,
        sortKey,
      });
    }
  }
  if (candidates.length === 0) throw new Error('no backup manifests');
  candidates.sort((a, b) => b.sortKey - a.sortKey);
  const newest = candidates[0];
  return {
    kind: newest.kind,
    id: newest.id,
    finishedAt: newest.finishedAt,
    hindsight: newest.hindsight,
    secretsCheck: newest.secretsCheck,
  };
}

/** §B.6 — display-only retention inventory (no schema version, stringy fields). */
async function loadRetention(targets) {
  const script = path.join(targets.repoRoot, 'scripts', 'ops', 'retention-report.sh');
  const json = await runJsonScript(script, ['--json'], 'retention-report');
  return {
    sessionsFiles: toInt(json?.sessions?.files),
    sessionsBytes: toInt(json?.sessions?.bytes),
    backupDaily: toInt(json?.backups?.daily),
    backupWeekly: toInt(json?.backups?.weekly),
    backupBytes: toInt(json?.backups?.bytes),
    telemetryFiles: toInt(json?.telemetry?.files),
    telemetryBytes: toInt(json?.telemetry?.bytes),
    storagesBytes: toInt(json?.storages_bytes),
    logsBytes: toInt(json?.logs_bytes),
    journal: typeof json.journal === 'string' ? json.journal : null,
  };
}

/** §B.10 — SOUL.md metadata only; the contents are never read. */
async function loadIdentity(targets) {
  const file = path.join(targets.agentHome, 'soul', 'SOUL.md');
  const stat = statFile(file);
  return {
    soulPresent: Boolean(stat),
    soulBytes: stat ? stat.size : null,
    soulModifiedAt: stat ? ISO(stat.mtimeMs) : null,
  };
}

/**
 * §B.11 — push/heartbeat are process-local. This route runs in the *serving*
 * process, so on the coding host the honest answer is `known: false`; values
 * are never echoed, only booleans.
 */
async function loadNotifications() {
  const servingUnit = unitFromCgroup();
  const known = servingUnit === UNIT;
  const ntfy = process.env.NTFY_URL;
  const ntfyLooksConfigured = typeof ntfy === 'string' && /^https?:\/\//i.test(ntfy);
  const heartbeat = process.env.DSH_HEARTBEAT;
  return {
    push: { known, inert: known ? !ntfyLooksConfigured : null },
    heartbeat: { known, enabled: known ? heartbeat === '1' || heartbeat === 'true' : null },
  };
}

/* ------------------------------------------------------------------ *
 * DSH version — resolved once per process
 * ------------------------------------------------------------------ */

let versionPromise = null;

/** Memoized DSH version (`0.2.2-rc.1`), or null. */
export function resolveDshVersion() {
  if (!versionPromise) versionPromise = readDshVersion();
  return versionPromise;
}

async function readDshVersion() {
  try {
    const res = await execFileCapture('dsh', ['--version'], TIMEOUT.version);
    const text = res.stdout.trim();
    const match = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(text);
    if (match) return match[1];
  } catch {
    /* fall through to argv resolution */
  }
  return versionFromArgv();
}

/** Fallback: `realpath(process.argv[1])` upwards to the DSH package manifest. */
function versionFromArgv() {
  try {
    const entry = process.argv[1];
    if (!entry) return null;
    let dir = path.dirname(realpathSync(entry));
    for (let depth = 0; depth < 6; depth += 1) {
      const manifestPath = path.join(dir, 'package.json');
      if (existsSync(manifestPath)) {
        const manifest = readJsonFile(manifestPath);
        if (manifest && manifest.name === '@deepseek-ai/dsh' && typeof manifest.version === 'string') return manifest.version;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* unreadable argv entry: version stays unknown */
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Source table + collection
 * ------------------------------------------------------------------ */

/** Fixed order; also the order of `sources[]` in the response. */
const SOURCES = [
  { id: 'systemd-unit', timeoutMs: TIMEOUT.systemctl, load: () => loadUnit() },
  { id: 'serving', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadServing(targets) },
  { id: 'listener', timeoutMs: TIMEOUT.http + 500, load: () => loadListener() },
  { id: 'plugins', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadPlugins(targets) },
  { id: 'systemd-timers', timeoutMs: TIMEOUT.systemctl + 500, load: () => loadTimers() },
  { id: 'hindsight', timeoutMs: TIMEOUT.http + 500, load: () => loadHindsight() },
  { id: 'alerts', timeoutMs: TIMEOUT.script, load: (targets) => loadAlerts(targets) },
  { id: 'egress', timeoutMs: TIMEOUT.script, load: (targets) => loadEgress(targets) },
  { id: 'cost', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadCost(targets) },
  { id: 'curator', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadCurator(targets) },
  { id: 'backup', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadBackup(targets) },
  { id: 'retention', timeoutMs: TIMEOUT.script, load: (targets) => loadRetention(targets) },
  { id: 'identity', timeoutMs: TIMEOUT.systemctl, load: (targets) => loadIdentity(targets) },
  { id: 'notifications', timeoutMs: TIMEOUT.systemctl, load: () => loadNotifications() },
];

/**
 * Collect one source. Never throws: a failed refresh serves the last good value
 * with `ok: false, stale: true` and the error, so the section keeps rendering.
 */
async function collectSource(source, options) {
  const started = Date.now();
  const timeoutMs = Math.max(250, Math.min(source.timeoutMs, options.deadline - started));
  try {
    const loaded = await cache.load(source.id, () => withTimeout(() => source.load(options.targets), timeoutMs, source.id), {
      fresh: options.fresh,
    });
    return {
      id: source.id,
      ok: !loaded.stale,
      ms: Date.now() - started,
      asOf: ISO(loaded.asOf),
      value: loaded.value,
      stale: Boolean(loaded.stale),
      error: loaded.stale ? cleanText(loaded.error || 'stale', options.targets) : undefined,
    };
  } catch (error) {
    const last = cache.peek(source.id);
    const detail = cleanText(errorMessage(error), options.targets);
    if (last && last.asOf > 0 && last.value !== undefined) {
      return { id: source.id, ok: false, ms: Date.now() - started, asOf: ISO(last.asOf), value: last.value, stale: true, error: detail };
    }
    return { id: source.id, ok: false, ms: Date.now() - started, error: detail };
  }
}

/**
 * Build the whole document. Sources run in parallel with per-source timeouts;
 * the DSH version is resolved once per process and awaited alongside them.
 */
export async function buildStatus(options = {}) {
  const targets = options.targets || resolveTargets();
  const fresh = Boolean(options.fresh);
  const deadline = Date.now() + BUDGET_MS;
  const [sources, version] = await Promise.all([
    Promise.all(SOURCES.map((source) => collectSource(source, { targets, fresh, deadline }))),
    resolveDshVersion().catch(() => null),
  ]);
  const now = Date.now();
  return assembleStatus({
    sources,
    now,
    targets,
    version,
    meta: { homeExists: existsSync(targets.agentHome), agentProfile: AGENT_PROFILE },
  });
}

/* ------------------------------------------------------------------ *
 * Pure assembly — the response envelope
 * ------------------------------------------------------------------ */

function alertsLevel(alerts) {
  if (!alerts || alerts.ok !== true) return 'degraded';
  if ((Number(alerts.errors) || 0) > 0) return 'alert';
  if ((Number(alerts.count) || 0) > 0) return 'alert';
  if ((Number(alerts.warnings) || 0) > 0) return 'warn';
  return 'ok';
}

function egressLevel(egress) {
  if (!egress || egress.ok !== true) return 'degraded';
  if ((Number(egress.unexpected) || 0) > 0 || (Number(egress.denied) || 0) > 0) return 'alert';
  const status = String(egress.status || '');
  if (status === 'alert') return 'alert';
  if (status === 'degraded') return 'warn';
  return 'ok';
}

function memoryLevel(memory) {
  if (!memory || memory.reachable !== true) return 'degraded';
  if (memory.ok !== true) return 'warn';
  if (memory.health && memory.health !== 'healthy') return 'warn';
  return 'ok';
}

/** `cost-spike` check status → a `spike` chip (`inactive` is the normal state). */
function spikeFromAlerts(alerts) {
  const checks = alerts && Array.isArray(alerts.checks) ? alerts.checks : [];
  const check = checks.find((entry) => entry && entry.id === 'cost-spike');
  if (!check) return null;
  if (check.status === 'alert') return 'active';
  if (check.status === 'warn') return /inactive|need >=|baseline/i.test(String(check.detail || '')) ? 'inactive' : 'warn';
  if (check.status === 'skip' || check.status === 'error') return 'unknown';
  return 'ok';
}

/** Age of the oldest contributing value, in ms. */
function oldestAgeMs(sources, now) {
  let oldest = now;
  for (const source of sources) {
    if (!source || !source.asOf) continue;
    const ms = Date.parse(source.asOf);
    if (Number.isFinite(ms) && ms < oldest) oldest = ms;
  }
  return Math.max(0, now - oldest);
}

/**
 * Turn collected sources into the response document. Pure: everything it needs
 * (clock, targets, version, meta) is passed in, so the tests can drive it with
 * failing sources and no host access.
 */
export function assembleStatus(input = {}) {
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const targets = input.targets || resolveTargets();
  const meta = input.meta || {};
  const version = input.version === undefined ? null : input.version;
  const sources = Array.isArray(input.sources) ? input.sources : [];

  const byId = new Map(sources.map((source) => [source && source.id, source]));
  const source = (id) => byId.get(id) || null;
  const payload = (id) => {
    const entry = source(id);
    return entry && entry.value !== undefined ? entry.value : null;
  };
  const healthy = (id) => Boolean(source(id) && source(id).ok);
  const failure = (id) => {
    const entry = source(id);
    return entry && entry.error ? cleanText(String(entry.error), targets) : null;
  };

  const unit = payload('systemd-unit');
  const servingSource = payload('serving');
  const listener = payload('listener');
  const plugins = payload('plugins');
  const timers = payload('systemd-timers');
  const hindsight = payload('hindsight');
  const alertsRaw = payload('alerts');
  const egressRaw = payload('egress');
  const costRaw = payload('cost');
  const curatorRaw = payload('curator');
  const backupRaw = payload('backup');
  const retentionRaw = payload('retention');
  const identityRaw = payload('identity');
  const notificationsRaw = payload('notifications');

  const serving = {
    unit: (servingSource && servingSource.unit) || null,
    home: displayPath(servingSource && servingSource.home, meta.homeDir),
    profile: (servingSource && servingSource.profile) || null,
    origin: (servingSource && servingSource.origin) || null,
    active: servingSource && servingSource.active !== undefined ? servingSource.active : null,
    sameAsAgent: Boolean(servingSource && servingSource.unit === UNIT),
  };

  const since = (unit && unit.since) || null;
  const agent = {
    known: Boolean(unit && unit.known),
    unit: UNIT,
    home: displayPath(targets.agentHome, meta.homeDir),
    homeExists: Boolean(meta.homeExists),
    profile: (meta.agentProfile === undefined ? AGENT_PROFILE : meta.agentProfile) || null,
    active: Boolean(unit && unit.active),
    subState: (unit && unit.subState) || null,
    pid: (unit && unit.pid) || null,
    since,
    uptimeSeconds: since ? Math.max(0, Math.round((now - Date.parse(since)) / 1000)) : null,
    restarts: unit && unit.restarts !== undefined ? unit.restarts : null,
    version,
    listener: AGENT_ORIGIN,
    listenerReachable: listener ? Boolean(listener.reachable) : null,
    bundles: {
      selected: plugins && plugins.selected !== undefined ? plugins.selected : null,
      installed: plugins && plugins.installed !== undefined ? plugins.installed : null,
    },
  };

  const alerts = {
    ok: healthy('alerts'),
    count: alertsRaw ? alertsRaw.alerts : null,
    warnings: alertsRaw ? alertsRaw.warnings : null,
    errors: alertsRaw ? alertsRaw.errors : null,
    exitCode: alertsRaw ? alertsRaw.exitCode : null,
    asOf: (alertsRaw && alertsRaw.asOf) || null,
    checks: alertsRaw && Array.isArray(alertsRaw.checks)
      ? alertsRaw.checks.map((check) => ({
          id: String(check.id || ''),
          status: String(check.status || ''),
          title: cleanText(String(check.title || ''), targets),
          detail: cleanText(String(check.detail || ''), targets),
        }))
      : [],
    error: failure('alerts'),
  };

  const backupVerdict = evaluateBackup({
    finishedAt: backupRaw ? backupRaw.finishedAt : null,
    now,
    limitHours: input.limits && input.limits.backupMaxAgeHours ? input.limits.backupMaxAgeHours : BACKUP_MAX_AGE_HOURS,
  });
  const backup = {
    ok: Boolean(backupRaw) && backupVerdict.ageHours !== null,
    ageHours: backupVerdict.ageHours,
    ageText: backupVerdict.ageText,
    limitHours: backupVerdict.limitHours,
    kind: (backupRaw && backupRaw.kind) || null,
    id: (backupRaw && backupRaw.id) || null,
    finishedAt: (backupRaw && backupRaw.finishedAt) || null,
    hindsight: (backupRaw && backupRaw.hindsight) || null,
    secretsCheck: (backupRaw && backupRaw.secretsCheck) || null,
    error: failure('backup'),
  };

  const egress = {
    ok: healthy('egress'),
    status: (egressRaw && egressRaw.status) || null,
    window: (egressRaw && egressRaw.window) || null,
    destinations: egressRaw ? egressRaw.destinations : null,
    events: egressRaw ? egressRaw.events : null,
    unexpected: egressRaw ? egressRaw.unexpected : null,
    denied: egressRaw ? egressRaw.denied : null,
    countersReadable: egressRaw ? Boolean(egressRaw.countersReadable) : null,
    top: egressRaw && Array.isArray(egressRaw.top) ? egressRaw.top : [],
    error: failure('egress'),
  };

  const cost = {
    ok: healthy('cost'),
    unit: (costRaw && costRaw.unit) || 'tokens',
    today: costRaw ? costRaw.today : null,
    date: (costRaw && costRaw.date) || null,
    history: costRaw && Array.isArray(costRaw.history) ? costRaw.history : [],
    spike: spikeFromAlerts(alertsRaw),
    error: failure('cost'),
  };

  const curator = {
    ok: healthy('curator'),
    reportDate: (curatorRaw && curatorRaw.reportDate) || null,
    generatedAt: (curatorRaw && curatorRaw.generatedAt) || null,
    nodes: curatorRaw ? curatorRaw.nodes : null,
    documents: curatorRaw ? curatorRaw.documents : null,
    observations: curatorRaw ? curatorRaw.observations : null,
    pendingConsolidation: curatorRaw ? curatorRaw.pendingConsolidation : null,
    failedConsolidation: curatorRaw ? curatorRaw.failedConsolidation : null,
    lastConsolidatedAt: (curatorRaw && curatorRaw.lastConsolidatedAt) || null,
    llmUsage7d: (curatorRaw && curatorRaw.llmUsage7d) || null,
    error: failure('curator'),
  };

  const memory = hindsight
    ? {
        ok: Boolean(hindsight.stats),
        reachable: hindsight.reachable === true,
        health: hindsight.health || null,
        bank: BANK,
        stats: hindsight.stats || null,
        llmUsage7d: hindsight.llmUsage7d || null,
        error: hindsight.statsError || failure('hindsight'),
      }
    : {
        ok: false,
        reachable: false,
        health: null,
        bank: BANK,
        stats: null,
        llmUsage7d: null,
        error: failure('hindsight') || 'unreachable',
      };

  const retention = {
    ok: healthy('retention'),
    sessionsFiles: retentionRaw ? retentionRaw.sessionsFiles : null,
    sessionsBytes: retentionRaw ? retentionRaw.sessionsBytes : null,
    backupDaily: retentionRaw ? retentionRaw.backupDaily : null,
    backupWeekly: retentionRaw ? retentionRaw.backupWeekly : null,
    backupBytes: retentionRaw ? retentionRaw.backupBytes : null,
    telemetryFiles: retentionRaw ? retentionRaw.telemetryFiles : null,
    telemetryBytes: retentionRaw ? retentionRaw.telemetryBytes : null,
    storagesBytes: retentionRaw ? retentionRaw.storagesBytes : null,
    logsBytes: retentionRaw ? retentionRaw.logsBytes : null,
    journal: (retentionRaw && retentionRaw.journal) || null,
    error: failure('retention'),
  };

  const identity = {
    ok: healthy('identity'),
    soulPresent: identityRaw ? Boolean(identityRaw.soulPresent) : null,
    soulBytes: identityRaw ? identityRaw.soulBytes : null,
    soulModifiedAt: (identityRaw && identityRaw.soulModifiedAt) || null,
    error: failure('identity'),
  };

  const notifications = {
    ok: healthy('notifications'),
    push: {
      known: Boolean(notificationsRaw && notificationsRaw.push && notificationsRaw.push.known),
      inert: notificationsRaw && notificationsRaw.push ? notificationsRaw.push.inert : null,
    },
    heartbeat: {
      known: Boolean(notificationsRaw && notificationsRaw.heartbeat && notificationsRaw.heartbeat.known),
      enabled: notificationsRaw && notificationsRaw.heartbeat ? notificationsRaw.heartbeat.enabled : null,
    },
    error: failure('notifications'),
  };

  const jobs = timers && Array.isArray(timers.items) ? timers.items : [];

  const health = {
    level: computeHealthLevel({
      alerts: alertsLevel(alerts),
      backup: backupVerdict.level,
      egress: egressLevel(egress),
      memory: memoryLevel(memory),
      jobs: healthy('systemd-timers') ? 'ok' : 'degraded',
    }),
    alerts,
    backup,
    egress,
    cost,
    jobs,
    curator,
  };

  const sourcesOut = sources.map((entry) => {
    const out = { id: entry.id, ok: Boolean(entry.ok), ms: entry.ms };
    if (entry.asOf) out.asOf = entry.asOf;
    if (entry.error) out.error = entry.error;
    return out;
  });

  const degraded = sources
    .filter((entry) => !entry.ok)
    .map((entry) => ({ id: entry.id, error: entry.error || 'unavailable', stale: Boolean(entry.stale) }));

  const stale = sources.some((entry) => Boolean(entry.stale)) || sources.some((entry) => !entry.ok && entry.value !== undefined);

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: ISO(now),
    ageMs: oldestAgeMs(sources, now),
    stale,
    serving,
    agent,
    health,
    memory,
    retention,
    identity,
    notifications,
    sources: sourcesOut,
    degraded,
  };
}

/* ------------------------------------------------------------------ *
 * HTTP handler + plugin
 * ------------------------------------------------------------------ */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

/** Only `?fresh=1` (or `?fresh=true`) is understood; everything else is ignored. */
function wantsFresh(request) {
  try {
    const raw = request && typeof request.url === 'string' ? request.url : '';
    const url = new URL(raw, 'http://127.0.0.1');
    const value = url.searchParams.get('fresh');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

/**
 * The route handler. Never throws: a failed envelope still answers with JSON.
 * Exported so a smoke test can call it without a Cordis context.
 */
export async function statusHandler(request) {
  try {
    const body = await buildStatus({ fresh: wantsFresh(request) });
    return jsonResponse(body, 200);
  } catch (error) {
    const detail = cleanText(errorMessage(error), resolveTargets());
    console.error(`[dsh-status] status route failed: ${detail}`);
    try {
      return jsonResponse({ ok: false, error: 'internal', detail }, 503);
    } catch {
      return new Response('{"ok":false,"error":"internal"}', { status: 503, headers: HEADERS });
    }
  }
}

export async function apply(ctx) {
  const dispose = await ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: statusHandler,
  });
  ctx.effect(() => () => {
    void dispose();
  }, 'dsh-status: /api routes');
}
