# Connectors on the personal host

The rc.2 `mcp-manager` row owns the profile's connector fleet. This directory holds the reproducible pieces:

| File | What it is |
|---|---|
| [`personal-mcp-manager.patch.yml`](personal-mcp-manager.patch.yml) | The `servers` map appended to `~/.dsh-personal/profiles/personal/cordis.patch.yml` |
| [`set-credential.py`](set-credential.py) | No-echo writer for one ref in the 0600 credential store |
| [`../fixtures/mcp-ping-server.mjs`](../fixtures/mcp-ping-server.mjs) | Dependency-free local stdio fixture (one `ping` tool) used as the regression connector |

## The two connectors

| Name | Transport | Scope | Credential |
|---|---|---|---|
| `ping` | stdio | local fixture, one read-only tool | none |
| `github` | streamable HTTP → `https://api.githubcopilot.com/mcp/` | **read-only**, toolsets `repos,issues,pull_requests` | `GITHUB_PERSONAL_ACCESS_TOKEN` |

The GitHub entry deliberately sets `X-MCP-Readonly: true` and `X-MCP-Toolsets`; the remote server then
exposes only read tools from those three groups. It does **not** expose `create_pull_request`,
`merge_pull_request`, `delete_file`, Actions or Copilot tools.

## Store the GitHub PAT

Never paste a token into chat, a shell argument, or a tracked file. Run this in a terminal on the host:

```sh
cd /home/josh/projects/dsh-personal-assistant
python3 scripts/connectors/set-credential.py GITHUB_PERSONAL_ACCESS_TOKEN
```

It prompts with no echo, inserts the ref into `~/.dsh-personal/.credentials.yaml` (0600), and prints only the
ref name. The rc.2 manager notices the credential and reconnects the `github` server without a restart.

Minimum token scope: a fine-grained PAT with **read-only** access to the repositories you want the assistant
to see (or a classic `repo`-read token). The server itself is constrained read-only, but the token is the real
boundary.

## Verify

1. Open the **Capabilities** page on `personal` (port 7002 / tailnet `:8454`). `github` should move from
   **waiting for credentials** to **connected** within ~15 s; the page polls.
2. Or read the owner-gated route (replace the URL with a launch-token URL if you do not have a cookie):

   ```sh
   curl -s -b cookies.txt http://127.0.0.1:7002/api/capabilities | jq '.connectors'
   ```

3. In a new personal session, ask for a repository list or a file read. The tool names are
   `mcp__github__*`; the remote server's read-only restriction is visible in what it advertises.
4. Egress check: the service now reaches `api.githubcopilot.com` only when the connector is used; the
   `dsh_egress` counter and the telemetry digest are the observation points.

## Disable or remove

- Temporary: set `enabled: false` on the `github` entry (or use Settings → Plugins (MCP)).
- Remove: delete the `github` block from the profile patch and restart; the manager unmounts it.
- Roll back the whole connector patch: restore `cordis.patch.yml.bak-connector-*` and restart.

## Next connectors

Stripe (restricted key) and Notion/Slack (OAuth) are the next candidates. An app that needs an interactive
OAuth flow is the written **Composio trigger** — see [`research/connectors-options.md`](../../research/connectors-options.md).
