# Plugin ledger

English | [中文](plugin-ledger.zh.md)

Every plugin install/upgrade passes through this file. **No row = not approved.** The build agent appends
an entry before installing anything into `personal`, and re-audits on every upgrade. Checklist:
[`personal-agent-security.md`](personal-agent-security.md) §4–§5.

Fields: **sha512** of the tarball (`npm view <pkg>@<ver> dist.integrity`), **scan** result
(install scripts / native / subprocess / network domains / creds), **trial** = scratch-profile result,
**verdict**, **rollback** command.

## Installed in `personal` — 2026-11-10 M1 (human sign-off "put forward")

| Package | Version | sha512 | Scan | Trial | Verdict | Date | Rollback |
|---|---|---|---|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | **0.2.2-rc.1** (exact; npm `latest` is the wrong build) | `sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` | first-party MIT; 0 scripts/native/subprocess/eval/network/env; tarball is a stub over 2 host-shipped first-party deps; 5 read-only tools (global tool layer) | **PASS** scout-search `:7012`: composes/boots clean 3.8 s, `/` 401, 0 non-UNIX `connect()`, FTS5 index opens per `openAt` | **ADOPT** — M1 conditions: explicit `path` + `openAt` (patch replaces config wholesale — restate both); real `session_search` acceptance test in M1 | 2026-11-10 | **INSTALLED 19:16** — index `…/storages/session-search.db` 0600 + `openAt: startup`; functional: `session_search` found an old session by phrase. Rollback: `DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @deepseek-ai/dsh-experimental-session-search` + restart |
| `@vectorize-io/hindsight-coding-agents` | **0.8.6** | `sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` | vendor-official (60k★ repo), 0 npm deps, no scripts/native; **no license in artifact** (MIT is repo-claim); cloud endpoint + dynamic per-git bank **by default**; dormant seed/git/auto-update/daemon spawn sites | **PASS** scout-mem `:7014`: composes/boots clean 3.7 s, `/` 401, **0 egress**, 8 `hindsight_*` tools, `dsh-personal` bank untouched (0 facts), `~/.hermes` untouched | **ADOPT-WITH-CONDITIONS**: config must live OUTSIDE Cordis (`HINDSIGHT_CONFIG` → 0600 file): `serverMode:self-hosted`, `apiUrl:http://127.0.0.1:9177`, `bankId:dsh-personal`, `dynamicBankId:false`, `autoInject:reflect`, `autoSeed/autoUpdate/gitIngest` off; never boot without it (cloud default); verify first-session seed + skill-copy + bank isolation | 2026-11-10 | **INSTALLED 19:16** — `HINDSIGHT_CONFIG` 0600 file + unit drop-in `20-hindsight.conf`; functional: write (bank 0→4 nodes), restart recall (`amber-fox-42`), bank isolation. Side effect: global skill `~/.agents/skills/hindsight-coding-agent/SKILL.md` sha256 `ea819c1c…3f8d90` (re-hash on upgrade). Rollback: remove plugin + drop-in + patch backup + restart |
| `@xmanrui/dsh-im` | **5.10.0** (HOLD — not approved yet) | `sha512-gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==` | MIT; no install scripts/native in tarball; 121 pkgs incl optional native `sharp`/libvips (LGPL) + Tencent Go CLI; 10 MB minified bundle vendoring Lark/Baileys; self-update RPC gated by trusted host; no telemetry; credential-store design; 0 audit vulns | **INSTALL/COMPOSE/BOOT PASS** scout-im `:7013`: 4.1 s install, boot 4.3 s, `/` 401→200, client module 200, no channel poller, boot egress only `api.deepseek.com`. **Compatibility NOT certified for 0.2.2-rc.1**; upstream **#547 Telegram final-answer delivery broken on 0.2.2-rc.1 (reproduced with 5.10.0)**, #538 delivery-uncertain + binding cleared | **HOLD for live Telegram smoke test** (token+allowlist+approval round-trip+3 turns+settings save+restart). If #547 reproduces → do not install; build our own minimal bridge. Install scope if it passes: Telegram only, DM allowlist, no voice/AI-Office/other channels, pin exact version | 2026-11-10 | `DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @xmanrui/dsh-im` + restart |

## Content-work plugins moved to `personal` — 2026-11-11 (human-directed)

Requested by the human: bring both across from the coding host with their data, remove them from the coding
profile. Both passed the admission checklist with one condition (the guizang auth patch). Data was copied to
`~/.dsh-personal/` before the personal install; coding-host data dirs were left in place as the backup copy.

| Package | Version | sha512 | Scan | Trial | Verdict | Date | Rollback |
|---|---|---|---|---|---|---|---|
| `dsh-guizang-design` | **0.1.4** (exact; author `op7418`, AGPL-3.0-only, 779★/44 forks) | `sha512-f0RyjQ+sr3dw0Drhu1YXXUhx4oLp5m0rlQ1cIgtMXBNrUm4dNCO2NVjNLgHnKp+I0g7wObZ1+gv9Hbg74Z25bg==` | 0 install/postinstall scripts (only `test`/`vendor`); no native code; deps `playwright`/`puppeteer-core`/`subset-font` used for local thumbnail rendering (browsers already present in `~/.cache/ms-playwright`; install with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`); registers 3 model-facing tools + a skill provider; writes `$DSH_HOME/guizang-design/{library.json,voice.md,thumbs}` and reads `$DSH_HOME/sessions` for the voice corpus; **no credentials access, no telemetry, no external network in `lib/`**. **FINDING: its `/guizang-design` web routes had no owner auth** (GET gallery/examples/thumbs/private works returned 200 unauthenticated, also over the tailnet; POSTs only checked Origin when present) — **fixed locally by `scripts/ops/patch-guizang-auth.sh`** (calls `ctx.connection.requestRejection`, fails closed 403) | Boot + panel on `personal`: iframe gallery renders, **2 migrated works**, voice profile ready; without the patch routes were 200 unauthenticated, after it **401**; with the owner cookie 200; egress unchanged (`api.deepseek.com` only, expected) | **ADOPT-WITH-CONDITION** — pin 0.1.4 and **re-apply the auth patch on any reinstall/upgrade**; installed after backup `daily/20261111T060926Z` | 2026-11-11 | `DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove dsh-guizang-design` + restart; data `~/.dsh-personal/guizang-design` stays |
| `dsh-media-desk` | **2.6.2** (exact; author `woniuniuniu`, MIT, 1023★/102 forks) | `sha512-r+1GPY1CQaG1zd92ayZNZH4Xsfl4l6U0cMhmIlUpqbQXhNNxQtr/1/5XyHDoAdjKclfn+qcB17e7UGpIMWPVZw==` | 0 install/postinstall scripts (only `build`/`test`/`prepack`); **zero runtime deps**; host registers `/media-desk` with its own **`ctx.connection.requestRejection` gate, fail-closed 403** (verified 401 unauthenticated); uses the DSH default model via the host (`ctx`) — no own keys; optional external image API only if the user configures `baseUrl`+`apiKey` (both blank); `execFile` only `xdg-open` on a `savedPath` from its own state (never request input); no telemetry; data `$DSH_HOME/media-desk` | Boot + panel on `personal`: migrated state loads (1 idea, 15 styles), model selector follows the host, `/media-desk/state` 401 unauthenticated / 200 authenticated; egress unchanged | **ADOPT** (installed after backup `daily/20261111T060926Z`) | 2026-11-11 | `DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove dsh-media-desk` + restart; data `~/.dsh-personal/media-desk` stays |

Coding-host cleanup: both rows disabled live via the plugin manager and the dependencies removed with
`dsh plugin --profile web remove`; `~/.dsh/guizang-design` (212 KB) and `~/.dsh/media-desk` (40 KB) are kept
untouched as the backup copy. A `dsh-web.service` restart is not needed for the UI (the fibers were disabled
live); the next boot simply no longer composes them.

## Rejected by maturity gate — D14 (2026-11-10, human decision)

Rule: mature plugins only; no 0–3★ single-author packages on core surfaces. Measured data in
[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) §0.

| Package | Version | Why rejected / replaced | Replacement |
|---|---|---|---|
| `dsh-switchboard` | 0.5.22 | 1★, 2.0k dl/mo, single author, **no license file in the GitHub repo** | `@xmanrui/dsh-im` if compatible, else our own minimal Telegram bridge |
| `dsh-plugin-heartbeat` | 0.8.0 | 3★, 3.3k dl/mo, single author; edge engine range | our ~100 LOC proactivity loop — BUILD |
| `dsh-automations` | 0.2.1 | 0★, 778 dl/mo, model-facing shell = RCE | native `dsh-schedule` + systemd timers — BUILD/DROP |
| `dsh-push-notify` | 1.1.0 | 2★, 1.3k dl/mo | our ~60 LOC ntfy shim — BUILD |
| `dsh-soul-md` | 0.12.2 | 39★ single-maintainer (51.8k dl/mo adoption, but not a mature project) | our ~80 LOC persona loader — BUILD |
| `dsh-skill-doctor` | 0.15.0 | 1★ | — DROP |
| `dsh-session-autarchive` | 0.1.7 | 0★ | native API + timers — DROP |
| `dsh-period-report` / `dsh-weekly-report` | 0.2.1 / 0.1.8 | 0–2★, single authors, one stale since Aug | local digest (live) + M2 narrative digest — DROP |

## Under vetting

_None — the M0.5 pass is complete (2026-11-10). Approved rows above carry their M1 conditions; every other
shortlist candidate is either rejected by the maturity gate (D14) or replaced by our own small code._


## Rejected / do not install

| Package | Reason |
|---|---|
| `dsh-mem0` | duplicate engine; Mem0 Platform/self-hosted/Python sidecar runtime (not for this stack) |
| `@kanadego/dsh-heartbeat` | no `engines.dsh`; heavyweight persona product; alternative `dsh-plugin-heartbeat` |
| `@hhuangpanda/dsh-automation` | engine range `>=0.2.2-rc.1 <0.2.2` breaks on any DSH bump; fork of alpacachen |
| `dsh-notifier`, `dsh-telegram-duty`, `dsh-im-hub`, `dsh-plugin-tlnotify`, `dsh-telegram-notify` | peer ranges incompatible with DSH 0.2.2-rc.1 |
| `dsh-backup`, `@xiaoyuyu6420/dsh-backup` | engines top out below 0.2.2-rc.1; own backup script instead |
| `dsh-longterm-memory`, `dsh-expmem`, `dsh-layered-memory`, `dsh-memory-with-soul` | engines/peers exclude this host or hard Python deps |
| `dsh-trust-panel` | depends on a trust suite that is not fully published |
| Any second heartbeat/scheduler/hook/kanban plugin | one per surface; native agent-team board suffices |

## Upgrade policy

1. New version = new row, re-scanned and re-trialed; the old version stays pinned until the new one passes.
2. Record diffs of `dist/` entrypoints, new dependencies, new network domains, new install scripts.
3. Security regression → roll back to the ledger's last good version and open a note here.

## Our own code installed in `personal` (D14 — local bundles, no npm supply chain)

| Bundle | Version | sha256 (entry) | Scan | Trial | Verdict | Date | Rollback |
|---|---|---|---|---|---|---|---|
| `@local/dsh-soul` | 0.1.0 | `67289628dd20218219dbc52cb37645264b9fcc8a9de6f3517be2be29015aa773` | our code: read-only fs, no network/subprocess/creds; literal section `interpolate:false`; 16 KiB cap | 8/8 selftest + headless persona proof + live journal line | **INSTALLED 2026-11-11** | 2026-11-11 | `dsh plugin --profile personal remove @local/dsh-soul` + restart |
| `@local/dsh-push` | 0.1.0 | `d55eed7b263cbe9c1ddebcc90c51de082085fd7ec3172970c157184d1fe4b3b4` | our code: no deps; env-only endpoint; payload has no bodies/creds; fail-open | mock: inert=0 requests, active=1 clean POST, dead endpoint=turn unaffected | **INSTALLED, inert (no NTFY_URL)** | 2026-11-11 | remove `@local/dsh-push` + restart |
| `@local/dsh-heartbeat` | 0.1.0 | `1d5ca8672d3166aeb724e7c5b7c08049ea4883a9253ad5605df322e8972667e0` | our code: no tools/network/shell; default OFF; bounded interval; identified `source.kind:"heartbeat"` | 26/26 unit tests; default-off and enabled boot verified | **INSTALLED, disabled** (live nudge path M2) | 2026-11-11 | remove `@local/dsh-heartbeat` + restart |

| `@local/dsh-capabilities` | 0.1.0 | `dd43ccb2a0b2447f5b0ac4dda9ed69fbdb97dfffad8e1660f7de3490c19661e4` (index.js; client.js `6a2f00a56e3e5939e1e8dba113bb965d8891a967186781fe8d5b33f9c7400d7d`) | our code: no deps, no network, no credential access; host registers three owner-gated `/api/capabilities` routes, returns only name/version/status/error (no source paths, commands or secrets); client is read-only except connector probe/restart; local `ping` MCP fixture is dependency-free and offline | 5/5 host tests; live personal: `GET /api/capabilities` 200 owner / 401 unauth, `ping` state `connected`, 31 bundles listed, Playwright 1440+390 with 0 console errors, `dsh-pending` clean | **INSTALLED 2026-11-12** (personal; linked bundle) | 2026-11-12 | `DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @local/dsh-capabilities` + restart; restore `cordis.patch.yml.bak-connector-*` to drop the fixture row |

## Re-admission on DSH 0.2.2-rc.2 — 2026-11-12

The runtime upgrade was treated as a re-admission event: every installed component was re-checked on rc.2
(boot, composed tree, live route/UI, repo tests). No new community tarballs were installed in this pass; the
official packages followed the runtime, and session-search was bumped to the matching rc.2 build.

| Component | Version | rc.2 result |
|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | **0.2.2-rc.2** | PASS — installed from the profile lockfile; index DB reopened at boot; dump-config clean |
| `@vectorize-io/hindsight-coding-agents` | 0.8.6 | PASS — 0600 config unchanged, bank `dsh-personal`, API health 200, no boot error |
| `@local/dsh-soul` | 0.1.0 | PASS — selftest 5/5; journal `loaded SOUL persona … order 0` |
| `@local/dsh-push` | 0.1.0 | PASS — inert (no `NTFY_URL`) |
| `@local/dsh-heartbeat` | 0.1.0 | PASS — default off; unit tests pass |
| `@local/dsh-profiles` | 0.1.0 | PASS — client module served on both hosts |
| `dsh-guizang-design` | 0.1.4 | PASS — panel loads; `/guizang-design` 401 unauth / 200 owner (auth patch intact) |
| `dsh-media-desk` | 2.6.2 | PASS — `/media-desk/state` 401 unauth / 200 owner |
| `@deepseek-ai/dsh-experimental-auto-review` | rc.2 (runtime) | PASS — bundle composes, no boot error |
| `@deepseek-ai/dsh-experimental-voice-input-bundle` | rc.2 (runtime) | PASS — bundle composes |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | — | **REMOVED** — no rc.2 release; rc.2 core supplies `agent-team`, `tool-agent-team`, `ui-agent-team` |
| Coding host: host-control / web-mobile / dshmarket / context / ffmpeg / blender / web-fetch-playwright / web-search / youtube / inspector / plugin-market / forge | as installed | PASS — boot 401, 90 live client modules, `dsh-pending` clean; no per-plugin error in the log |

Residual: full session-level SOUL-opener and Hindsight recall turns are still to be exercised on rc.2; the
plugin-level checks and the M1 acceptance runs are on rc.1. The rc.1→rc.2 upgrade guide items that touch this
stack are `subagent-interrupt-default` (our preset now carries `interrupt: false`) and `web-search-billing`
(no YAML change required; `*ApiKeyEnv` still takes precedence). `BundleInfo.updatable` is now
`BundleInfo.update`, which the Capabilities host route must use.

## `@local/dsh-memory-personal` 0.1.0 (2026-11-13) — personal-agent memory, replaces the coding-agent client

| Field | Value |
|---|---|
| Component | `@local/dsh-memory-personal` 0.1.0 (first-party, in-repo, no third-party code) |
| Provenance | [`plugins/dsh-memory-personal`](../plugins/dsh-memory-personal/) — dependency-free (node builtins + global `fetch`) |
| Replaces | `@vectorize-io/hindsight-coding-agents` 0.8.6 **as the memory client** (server and bank unchanged) |
| Why | measured 3,175 tokens/step of injection on a non-coding task, ~75 % a tool manual; no repository exists on this host |
| Trial | isolated `$DSH_HOME` under `.tmp/`: 2 runs, retain + cross-session recall verified; live host untouched |
| Rollback | remove the bundle (or disable the row), re-enable `hindsight`, restart; `profile.json` and the bank are untouched |
| Open | live install not approved yet; `hindsight_reflect` still 402 upstream |
