# Connectors on the personal host

The Capabilities panel (`plugins/dsh-capabilities`) owns the user experience; this directory holds the
reproducible pieces.

| File | What it is |
|---|---|
| [`personal-mcp-manager.patch.yml`](personal-mcp-manager.patch.yml) | The `servers` map appended to `~/.dsh-personal/profiles/personal/cordis.patch.yml`: the local `ping` fixture and the read-only GitHub remote MCP |
| [`set-credential.py`](set-credential.py) | No-echo writer for one ref in the 0600 credential store |
| [`../fixtures/mcp-ping-server.mjs`](../fixtures/mcp-ping-server.mjs) | Dependency-free local stdio fixture (one `ping` tool) |
| [`../../research/connectors-options.md`](../../research/connectors-options.md) | Decision record, catalog, Composio key risk, next steps |

## Two planes

**OAuth apps (Composio).** The Capabilities catalog connects Gmail, Outlook, Slack, Google Calendar/Drive,
Dropbox, Notion, HubSpot, Stripe, QuickBooks, Xero and Shopify. A host route creates a Composio sign-in link;
the user completes it in the popup; the card flips to connected. A Composio session MCP registered at runtime
gives the model `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS` and `COMPOSIO_MULTI_EXECUTE_TOOL`.

**Token MCP servers (local).** `ping` is the offline fixture; `github` is GitHub's hosted remote MCP,
read-only and limited to `repos,issues,pull_requests`, waiting for a PAT.

## Keys

- `COMPOSIO_API_KEY` is already stored in `~/.dsh-personal/.credentials.yaml` (0600), imported from the
  pantler dev profile at the user's direction. **Shared-project risk:** the key can reach pantler's connected
  accounts; the assistant uses its own opaque user id, but a dedicated Composio project/key is the right
  production move.
- A GitHub PAT is optional; store it with:

```sh
cd /home/josh/projects/dsh-personal-assistant
python3 scripts/connectors/set-credential.py GITHUB_PERSONAL_ACCESS_TOKEN
```

The helper prompts with no echo, writes 0600, and prints only the ref name. The rc.2 manager reconnects the
affected server automatically.

## Verify

```sh
# owner-gated route (use a launch-token URL + cookie from the personal host)
curl -s -b cookies.txt http://127.0.0.1:7002/api/capabilities | jq '.composio | {configured, error, apps: [.apps[] | {id,state,canConnect}]}'

# UI smoke: sidebar, catalog, Connect popup, pending state, no console errors
node scripts/verify-capabilities-ui.mjs "<token-url>" capabilities
```

The UI script opens the Composio sign-in popup and closes it without completing the flow; clean any pending
account with the Disconnect button or `POST /api/capabilities/disconnect {"app":"gmail"}`.

## Disable or remove

- Disable an OAuth app: Disconnect in the panel (revokes the account), or remove the app from
  `plugins/dsh-capabilities/composio.js` `APPS`.
- Remove an MCP server: delete its block from the profile patch and restart.
- Roll back the whole connector patch: restore `cordis.patch.yml.bak-connector-*` and restart.
