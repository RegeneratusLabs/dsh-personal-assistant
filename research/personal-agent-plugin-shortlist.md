# Personal agent — plug-and-play plugin shortlist

**Question:** how much of the build plan can we buy instead of write? **Answer: almost all of it.** The
mechanism layer is ~90% available as compatible DSH plugins; our custom code shrinks from ~1,000–1,100
LOC to **~40–100 LOC plus configuration/content**.

**Status:** verified 2026-11-10 against DSH **0.2.2-rc.1**, Node 24.22.1, Linux host. Compatibility was
checked from live npm metadata (`engines.dsh`, peers, `dsh.bundle`) plus the market's precomputed
compatibility cache; README claims are marked as claims. **No plugin in this document has been installed
or run yet** — every ADOPT is "adopt after a scratch-profile smoke test".

## 0. Maturity gate — D14 (2026-11-10, human decision)

**Rule: mature plugins only. No 0–3★ single-author packages on core surfaces; prefer first-party and
vendor-official code; build the thin glue ourselves when only an immature package exists.**

Measured 2026-11-10 (npm registry + `api.npmjs.org/downloads` + GitHub API; DSH 0.2.2-rc.1 host):

| Candidate | Repo stars | npm dl/mo | License | Maintainer | 0.2.2-rc.1 declared? | Tier | Verdict |
|---|---:|---:|---|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | 277,752 (DSH repo) | 1,408,930 | MIT | DeepSeek | first-party | **A** | ADOPT (pin exact `0.2.2-rc.1`) |
| `@vectorize-io/hindsight-coding-agents` | 60,194 (hindsight) | 115,887 | MIT (npm metadata missing) | Vectorize | no engines/peers (`bundle` only) | **B** | ADOPT after trial; pin self-hosted + bank |
| `@xmanrui/dsh-im` | 3,437 | 127,901 | MIT | single | **no** — declares `0.2.1-rc.2` only | **C** | TRIAL: gating question is 0.2.2-rc.1 compatibility |
| `dsh-memento` | 144 | 7,717 | Apache-2.0 | single | yes (range) | **C-** | optional notes (M3) only if needed |
| `dsh-soul-md` | 39 | 51,785 | MIT | single | yes (explicit list) | **D+** | high adoption, small repo → **BUILD ~80 LOC loader** instead |
| `dsh-plugin-heartbeat` | 3 | 3,340 | MIT | single | edge (`^0.2.1-rc.5`) | **D** | BUILD ~100 LOC or defer |
| `dsh-push-notify` | 2 | 1,334 | MIT | single | range | **D** | BUILD ~60 LOC ntfy shim |
| `dsh-switchboard` | 1 | 2,055 | npm MIT / **repo has no license file** | single | range | **D** | **REJECT** (D14) |
| `dsh-automations` | 0 | 778 | MIT | single | declares compatible | **D** | BUILD thin glue / rely on native schedule + shell RCE caution |
| `dsh-skill-doctor` | 1 | 2,324 | MIT | single | range | **D** | DROP |
| `dsh-session-autarchive` | 0 | 1,572 | MIT | single | range | **D** | DROP (native timers suffice) |
| `dsh-period-report` | 0 | 772 | MIT | single, stale (Aug) | none | **D** | DROP (own digest exists) |
| `dsh-weekly-report` | 2 | 1,039 | MIT | single | none | **D** | DROP |

**Consequences for the stack:** third-party surface shrinks to **session-search + Hindsight + (dsh-im if it
runs)**; identity, push and heartbeat become our own small code; automations/digest/hygiene rely on native
DSH seams + systemd timers. This *overrides* the earlier verdicts in §1 where they conflict (switchboard,
heartbeat, automations, push, soul-md, skill-doctor, autarchive, period-report).

**Channel decision:** `@xmanrui/dsh-im` (mature) over `dsh-switchboard` (1★). The gating risk is that dsh-im
does not declare DSH `0.2.2-rc.1` compatibility — see `research/admission-dsh-im.md` for the trial. If it
cannot run, the fallback is **not** a 1★ plugin: build the minimal Telegram bridge on the approvals seam
(larger, but ours) or wait for a compatible dsh-im release.

Detailed evidence and rejected lists: [`plugin-scout-memory.md`](plugin-scout-memory.md) (277 lines),
[`plugin-scout-channels.md`](plugin-scout-channels.md) (178), [`plugin-scout-proactivity.md`](plugin-scout-proactivity.md)
(259). Discovery used the 4,985-plugin index at `.cache/plugin-index.json` (categories: memory 219,
identity 63, notify 162, remote 159, voice 76, workflow 321, session 378, skill 141, security 136).

## 1. Recommended v1 stack

Install into a **scratch profile first** (`dsh --profile scout --from-default-profile web`), then into
`personal` only after the smoke test passes.

| Layer | Package @ version | Why it wins | Verdict | Smoke test |
|---|---|---|---|---|
| **Identity** | **BUILD** `~80 LOC` loader + `soul/SOUL.md` (D14) | No mature identity plugin: `dsh-soul-md` is 39★/single-maintainer (adoption is high at 51.8k dl/mo, but it is not a mature project). A loader on the persona seam is small, auditable, ours. | BUILD (was ADOPT) | injection test + memory off |
| **Long-term memory** | `@vectorize-io/hindsight-coding-agents@0.8.6` | Official Hindsight integration: **auto-capture** (session write-back every Stop + optional git ingest) and **auto-recall injection** (`autoInject: reflect\|pages\|recall\|none`, once on first prompt, 7 s budget with fallback); **no new runtime** — `serverMode:"self-hosted"` + `apiUrl:http://127.0.0.1:9177` reuses the Hindsight 0.10.3 + Postgres already running; no Python, no embedding endpoint, 0 npm deps; 115.9k downloads/mo, MIT | ADOPT after smoke test | scratch profile, **new bank** (never Hermes' `josh`), plant a fact, restart, recall it; check `/llm-requests/stats` |
| **Episodic recall** | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` | Official FTS5 over past sessions; npm `latest` (0.2.1-alpha.2) has the wrong cordis peer — install the **exact `@0.2.2-rc.1`** version (peer cordis ~4.1.0) | ADOPT | enable, search an old conversation |
| **Channel + approvals** | `@xmanrui/dsh-im@5.10.0` (D14) | Mature: 3,437★, 127.9k dl/mo, MIT, 131 releases since Aug, Telegram among 9 channels, text approvals. **Risk: declares DSH `0.2.1-rc.2`, not 0.2.2-rc.1** → gating trial; if incompatible, build the minimal Telegram bridge ourselves rather than fall back to a 1★ plugin. | TRIAL (compat gating) | boot + settings + one real Telegram approval |
| **Phone push (optional)** | **BUILD** ~60 LOC ntfy shim (D14) | `dsh-push-notify` is 2★/single-author. A tiny local notifier on turn-end/approval events is safer and ours. | BUILD (was ADOPT) | one test push to ntfy |
| **Heartbeat** | **BUILD** ~100 LOC or defer (D14) | `dsh-plugin-heartbeat` is 3★/single-author. Proactivity policy is the product anyway; build the pulse/dedupe/quiet-hours loop ourselves on native seams. | BUILD (was ADOPT) | quiet when nothing matters; one gated pulse |
| **Event triggers** | **BUILD** thin glue / native `dsh-schedule` (D14) | `dsh-automations` is 0★/778 dl/mo and its model-facing shell action is RCE. Daily/interval needs are met by native schedule + systemd timers; no third-party trigger engine. | BUILD/DROP (was ADOPT) | one daily job fires once |
| **Skill diagnostics** | — (D14) | `dsh-skill-doctor` is 1★/single-author; diagnostics are not worth the surface. Use our own `dsh-pending`/session inspection. | DROP | — |
| **Session hygiene** | — (D14) | `dsh-session-autarchive` is 0★/single-author; systemd timers + native session APIs cover it. | DROP (optional) | — |
| **Digest** | **OURS** (systems timer, already live for M0) (D14) | Both report plugins are 0–2★/single-author; the M0 local digest + alerts already cover the data. Add the narrative digest in M2 on native `dsh-schedule`. | BUILD/DROP | daily digest file + alerts |
| **Kanban/agent team** | — | Native `team_task_*` + `@deepseek-ai/dsh-experimental-agent-team-profile` are already in the profile | DO NOTHING | — |
| **Backup** | **ours** | No compatible market backup covers the Hindsight Postgres + `~/.dsh-personal` together (`dsh-backup` engines top out at 0.2.0-rc.1; `dsh-vault` unverified) | BUILD (script) | restore drill |

## 2. Memory decision (the important one)

Three architectures were on the table; the scouts killed two:

| Option | Runtime | Fit | Verdict |
|---|---|---|---|
| **Hindsight plugin** | reuses running `:9177` daemon; no Python/embeddings | auto-capture + auto-recall + knowledge pages + mental models; bank per git project → must override to a personal bank | **PICK** — best fit for the least new machinery |
| `dsh-memento@0.5.30` | zero-dep SQLite, inside DSH | literally our planned `ctx.memory` seam: typed service, 2 tracks × 2 layers with hard char budgets, approval gate enforced **inside the service**, audit trail, frozen once-per-session snapshot, provider conformance suite | **KEEP AS OPTION** — adopt instead of Hindsight if we want writes gated/audited and no external engine; two injectors must not run together |
| `dsh-mem0@0.3.1` | Mem0 Platform API key **or** self-hosted REST **or** Python sidecar (mem0ai + Qdrant + embeddings) | per-turn recall + capture, settings UI, hygiene | **REJECT for the stack** — duplicate engine plus cloud/Python dependency |
| `dsh-tdai-memory@0.4.7` | sqlite-vec + TencentDB libs + node-llama-cpp + embedding endpoint | explicit 0.2.2-rc.1 compat, layered L0–L3 | TRIAL only (heavy, unverified) |
| `dsh-hermes-memory@1.2.0` / `dsh-auto-memory@1.5.0` | in-process, no LLM calls | Hermes/Claude-Code notes (MEMORY.md 2200 / USER.md 1375 chars, frozen snapshot) | TRIAL as **notes tier** only if Hindsight pages are not enough; never stack two note stores |

**Never** point the plugin at the Hermes bank `josh` (58,310 facts). Create a `dsh-personal` bank, tags
per session/workspace, and keep the plugin's `bankId`/`autoInject` explicit in config.

**What stays custom (memory):** one tiny **curator** (~40–80 LOC, registered via `dsh-schedule`) that
calls Hindsight `/consolidate`, `/mental-models/{id}/refresh` and `/directives`, and posts a digest
through switchboard/push-notify. Nothing in the market wires that scheduled loop.

## 3. Build-vs-buy delta vs the plan

| Planned component | Bought | Still ours |
|---|---|---|
| `dsh-memory` seam (300–400 LOC) | Hindsight plugin's capture/inject + tools | config only (bank, budgets, autoInject mode) |
| `dsh-memory-hindsight` adapter (250–350 LOC) | the official plugin | bank naming/policy + curator |
| `dsh-memory-notes` (150 LOC) | Hindsight pages/mental models (or memento / hermes-memory) | notes *policy* content |
| `dsh-memory-curator` | — | **BUILD ~40–80 LOC** (only memory code left) |
| `dsh-notify` + Telegram adapter (250 LOC) | switchboard (+ optional push-notify) | thin surface-agnostic routing wrapper (~100 LOC) **only if** we need quiet-hours/per-surface policy |
| Approval transport | switchboard buttons (or dsh-im text approvals) | per-surface autonomy policy (config/prompt) |
| Heartbeat (~100 LOC) | `dsh-plugin-heartbeat` | cadence/quiet-hours policy |
| Event triggers | `dsh-automations` (+ `dsh-monitor`) | the rules themselves (data, not code) |
| Digest (~150 LOC) | `dsh-period-report` (TRIAL) or native schedule + template | digest content policy + delivery target |
| Session-folder auto-create | nothing — compose `dsh-automations` session-start + shell scaffold | scaffold template + naming (30 min config) |
| Skill curation | `dsh-skill-doctor` surfaces + `@michengai/dsh-skills-manager` | proposal/merge/retire policy (later) |
| Memory/agent UI | memento panel free, or `dsh-hindsight-gui` (TRIAL) | nothing for v1 |
| Kanban | native agent team | nothing (do not buy a second board) |
| SOUL identity loader (~80 LOC) | `dsh-soul-md` | persona content |

**Net:** mechanism budget drops from ~3–5 dev-days of plugin code to roughly **a day of smoke tests +
~140–200 LOC** (curator + optional notify wrapper) + configuration/content.

## 4. Install order and guardrails

**Security gate first:** read [`personal-agent-security.md`](personal-agent-security.md). DSH does not vet
plugin code or prompt injection; plugins run in-process as the service user. Do not install any community
plugin into `personal` until the OS isolation baseline (dedicated user/container + egress allowlist) and the
admission checklist are in place. Findings from the static scan of these six packages: no install scripts
anywhere; `dsh-automations` exposes a **model-callable unsandboxed shell** (`automation_save`) — disable or
gate it; `dsh-switchboard` spawns `ffmpeg`/`git` and carries a `prepare` script for git installs; the
Hindsight plugin is a 16.7 MB multi-harness bundle that **defaults to the cloud endpoint** — pin
`serverMode: self-hosted` and `apiUrl: http://127.0.0.1:9177`.

```sh
# 0) scratch profile, pinned versions
dsh --profile scout --from-default-profile web
dsh plugin --profile scout add dsh-soul-md@0.12.2
dsh plugin --profile scout add @vectorize-io/hindsight-coding-agents@0.8.6   # new bank, self-hosted :9177
dsh plugin --profile scout add dsh-switchboard@0.5.22
dsh plugin --profile scout add dsh-plugin-heartbeat@0.8.0
dsh plugin --profile scout add dsh-automations@0.2.1
dsh plugin --profile scout add dsh-push-notify@1.1.0
dsh plugin --profile scout add @deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1
# restart between every add; verify the plugin health card before the next one
```

1. **One Telegram poller per bot token** — never two of switchboard / dsh-im / messenger-gateway / tg-bridge.
2. **Do not hand-write `insert` rows** for bundle plugins (heartbeat's documented boot crash); use
   `dsh plugin add` and let the bundle layer compose.
3. **Pin exact versions.** The market moves daily and peers/engines are the compatibility contract.
4. **Engine landmines to avoid:** `@hhuangpanda/dsh-automation` (`>=0.2.2-rc.1 <0.2.2` breaks on any bump),
   `dsh-notifier`, `dsh-telegram-duty`, `dsh-im-hub`, `dsh-plugin-tlnotify`, `dsh-telegram-notify`,
   `dsh-backup` (engines stop at 0.2.0-rc.1), `dsh-longterm-memory` (engines exclude rc.1),
   `dsh-mem0` for our stack, `@kanadego/dsh-heartbeat` (no engines.dsh, heavy persona product).
5. **Data/egress:** chat bridges necessarily send content to Telegram/Feishu; ntfy/Bark/Edge-TTS add
   egress; switchboard/dsh-im store tokens in the credential store; Hindsight stays local on `:9177`.
6. **Keep the Web UI + Tailscale fence** as the fallback surface; a bot token is full control of the bot.

## 5. Smoke-test checklist (M0)

For each ADOPT: boot in `scout`, check the plugin health card, then exercise the one behavior that
matters — persona injection (soul-md), fact recall across restart in a fresh bank (Hindsight), a real
Telegram approval, a gated heartbeat pulse with `/api/heartbeat/status` 200, an automation `log` rule firing
on startup, session search returning an old conversation, a push notification arriving. Only then copy the
pinned install list into `personal`.

## 6. Open items

- `@vectorize-io/hindsight-coding-agents` declares **no engines/peers** → 0.2.2-rc.1 hosting is unproven;
  smoke test is mandatory, and it writes a Cordis row into `$DSH_HOME/cordis.patch.yml` (home-level).
- Hindsight bank mapping is per git project; we need a deterministic single personal bank (override
  `bankId`), and a backup/export procedure for its embedded Postgres.
- Two injected blocks (soul-md memory + Hindsight recall) must not both be on; budgets need tuning
  (memento defaults 2,000/4,000 chars exceed our 1.5–2k-token target → ~600/800 if adopted).
- Switchboard maturity: audit the source before trusting approvals; dsh-im is the battle-tested fallback.
- Curator still needs a home (new package vs a row in a future `@local/dsh-assistant` bundle).

## 7. M0.5 admission outcome (2026-11-10 — actual, supersedes the smoke-test plan in §5)

| Candidate | Admission result | M1 decision |
|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` | scans clean (first-party stub over host-shipped deps); trial PASS (`:7012`, 3.8 s boot, 401, 0 egress, FTS5 opens) | **ADOPT**; pin exact; personal override must restate `path` + `openAt` |
| `@vectorize-io/hindsight-coding-agents@0.8.6` | scans clean claim-wise, but **no license in the artifact**, cloud endpoint + dynamic per-git bank by default, dormant spawn/auto-update paths; trial PASS (`:7014`, 0 egress, bank untouched) | **ADOPT-WITH-CONDITIONS**; config via `HINDSIGHT_CONFIG` 0600 (`self-hosted`, `:9177`, `dsh-personal`, dynamicBankId false, autoSeed/autoUpdate/gitIngest off); never boot without it |
| `@xmanrui/dsh-im@5.10.0` | install/compose/boot PASS but maintainer does **not** certify 0.2.2-rc.1 and upstream **#547 (Telegram final answer not delivered on 0.2.2-rc.1, reproduced with 5.10.0)** + #538 are open | **HOLD** pending live Telegram smoke test; if it reproduces, build our own minimal bridge |
| `dsh-switchboard` + all other 0–3★ packages | rejected by D14 | not installed; identity/push/heartbeat/automations/digest are our own small code or native seams |

Evidence: [`admission-scans.md`](admission-scans.md), [`admission-trials.md`](admission-trials.md),
[`admission-dsh-im.md`](admission-dsh-im.md); ledger rows in [`plugin-ledger.md`](plugin-ledger.md).
