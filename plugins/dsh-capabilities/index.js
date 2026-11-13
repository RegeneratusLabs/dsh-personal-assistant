/**
 * Host half of the Capabilities panel.
 *
 * Three planes, one authenticated read route:
 *  - `ctx.pluginManager` — the profile's bundle list;
 *  - `ctx.mcpManager` — the MCP server fleet (status, probe, restart);
 *  - Composio — the OAuth catalog, via the connection broker in `composio.js`.
 *
 * Connector *configuration* stays on the official Plugins page / Settings.
 * The only writes here are safe runtime operations: MCP probe/restart, and
 * Composio connect/disconnect, which never touch profile files. The route is
 * registered on the shared `/api` channel, so the owner cookie, Host/Origin
 * fence and ownership check run before every handler. No credential, server
 * command, profile path or Composio user id is returned.
 */
import {
  ConnectorError,
  appById,
  composioStatus,
  connectApp,
  disconnectApp,
  disposeComposioSession,
  ensureComposioSession,
} from './composio.js';

export const name = 'dsh-capabilities';

/** The connection channel and the credential seam (Composio key) are required. */
export const inject = ['connection', 'credentials'];

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function fail(status, message, code = 'error') {
  return json({ ok: false, code, error: message }, status);
}

/** Truncate an upstream diagnostic; it may embed a path or a command line. */
function trim(value, max = 300) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

/** One bundle as the page needs it; deliberately no `source`, `meta` or package paths. */
export function bundleView(bundle) {
  const error = bundle?.error;
  return {
    name: String(bundle?.name ?? ''),
    version: typeof bundle?.version === 'string' ? bundle.version : null,
    enabled: bundle?.enabled === true,
    official: bundle?.official === true,
    installed: bundle?.installed === true,
    availability: typeof bundle?.availability === 'string' ? bundle.availability : null,
    update: typeof bundle?.update === 'string' ? bundle.update : null,
    rows: Array.isArray(bundle?.rows) ? bundle.rows.length : 0,
    description: trim(bundle?.description, 240),
    error: error
      ? { code: trim(error.code, 64) ?? 'error', message: trim(error.message) }
      : null,
  };
}

/** One managed MCP server; only identity, configured intent and live status. */
export function serverView(server) {
  const status = server?.status ?? {};
  return {
    name: String(server?.name ?? ''),
    configured: server?.configured === true,
    state: typeof status.state === 'string' ? status.state : 'unknown',
    reason: typeof status.reason === 'string' ? status.reason : null,
    error: trim(status.lastError),
    closeConfirmed: typeof status.closeConfirmed === 'boolean' ? status.closeConfirmed : null,
  };
}

/** Read all three planes; a missing manager degrades to an empty plane, not a failed page. */
export async function collect(ctx) {
  // Register the Composio session MCP before listing the fleet, so the page
  // shows it on the first read. A missing key/manager is reported, not fatal.
  const tools = await ensureComposioSession(ctx);
  const pluginManager = ctx.get('pluginManager');
  const mcpManager = ctx.get('mcpManager');

  const plugins = [];
  if (pluginManager) {
    const bundles = await pluginManager.listBundles();
    for (const bundle of bundles) plugins.push(bundleView(bundle));
  }

  const connectors = [];
  if (mcpManager && typeof mcpManager.list === 'function') {
    for (const server of mcpManager.list()) connectors.push(serverView(server));
  }

  const composio = await composioStatus(ctx);

  return {
    generatedAt: new Date().toISOString(),
    connectors,
    composio: { ...composio, tools },
    plugins,
    available: {
      pluginManager: Boolean(pluginManager),
      mcpManager: Boolean(mcpManager),
      composio: composio.configured,
    },
  };
}

/** Parse `{app}` for a connect/disconnect action. */
async function readApp(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ConnectorError('bad_request', 'Expected a JSON body.', 400);
  }
  const id = typeof body?.app === 'string' ? body.app : '';
  if (!appById(id)) throw new ConnectorError('not_in_catalogue', 'Unknown app.', 404);
  return id;
}

function fromError(error) {
  if (error instanceof ConnectorError) return fail(error.status, error.message, error.code);
  return fail(500, trim(error?.message) ?? 'capabilities action failed', 'error');
}

export async function apply(ctx) {
  const read = await ctx.connection.fetch.register({
    path: '/api/capabilities',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        return json(await collect(ctx));
      } catch (error) {
        return fromError(error);
      }
    },
  });

  const connect = await ctx.connection.fetch.register({
    path: '/api/capabilities/connect',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return json({ ok: true, ...(await connectApp(ctx, await readApp(request))) });
      } catch (error) {
        return fromError(error);
      }
    },
  });

  const disconnect = await ctx.connection.fetch.register({
    path: '/api/capabilities/disconnect',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return json({ ok: true, ...(await disconnectApp(ctx, await readApp(request))) });
      } catch (error) {
        return fromError(error);
      }
    },
  });

  const mcpAction = (kind) => async (request) => {
    const manager = ctx.get('mcpManager');
    if (!manager) return fail(409, 'The MCP manager is not composed on this host.', 'not_configured');
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, 'Expected a JSON body.', 'bad_request');
    }
    const name = typeof body?.name === 'string' ? body.name : '';
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) return fail(400, 'Invalid connector name.', 'bad_request');
    try {
      if (kind === 'probe') {
        const probe = await manager.probe(name);
        return json({ ok: true, probe });
      }
      await manager.restart(name);
      return json({ ok: true });
    } catch (error) {
      return fail(502, trim(error?.message) ?? `${kind} failed`, 'upstream');
    }
  };

  const probe = await ctx.connection.fetch.register({
    path: '/api/capabilities/connectors/probe',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: mcpAction('probe'),
  });
  const restart = await ctx.connection.fetch.register({
    path: '/api/capabilities/connectors/restart',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: mcpAction('restart'),
  });

  ctx.effect(
    () => () => {
      disposeComposioSession();
      void read();
      void connect();
      void disconnect();
      void probe();
      void restart();
    },
    'dsh-capabilities: /api routes',
  );
}
