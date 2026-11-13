# `@local/dsh-capabilities` — connectors and plugins in one panel

A first-party local bundle for the DSH Web GUI. It adds a **Capabilities** entry to the left sidebar:

| Section | What it does |
|---|---|
| **Connectors** | A curated Western catalog (Gmail, Outlook, Slack, Google Calendar/Drive, Dropbox, Notion, HubSpot, Stripe, QuickBooks, Xero, Shopify) with **Connect / Disconnect**. Connect opens a Composio sign-in link; the card flips to connected when the account is `ACTIVE`. |
| **Advanced — MCP servers** | The raw `mcp-manager` fleet (ping fixture, GitHub read-only, the runtime Composio session), with **Probe / Restart**. |
| **Plugins** | Every bundle in the profile, with version, on/off, row count and load error. Read-only here; install/toggle on the official Plugins page. |

## Host routes (owner-gated)

| Route | Purpose |
|---|---|
| `GET /api/capabilities` | Joins the three planes: `composio` (catalog + state), `connectors` (MCP fleet), `plugins` (bundles). |
| `POST /api/capabilities/connect` `{app}` | Creates/reuses a Composio auth config and returns `{state, url, expiresAt}`. |
| `POST /api/capabilities/disconnect` `{app}` | Revokes the app's connected account(s). |
| `POST /api/capabilities/connectors/probe\|restart` `{name}` | The MCP manager's own operations. |

No route returns the Composio key, the Composio user id, a server command, or a profile path. Account state is
reduced to display name/status. The routes run on the shared `/api` channel, so the owner cookie, Host/Origin
fence and ownership check run before every handler (401 unauthenticated).

## Composio broker

- Key: `COMPOSIO_API_KEY` in the DSH credential store (0600). The current key was imported from the pantler
  project at the user's direction; see the shared-project risk in
  [`research/connectors-options.md`](../../research/connectors-options.md).
- User id: opaque `dsh_personal_<32 hex>` in `~/.dsh-personal/connectors/identity.json` (0600), created once.
- Connect: auth config (`use_composio_managed_auth`) → `POST /connected_accounts/link` → sign-in URL.
- Disconnect: `DELETE /connected_accounts/{id}?revoke_on_delete=true`.
- Tools: a Composio **session MCP** is registered at runtime as `composio` (`search` + `get schemas` +
  `multi-execute`). The manager owns the instance; the key stays a `${credential:…}` header template.

## Install

```sh
dsh plugin --profile personal add link:/home/josh/projects/dsh-personal-assistant/plugins/dsh-capabilities
systemctl --user restart dsh-personal.service
```

Rollback: `dsh plugin --profile personal remove @local/dsh-capabilities` + restart.

## Limits (v0.2.0)

- Plugin rows are read-only; no install/toggle action.
- `xero` and `shopify` have no managed OAuth in the current project; their Connect is disabled until an auth
  config exists.
- The Composio session exposes **multi-execute**, not per-action tools; DSH approval is per tool call, so this
  is not a write-safety boundary. A direct-tools allowlist is the next refinement.
- The session is created on the first page read and reused; a host restart refreshes it. A session that
  expires needs a restart (or a future reconnect path).
- Status is polled every 8 s; no push stream.
