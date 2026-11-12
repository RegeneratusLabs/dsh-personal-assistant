# External-service connectors — decision record (2026-11-12)

Direction confirmed by the human: **local-first, official MCP plane; Composio is the fallback if it does not
work.** This record is the short version of the full options pack: what is live, which Western apps fit
which route, and the written trigger for switching to Composio.

## What is live now

- DSH **0.2.2-rc.2** on both hosts, which supplies the two prerequisites: the official MCP server manager
  (`mcp-manager`, status/restart/probe over Remote and Settings) and `${credential:REF}` templates in the MCP
  client.
- The **Capabilities** sidebar page (`@local/dsh-capabilities`): Connectors and Plugins in one read-only hub,
  with connector Probe/Restart. Host route `GET /api/capabilities` is owner-gated; no credential, command or
  profile path is returned.
- **One connector, `ping`**: a dependency-free local stdio MCP server
  (`scripts/fixtures/mcp-ping-server.mjs`) wired through the `mcp-manager` row. It proves discovery, tool
  registration, live status (`connected`), probe/restart and the page end to end with **no third-party
  supply chain and no egress**. It is a fixture, not a product connector.

## Western coverage matrix

Route order: **official/provider MCP → community MCP (vet) → Composio**. Status is what has been verified,
not what the vendor claims.

| App | Route | Status / next step |
|---|---|---|
| GitHub | official `github/github-mcp-server` (local stdio/Docker or remote with PAT) | **First real pilot** — token-based, no OAuth; needs a PAT |
| Stripe | official MCP (restricted API key or OAuth) | verify the auth mode; token-based → second pilot candidate |
| Notion | official remote MCP | OAuth → **Composio trigger candidate** |
| Slack | official/community MCP | OAuth → trigger candidate |
| Gmail / Google Calendar / Drive | community Google Workspace MCP | OAuth → trigger candidate |
| Outlook / Microsoft 365 | community Graph MCP | OAuth → trigger candidate |
| QuickBooks / Xero | community MCP | OAuth → trigger candidate (accounting = high value) |
| HubSpot | community MCP | token/OAuth to verify |
| Shopify | official/community MCP | API-key/token to verify |
| Dropbox / OneDrive | community/remote MCP | OAuth → trigger candidate |

The matrix is deliberately honest: the DSH-native market has **no mature Western connector catalog**.
`dsh-mcp-connector` (124★) is a Chinese-first data marketplace plus a generic MCP importer — it can import a
Western server, but it does not supply a Western catalog. `dsh-mcp-panel` (93★) is a neutral management
console, not a catalog. Western coverage therefore comes from **per-provider MCP servers** or **Composio**.

## Fallback trigger (write it down, don't vibe it)

Switch the connector plan to **Composio** when any of these is true:

1. **Two of the first three Western apps need OAuth** that the DSH MCP client cannot perform (no OAuth flow,
   no needs-auth state); or
2. the app has **no credible official/community MCP server** and building one is not justified; or
3. per-app setup exceeds roughly **one day** of vetting/wiring; or
4. the assistant must serve a **multi-user base** with per-user connected accounts.

When triggered: use Composio **session MCP with the direct-tools preset** (exact tools, per-action DSH
approval), **not** the Connect meta-tools (`COMPOSIO_MULTI_EXECUTE_TOOL` runs up to 50 actions;
`COMPOSIO_REMOTE_BASH_TOOL` is remote code execution). Store the key in the DSH credential store, put the
MCP URL/headers behind `${credential:…}` where possible, observe egress, and take the paid ZDR tier if the
connector touches mail/calendar. No Composio account is created without a separate human approval.

## Security notes that apply to every connector

- **MCP tools are ordinary tools.** DSH's approval policy is per-tool; a remote write tool is not
  automatically "ask every time". Before adding a connector with write tools, add an explicit allowlist/policy
  or use a read-only tool preset. This is the gap the Capabilities page does not close.
- **stdio = arbitrary code**: pin the server version, scan it, never let the model install one.
- **Secrets**: `${credential:REF}` only; `mcp-manager` enables template expansion; never a literal token in
  the profile patch, env, or logs.
- **Egress**: the fixture is local; a real connector adds its provider domains. Keep `dsh_egress` observed.
- **Prompt injection**: tool results are data, never instructions. Write actions need human approval.

## Next actions

1. Human supplies a **GitHub PAT** (or names a different first Western app and its token). Configure it under
   the `mcp-manager` row with `env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${credential:GITHUB_PERSONAL_ACCESS_TOKEN}' }`,
   store the token in the credential store, restart, and verify the tool list/read call.
2. Attempt the first OAuth app (default Gmail/Calendar) in a scratch profile; if it blocks, record the
   trigger above and ask before opening Composio.
3. Keep the `ping` fixture as the regression connector in the Capabilities verification script.
