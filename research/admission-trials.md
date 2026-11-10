# M0.5 admission trials — Hindsight memory + official session search

**Scope:** scratch-profile trials (not `personal`) for the two memory/recall adoptions pinned by the
shortlist: `@vectorize-io/hindsight-coding-agents@0.8.6` (self-hosted, bank `dsh-personal`) and
`@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`. Static scans are in
[`admission-scans.md`](admission-scans.md); admission rules are
[`personal-agent-security.md`](personal-agent-security.md) §4–§5; stack decision is
[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) §2.

**Status:** trials run **2026-11-10 18:38–18:56 AEST** on the shared host. **Verdicts: PASS / PASS**
(composition, boot, pinning, isolation), each with M1 conditions. No host change outside the two scout
profiles; the live `personal` host (`127.0.0.1:7002`) and its DSH_HOME were not touched.

**Environment:** DSH `0.2.2-rc.1` (`/home/josh/dsh/node/bin/dsh`), Node `v24.22.1`, pnpm `12.9.1`,
`DSH_HOME=/home/josh/.dsh`, profiles `scout-mem` / `scout-search`, Hindsight `0.10.3` at
`http://127.0.0.1:9177` (bank `dsh-personal`, 0 facts), host `@deepseek-ai/cordis` `4.1.0`.
**Ports:** `scout-mem` on **7014**, `scout-search` on **7012**. 7011 was already held by a concurrent
`dsh --profile ht` trial (separate `DSH_HOME=/tmp/dsh-ht-home`, another teammate's process — not killed).

## 0. Trial matrix

| # | Package @ version | Integrity (sha512) | Install | Boot (127.0.0.1) | HTTP `/`, `/api/health` | Boot ms | Tools/rows | Egress at boot | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `@vectorize-io/hindsight-coding-agents@0.8.6` | `sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` | `dsh plugin add`, +1 pkg, 1.8 s | `:7014` | **401 / 401** (`/health` 404) | **3,732** (clean) | 8 `hindsight_*` tools registered | 0 `connect()` syscalls | **PASS** (M1 conditions §3.6) |
| 2 | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` | `sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` | `dsh plugin add`, +7 pkgs, 2.1 s | `:7012` | **401 / 401** (`/health` 404) | **3,784** (clean, bundle defaults) | group + sqlite provider + 5-tool plugin composed; FTS5 index opens (A/B §4.4) | 0 `connect()` syscalls | **PASS** (M1 conditions §4.6) |

No `latest`, no ranges in the profiles, no version exemptions (`dsh plugin version-exemptions` → `{}` for
both), no install/build scripts executed, no `approvedBuilds`.

## 1. Setup surprises (read first)

1. **The literal task command `dsh plugin --profile scout-mem --from-default-profile web` does not exist.**
   `--from-default-profile` is a *launcher* flag; `dsh plugin` forwards its remaining arguments to pnpm, so
   the command would fail. A profile can be created **without booting** (and without colliding with the live
   UI on `:7000`) by:
   `dsh --profile scout-mem --from-default-profile web --dump-config >/dev/null`.
   `--dump-config` calls `prepareProfile()` which initializes the profile from the shipped `web` template
   (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`), then exits. Verified: profile dir created,
   `package.json`/`cordis.patch.yml`/`cordis.yml`/`pnpm-workspace.yaml` written, exit 0.
2. **`dsh plugin add` auto-appends the bundle.** For both packages (each declares `dsh.bundle.patch`), the
   package is added to the profile's `dsh.profile.bundles`; no hand-written `insert` row was needed (and none
   was written — see `AGENTS.md` hard rule).
3. **Readiness is not "listener exists".** The HTTP listener appears ~1 s before the tree settles: the first
   probe returned **404**, then **401**. The trial treats `GET /` → **401** on the *dsh PID's* listener as
   "serving". 404/401 split matches the live hosts (`:7002`, `:7000`): `/` and `/api/health` → 401,
   `/health` → 404.
4. **The web app prints a launch token** (`dsh web: http://127.0.0.1:PORT/?token=…`). Every captured log in
   this trial was redacted (`token=<REDACTED>`) before being quoted here; the raw scratch logs in `/tmp` were
   redacted in place after the trial. No credential or launch token appears in this document or the repo.
5. **Port 7011 was taken** by a concurrent `dsh --profile ht` trial (separate DSH_HOME). The task's shared
   description allows `>=7011`, so `scout-mem` used **7014**; `scout-search` used the assigned **7012**. The
   other trial was not signalled, inspected further, or touched.

## 2. Exact commands (both trials)

```sh
# environment
export DSH=/home/josh/dsh/node/bin/dsh
export DSH_HOME=/home/josh/.dsh          # coding home only; never ~/.dsh-personal
cd /home/josh/projects/DSH-playground    # cwd = git repo (matters for Hindsight bank resolution)

# --- profile creation (no boot, no :7000 collision) ---
$DSH --profile scout-mem    --from-default-profile web --dump-config >/dev/null
$DSH --profile scout-search --from-default-profile web --dump-config >/dev/null

# --- pinned installs ---
$DSH plugin --profile scout-mem    add @vectorize-io/hindsight-coding-agents@0.8.6
$DSH plugin --profile scout-search add @deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1

# --- boot (bounded, 127.0.0.1, own PID killed only) ---
env DSH_HOME=$DSH_HOME \
    HINDSIGHT_CONFIG=/tmp/scout-mem-trial/hindsight-coding-agent.json \
    HINDSIGHT_LOG_FILE=/tmp/scout-mem-trial/plugin.log HINDSIGHT_LOG_LEVEL=debug \
    $DSH --profile scout-mem --host 127.0.0.1 --port 7014 --no-open

$DSH --profile scout-search --host 127.0.0.1 --port 7012 --no-open

# --- egress / subprocess proof: trace the boot ---
strace -f -e trace=execve,connect -o /tmp/scout-mem-trial/strace-exec.log \
  env DSH_HOME=$DSH_HOME HINDSIGHT_CONFIG=/tmp/scout-mem-trial/hindsight-coding-agent.json \
  $DSH --profile scout-mem --host 127.0.0.1 --port 7014 --no-open

# --- read-only config-resolution probe (no network: diagnose is local) ---
node /home/josh/.dsh/profiles/scout-mem/node_modules/@vectorize-io/hindsight-coding-agents/dist/mcp-server.js
#   (JSON-RPC over stdio: initialize -> tools/call hindsight_diagnose)
```

## 3. Trial 1 — `@vectorize-io/hindsight-coding-agents@0.8.6`

### 3.1 Admission facts

| Field | Value |
|---|---|
| Version pinned | `0.8.6` (exact; profile `package.json` + `pnpm-lock.yaml` + `node_modules` all `0.8.6`) |
| sha512 | `sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` |
| License field | **absent** in npm metadata/package.json (README says MIT; treat as unverified) |
| Repo | `git+https://github.com/vectorize-io/hindsight.git` |
| `engines` / `peerDependencies` / runtime `dependencies` | **none** (0 npm deps) |
| Size / files | 16.7 MB unpacked, 61 code files, multi-harness bundle (~0.7–1.2 MB per entrypoint) |
| Install scripts | none (`scripts` are build/test/prepublish only; pnpm never runs them on install) |
| DSH entry | `exports["./dsh"] → dist/dsh.js`; bundle patch `./cordis.patch.yml` |
| Compatibility admission | `evaluatePluginCompatibility(manifest, {}, "0.2.2-rc.1")` → **undefined (COMPATIBLE)**: no `engines.dsh` and no `@deepseek-ai/dsh*` peers to check. CLI admitted silently; no exemption needed (`version-exemptions` = `{}`). Package is **not** in the market discovery-compatibility cache (CLI install path, not market UI). |
| Install | `+1 package`, pnpm `Done in 1.8s`, wall 2.30 s; no peer warnings |

Targeted re-scan of the exact runtime entrypoint (`dist/dsh.js`, my run): `eval(` 0, `new Function` 0,
`child_process` imports 8, `execFile` sites 17, `spawn` sites 0 occurrences of literal `spawn(` (imports use
`spawn as …`). Sites are **dormant at boot** in self-hosted mode: background seed (`src/core/seed.ts`),
auto-update (`src/core/auto-update.ts`), local daemon mode (`src/core/daemon.ts`), `git` reads
(`src/core/git.ts`, `status.ts`, `survey.ts`, `deepen`). One hard-coded cloud URL
`https://api.hindsight.vectorize.io` (the default, see §3.3) and `process.env` access (config/env layer).
No credential-store access found. Static scan details remain owned by [`admission-scans.md`](admission-scans.md).

### 3.2 Composed rows

`--dump-config` (profile layer) shows the bundle inserts exactly one row, with **no config**:

```yaml
- id: hindsight
  name: '@vectorize-io/hindsight-coding-agents/dsh'
```

### 3.3 SURPRISE — config is *outside* Cordis; a profile-patch `config:` block is inert

The shortlist/task assumed `serverMode`/`apiUrl`/`bankId` are pinned "in the profile patch". They are not:

- `dist/dsh.js` `apply(ctx)` (line 19251) takes **no config argument**; the row has no config schema. Config
  is loaded per workspace by `loadConfig()` (line 1857) from, later-wins:
  env vars → **`~/.hindsight/coding-agent.json`** (`CONFIG_PATH`, line 1529) → `harnesses.<name>`.
  `HINDSIGHT_CONFIG` relocates the file; `HINDSIGHT_SERVER_MODE` / `HINDSIGHT_API_URL` /
  `HINDSIGHT_BANK_ID` override single fields.
- **Probe (ran):** added `- id: hindsight` + `config: {disabled: true, bankId: CORDIS-CONFIG-PROBE}` to the
  profile patch (composed row confirmed via `--dump-config`), booted with a *valid* external config. The
  plugin still registered all **8 tools** (`plugin.log`: `tools registered {"count":8,…, "hindsight":8}`) →
  the Cordis config was **ignored**. A `config:` block in `personal`'s patch would be a false sense of
  security. Probe row was reverted; final profile patch is empty.

**Documented defaults** (empirical: `hindsight_diagnose` MCP tool run with `HOME` pointed at an empty dir,
no config, no network):

| Field | Default | Risk |
|---|---|---|
| `serverMode` | `cloud` | would talk to the cloud |
| `apiUrl` | **`https://api.hindsight.vectorize.io`** | **cloud endpoint by default** |
| `bankId` | unset → dynamic `bankIdTemplate` = **`coding-agent::{gitProject}`** (diagnose: `coding-agent::DSH-playground`) | **not** the Hermes bank `josh` (good) but a new per-repo bank every time (bad for a personal assistant) |
| `dynamicBankId` | true iff no `bankId` | — |
| `autoInject` | `reflect` | one injected block per first prompt (7 s budget, fallback) |
| `retainSessions` | true | auto-capture on |
| `disabled`, `optInOnly` | false / false | memory on for every workspace |

### 3.4 Pinned configuration used for the trial (and recommended for M1)

Trial config file (0600, `/tmp` — **not** the shared `~/.hindsight/coding-agent.json`, which does not exist
on this host and is shared by every Hindsight coding-agent harness):

```json
{ "serverMode": "self-hosted", "apiUrl": "http://127.0.0.1:9177",
  "bankId": "dsh-personal", "dynamicBankId": false, "autoInject": "reflect" }
```

Read-only `hindsight_diagnose` (MCP stdio, local, no network) with that config:

```json
{ "bank_id": "dsh-personal", "harness": "dsh", "workspace": "/home/josh/projects/DSH-playground",
  "config": { "path": "/tmp/scout-mem-trial/hindsight-coding-agent.json", "exists": true,
              "api_url": "http://127.0.0.1:9177", "api_token_configured": false, "disabled": false } }
```

→ pinned resolution is exactly `self-hosted` + `127.0.0.1:9177` + bank `dsh-personal`.

### 3.5 Boot evidence

| Check | Evidence |
|---|---|
| Serving | `GET /` **401**, `GET /api/health` **401**, `GET /health` 404 (matches live hosts) |
| Listener ownership | `ss -ltnp` → `127.0.0.1:7014 … pid=<our dsh PID>` |
| Boot time | **3,732 ms** start → first 401 (clean boot, final profile state); 3,925 ms earlier run; ~5.7 s under strace |
| Boot log | exactly one line: `dsh web: http://127.0.0.1:7014/?token=<REDACTED>` — no warnings, no `did not activate`, no errors |
| Plugin log | `DEBUG [dsh] tools registered {"count":8,"hostCatalog":8,"hindsight":8}` |
| Egress | `strace -f -e trace=execve,connect` over the whole boot: **0 non-UNIX `connect()`** calls (positive control: tracing `curl http://127.0.0.1:9177/health` records its AF_INET connect), **3 `execve`** (env → dsh script → node launch chain only), **no child processes** at readiness |
| Domains in logs | only the printed `http://127.0.0.1:7014` banner; no cloud/registry/other domains |
| Shutdown | SIGTERM → exit 0, port freed; only our PID was signalled |

### 3.6 Isolation / host state

- `dsh-personal` bank before and after: **0 facts, 0 documents, 0 observations** (never written — no session
  was created, so auto-capture/seed never ran).
- `~/.hindsight/` unchanged (no `coding-agent.json`, no `coding-agents-logs/`; log/diag paths were redirected
  to `/tmp` for the trial). `~/.hermes` untouched. Hermes banks (`josh` 58,310 facts etc.) untouched.
- No writes to `$DSH_HOME/cordis.patch.yml` (home-level layer mtime unchanged, still only
  `web-search-deepseek`). The README's `npx … install dsh` route *would* write a home-level row affecting
  every profile — **we used the published-package (profile) route instead**.

### 3.7 Verdict

**PASS** — composes, boots cleanly on 0.2.2-rc.1, registers its 8 tools, and is pinnable to
`self-hosted` + `127.0.0.1:9177` + `dsh-personal` with zero egress at boot.

**M1 conditions (must be explicit):**
1. Pin config **outside** Cordis: either set `Environment=HINDSIGHT_CONFIG=/home/josh/.dsh-personal/hindsight/coding-agent.json`
   (0600, backed up) in the unit, or write `~/.hindsight/coding-agent.json` **only if** no other harness on
   the host depends on it (it is absent today). A profile-patch `config:` block does nothing.
2. Never boot `personal` without that config: the default is the **cloud endpoint** with a dynamic
   `coding-agent::<gitProject>` bank.
3. First real session will (a) seed the `dsh-personal` bank and (b) install the companion skill — verify both,
   and verify `forget`/bank isolation then (M1 acceptance), not in this trial.
4. The 17 `execFile`/git/auto-update/daemon code paths are dormant here; re-read them if `gitIngest`,
   daemon mode, or auto-update is ever enabled.

## 4. Trial 2 — `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`

### 4.1 Admission facts

| Field | Value |
|---|---|
| Version pinned | **`0.2.2-rc.1`** (exact) — verified in profile `package.json`, `pnpm-lock.yaml`, `node_modules`; **not** npm `latest` `0.2.1-alpha.2` |
| Why not `latest` | npm `dist-tags.latest = 0.2.1-alpha.2` declares peer `@deepseek-ai/cordis ~4.0.5-alpha.1`; host cordis is **4.1.0** → wrong peer. `0.2.2-rc.1` declares `@deepseek-ai/cordis ~4.1.0` (matches). `next = 0.2.2-rc.1`. |
| sha512 | `sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` |
| License | MIT; repo `github.com/deepseek-ai/deepseek-harness` (`packages/experimental/session-search`) — first-party |
| Dependencies (exact) | `@deepseek-ai/dsh-session-query-sqlite@0.2.2-rc.1`, `@deepseek-ai/dsh-tool-session-query@0.2.2-rc.1` → transitively `@deepseek-ai/dsh-brand@0.2.2-rc.1`, `@deepseek-ai/cosmokit@1.9.0`, `@deepseek-ai/schemastery@3.19.0` (7 packages installed) |
| Peers | `@deepseek-ai/cordis ~4.1.0` (satisfied by host 4.1.0). Child packages add `@deepseek-ai/dsh-*@0.2.2-rc.1` peers, supplied by the host install anchor at runtime. |
| Compatibility admission | `evaluatePluginCompatibility` → **COMPATIBLE** for the plugin and both children. DSH's checker only evaluates `engines.dsh` (absent) or `@deepseek-ai/dsh`/`@deepseek-ai/dsh-*` peers; the `@deepseek-ai/cordis` peer is outside that check but matches the host. CLI admitted silently; `version-exemptions` = `{}`; not in the market compat cache. |
| Install | `+7 packages`, pnpm `Done in 2.1s`, wall 2.78 s. pnpm printed `[WARN] Issues with peer dependencies found` — expected: `pnpm-workspace.yaml` has `autoInstallPeers: false`, peers come from the DSH install anchor (verified by a clean boot). |
| Install scripts | none |
| Static re-scan (my run) | the 3 packages: 0 `child_process`/`spawn`/`eval`/`new Function`, 0 `process.env`, 0 `https?://` |

### 4.2 Composed rows (bundle defaults, before trial override)

```yaml
- id: optional-session-search
  name: cordis:group
  group: true
  isolate: { sessionQuery: true }
  config:
    - id: optional-session-query-sqlite
      name: '@deepseek-ai/dsh-session-query-sqlite'
      config: { path: ':memory:', openAt: 'first-search' }
    - id: optional-tool-session-query
      name: '@deepseek-ai/dsh-tool-session-query'      # 5 read-only tools, no config
```

The bundle is **opt-in** (`dsh.bundle.listedByDefault: false`, ships switched off); enabling = present in
`dsh.profile.bundles`, which `dsh plugin add` did. The five tools are `session_search`,
`session_event_search`, `session_trace`, `session_event_trace`, `session_event_read` (README).

### 4.3 SURPRISE — a patch replaces a row's `config` **wholesale**

The first A/B attempt set only `path` and expected the bundle's `openAt: first-search` to remain. It did
not: the patch replaced the whole config, so the provider fell back to its own default `openAt: startup`
(the index opened at boot). This is the same trap documented for the `connection` row in the web profile —
**restate every key** (`path` **and** `openAt`) in any session-search override.

### 4.4 "Search opens" proof (A/B)

Trial override (reproduce exactly):

```yaml
- id: optional-session-query-sqlite
  config:
    path: /tmp/scout-search-trial/session-search.db
    openAt: startup
```

| `openAt` | Index file after boot | Evidence |
|---|---|---|
| `startup` (explicit) | **created, 36,864 B, mode 0600** | `sqlite_master` = `persisted_sessions`, `search_state`, FTS5 virtual table `persisted_docs` + 5 FTS5 shadow tables (`persisted_docs_{config,content,data,docsize,idx}`); `PRAGMA application_id = 1146308689`, `user_version = 8` → the FTS5 derived index opened and initialized at activation |
| `first-search` (explicit) | **absent** | lazy path: the provider defers `node:sqlite`/index opening until the first search (README contract) — confirmed by a second boot |

The clean boot (final profile state, bundle defaults `:memory:` + `first-search`) also serves 401 with no
index file — the index opens in memory on the first model search. **A model-driven `session_search` call was
not run in M0.5** (it needs a model turn); the five tools' registration is evidenced by: composed rows,
zero `did not activate` warnings (a failing entry prints `dsh: warning: N entry did not activate` plus a
stack trace — observed in the concurrent `ht` trial, not here), and the peer tree resolving at boot.
The real acceptance test ("session search finds an old conversation") belongs to M1.

### 4.5 Boot evidence

| Check | Evidence |
|---|---|
| Serving | `GET /` **401**, `/api/health` **401**, `/health` 404 |
| Listener ownership | `ss -ltnp` → `127.0.0.1:7012 … pid=<our dsh PID>` |
| Boot time | **3,784 ms** (clean, bundle defaults); 3,916 ms (index-at-startup run); 4,011/4,027 ms A/B runs; ~5.8 s under strace |
| Boot log | one line: `dsh web: http://127.0.0.1:7012/?token=<REDACTED>` — no warnings/errors |
| Egress | `strace -f -e trace=connect` over the boot: **0 non-UNIX `connect()`** calls; no sockets held at readiness |
| Shutdown | SIGTERM → exit 0, port freed; only our PID signalled |

### 4.6 Verdict

**PASS** — exact pinned version composes on 0.2.2-rc.1, boots clean and serves, and the SQLite FTS5 index
opens per `openAt`/`path`.

**M1 conditions:**
1. In `personal`, choose the index explicitly rather than inheriting `:memory:` + `first-search`: e.g.
   `path: /home/josh/.dsh-personal/storages/session-search.db` (0600) with `openAt: startup` or
   `first-search`. Remember the wholesale-config rule (restate `path` + `openAt`).
2. The index is per process and rebuilt after a restart (README); `:memory:` loses it entirely. File path is
   recommended so recall survives restarts and `openAt: startup` surfaces index errors at boot.
3. Run the real acceptance test in M1: `session_search` returns an old conversation from an authorized
   workspace (exact-`cwd` authority applies).

## 5. Ledger-ready rows (for the Lead to paste into `plugin-ledger.md`)

| Package | Version | sha512 | Scan | Trial | Verdict | Date | Rollback |
|---|---|---|---|---|---|---|---|
| `@vectorize-io/hindsight-coding-agents` | 0.8.6 | `sha512-3T67…cAA==` | no install scripts/native; 0 deps; 17 execFile/git/daemon/auto-update sites dormant; **cloud default**; no license field | PASS — scout-mem, :7014, 401, 3.7 s, 8 tools, 0 connect; pinned self-hosted/127.0.0.1:9177/`dsh-personal` | **ADOPT-WITH-CONDITIONS** (config via `HINDSIGHT_CONFIG`/file, never Cordis patch) | 2026-11-10 | `dsh plugin --profile personal remove @vectorize-io/hindsight-coding-agents` (+ remove the config file/unit env) |
| `@deepseek-ai/dsh-experimental-session-search` | 0.2.2-rc.1 | `sha512-FroS…qFQ==` | first-party MIT; no subprocess/network/env; 3 pkgs | PASS — scout-search, :7012, 401, 3.8 s, 0 connect; index opens with explicit path+openAt | **ADOPT** | 2026-11-10 | `dsh plugin --profile personal remove @deepseek-ai/dsh-experimental-session-search` |

## 6. Cleanup / what was left behind

- **Processes:** none. Every booted host was stopped with SIGTERM (exit 0); one orphan from an early
  `strace`-wrapper kill was found (only our own `scout-mem`/`:7014` PID) and killed; ports **7012** and
  **7014** are free. No other process was signalled.
- **Profiles left for inspection** (in scope for M0.5): `/home/josh/.dsh/profiles/scout-mem` (17 MB, clean
  patch layer, `@vectorize-io/hindsight-coding-agents@0.8.6` installed) and
  `/home/josh/.dsh/profiles/scout-search` (1 MB, clean patch layer,
  `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` installed). Both boot cleanly in that state.
  Remove with `rm -rf /home/josh/.dsh/profiles/scout-mem /home/josh/.dsh/profiles/scout-search`
  (or `dsh plugin --profile <p> remove <pkg>` first). No `compatibility.json` exemption file exists in
  either.
- **Scratch evidence** (ephemeral, `/tmp`): `/tmp/scout-mem-trial/` and `/tmp/scout-search-trial/` hold the
  redacted boot logs, strace logs, plugin logs, MCP probe scripts and the pinned config. Safe to delete.
- **Not changed:** live `personal` host/`:7002`, `~/.dsh-personal`, `~/.hermes`, the Hermes banks, the
  `dsh-personal` bank (still 0 facts), `~/.dsh/cordis.patch.yml`, `~/.hindsight/`, systemd units, sudo/root
  state. No credentials or launch tokens were printed or committed.

## 7. Not tested here (honest gaps → M1 acceptance)

- Hindsight write/read round-trip, cross-session + restart recall, `forget`, fail-open when `:9177` is down,
  token-budget tuning, audit-log/bank-isolation verification (all M1; bank was deliberately left empty).
- The Hindsight companion-skill install and bank seed that happen on the **first session** (no session was
  created in M0.5).
- A real model-driven `session_search` call / "finds an old conversation".
- Egress during a model turn or a Hindsight session (M0.5 only proved the **boot** has zero `connect()`
  syscalls; the nftables `dsh_egress` observer is scoped to the `dsh-personal` service cgroup, not these
  scratch hosts, so `strace` was used instead).
- Full static audit of the 16.7 MB Hindsight bundle (this trial re-scanned the DSH entrypoint only;
  [`admission-scans.md`](admission-scans.md) owns the tarball scan).
- The market-UI install path (CLI `dsh plugin add` was used).
