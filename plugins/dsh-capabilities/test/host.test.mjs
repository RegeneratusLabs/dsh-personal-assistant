import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, bundleView, collect, serverView } from '../index.js';

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

test('collect joins both planes and tolerates missing managers', async () => {
  const ctx = {
    get(name) {
      if (name === 'pluginManager') {
        return { listBundles: async () => [{ name: 'p', enabled: true, rows: [] }] };
      }
      if (name === 'mcpManager') {
        return { list: () => [{ name: 'c', configured: true, status: { state: 'connected' } }] };
      }
      return undefined;
    },
  };
  const out = await collect(ctx);
  assert.equal(out.plugins.length, 1);
  assert.equal(out.connectors.length, 1);
  assert.deepEqual(out.available, { pluginManager: true, mcpManager: true });

  const empty = await collect({ get: () => undefined });
  assert.deepEqual(empty.plugins, []);
  assert.deepEqual(empty.connectors, []);
  assert.deepEqual(empty.available, { pluginManager: false, mcpManager: false });
});

test('apply registers the read route and both connector actions', async () => {
  const routes = [];
  const calls = [];
  const ctx = {
    get(name) {
      if (name === 'pluginManager') return { listBundles: async () => [] };
      if (name === 'mcpManager') {
        return {
          list: () => [],
          probe: async (name) => {
            calls.push(['probe', name]);
            return { ok: true };
          },
          restart: async (name) => {
            calls.push(['restart', name]);
          },
        };
      }
      return undefined;
    },
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

  await apply(ctx);
  assert.deepEqual(
    routes.map((route) => `${route.methods.join(',')} ${route.path}`),
    [
      'GET /api/capabilities',
      'POST /api/capabilities/connectors/probe',
      'POST /api/capabilities/connectors/restart',
    ],
  );

  const read = await routes[0].fetch(new Request('http://host/api/capabilities'));
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).connectors, []);

  const probe = await routes[1].fetch(
    new Request('http://host/api/capabilities/connectors/probe', {
      method: 'POST',
      body: JSON.stringify({ name: 'ping' }),
    }),
  );
  assert.equal(probe.status, 200);
  assert.deepEqual(calls, [['probe', 'ping']]);

  const bad = await routes[2].fetch(
    new Request('http://host/api/capabilities/connectors/restart', {
      method: 'POST',
      body: JSON.stringify({ name: '../etc' }),
    }),
  );
  assert.equal(bad.status, 400);
});
