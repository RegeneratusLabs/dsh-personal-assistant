/**
 * Host half of the Capabilities panel.
 *
 * One authenticated read route joins the two management planes rc.2 already
 * owns — `ctx.pluginManager` (profile bundles) and `ctx.mcpManager` (the MCP
 * server fleet) — into the shape the sidebar page renders. Two POST routes
 * wrap the manager's own probe/restart operations; there is no write path for
 * plugin installation or connector configuration here. Those stay on the
 * official Plugins page and Settings, which already enforce their own checks.
 *
 * The host route is registered on the shared `/api` channel, so the owner
 * cookie, Host/Origin fence and ownership check run before either handler
 * (see `dsh-client-connection`'s ConnectionFetchRoute). No credential, no
 * profile source spec and no server command is ever returned.
 */
export const name = 'dsh-capabilities';

/** The connection channel is the only required service; both managers are read defensively. */
export const inject = ['connection'];

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function fail(status, message) {
  return json({ ok: false, error: message }, status);
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

/** Read both planes; a missing manager degrades to an empty plane, not a failed page. */
export async function collect(ctx) {
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

  return {
    generatedAt: new Date().toISOString(),
    connectors,
    plugins,
    available: { pluginManager: Boolean(pluginManager), mcpManager: Boolean(mcpManager) },
  };
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
        return fail(500, trim(error?.message) ?? 'capabilities read failed');
      }
    },
  });

  const action = (kind) => async (request) => {
    const manager = ctx.get('mcpManager');
    if (!manager) return fail(409, 'The MCP manager is not composed on this host.');
    let body;
    try {
      body = await request.json();
    } catch {
      return fail(400, 'Expected a JSON body.');
    }
    const name = typeof body?.name === 'string' ? body.name : '';
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) return fail(400, 'Invalid connector name.');
    try {
      if (kind === 'probe') {
        const probe = await manager.probe(name);
        return json({ ok: true, probe });
      }
      await manager.restart(name);
      return json({ ok: true });
    } catch (error) {
      return fail(502, trim(error?.message) ?? `${kind} failed`);
    }
  };

  const probe = await ctx.connection.fetch.register({
    path: '/api/capabilities/connectors/probe',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: action('probe'),
  });
  const restart = await ctx.connection.fetch.register({
    path: '/api/capabilities/connectors/restart',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: action('restart'),
  });

  ctx.effect(
    () => () => {
      void read();
      void probe();
      void restart();
    },
    'dsh-capabilities: /api routes',
  );
}
