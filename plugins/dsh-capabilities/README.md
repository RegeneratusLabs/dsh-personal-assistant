# `@local/dsh-capabilities` — one page for connectors and plugins

A first-party local bundle for the DSH Web GUI. It adds a **Capabilities** entry to the left sidebar and a
page with two sections:

| Section | Source | What it shows |
|---|---|---|
| **Connectors** | `ctx.mcpManager.list()` (rc.2 MCP server manager) | name, live state, configured/removed, first error; **Probe** and **Restart** act on the running manager |
| **Plugins** | `ctx.pluginManager.listBundles()` | name, version, on/off, row count, official marker, load error |

The page is a **read-only hub** on purpose: installation, removal, bundle toggles and connector configuration
stay on the official **Plugins** page and **Settings → Plugins (MCP)**, which own the write checks and
approvals. Probe/restart are the manager's own operations (no profile write).

## Host route

`GET /api/capabilities` returns:

```json
{
  "generatedAt": "2026-11-12T…",
  "connectors": [{ "name": "filesystem", "configured": true, "state": "connected",
                   "reason": null, "error": null, "closeConfirmed": null }],
  "plugins":    [{ "name": "@local/dsh-soul", "version": "0.1.0", "enabled": true,
                   "official": false, "installed": true, "availability": "profile",
                   "update": null, "rows": 1, "description": "…",
                   "error": null }],
  "available": { "pluginManager": true, "mcpManager": true }
}
```

- Registered through `ctx.connection.fetch.register`, so the owner cookie, Host/Origin fence and ownership
  check run before the handler; unauthenticated requests get 401.
- Deliberately omits `source`/`meta`/package paths, server commands and every credential. Errors are
  truncated to 300 characters.
- `POST /api/capabilities/connectors/probe|restart` takes `{"name":"<serverName>"}`, validates the name
  against `[A-Za-z0-9_-]{1,32}`, and calls `ctx.mcpManager.probe|restart`. A host without the manager gets
  `409`.

## Install

```sh
dsh plugin --profile personal add link:/home/josh/projects/dsh-personal-assistant/plugins/dsh-capabilities
systemctl --user restart dsh-personal.service   # or Settings → Host control
```

Rollback: `dsh plugin --profile personal remove @local/dsh-capabilities` + restart.

## Limits (v0.1.0)

- Plugin rows are read-only; no toggle/install action here.
- No connector add/edit form: settings writes remain on the official Settings surface.
- Status is polled every 15 s while the page is mounted; no push stream (the manager's `watch` Remote is not
  mounted by the web client in this build).
- `BundleInfo.update` is reported, not the removed rc.1 `updatable` field.
