# Restarting a DSH host, and seeing what is waiting for one

Runbook, 2026-11-10. Answers two recurring questions: *how do I restart DSH when I only have
the Web UI?* and *which plugins are stuck behind "restart required"?*

## TL;DR

| Question | Answer |
|---|---|
| Restart from the Web UI? | **No control exists.** The page is served by the process that must restart. |
| Restart at all? | `scripts/ops/dsh-restart.sh [unit]`, or `systemctl --user restart <unit>` from an SSH shell. |
| Which plugins are waiting? | `scripts/ops/dsh-pending.py` — diff of saved bundle selection vs the live client graph. |
| Can pending changes be "pushed through"? | **No.** DSH has no apply/flush operation; a new process is the only flush. |
| One-click UI button? | **Installed on the coding host:** Settings → Host control (`plugins/dsh-host-control/`, see §6). |

Units on this host:

| Host | Unit | Listener | Tailnet |
|---|---|---|---|
| coding | `dsh-web.service` | `127.0.0.1:7000` | `https://homelab.taildace6c.ts.net/` |
| personal | `dsh-personal.service` | `127.0.0.1:7002` | `https://homelab.taildace6c.ts.net:8454/` |

## 1. Why the UI cannot do it

- The Web UI is a client of the Host process; nothing in the shipped client or Host API restarts,
  stops, or respawns that process. The `plugin_manager` tool and the Plugins page only *report* a
  `restart-required` result (`restartReason`: `no-hmr`, `package-moved`, or an HMR pending module).
- `dsh` has no `restart` subcommand (`dsh plugin`, `dsh web`, `dsh headless`, `dsh sdk`, `dsh acp`).
- Restarting is a supervisor action: here, the systemd **user** units. From a phone/laptop over
  tailscale that means SSH (`ssh homelab`), not the browser.
- The one UI-shaped workaround: this box runs two hosts, so hop to the *other* host's chat and ask
  its agent to restart the target unit — a different process, so the request survives.

## 2. `scripts/ops/dsh-restart.sh`

```sh
./scripts/ops/dsh-restart.sh --dry-run            # plan for dsh-web.service (default)
./scripts/ops/dsh-restart.sh dsh-personal.service
```

- Hands the restart to systemd as a **separate transient unit**
  (`systemd-run --user --collect … systemctl --user restart <unit>`). That is what makes it safe to
  call from inside the target unit (agent `bash` tool, Web UI terminal tab): the caller's cgroup is
  killed, the restart job is not.
- From outside the unit (SSH) it also waits, reports the new MainPID and state, and polls the loopback
  listener (expects `401` — up, awaiting the auth cookie).
- Refuses root, missing units, and inactive units; `--dry-run` changes nothing.
- Exit codes: `0` ok, `2` bad/absent unit, `3` not active, `4` no new pid, `5` listener silent.

What the user sees: the tab drops, Reconnect/reload works, and **no new token URL is needed** — the
signed cookie (365 d, secret in `~/.dsh-personal/.credentials.yaml`) survives the restart. Turns in
flight are recorded as interrupted.

## 3. `scripts/ops/dsh-pending.py`

```sh
./scripts/ops/dsh-pending.py                  # all active DSH web units
./scripts/ops/dsh-pending.py dsh-web.service  # one unit
```

How it decides, without trusting any cached list:

1. **Saved state** — `$DSH_HOME/profiles/<profile>/package.json`: `dependencies` plus
   `dsh.profile.bundles`.
2. **Live state** — the client-module graph the running Host serves to a browser. It reads the
   process's own launch token from the unit's log sink (append file or journal), exchanges it for the
   same signed cookie the browser gets, and `GET`s `/` on loopback — read-only, and it never prints
   the token. The `Host` header is set to `--public-url`'s authority when the unit sets one (the
   personal unit's cookie is authority-bound to `homelab.taildace6c.ts.net:8454`).
3. A package that declares `dsh.client`, is in the saved bundle selection, and is **absent** from the
   live graph is an install the process never composed → `PENDING`. The inverse (running, no longer
   selected) is reported as `STALE`.

Not covered, by design: config-only edits to `cordis.patch.yml` rows are hot-reloaded by HMR and are
not reported; host-only bundles (no `dsh.client`) cannot be proven stale this way and appear only as
an install-time hint.

Exit codes: `0` nothing pending, `1` pending work found, `2` could not inspect.

## 4. Finding on 2026-11-10 17:40 (verified)

`dsh-web.service` was started **2026-11-07 17:26** and two selected client plugins are not composed:

| package | installed | in saved bundles | in live graph |
|---|---|---|---|
| `dsh-context@0.83.0` | 17:24:02 today | yes | **no** |
| `dsh-guizang-design` | 17:21:54 today | yes | **no** |

Everything else is live, including packages installed *after* that boot — `dsh-media-desk`
(11-09 19:42), `dsh-web-mobile` (11-09 16:16), `dshmarket` (11-08 14:25). So HMR normally applies an
install live; these two did not. The likely blocker is a pending HMR state left by the market's
cancelled update at 17:19:11 (`@feiyang666/dsh-mobile-remote`, `.dsh-market/log.ndjson`): once a
changed module waits for a restart, later operations also report `restart-required` until the process
restarts. A restart clears it and loads both plugins.

`dsh-personal.service` (up since 17:00) had nothing pending.

## 5. Options that were considered and not taken

- **A `dsh` restart subcommand / Host API route** — upstream change to DSH; out of scope for a
  composition build, and the Host cannot reliably kill+respawn its own supervisor.
- **Supervisor auto-restart on install** (`Restart=always` + sentinel) — turns every plugin install
  into an unattended process bounce mid-conversation; rejected.
- **`dsh-workspace-control`** (a market plugin that ships "restart DSH") — already **REJECTED** in
  `research/plugin-scout-proactivity.md`: no `engines.dsh`, no peers, and much larger blast radius
  (workspace rebuild/merge/rename, session persistence rewrites) than the one feature wanted.

## 6. The Host-control panel (built 2026-11-10)

`plugins/dsh-host-control/` is a zero-build local bundle with two halves:

- **Host** (`index.js`) — two exact Fetch routes on the authenticated `/api` channel (`ctx.connection.fetch`,
  so Connection's Host/Origin fence and the signed cookie are enforced, and only owner Peers arrive):
  `GET /api/host-control/status` and `POST /api/host-control/restart`.
  The unit is derived from the running process (`/proc/self/cgroup`, `MainPID` scan fallback) and
  validated against `^[A-Za-z0-9_.@-]+\.service$`; the restart route takes **no parameters**, so it can
  only restart the unit it runs in. `pending` is computed live: saved `dsh.profile.bundles` entries that
  declare `dsh.client` but have no `ctx.clientModules.clientPath()` — the same difference the Plugins page
  reports once and forgets. Loader rows refine that: a package whose own row never got a fiber, or whose
  fiber is not ACTIVE, is reported as **Failed to load** instead — a restart cannot fix it, and the panel's
  copy says so. Restart is the same `systemd-run --user --collect` hand-off §2 uses, with a 1 s delay so the
  HTTP answer flushes before the socket dies.
- **Client** (`client.js`) — one `settings.section` (Settings → **Host control**): unit/state/PID/uptime/
  listener/profile, the pending list, Refresh, and a confirmed **Restart DSH** button that polls until the
  host answers again ("Host is back.").

No model-facing tool is registered: the agent cannot restart the Host by itself, only a human click can.

Verified end-to-end on a scratch Host home (`/tmp`) run as its own transient unit: status JSON, client
bundle served, method guard (GET on the restart route → 404), restart → new MainPID, **the pre-restart
cookie still authenticates after the restart**, route re-registration with no duplicate errors, and a
Playwright run of the whole UI path (`scripts/verify-host-control-ui.mjs`; screenshots in `artifacts/`).
The live hosts were not restarted by that test.

### Pre-flight finding (2026-11-10 19:00): `dsh-context` cannot load on this profile

A scratch boot of the *real* pending composition (base + web-app + `@local/dsh-host-control` + `dsh-context`
+ `dsh-guizang-design`, with the live `node_modules` symlinked in) showed the two third-party plugins are not
equivalent:

| package | host half | client half | verdict |
|---|---|---|---|
| `dsh-guizang-design@0.1.4` | ACTIVE | live | loads fine after restart |
| `dsh-context@0.83.0` | **import throws** | absent | `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-session` |

Cause: `dsh-context` imports host packages (`@deepseek-ai/dsh-session`, `@deepseek-ai/cordis`) from its
**Host** half, but the profile's `pnpm-workspace.yaml` sets `autoInstallPeers: false`, so those peer
dependencies are never installed under `profiles/web/node_modules/@deepseek-ai/` (only `cosmokit` and
`schemastery` are there). Plugins that only use host packages in their **client** half — `dsh-web-mobile`,
`dshmarket` — are unaffected, because the browser graph maps them. The install report (`restart-required`)
cannot catch this: only an import at boot can.

Options, in order of preference: remove `dsh-context` (restart does not help), or install its peers into the
profile deliberately (`autoInstallPeers: true` + reinstall — this loads a **second** copy of `@deepseek-ai/cordis`
in-process, so treat it as unsupported), or ask upstream for a Host-half build without host-internal imports.
The panel now reports it under **Failed to load** rather than pretending it waits for a restart.

Installed into the coding profile with `plugin_manager install_bundle`; the install itself reports
`restart-required` (`package-moved`), so the first appearance of the button needs one shell restart:

```sh
/home/josh/projects/DSH-playground/scripts/ops/dsh-restart.sh dsh-web.service
```

Rollback: remove the bundle (`plugin_manager remove_bundle`, or Plugins → Remove) and restart.

## 7. If a wider UI control is wanted later

Minimum shape: one small local plugin — a Host route (auth via the existing cookie) that runs the
`systemd-run … restart` hand-off, plus one client button in Settings or the Plugins page, with a
confirmation. Constraints before it may enter `personal`:

- it is a **remote restart control** (denial-of-service surface on an always-on agent) — same class as
  the rejected workspace-control feature, so it needs a ledger row and the §4–§5 admission checklist
  in `research/personal-agent-security.md`;
- hard-code the unit list; no model-facing tool, no parameters from the session;
- keep the callback behind the existing loopback+tailnet authority fence, and log every request to the
  local telemetry sink.

Until then, the two scripts plus the two-host chat workaround cover the workflow.

## 8. Security notes

- DSH launch tokens live in the unit's log sink (`~/dsh/logs/*.log`, 0600 files in a 0700 directory, and the user journal).
  They are per-process, die on restart, and are already noted as a residual in `research/m0-*.md`.
  The scripts read them to authenticate a **read-only loopback GET** and never print them.
- Exchanging a token for a cookie does not invalidate it for the browser (verified: repeated exchanges
  succeed on the running process), so the detector cannot lock the user out.
- `dsh-pending.py` makes no writes anywhere except the OS temp directory via `curl`-free urllib.

Rollback: delete `scripts/ops/dsh-restart.sh`, `scripts/ops/dsh-pending.py`, this file. No host state
was changed to add them.
