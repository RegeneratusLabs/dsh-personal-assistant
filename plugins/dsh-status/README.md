# @local/dsh-status — Status/Health (host half)

Read-only host half of the Status/Health panel. It answers **one** route with **one** aggregated,
sanitized JSON document about the *personal assistant* — `dsh-personal.service`, its DSH home
(`DSH_PERSONAL_HOME` or `~/.dsh-personal`), Hindsight bank `dsh-personal` on `127.0.0.1:9177`,
its telemetry scripts, backups and identity metadata.

The assistant is a **different process** from the one serving this route, so `serving` (this
process) and `agent` (the assistant) are reported separately. The browser half (`client.js`) is
written by the Lead and is the only consumer; this package contributes no model-facing tool.

## Route contract

```
GET /api/dsh-status/status            → 200 application/json; charset=utf-8
GET /api/dsh-status/status?fresh=1    → 200, bypasses the server cache
```

- Registered through `ctx.connection.fetch.register({ path, methods: ['GET'],
  requestBody: 'buffered', fetch })` and disposed via `ctx.effect` (the host-control pattern).
- Auth, the Host/Origin fence and the owner check run **before** the handler
  (`401` unauthenticated, `403` cross-site / non-owner, `404` wrong method). The handler itself
  authenticates nothing and returns `cache-control: no-store` (freshness is in the body).
- **Never throws.** A failed source becomes `sources[].ok:false` + `degraded[]` and the rest of
  the document still renders. If the envelope itself fails, the answer is
  `503 {ok:false, error:'internal', detail}` — still JSON.
- Only `?fresh=1` (or `?fresh=true`) is understood. Every other query parameter is ignored, and
  **no** request input can select a unit, home, bank, host or script.
- Top-level shape (`schemaVersion: 1`):
  `ok, schemaVersion, generatedAt, ageMs, stale, serving, agent,
  health{level, alerts, backup, egress, cost, jobs, curator}, memory, retention, identity,
  notifications, sources[], degraded[]`.
  `sources[]` entries are `{id, ok, ms, asOf?, error?}` only — never the raw value.
  `ageMs` is the age of the oldest contributing value; `stale` is true when any section was
  served from its last good value after a failed refresh.

## Data sources

| Source id | Read |
|---|---|
| `systemd-unit` | one `systemctl --user show` for `dsh-personal.service` |
| `serving` | `/proc/self/cgroup` unit, `DSH_HOME`, profile, loopback origin from argv |
| `listener` | loopback `GET 127.0.0.1:7002/` — a `401` counts as reachable |
| `plugins` | saved profile manifest + installed packages on disk |
| `systemd-timers` | `systemctl [--user] list-timers 'dsh-*' --output=json` (user + system) |
| `hindsight` | `/health`, `/v1/default/banks/dsh-personal/stats`, `…/llm-requests/stats?period=7d` |
| `alerts` | `scripts/telemetry/check-alerts.sh --json` (pinned flags, exit status ignored) |
| `egress` | `scripts/egress/summarize-egress.sh summary --json --no-ptr` |
| `cost` | `~/.dsh-personal/telemetry/cost-today.json` |
| `curator` | newest `~/.dsh-personal/telemetry/curate-YYYY-MM-DD.json` |
| `backup` | newest `~/backups/dsh-personal/{daily,weekly}/*/manifest.json` |
| `retention` | `scripts/ops/retention-report.sh --json` |
| `identity` | `stat` of `~/.dsh-personal/soul/SOUL.md` — **metadata only, contents never read** |
| `notifications` | booleans from this process's env (never the values) |

Every subprocess is `execFile` with an **argv array** (no shell, no interpolation) and pinned
constants. Timeouts: `systemctl` 1.5 s, loopback HTTP 2 s, each script 6 s; the whole response
is budgeted at 8 s.

### Sanitisation (allowlist output)

The route emits only the documented fields. It drops, by construction: this machine's hostname,
backup `owner_user`/`owner_uid`, `dsh.home`/`bin`, `repo.dir`, symlink targets, every `sha256`,
the egress cgroup path and `service_user`, raw script stderr, and destination IPs (only the
matched hostname is kept). Absolute local paths in alert details are replaced with `<repo>`,
`<agent-home>`, `<backups>`, `~`; every emitted string additionally goes through a token-shaped
masker (`sk-…`, `Bearer …`, `token=…`, 32+ char opaque strings).

It never reads `.credentials.yaml`, `*.log`, `/proc/*/environ` or `~/.hermes/**`, never calls
`GET /v1/default/banks`, and pins the bank name `dsh-personal`. Unit names and the bank name are
kept as-is.

## Cache and TTLs

Module-level cache with **per-section TTLs** and **single-flight**: a request arriving during a
refresh joins the in-flight promise. `?fresh=1` skips the TTL check (it still joins a refresh
already running).

| Section | TTL |
|---|---:|
| `agent`, `serving`, `listener`, `plugins` | 5 s |
| `health.jobs` | 15 s |
| `memory` | 10 s |
| `health.alerts` | 30 s |
| `health.egress`, `health.cost`, `health.curator`, `identity`, `notifications` | 60 s |
| `health.backup`, `retention` | 300 s |

An expired section whose refresh fails serves its **last good value** with `stale: true` and the
error attached, and is not retried for 3 s, so a broken source cannot turn into a polling storm.

## Degradation

`health.level` is `ok | warn | alert | degraded` — the worst of alerts, backup, egress, memory
and jobs. `degraded` means "a source is unavailable" (amber, not red): a stopped unit, a missing
repo script, an unreachable Hindsight or a missing backup directory degrades that section only.
`degraded[]` lists the failed sources; `sources[]` carries the per-source error and timing. A
memory-only failure (Hindsight down) never paints the whole panel red.

Not in scope: live-vs-saved plugin composition (that is `GET /api/host-control/status`), any
write verb, memory/session text, and currency cost (no price table exists — tokens only).

## Verify

```sh
cd plugins/dsh-status
node --check index.js
node --test 'test/*.test.mjs'
```

The tests cover the pure helpers only (health level, backup age/limit, token masker, cache
TTL/single-flight/stale with a fake clock, and the response envelope with failing sources).

## Install / rollback

Install with `dsh plugin --profile <profile> add ./plugins/dsh-status` (never hand-write the
`insert` row — the bundle patch is applied by the installer). Rollback:

```sh
dsh plugin --profile web remove @local/dsh-status
systemctl --user restart dsh-web.service   # or Settings → Host control
```

## No-write guarantee

This host half opens no write path: no files written, no service or timer touched, no process
signalled, no Hindsight mutation, no install, no restart, no model-facing tool. It reads pinned
paths under the two DSH homes and the backup root, three approved scripts, `systemctl` read
verbs, and two loopback HTTP endpoints.

## Browser half (`client.js`)

One sidebar entry, **Assistant** (id `assistant`), opening a keyed `main` page rendered by
`PanelPage`. It fetches only `GET api/dsh-status/status` (`credentials: 'same-origin'`,
`cache: 'no-store'`, 9 s abort) — never files or credentials. The page shows a vitals strip, a
lede sentence, hairline sections (memory, scheduled jobs, safety/retention, alerts, egress, token
cost, identity) and a per-source freshness footer. Every section degrades on its own; a missing
route says the host half is not installed, a 401 says the session expired.

Refresh: one request at mount, then a single 60 s interval that only runs while the tab is
visible, a manual Refresh button, and exponential backoff (60 → 120 → 300 s) on failure; the last
good document stays on screen with a `stale` badge. Relative timestamps tick every 15 s.

Styling is token-only: every colour, radius and type size is a `--dsw-*` token reference, with no
literal colour values in the source (enforced by review; `grep -n '#' client.js` is empty). Styles
are injected as one `<style data-plugin="dsh-status">` element and removed when the bundle is
disabled. Copy is `en` + `zh` behind `t()`.

Verification: `node scripts/verify-dsh-status-ui.mjs` (mints the loopback owner cookie, checks the route
shape and the rendered panel, screenshots light/dark/390 into `artifacts/ui/`) and
`node scripts/verify-dsh-status-a11y.mjs` (single h1, main landmark, live regions, AA contrast for every
rendered text style, visible keyboard focus, 200% zoom, reduced motion, 44px coarse-pointer targets).
