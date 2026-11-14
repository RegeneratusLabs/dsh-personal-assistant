/**
 * Composio connection broker for the Capabilities panel.
 *
 * The panel's Connect button needs an OAuth handoff, which DSH's MCP client
 * cannot provide. This module owns the broker side: one project key in the
 * credential store, one opaque per-profile Composio user id in 0600 state, and
 * the three REST calls the catalog needs (list accounts, create a sign-in link,
 * revoke an account). It never returns the key, the user id, or a provider
 * credential; account state is reduced to a display name/status.
 *
 * The same key backs the Composio session MCP server (registered by the host
 * plugin) so a connected account is immediately usable by the model.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://backend.composio.dev/api/v3.1';
const KEY_REF = 'COMPOSIO_API_KEY';
const USER_RE = /^dsh_personal_[0-9a-f]{32}$/;
const ACCOUNT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SECRET_TEXT = /\b(?:ak|ca|sk)_[A-Za-z0-9_-]{6,}\b/g;
const TIMEOUT_MS = 20_000;
const MAX_BODY = 2 * 1024 * 1024;

/**
 * Curated Western catalog. Slugs are verified against Composio's toolkit
 * search (2026-11-13); `managedOAuth: false` means Composio has no managed
 * sign-in and an auth config must be created in the Composio project first.
 */
export const APPS = [
  { id: 'gmail', name: 'Gmail', slug: 'gmail', group: 'Communication', description: 'Read and draft email.', managedOAuth: true },
  { id: 'outlook', name: 'Outlook', slug: 'outlook', group: 'Communication', description: 'Mail and calendar from Microsoft 365.', managedOAuth: true },
  { id: 'slack', name: 'Slack', slug: 'slack', group: 'Communication', description: 'Channels, messages and search.', managedOAuth: true },
  { id: 'gcal', name: 'Google Calendar', slug: 'googlecalendar', group: 'Calendar & files', description: 'Events, availability and scheduling.', managedOAuth: true },
  { id: 'gdrive', name: 'Google Drive', slug: 'googledrive', group: 'Calendar & files', description: 'Find, read and upload files.', managedOAuth: true },
  { id: 'dropbox', name: 'Dropbox', slug: 'dropbox', group: 'Calendar & files', description: 'Files and shared folders.', managedOAuth: true },
  { id: 'notion', name: 'Notion', slug: 'notion', group: 'Work', description: 'Pages, databases and search.', managedOAuth: true },
  { id: 'hubspot', name: 'HubSpot', slug: 'hubspot', group: 'Work', description: 'Contacts, companies and deals.', managedOAuth: true },
  { id: 'stripe', name: 'Stripe', slug: 'stripe', group: 'Money', description: 'Customers, payments and invoices.', managedOAuth: true },
  { id: 'quickbooks', name: 'QuickBooks', slug: 'quickbooks', group: 'Money', description: 'Invoices, customers and books.', managedOAuth: true },
  { id: 'xero', name: 'Xero', slug: 'xero', group: 'Money', description: 'Accounting and invoices.', managedOAuth: false },
  { id: 'shopify', name: 'Shopify', slug: 'shopify', group: 'Money', description: 'Orders, products and customers.', managedOAuth: false },
];

const BY_ID = new Map(APPS.map((app) => [app.id, app]));

/** The four states the panel draws, plus inactive. */
const STATE_OF = {
  ACTIVE: 'connected',
  INITIATED: 'pending',
  INITIALIZING: 'pending',
  FAILED: 'needs_attention',
  EXPIRED: 'needs_attention',
  INACTIVE: 'inactive',
  REVOKED: 'not_connected',
};
const STATE_PRIORITY = ['ACTIVE', 'INITIATED', 'INITIALIZING', 'FAILED', 'EXPIRED', 'INACTIVE', 'REVOKED'];

export class ConnectorError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function appById(id) {
  return BY_ID.get(String(id || '').trim().toLowerCase()) ?? null;
}

function redact(value) {
  return String(value || '').replace(SECRET_TEXT, '<redacted>').slice(0, 300);
}

function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh');
}

/** One opaque user id per profile, created once; an unreadable file is an error, never a new id. */
export function identity() {
  const dir = path.join(dshHome(), 'connectors');
  const file = path.join(dir, 'identity.json');
  if (existsSync(file)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new ConnectorError('identity_unreadable', `Cannot read ${file}; restore or remove it explicitly.`, 500);
    }
    const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
    if (!USER_RE.test(userId)) {
      throw new ConnectorError('identity_invalid', `Invalid connector identity in ${file}.`, 500);
    }
    return userId;
  }
  const userId = `dsh_personal_${randomBytes(16).toString('hex')}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `.identity-${process.pid}.tmp`);
  writeFileSync(temp, `${JSON.stringify({ userId, createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
  return userId;
}

export async function apiKey(ctx) {
  const hit = await ctx.credentials.resolve(KEY_REF);
  return typeof hit?.value === 'string' && hit.value ? hit.value : null;
}

async function request(key, method, route, body) {
  let response;
  try {
    response = await fetch(`${BASE}${route}`, {
      method,
      headers: {
        'x-api-key': key,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ConnectorError('upstream', `Composio request failed: ${redact(error?.message)}`, 502);
  }
  const text = await response.text();
  if (text.length > MAX_BODY) throw new ConnectorError('upstream', 'Composio response was too large.', 502);
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ConnectorError('upstream', 'Composio returned a non-JSON response.', 502);
    }
  }
  if (!response.ok) {
    throw new ConnectorError('upstream', `Composio ${response.status}: ${redact(text)}`, 502);
  }
  return payload ?? {};
}

async function listPages(key, route, params) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ ...params, limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const payload = await request(key, 'GET', `${route}?${query.toString()}`);
    if (Array.isArray(payload.items)) items.push(...payload.items.filter((item) => item && typeof item === 'object'));
    cursor = typeof payload.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : null;
    if (!cursor) break;
  }
  return items;
}

function accountSlug(account) {
  const slug = account?.toolkit?.slug;
  return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
}

function publicAccount(account) {
  const id = typeof account?.id === 'string' ? account.id.trim() : '';
  if (!ACCOUNT_ID_RE.test(id)) return null;
  const display = account?.state?.val?.displayName;
  return {
    displayName: typeof display === 'string' ? display.slice(0, 120) : '',
    status: typeof account?.status === 'string' ? account.status : '',
    createdAt: typeof account?.created_at === 'string' ? account.created_at.slice(0, 40) : '',
  };
}

function stateOf(accounts) {
  if (!accounts.length) return ['not_connected', null];
  for (const wanted of STATE_PRIORITY) {
    const found = accounts.filter((account) => String(account?.status || '') === wanted);
    if (found.length) {
      found.sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
      return [STATE_OF[wanted] ?? 'not_connected', publicAccount(found[0])];
    }
  }
  return ['not_connected', publicAccount(accounts[0])];
}

function entry(app, { state = 'not_connected', account = null, canConnect = false, reason = null } = {}) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    group: app.group,
    description: app.description,
    managedOAuth: app.managedOAuth,
    state,
    account,
    canConnect,
    reason,
  };
}

/** The catalog's full state; a Composio failure is reported, never thrown to the page. */
export async function composioStatus(ctx) {
  const key = await apiKey(ctx);
  if (!key) {
    return {
      configured: false,
      error: null,
      apps: APPS.map((app) =>
        entry(app, { canConnect: false, reason: `Store ${KEY_REF} to connect apps.` }),
      ),
    };
  }
  try {
    const userId = identity();
    const accounts = await listPages(key, '/connected_accounts', { user_ids: userId });
    const apps = APPS.map((app) => {
      const mine = accounts.filter((account) => accountSlug(account) === app.slug);
      const [state, account] = stateOf(mine);
      return entry(app, {
        state,
        account,
        canConnect: app.managedOAuth,
        reason: app.managedOAuth
          ? null
          : 'Composio has no managed sign-in for this app yet; create an auth config first.',
      });
    });
    return { configured: true, error: null, apps };
  } catch (error) {
    const message = error instanceof ConnectorError ? error.message : redact(error?.message);
    return {
      configured: true,
      error: { code: error?.code || 'upstream', message },
      apps: APPS.map((app) => entry(app, { canConnect: false, reason: message })),
    };
  }
}

async function authConfigId(key, app) {
  const existing = await request(key, 'GET', `/auth_configs?toolkit_slug=${encodeURIComponent(app.slug)}&limit=1`);
  if (Array.isArray(existing.items)) {
    for (const item of existing.items) {
      if (typeof item?.id === 'string' && item.id) return item.id;
    }
  }
  if (!app.managedOAuth) {
    throw new ConnectorError(
      'managed_auth_unavailable',
      `Composio has no managed sign-in for ${app.name}. Create an auth config for it in the Composio project, then connect again.`,
      409,
    );
  }
  const created = await request(key, 'POST', '/auth_configs', {
    toolkit: { slug: app.slug },
    auth_config: { type: 'use_composio_managed_auth' },
  });
  const id = created?.auth_config?.id;
  if (typeof id !== 'string' || !id) {
    throw new ConnectorError(
      'managed_auth_unavailable',
      `Composio would not create a managed sign-in for ${app.name}.`,
      409,
    );
  }
  return id;
}

function safeLink(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'composio.dev' && !url.hostname.endsWith('.composio.dev')) return null;
  return url.toString();
}

/** Create (or reuse) a managed OAuth sign-in link for one app. */
export async function connectApp(ctx, appId) {
  const app = appById(appId);
  if (!app) throw new ConnectorError('not_in_catalogue', 'Unknown app.', 404);
  const key = await apiKey(ctx);
  if (!key) throw new ConnectorError('not_configured', `Store ${KEY_REF} before connecting apps.`, 409);
  const userId = identity();
  const accounts = await listPages(key, '/connected_accounts', { user_ids: userId });
  const mine = accounts.filter((account) => accountSlug(account) === app.slug);
  const [state] = stateOf(mine);
  if (state === 'connected') return { app: app.id, state, url: null, connectedAccountId: null, expiresAt: null };
  const authId = await authConfigId(key, app);
  const link = await request(key, 'POST', '/connected_accounts/link', {
    user_id: userId,
    auth_config_id: authId,
  });
  const url = safeLink(link.redirect_url);
  if (!url) throw new ConnectorError('upstream', 'Composio did not return a sign-in link this app can open.', 502);
  return {
    app: app.id,
    state: 'pending',
    url,
    connectedAccountId: typeof link.connected_account_id === 'string' ? link.connected_account_id.slice(0, 128) : null,
    expiresAt: typeof link.expires_at === 'string' ? link.expires_at.slice(0, 40) : null,
  };
}

/** Revoke every connected account for one app under this profile's user id. */
export async function disconnectApp(ctx, appId) {
  const app = appById(appId);
  if (!app) throw new ConnectorError('not_in_catalogue', 'Unknown app.', 404);
  const key = await apiKey(ctx);
  if (!key) throw new ConnectorError('not_configured', `Store ${KEY_REF} before disconnecting apps.`, 409);
  const userId = identity();
  const accounts = await listPages(key, '/connected_accounts', { user_ids: userId });
  let removed = 0;
  for (const account of accounts) {
    if (accountSlug(account) !== app.slug) continue;
    const id = typeof account?.id === 'string' ? account.id : '';
    if (!ACCOUNT_ID_RE.test(id)) continue;
    try {
      await request(key, 'DELETE', `/connected_accounts/${encodeURIComponent(id)}?revoke_on_delete=true`);
      removed += 1;
    } catch (error) {
      if (!(error instanceof ConnectorError) || !/404/.test(error.message)) throw error;
    }
  }
  return { app: app.id, removed, state: 'not_connected' };
}

// ── tools plane: one Composio session MCP, registered at runtime ────────────
// The panel connects accounts through REST; the model needs tools. A session
// with search + schemas + execute keeps the tool surface to three meta-tools
// (no per-app schema bloat) and reuses the same project key. The manager's
// registration is owned by this plugin's fiber, and the `x-api-key` header stays
// a credential template so the key never enters the composition.
let sessionRegistration = null;
let sessionId = null;

function safeSessionUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'composio.dev' && !url.hostname.endsWith('.composio.dev')) return null;
  return url.toString();
}

/**
 * Create (once) and register the Composio session MCP with the rc.2 manager.
 * Idempotent; returns `{ registered, error? }`. A failure is reported, not
 * thrown into the page.
 */
export async function ensureComposioSession(ctx) {
  if (sessionRegistration) return { registered: true, sessionId };
  const manager = ctx.get('mcpManager');
  if (!manager || typeof manager.register !== 'function') {
    return { registered: false, reason: 'The MCP manager is not composed on this host.' };
  }
  const key = await apiKey(ctx);
  if (!key) return { registered: false, reason: `Store ${KEY_REF} to enable Composio tools.` };
  try {
    const userId = identity();
    const session = await request(key, 'POST', '/tool_router/session', {
      user_id: userId,
      // Session toolkits must all be auto-provisionable; Shopify/Xero need a
      // project auth config first and would make the whole session fail.
      toolkits: { enable: APPS.filter((app) => app.managedOAuth).map((app) => app.slug) },
      manage_connections: { enable: false },
      workbench: { enable: false },
      search: { enable: true },
      execute: { enable_multi_execute: true },
    });
    const url = safeSessionUrl(session?.mcp?.url);
    if (!url) throw new ConnectorError('upstream', 'Composio did not return a session MCP URL.', 502);
    sessionRegistration = manager.register('composio', {
      transport: 'streamable-http',
      url,
      headers: { 'x-api-key': `\${credential:${KEY_REF}}` },
    });
    sessionId = typeof session.session_id === 'string' ? session.session_id : null;
    return { registered: true, sessionId };
  } catch (error) {
    const message = error instanceof ConnectorError ? error.message : redact(error?.message);
    return { registered: false, error: message };
  }
}

/** Drop the registered session server (plugin unload or session replacement). */
export function disposeComposioSession() {
  if (sessionRegistration) {
    sessionRegistration();
    sessionRegistration = null;
    sessionId = null;
  }
}
