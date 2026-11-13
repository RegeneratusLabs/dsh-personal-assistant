# External-service connectors — decision and current state (2026-11-13)

The requirement that settled the architecture: **a user-facing Connect button that opens the provider's OAuth
page.** DSH 0.2.2-rc.2's MCP client/manager has no OAuth flow, no needs-auth state, and no sign-in link, so
that UX cannot be built on the local MCP plane alone. **Composio is the OAuth broker; the local MCP plane keeps
token-based connectors.** This supersedes the earlier “local-first only” decision.

## What is live

| Piece | State |
|---|---|
| **Capabilities** sidebar page on `personal` | live — 12-app Western catalog with Connect/Disconnect, live state, Advanced MCP servers, Plugins |
| **Connect** | host route `POST /api/capabilities/connect` → Composio `POST /connected_accounts/link` → a real `dashboard.composio.dev` sign-in URL, opened in a popup; the card flips to connected when the account is `ACTIVE` |
| **Disconnect** | host route revokes the account (`DELETE /connected_accounts/{id}?revoke_on_delete=true`) |
| **Composio user id** | opaque per-profile `dsh_personal_<32 hex>` in `~/.dsh-personal/connectors/identity.json` (0600); never an email, never `default` |
| **Tools** | a Composio **session MCP** is registered with the rc.2 manager at runtime as `composio` (state `connected`); it exposes `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL` |
| **Token connectors** | `ping` local fixture (connected) and `github` remote read-only MCP (PAT still pending) stay on the local MCP plane |

Verified live: `/api/capabilities` returns `composio.configured: true`, 12 apps, the session tools registered,
and the MCP fleet `ping / github / composio`; Playwright confirms the Connect popup opens to Composio, the
pending state renders, and the page has 0 console errors at 1440 and 390 px. A model turn has already called
the local `mcp__ping__ping` tool and received `pong`.

## Key source and its risk (must be read)

The Composio project key currently in `~/.dsh-personal/.credentials.yaml` was **imported from the pantler
agent's dev profile** at the user's direction. Consequences:

- The personal agent and pantler share one Composio **project** (and its auth configs / billing). The
  assistant uses its own opaque `user_id`, so the panel and tools only see accounts connected under
  `dsh_personal_…`, but the *key* can reach every account in that project. A compromised personal host could
  query pantler's connected accounts.
- Before this becomes a product surface, create a **dedicated Composio project (and key) for the personal
  assistant**, or keep the shared key only for prototyping. Rotate the pantler key if it was ever exposed.
- Hosted custody: Composio stores provider tokens and executes calls; tool payloads are logged by default.
  Zero-data-retention is the paid Standard tier. Treat this as a deliberate exception to the local-first
  posture.

## Catalog (Western apps)

`gmail`, `outlook`, `slack`, `gcal`, `gdrive`, `dropbox`, `notion`, `hubspot`, `stripe`, `quickbooks`, `xero`,
`shopify`. Slugs were verified against Composio's toolkit search. `xero` and `shopify` have **no managed
OAuth** in this project: their Connect button is disabled with a reason until an auth config is created in
Composio. Everything else uses managed auth.

## Tool-plane trade-off

The session MCP uses **search + schemas + multi-execute** (3 tools) to avoid injecting hundreds of per-app
schemas. The cost: `COMPOSIO_MULTI_EXECUTE_TOOL` can batch up to 50 actions, and DSH approval is per tool call,
not per inner action. This is acceptable for the first slice but is **not** a write-safety boundary.

Next refinement: a **direct-tools** session with an explicit per-app tool allowlist (e.g. Gmail read/draft
only, Calendar read/create) so each action is its own DSH tool and approval. That needs a curated slug list per
app and a session refresh when the allowlist changes.

## Next actions

1. Complete the OAuth for **Gmail** or **Google Calendar** from the Capabilities page; the card should turn
   connected and the session tools should see the account. Test one read (“list my last 3 emails”) and one
   draft/read-only Calendar call.
2. Decide on a **dedicated Composio project/key** for the assistant (recommended) vs keeping pantler's.
3. Replace the multi-execute session with the direct-tools allowlist once the first apps are proven.
4. Store the GitHub PAT when convenient; the local read-only GitHub connector remains the token-based
   reference.
