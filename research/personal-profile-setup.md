# Personal DSH host + Profiles panel — setup runbook

Built 2026-11-09. Two independent DSH hosts run side by side, both published **only through Tailscale**,
plus a sidebar **Profiles** panel (design A) in both UIs that lets you jump between them.

## What's running (tailnet URLs)

| Host | Tailnet URL | Local listener | Systemd user unit | DSH home |
|---|---|---|---|---|
| Coding | **https://homelab.taildace6c.ts.net/** | `127.0.0.1:7000` | `dsh-web.service` (pre-existing) | `~/.dsh` |
| Personal | **https://homelab.taildace6c.ts.net:8454/** | `127.0.0.1:7002` | **`dsh-personal.service`** (new) | **`~/.dsh-personal`** (new) |
| Re-auth helper | https://homelab.taildace6c.ts.net/relogin | `127.0.0.1:7001` | `dsh-relogin.service` (pre-existing) | — |

Both DSH units bind loopback only; `tailscale serve` terminates TLS and forwards the browser-facing Host,
which is why each host is launched with `--trusted-host homelab.taildace6c.ts.net`. Both units are
enabled and active; `dsh-personal.service` has `Restart=on-failure`.

### Tailscale Serve map (relevant entries)

```text
https://homelab.taildace6c.ts.net:443
 ├── /        → http://127.0.0.1:7000   (coding)
 └── /relogin → http://127.0.0.1:7001   (pre-existing re-auth helper, coding only)

https://homelab.taildace6c.ts.net:8454
 └── /        → http://127.0.0.1:7002   (personal; added 2026-11-09)
```

8454 was chosen because 443–8453 are already assigned to other local services on this node. The mapping
is persistent (`tailscale serve --bg`), created by `scripts/setup-personal-profile.sh`:

```sh
tailscale serve --bg --https=8454 http://127.0.0.1:7002
```

## First-visit authentication (one time per authority)

DSH mints a new launch token per process; a bare URL returns 401 until the browser exchanges that token
for a signed cookie. The personal host prints its tailnet token URL into its log:

```sh
grep -o 'https://homelab.taildace6c.ts.net:8454/?token=[A-Za-z0-9_-]*' ~/dsh/logs/personal.log | tail -1
```

Open that URL once. The cookie is bound to `homelab.taildace6c.ts.net:8454` and lasts 365 days (the
personal profile patch sets `cookieMaxAgeDays: 365`); it survives restarts and reboots because the signing
secret persists in `~/.dsh-personal/.credentials.yaml`. The panel's **Open** button then works normally.
Coding host: same procedure via `~/dsh/logs/web.log` (or the pre-existing `/relogin` helper at
<https://homelab.taildace6c.ts.net/relogin>), authority `homelab.taildace6c.ts.net` (port 443).

## The Profiles panel (design A)

A zero-build client plugin, written directly (creator mode not needed), installed in **both** profiles:

- left-sidebar entry **Profiles**, global page with one card per host;
- liveness probe (no-cors fetch every 15 s; a reachable host answering 401 counts as online);
- Open (new tab) / Copy URL; the host you're on is tagged **this host**;
- no proxying, so each DSH host keeps its own authority-bound cookie — siloed sessions, schedules,
  memory and plugins.

Source: [`plugins/dsh-profiles/`](../plugins/dsh-profiles/README.md). v0.1.0 keeps the tailnet host list in
`client.js`; edit and reload the page (v0.2: Host Remote + Settings card).

## What the personal home contains

```
~/.dsh-personal/
├── .credentials.yaml          # copied in place from ~/.dsh (same API keys/refs)
├── cordis.patch.yml           # copied home-level patch (search credential pin)
├── storages/                  # per-home state (workspaces, projections)
├── workspace/                 # documentsDirectory for the default first-use workspace
├── logs/                      # startup diagnostics
└── profiles/personal/
    ├── package.json           # bundles: dsh-base + dsh-web-app + dsh-profiles
    ├── cordis.patch.yml       # model route, tailnet trust, cookie age, workspace dir, welcome notice
    └── node_modules/@local/dsh-profiles -> playground plugin
```

Profile patch highlights:

```yaml
- id: llm-pi-ai            # same OpenCode Go flat-rate route as the coding profile
  config: { providers: { opencode-go: { apiKeyEnv: OPENCODE_GO_API_KEY, reasoning: high } } }
- id: agent-default-model
  config: { provider: opencode-go, model: deepseek-v4.1-flash, reasoningEffort: max }
- id: connection           # tailnet Host fence + year-long login
  config:
    trustedHosts: !!js ctx.webStartup.trustedHosts
    cookieMaxAgeDays: 365
- id: workspace-controller # this host has no XDG Documents dir
  config: { documentsDirectory: /home/josh/.dsh-personal/workspace }
```

**Isolation model:** each home has its own sessions, workspaces, schedule tasks, credentials copy,
plugin set and home patch. The DSH *installation* (v0.2.2-rc.1) and project-level skill roots are shared.
Two hosts = two Node processes (~300–900 MB each).

## Commands that created it

- [`scripts/setup-personal-profile.sh`](../scripts/setup-personal-profile.sh) — idempotent: creates the
  home/profile, copies credentials and home patch, installs the panel bundle, writes the systemd unit
  (tailnet flags + `--public-url`), adds the `tailscale serve` mapping, reloads/restarts the unit and polls
  the listeners.
- [`scripts/verify-profiles-ui-tailnet.mjs`](../scripts/verify-profiles-ui-tailnet.mjs) — Playwright
  verification over the tailnet authorities + screenshots in `artifacts/` (`*-tailnet.png`).

## Adding assistant capability to the personal host (next step)

Everything is installed per home, so prefix commands (the unit restarts so plugins take effect):

```sh
DSH_HOME=~/.dsh-personal dsh plugin --profile personal add @goodandready/dsh-messenger-gateway
DSH_HOME=~/.dsh-personal dsh plugin --profile personal add dsh-auto-memory
DSH_HOME=~/.dsh-personal dsh plugin --profile personal add @kanadego/dsh-heartbeat
systemctl --user restart dsh-personal.service
```

The barebones host already has a working model route (OpenCode Go), schedule tools, MCP client and a
default workspace at `~/.dsh-personal/workspace/deepseek-harness`. No IM channel, memory or heartbeat yet.

## Known limitations / TODO

- **First visit per authority** needs the token URL once (cookie then persists for a year).
- The pre-existing `dsh-relogin` helper hardcodes the 443 origin and `dsh-web.service`, so it only
  re-authenticates **coding**. For a personal re-auth helper, either grep the token from
  `~/dsh/logs/personal.log` or run a patched copy of the helper (its `Location` would need
  `https://homelab.taildace6c.ts.net:8454/?token=…`, not a same-origin relative path).
- Panel host list is hardcoded in v0.1.0; v0.2 should expose it through a Host Remote + Settings card and
  could capture one-time token URLs for seamless first visits.
- Liveness probes log a 401 in the browser console (the probe request is unauthenticated by design);
  harmless, and the footer explains it.
- The personal log still contains earlier failed startup attempts from the 7001 port collision (history
  only).
- Coding host's client logs a `ws://127.0.0.1:9230/ingest` 403 — from an existing coding-profile plugin,
  unrelated to the panel.

## Verification evidence

`artifacts/coding-profiles-tailnet.png`, `artifacts/personal-profiles-tailnet.png` (panel over the
tailnet, both cards online, tailnet URLs), `artifacts/*-home-tailnet.png` (UIs after token exchange;
personal shows its Default workspace).
