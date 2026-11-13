import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { apply, bundleView, collect, serverView } from '../index.js';
import { APPS, composioStatus, identity } from '../composio.js';

function ctxWith({ credentials, pluginManager, mcpManager, routes = [] } = {}) {
  return {
    get(name) {
      if (name === 'pluginManager') return pluginManager;
      if (name === 'mcpManager') return mcpManager;
      return undefined;
    },
    credentials: credentials ?? { resolve: async () => undefined },
    connection: {
      fetch: {
        register: async (route) => {
          routes.push(route);
          return async () => {};
        },
      },
    },
    effect: () => {},
  };
}

test('bundleView keeps management facts and drops paths', () => {
  const view = bundleView({
    name: '@local/dsh-soul',
    version: '0.1.0',
    enabled: true,
    official: false,
    installed: true,
    availability: 'profile',
    update: null,
    rows: [{ id: 'a' }, { id: 'b' }],
    description: 'Identity loader',
    source: 'link:/home/josh/projects/secret',
    meta: { detail: '/home/josh/secret.md' },
    error: null,
  });
  assert.equal(view.rows, 2);
  assert.equal(view.name, '@local/dsh-soul');
  assert.equal(view.source, undefined);
  assert.equal(view.meta, undefined);
  assert.equal(view.error, null);
});

test('bundleView carries a bounded error', () => {
  const view = bundleView({ name: 'x', error: { code: 'load', message: 'x'.repeat(500) } });
  assert.equal(view.error.code, 'load');
  assert.equal(view.error.message.length, 300);
});

test('serverView keeps identity and live status', () => {
  const view = serverView({
    name: 'filesystem',
    configured: true,
    status: { state: 'connected' },
    command: '/secret/server',
  });
  assert.deepEqual(view, {
    name: 'filesystem',
    configured: true,
    state: 'connected',
    reason: null,
    error: null,
    closeConfirmed: null,
  });
});

test('collect joins all three planes and tolerates missing managers', async () => {
  const ctx = ctxWith({
    pluginManager: { listBundles: async () => [{ name: 'p', enabled: true, rows: [] }] },
    mcpManager: { list: () => [{ name: 'c', configured: true, status: { state: 'connected' } }] },
  });
  const out = await collect(ctx);
  assert.equal(out.plugins.length, 1);
  assert.equal(out.connectors.length, 1);
  assert.equal(out.composio.configured, false);
  assert.equal(out.composio.apps.length, APPS.length);
  assert.deepEqual(out.available, { pluginManager: true, mcpManager: true, composio: false });

  const empty = await collect(ctxWith());
  assert.deepEqual(empty.plugins, []);
  assert.deepEqual(empty.connectors, []);
  assert.equal(empty.available.pluginManager, false);
});

test('composioStatus without a key reports every app unconnected and not connectable', async () => {
  const status = await composioStatus(ctxWith());
  assert.equal(status.configured, false);
  assert.equal(status.error, null);
  assert.equal(status.apps.length, APPS.length);
  assert.ok(status.apps.every((app) => app.state === 'not_connected' && app.canConnect === false));
});

test('identity is one opaque id per home, created 0600 and reused', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cap-identity-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    const first = identity();
    const second = identity();
    assert.match(first, /^dsh_personal_[0-9a-f]{32}$/);
    assert.equal(first, second);
    const file = path.join(dir, 'connectors', 'identity.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply registers the read, connect, disconnect and MCP action routes', async () => {
  const routes = [];
  const ctx = ctxWith({ routes });
  await apply(ctx);
  assert.deepEqual(
    routes.map((route) => `${route.methods.join(',')} ${route.path}`),
    [
      'GET /api/capabilities',
      'POST /api/capabilities/connect',
      'POST /api/capabilities/disconnect',
      'POST /api/capabilities/connectors/probe',
      'POST /api/capabilities/connectors/restart',
    ],
  );

  const read = await routes[0].fetch(new Request('http://host/api/capabilities'));
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.composio.configured, false);
  assert.equal(body.composio.apps.length, APPS.length);

  const unknown = await routes[1].fetch(
    new Request('http://host/api/capabilities/connect', {
      method: 'POST',
      body: JSON.stringify({ app: 'not-an-app' }),
    }),
  );
  assert.equal(unknown.status, 404);

  const noKey = await routes[1].fetch(
    new Request('http://host/api/capabilities/connect', {
      method: 'POST',
      body: JSON.stringify({ app: 'gmail' }),
    }),
  );
  assert.equal(noKey.status, 409);
  assert.equal((await noKey.json()).code, 'not_configured');
});
