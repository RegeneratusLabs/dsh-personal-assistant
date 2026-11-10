/**
 * Host half of the Host-control bundle.
 *
 * Two effects, both on the authenticated `/api` channel:
 *
 *  - `GET /api/host-control/status` — this process's unit, listener and profile,
 *    plus the plugin changes the running process has not composed yet. "Not
 *    composed" is read honestly: the saved bundle selection on disk (the profile
 *    manifest) versus `ctx.clientModules.clientPath(pkg)`, the live client bundle
 *    this process actually serves. That difference is exactly what the Web UI
 *    reports as `restart required` at the moment of an operation and then forgets.
 *
 *  - `POST /api/host-control/restart` — restart this process's own systemd
 *    `--user` unit. The unit is derived from the running process, never accepted
 *    from the request, so the endpoint cannot restart anything else; it takes no
 *    parameters at all.
 *
 * The restart is handed to systemd as a separate transient unit
 * (`systemd-run --user --collect … systemctl --user restart <unit>`), so the job
 * survives this process being killed by it, and a one-second delay lets the HTTP
 * response reach the browser before the socket dies.
 *
 * Only owner Peers reach an exact route on the shared channel, so browser
 * authentication, the Host/Origin fence and the ownership check all run before
 * either handler (see `dsh-client-connection`'s `ConnectionFetchRoute`).
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** This bundle's package name; also the Loader row id it is installed under. */
const PKG = '@local/dsh-host-control';
/** A systemd unit name safe to interpolate into the transient-unit command line. */
const UNIT_RE = /^[A-Za-z0-9_.@-]+\.service$/;

export const name = 'dsh-host-control';
export const inject = ['connection'];

/** Run one command; resolves to stdout, or null when it is missing or failed. */
function run(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
        resolve(error ? null : String(stdout));
      });
    } catch {
      resolve(null);
    }
  });
}

function rejectJson(error, detail) {
  return new Response(JSON.stringify({ ok: false, error, detail }), {
    status: 409,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The systemd `--user` unit this process runs under.
 *
 * `/proc/self/cgroup` names the unit for a process started by systemd, which
 * covers both DSH hosts on this machine. A launch outside a unit (a shell, a
 * container init) yields null, and the UI says so instead of guessing.
 */
function unitFromCgroup() {
  try {
    for (const line of readFileSync('/proc/self/cgroup', 'utf8').split('\n')) {
      const parts = (line.split(':').pop() || '').split('/').filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        if (UNIT_RE.test(parts[i])) return parts[i];
      }
    }
  } catch {
    /* not Linux, or unreadable */
  }
  return null;
}

/** Fallback: find the active `dsh*.service` whose MainPID is this process. */
async function unitFromMainPid() {
  const list = await run('systemctl', [
    '--user', 'list-units', '--type=service', '--all', '--no-legend', '--plain', 'dsh*.service',
  ]);
  if (!list) return null;
  for (const line of list.split('\n')) {
    const unit = line.split(/\s+/)[0];
    if (!UNIT_RE.test(unit || '')) continue;
    const pid = await run('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', unit]);
    if (pid && Number(pid.trim()) === process.pid) return unit;
  }
  return null;
}

/** `$DSH_HOME` for this process (the personal unit sets it; the web unit relies on the default). */
function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh');
}

/**
 * The profile directory this process booted from.
 *
 * Preferred: the profile manifest that installed this bundle as a dependency —
 * exact, and independent of argv. Falls back to `--profile`, then `web`.
 */
function profileDir() {
  const base = path.join(dshHome(), 'profiles');
  let dirs = [];
  try {
    dirs = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(base, entry.name));
  } catch {
    return null;
  }
  const manifestOf = (dir) => {
    try {
      return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  };
  for (const dir of dirs) {
    const manifest = manifestOf(dir);
    if (manifest && manifest.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, PKG)) {
      return dir;
    }
  }
  const fromArgv = /--profile\s+(\S+)/.exec(process.argv.join(' '));
  if (fromArgv) {
    const candidate = path.join(base, fromArgv[1]);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  const web = path.join(base, 'web');
  if (existsSync(path.join(web, 'package.json'))) return web;
  return dirs[0] || null;
}

/** Whether the package at `dir/node_modules/<name>` declares a browser half. */
function declaresClient(dir, name) {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'),
    );
    return Boolean(manifest && manifest.dsh && manifest.dsh.client);
  } catch {
    return false;
  }
}

/**
 * Saved selection versus live composition.
 *
 * A package that is installed, declares `dsh.client` and is selected in
 * `dsh.profile.bundles` but has no live client bundle in this process is what
 * the user experiences as "I installed a plugin and nothing happened".
 */
function compositionDelta(ctx) {
  const dir = profileDir();
  if (!dir) return null;
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const registry = ctx.get('clientModules');
  const dependencies = manifest.dependencies || {};
  const bundles = ((manifest.dsh || {}).profile || {}).bundles || [];
  // Loader rows separate "waits for a restart" from "already threw while loading".
  // A package whose own row never got a fiber, or whose fiber is not ACTIVE, will
  // not start by restarting: it is reported as failed instead of pending.
  const rowsByName = new Map();
  const loader = ctx.get('loader');
  if (loader && typeof loader.entries === 'function') {
    try {
      for (const entry of loader.entries()) {
        const entryName = entry && entry.options && entry.options.name;
        if (typeof entryName !== 'string') continue;
        rowsByName.set(entryName, {
          hasFiber: Boolean(entry.fiber),
          active: Boolean(entry.fiber) && entry.fiber.state === 2, // FiberState.ACTIVE
        });
      }
    } catch {
      /* an unreadable row table yields no failure detail; everything stays pending */
    }
  }
  /** A selected package with no live client bundle: still pending, or already broken. */
  const classify = (name) => {
    const row = rowsByName.get(name);
    if (!row) return 'pending';
    return row.active ? 'pending' : 'failed';
  };
  const pending = [];
  const failed = [];
  const stale = [];
  let liveCount = 0;
  for (const dependency of Object.keys(dependencies)) {
    if (!declaresClient(dir, dependency)) continue;
    let live = false;
    if (registry && typeof registry.clientPath === 'function') {
      try {
        live = Boolean(registry.clientPath(dependency));
      } catch {
        live = false;
      }
    }
    if (live) liveCount += 1;
    const selected = bundles.includes(dependency);
    if (selected && !live) {
      if (classify(dependency) === 'failed') failed.push(dependency);
      else pending.push(dependency);
    } else if (!selected && live) stale.push(dependency);
  }
  return {
    profile: path.basename(dir),
    home: dshHome(),
    pending,
    failed,
    stale,
    liveCount,
    // null when this process cannot see the client registry (non-Web composition)
    liveStateKnown: Boolean(registry),
  };
}

/** One unit's activation facts, or null when systemd does not know it. */
async function unitStatus(unit) {
  const out = await run('systemctl', [
    '--user', 'show', '-p', 'ActiveState', '-p', 'MainPID', '-p', 'ActiveEnterTimestamp', unit,
  ]);
  if (!out) return null;
  const facts = {};
  for (const line of out.split('\n')) {
    const sep = line.indexOf('=');
    if (sep > 0) facts[line.slice(0, sep)] = line.slice(sep + 1);
  }
  return {
    unit,
    active: facts.ActiveState === 'active',
    pid: Number(facts.MainPID) || 0,
    since: facts.ActiveEnterTimestamp || '',
  };
}

export async function apply(ctx) {
  let selfUnit = unitFromCgroup();

  const resolveSelfUnit = async () => {
    if (selfUnit) return selfUnit;
    selfUnit = await unitFromMainPid();
    return selfUnit;
  };

  const listenerOrigin = () => {
    try {
      const server = ctx.get('webServer');
      return server && typeof server.getOrigin === 'function' ? server.getOrigin() : null;
    } catch {
      return null;
    }
  };

  const status = async () => {
    const unit = await resolveSelfUnit();
    const delta = compositionDelta(ctx);
    return json({
      ok: true,
      self: unit,
      origin: listenerOrigin(),
      unit: unit ? await unitStatus(unit) : null,
      profile: delta ? delta.profile : null,
      home: delta ? delta.home : dshHome(),
      pending: delta ? delta.pending : null,
      failed: delta ? delta.failed : null,
      stale: delta ? delta.stale : null,
      liveCount: delta ? delta.liveCount : null,
      liveStateKnown: delta ? delta.liveStateKnown : false,
    });
  };

  const restart = async () => {
    const unit = await resolveSelfUnit();
    if (!unit || !UNIT_RE.test(unit)) {
      return rejectJson(
        'unit-unknown',
        'this DSH process is not running under a systemd --user unit, so there is nothing to restart it with',
      );
    }
    const tag = `dsh-restart-${Date.now()}-${process.pid}`;
    // The sleep runs inside the transient unit: the browser gets its answer,
    // then systemd stops this process and starts a new one.
    const script = `sleep 1; exec systemctl --user restart ${unit}`;
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(
          'systemd-run',
          ['--user', '--collect', '--quiet', '--unit', tag, '/bin/sh', '-c', script],
          { detached: true, stdio: 'ignore' },
        );
        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`systemd-run exited with status ${code}`));
        });
      });
    } catch (error) {
      const detail = String((error && error.message) || error);
      // The unit's own sink (journald or the append log) is the local audit trail.
      console.error(`[dsh-host-control] restart hand-off failed for ${unit}: ${detail}`);
      return rejectJson('restart-unavailable', detail);
    }
    console.log(`[dsh-host-control] restart of ${unit} handed off as ${tag}`);
    return json({ ok: true, unit, scheduledAt: new Date().toISOString() });
  };

  const disposeStatus = await ctx.connection.fetch.register({
    path: '/api/host-control/status',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: status,
  });
  const disposeRestart = await ctx.connection.fetch.register({
    path: '/api/host-control/restart',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: restart,
  });

  ctx.effect(
    () => () => {
      void disposeStatus();
      void disposeRestart();
    },
    'dsh-host-control: /api routes',
  );
}
