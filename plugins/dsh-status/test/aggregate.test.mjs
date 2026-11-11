/**
 * Unit tests for the pure helpers in `../index.js`.
 *
 * No host access, no Cordis context, no dependencies: `node --test test/`.
 * The aggregation helpers are exercised with fabricated source results, so a
 * failing source (or a hostile detail string) is reproducible on any machine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import {
  assembleStatus,
  backupAgeHours,
  cleanText,
  computeHealthLevel,
  createSectionCache,
  evaluateBackup,
  formatAgeHours,
  displayPath,
  maskTokens,
  severityOf,
  worstLevel,
} from '../index.js';

const TARGETS = {
  agentHome: '/home/tester/.dsh-personal',
  repoRoot: '/home/tester/projects/DSH-playground',
  backupRoot: '/home/tester/backups/dsh-personal',
  servingHome: '/home/tester/.dsh',
};

const NOW = Date.parse('2026-11-11T03:00:00Z');

/* ------------------------------------------------------------------ *
 * severity / health level
 * ------------------------------------------------------------------ */

test('severityOf maps check statuses onto the four health levels', () => {
  assert.equal(severityOf('ok'), 'ok');
  assert.equal(severityOf('pass'), 'ok');
  assert.equal(severityOf('skip'), 'ok');
  assert.equal(severityOf('warn'), 'warn');
  assert.equal(severityOf('degraded'), 'warn');
  assert.equal(severityOf('alert'), 'alert');
  assert.equal(severityOf('error'), 'alert');
  // An unknown status must never read as green.
  assert.equal(severityOf('something-new'), 'warn');
  assert.equal(severityOf(undefined), 'warn');
  assert.equal(severityOf(null), 'warn');
});

test('worstLevel picks the worst level, ignoring unknown input', () => {
  assert.equal(worstLevel([]), 'ok');
  assert.equal(worstLevel(['ok', 'warn']), 'warn');
  assert.equal(worstLevel(['warn', 'alert', 'ok']), 'alert');
  assert.equal(worstLevel(['alert', 'degraded']), 'degraded');
  assert.equal(worstLevel(['nonsense', 'ok']), 'ok');
});

test('computeHealthLevel: any unavailable source degrades, memory-only stays amber', () => {
  assert.equal(computeHealthLevel({}), 'ok');
  assert.equal(computeHealthLevel({ alerts: 'ok', backup: 'ok', egress: 'ok', memory: 'ok', jobs: 'ok' }), 'ok');
  assert.equal(computeHealthLevel({ alerts: 'alert', backup: 'ok' }), 'alert');
  assert.equal(computeHealthLevel({ alerts: 'warn', backup: 'ok' }), 'warn');
  assert.equal(computeHealthLevel({ memory: 'degraded' }), 'degraded');
  assert.equal(computeHealthLevel({ egress: 'degraded', alerts: 'alert' }), 'degraded');
});

/* ------------------------------------------------------------------ *
 * backup age
 * ------------------------------------------------------------------ */

test('backupAgeHours parses the manifest timestamp and refuses garbage', () => {
  assert.equal(backupAgeHours('2026-11-11T01:00:00Z', NOW), 2);
  assert.equal(backupAgeHours('2026-11-10T21:00:00Z', NOW), 6);
  assert.equal(backupAgeHours(null, NOW), null);
  assert.equal(backupAgeHours('not a date', NOW), null);
  // A future timestamp never yields a negative age.
  assert.equal(backupAgeHours('2026-11-11T05:00:00Z', NOW), 0);
});

test('formatAgeHours renders minutes, hours and days', () => {
  assert.equal(formatAgeHours(0.5), '30m');
  assert.equal(formatAgeHours(5.25), '5h 15m');
  assert.equal(formatAgeHours(76), '3d 4h');
  assert.equal(formatAgeHours(null), null);
});

test('evaluateBackup: ok under 75% of the limit, warn up to it, alert past it, degraded when absent', () => {
  const fresh = evaluateBackup({ finishedAt: '2026-11-11T01:00:00Z', now: NOW, limitHours: 48 });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.level, 'ok');
  assert.equal(fresh.ageHours, 2);
  assert.equal(fresh.ageText, '2h 0m');

  const late = evaluateBackup({ finishedAt: '2026-11-09T11:00:00Z', now: NOW, limitHours: 48 });
  assert.equal(late.level, 'warn');
  assert.equal(late.ok, true);

  const expired = evaluateBackup({ finishedAt: '2026-11-09T01:00:00Z', now: NOW, limitHours: 48 });
  assert.equal(expired.level, 'alert');
  assert.equal(expired.ok, true);

  const missing = evaluateBackup({ finishedAt: null, now: NOW, limitHours: 48 });
  assert.equal(missing.ok, false);
  assert.equal(missing.ageHours, null);
  assert.equal(missing.level, 'degraded');
  assert.equal(missing.limitHours, 48);
});

/* ------------------------------------------------------------------ *
 * token-shaped masker
 * ------------------------------------------------------------------ */

test('maskTokens redacts provider keys, bearer values, key=value secrets and long opaque strings', () => {
  // Built at runtime so this fixture itself is not a secret-shaped literal.
  assert.equal(maskTokens('sk-' + 'x'.repeat(24)), '[redacted]');
  assert.equal(maskTokens('Authorization: Bearer abcdef123456'), 'Authorization: Bearer [redacted]');
  assert.equal(maskTokens('token=abc123456789'), 'token=[redacted]');
  assert.equal(maskTokens('api_key: 0123456789abcdef'), 'api_key: [redacted]');
  assert.equal(maskTokens('sha256 ' + 'a'.repeat(64)), 'sha256 [redacted]');
  assert.equal(maskTokens('id 0123456789abcdef0123456789abcdef'), 'id [redacted]');
});

test('maskTokens keeps ordinary identifiers intact and recurses through data', () => {
  assert.equal(maskTokens('dsh-personal.service'), 'dsh-personal.service');
  assert.equal(maskTokens('dsh-personal'), 'dsh-personal');
  assert.equal(maskTokens('2026-11-11T03:00:00.000Z'), '2026-11-11T03:00:00.000Z');
  assert.equal(maskTokens('daily/20261110T214349Z'), 'daily/20261110T214349Z');

  const masked = maskTokens({ checks: [{ detail: 'token=abc123456789' }], n: 3 });
  assert.equal(masked.checks[0].detail, 'token=[redacted]');
  assert.equal(masked.n, 3);
});

test('displayPath keeps the home relative and leaves other paths alone', () => {
  assert.equal(displayPath('/home/tester/.dsh-personal', '/home/tester'), '~/.dsh-personal');
  assert.equal(displayPath('/home/tester', '/home/tester'), '~');
  assert.equal(displayPath('/srv/dsh-home', '/home/tester'), '/srv/dsh-home');
  assert.equal(displayPath(null, '/home/tester'), null);
});

test('cleanText scrubs local paths before masking', () => {
  assert.equal(cleanText('/home/tester/projects/DSH-playground/scripts/x.sh', TARGETS), '<repo>/scripts/x.sh');
  assert.equal(cleanText('/home/tester/.dsh-personal/telemetry/cost-today.json', TARGETS), '<agent-home>/telemetry/cost-today.json');
  assert.equal(cleanText('/home/tester/backups/dsh-personal/daily', TARGETS), '<backups>/daily');
  assert.equal(cleanText(path.join(os.homedir(), 'other/file'), TARGETS), '~/other/file');
  assert.equal(cleanText('token=abc123456789', TARGETS), 'token=[redacted]');
});

/* ------------------------------------------------------------------ *
 * cache: TTL, single-flight, stale fallback (fake clock)
 * ------------------------------------------------------------------ */

test('cache honours TTLs, coalesces concurrent loads and keeps the last good value', async () => {
  let clock = 1_000;
  let calls = 0;
  const cache = createSectionCache({
    now: () => clock,
    ttlFor: (id) => (id === 'short' ? 1_000 : 60_000),
    retryMs: 500,
  });
  const loader = async () => {
    calls += 1;
    return { n: calls };
  };

  const first = await cache.load('short', loader);
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(first.value.n, 1);

  const hit = await cache.load('short', loader);
  assert.equal(calls, 1, 'a live entry is served from cache');
  assert.equal(hit.cached, true);
  assert.equal(hit.stale, false);

  // Fresh bypasses the TTL.
  const forced = await cache.load('short', loader, { fresh: true });
  assert.equal(calls, 2);
  assert.equal(forced.cached, false);

  // Expiry rebuilds.
  clock += 1_001;
  const rebuilt = await cache.load('short', loader);
  assert.equal(calls, 3);
  assert.equal(rebuilt.value.n, 3);

  // Single-flight: two concurrent loads share one loader run.
  let slowCalls = 0;
  const slow = () =>
    new Promise((resolve) => {
      setTimeout(() => {
        slowCalls += 1;
        resolve({ n: 'slow' });
      }, 10);
    });
  const [a, b] = await Promise.all([cache.load('long', slow), cache.load('long', slow)]);
  assert.equal(slowCalls, 1, 'the second request joins the in-flight refresh');
  assert.equal(a.value.n, 'slow');
  assert.equal(b.cached, true);

  // A failed refresh keeps the last good value, then serves it stale for retryMs.
  clock += 100_000;
  await assert.rejects(
    cache.load('short', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  const kept = cache.peek('short');
  assert.equal(kept.value.n, 3);
  assert.equal(kept.error, 'boom');

  const stale = await cache.load('short', loader);
  assert.equal(stale.stale, true);
  assert.equal(stale.error, 'boom');
  assert.equal(stale.value.n, 3);
  assert.equal(calls, 3, 'a broken source is not hammered inside the retry window');

  // After the retry window the loader is tried again.
  clock += 501;
  const recovered = await cache.load('short', loader);
  assert.equal(calls, 4);
  assert.equal(recovered.stale, false);
});

test('cache reports a missing entry as null and clears on demand', async () => {
  const cache = createSectionCache({ now: () => 5_000, ttlFor: () => 1_000 });
  assert.equal(cache.peek('never'), null);
  await cache.load('never', async () => ({ ok: true }));
  assert.equal(cache.peek('never').expired, false);
  cache.clear();
  assert.equal(cache.peek('never'), null);
  assert.equal(cache.size, 0);
});

/* ------------------------------------------------------------------ *
 * response envelope
 * ------------------------------------------------------------------ */

/** A full, healthy set of source results with realistic values. */
function healthySources() {
  return [
    { id: 'systemd-unit', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { known: true, active: true, subState: 'running', pid: 1234, since: '2026-11-11T00:00:00.000Z', restarts: 0 } },
    { id: 'serving', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { unit: 'dsh-web.service', home: '/home/tester/.dsh', profile: 'web', origin: 'http://127.0.0.1:7000', active: true } },
    { id: 'listener', ok: true, ms: 3, asOf: '2026-11-11T02:59:59.000Z', value: { reachable: true, status: 401 } },
    { id: 'plugins', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { profile: 'personal', selected: 8, installed: 6 } },
    { id: 'systemd-timers', ok: true, ms: 2, asOf: '2026-11-11T02:59:59.000Z', value: { items: [{ unit: 'dsh-telemetry-digest.timer', scope: 'user', next: '2026-11-12T07:00:00.000Z', last: '2026-11-11T07:02:00.000Z' }] } },
    { id: 'hindsight', ok: true, ms: 12, asOf: '2026-11-11T02:59:59.000Z', value: { reachable: true, health: 'healthy', bank: 'dsh-personal', statsError: null, stats: { nodes: 30, documents: 8, observations: 10, links: 244, pendingOperations: 0, failedOperations: 0, lastWriteAt: '2026-11-10T22:37:41.000Z', lastConsolidatedAt: '2026-11-10T22:37:41.000Z' }, llmUsage7d: { requests: 67, tokens: 335897, errors: 6, success: 61 } } },
    { id: 'alerts', ok: true, ms: 1190, asOf: '2026-11-11T02:59:53.000Z', value: { alerts: 0, warnings: 2, errors: 0, exitCode: 0, asOf: '2026-11-11T02:59:53.000Z', checks: [{ id: 'cost-spike', status: 'warn', title: 'Cost spike', detail: 'only 1 baseline day(s) available; spike check inactive' }] } },
    { id: 'egress', ok: true, ms: 470, asOf: '2026-11-11T02:59:53.000Z', value: { status: 'ok', window: '24h', destinations: 1, events: 56, unexpected: 0, denied: 0, countersReadable: false, top: [{ host: 'api.deepseek.com', events: 56, lastSeen: '2026-11-11T02:59:43.000Z' }] } },
    { id: 'cost', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { unit: 'tokens', today: 212291, date: '2026-11-11', history: [{ date: '2026-11-10', value: 8978 }] } },
    { id: 'curator', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { reportDate: '2026-11-11', generatedAt: '2026-11-10T22:46:24.000Z', nodes: 30, documents: 8, observations: 10, pendingConsolidation: 0, failedConsolidation: 0, lastConsolidatedAt: '2026-11-10T22:37:41.000Z', llmUsage7d: { requests: 67, tokens: 335897 } } },
    { id: 'backup', ok: true, ms: 1, asOf: '2026-11-11T02:59:59.000Z', value: { kind: 'daily', id: '20261110T214349Z', finishedAt: '2026-11-10T21:43:52.000Z', hindsight: 'exported', secretsCheck: 'pass' } },
    { id: 'retention', ok: true, ms: 80, asOf: '2026-11-11T02:59:59.000Z', value: { sessionsFiles: 16, sessionsBytes: 212092, backupDaily: 3, backupWeekly: 1, backupBytes: 10218065, telemetryFiles: 5, telemetryBytes: 8021, storagesBytes: 121195, logsBytes: 114460, journal: '1.9G' } },
    { id: 'identity', ok: true, ms: 0, asOf: '2026-11-11T02:59:59.000Z', value: { soulPresent: true, soulBytes: 2262, soulModifiedAt: '2026-11-10T21:43:54.000Z' } },
    { id: 'notifications', ok: true, ms: 0, asOf: '2026-11-11T02:59:59.000Z', value: { push: { known: false, inert: null }, heartbeat: { known: false, enabled: null } } },
  ];
}

test('assembleStatus builds the documented envelope from healthy sources', () => {
  const doc = assembleStatus({
    sources: healthySources(),
    now: NOW,
    targets: TARGETS,
    version: '0.2.2-rc.1',
    meta: { homeExists: true, agentProfile: 'personal', homeDir: '/home/tester' },
  });

  assert.equal(doc.ok, true);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.generatedAt, '2026-11-11T03:00:00.000Z');
  assert.equal(doc.stale, false);
  assert.deepEqual(doc.degraded, []);

  // Top-level contract.
  assert.deepEqual(Object.keys(doc).sort(), [
    'ageMs', 'agent', 'degraded', 'generatedAt', 'health', 'identity', 'memory',
    'notifications', 'ok', 'retention', 'schemaVersion', 'serving', 'sources', 'stale',
  ]);
  assert.deepEqual(Object.keys(doc.health).sort(), ['alerts', 'backup', 'cost', 'curator', 'egress', 'jobs', 'level']);

  assert.equal(doc.health.level, 'warn', 'two warnings, no alerts');
  assert.equal(doc.serving.unit, 'dsh-web.service');
  assert.equal(doc.serving.home, '~/.dsh');
  assert.equal(doc.agent.home, '~/.dsh-personal', 'the username never ships');
  assert.equal(doc.serving.sameAsAgent, false);
  assert.equal(doc.agent.active, true);
  assert.equal(doc.agent.version, '0.2.2-rc.1');
  assert.equal(doc.agent.uptimeSeconds, 3 * 3600);
  assert.equal(doc.agent.listenerReachable, true);
  assert.deepEqual(doc.agent.bundles, { selected: 8, installed: 6 });
  assert.equal(doc.health.alerts.count, 0);
  assert.equal(doc.health.alerts.checks.length, 1);
  assert.equal(doc.health.cost.spike, 'inactive');
  assert.equal(doc.health.cost.today, 212291);
  assert.equal(doc.health.backup.ageHours, 5.3);
  assert.equal(doc.health.jobs.length, 1);
  assert.equal(doc.memory.bank, 'dsh-personal');
  assert.equal(doc.memory.stats.nodes, 30);
  assert.equal(doc.memory.llmUsage7d.requests, 67);
  assert.equal(doc.retention.journal, '1.9G');
  assert.equal(doc.identity.soulBytes, 2262);
  assert.equal(doc.notifications.push.known, false);
  assert.equal(doc.sources.length, healthySources().length);
  assert.deepEqual(Object.keys(doc.sources[0]).sort(), ['asOf', 'id', 'ms', 'ok']);
  // Only the allowlisted fields, never the raw source values.
  assert.equal(doc.sources.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'value')), false);
});

test('assembleStatus never throws when sources fail, and keeps sections renderable', () => {
  const failing = [
    { id: 'systemd-unit', ok: false, ms: 1500, error: 'systemd-unit timed out after 1500 ms' },
    { id: 'serving', ok: false, ms: 1500, error: 'serving timed out after 1500 ms' },
    { id: 'listener', ok: true, ms: 3, asOf: '2026-11-11T02:59:59.000Z', value: { reachable: false, status: null } },
    { id: 'plugins', ok: false, ms: 1, error: 'agent profile manifest unreadable' },
    { id: 'systemd-timers', ok: false, ms: 1500, error: 'list-timers unavailable' },
    { id: 'hindsight', ok: false, ms: 2000, error: 'Hindsight unreachable (connection failed)' },
    {
      id: 'alerts',
      ok: false,
      ms: 6000,
      asOf: '2026-11-11T02:00:00.000Z',
      stale: true,
      error: 'check-alerts timed out after 6000 ms',
      value: {
        alerts: 0,
        warnings: 1,
        errors: 0,
        exitCode: 0,
        asOf: '2026-11-11T02:00:00.000Z',
        checks: [{
          id: 'egress-observe',
          status: 'warn',
          title: 'Egress observe',
          detail: 'token=abc123456789 reading /home/tester/projects/DSH-playground/scripts/egress/x.sh',
        }],
      },
    },
    { id: 'egress', ok: false, ms: 6000, error: 'summarize-egress produced no output (exit 2)' },
    { id: 'cost', ok: false, ms: 1, error: 'cost file missing' },
    { id: 'curator', ok: false, ms: 1, error: 'no curator report' },
    { id: 'backup', ok: false, ms: 1, error: 'no backup manifests' },
    { id: 'retention', ok: false, ms: 6000, error: 'retention-report output was not JSON' },
    { id: 'identity', ok: false, ms: 1, error: 'EACCES' },
    { id: 'notifications', ok: false, ms: 1, error: 'EACCES' },
  ];

  const doc = assembleStatus({
    sources: failing,
    now: NOW,
    targets: TARGETS,
    version: null,
    meta: { homeExists: false, agentProfile: 'personal', homeDir: '/home/tester' },
  });

  assert.equal(doc.ok, true, 'the envelope stays ok; degradation is explicit');
  assert.equal(doc.health.level, 'degraded');
  assert.equal(doc.stale, true, 'a stale value is present');
  assert.equal(doc.degraded.length, failing.filter((source) => !source.ok).length);
  assert.deepEqual(doc.degraded.map((entry) => entry.id), failing.filter((source) => !source.ok).map((entry) => entry.id));
  assert.equal(doc.degraded[0].error.length > 0, true);
  assert.equal(doc.degraded.find((entry) => entry.id === 'alerts').stale, true);

  // Sections are still fully shaped, with nulls instead of missing keys.
  assert.equal(doc.agent.known, false);
  assert.equal(doc.agent.active, false);
  assert.equal(doc.agent.homeExists, false);
  assert.equal(doc.agent.version, null);
  assert.equal(doc.agent.listenerReachable, false);
  assert.deepEqual(doc.agent.bundles, { selected: null, installed: null });
  assert.equal(doc.serving.unit, null);
  assert.equal(doc.memory.ok, false);
  assert.equal(doc.memory.reachable, false);
  assert.equal(doc.memory.bank, 'dsh-personal');
  assert.equal(doc.memory.stats, null);
  assert.equal(doc.health.alerts.ok, false);
  assert.equal(doc.health.alerts.count, 0, 'the stale value still renders');
  assert.equal(doc.health.alerts.error, 'check-alerts timed out after 6000 ms');
  assert.equal(doc.health.backup.ok, false);
  assert.equal(doc.health.backup.ageHours, null);
  assert.equal(doc.health.backup.level, undefined, 'level is not part of the backup section');
  assert.equal(doc.health.egress.ok, false);
  assert.equal(doc.health.cost.today, null);
  assert.deepEqual(doc.health.jobs, []);
  assert.equal(doc.retention.ok, false);
  assert.equal(doc.identity.ok, false);
  assert.equal(doc.notifications.ok, false);

  // Sanitisation survives the failure path: no token, no absolute repo path.
  const serialized = JSON.stringify(doc);
  assert.equal(serialized.includes('abc123456789'), false);
  assert.equal(serialized.includes('/home/tester/projects/DSH-playground'), false);
  assert.equal(doc.health.alerts.checks[0].detail.includes('<repo>/scripts/egress/x.sh'), true);
});

test('assembleStatus flags a stopped unit and a blind memory card without a red global state', () => {
  const sources = healthySources();
  sources[0] = { ...sources[0], value: { known: true, active: false, subState: 'failed', pid: null, since: null, restarts: 3 } };
  sources[5] = { id: 'hindsight', ok: false, ms: 2000, error: 'Hindsight unreachable (connection failed)' };

  const doc = assembleStatus({
    sources,
    now: NOW,
    targets: TARGETS,
    version: '0.2.2-rc.1',
    meta: { homeExists: true, agentProfile: 'personal', homeDir: '/home/tester' },
  });

  assert.equal(doc.agent.active, false);
  assert.equal(doc.agent.subState, 'failed');
  assert.equal(doc.agent.uptimeSeconds, null);
  assert.equal(doc.agent.restarts, 3);
  assert.equal(doc.memory.reachable, false);
  assert.equal(doc.health.level, 'degraded', 'memory-only failure is amber, not alert');
  assert.deepEqual(doc.degraded.map((entry) => entry.id), ['hindsight']);
});
