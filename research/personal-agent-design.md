# Personal agent on DSH — build plan

English | [中文](personal-agent-design.zh.md)

**Status:** living plan, 2026-11-10. Target: a personal assistant running on the existing `personal` DSH
host (0.2.2-rc.1, `~/.dsh-personal`, tailnet-published). This file is the decision record; the detailed
reference material is in [`personal-agent-docs.md`](personal-agent-docs.md) and the plugin scouting
results in [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) (once written).

## 0. Decisions so far

| # | Decision | Rationale |
|---|---|---|
| D1 | **Compose, don't fork.** The assistant is a profile bundle of small plugins on documented seams; no core patches. | Keeps DSH's "everything is a plugin, minimal" property and the dev-preview upgrade path. |
| D2 | **One profile (`personal`), one bundle `@local/dsh-assistant`.** Rows are disableable one at a time. | One place to inspect, patch, back up. |
| D3 | **Identity:** `soul/SOUL.md` is the source of truth, injected at the persona slot (order 0) by a small loader. | Hermes-style identity without a file-per-session mechanism. Full analysis in `personal-agent-docs.md` §5. |
| D4 | **Memory:** three tiers — curated notes (frozen), long-term memory engine (Hindsight, via a `ctx.memory` seam + adapter), episodic session search (FTS5). Do not write a memory engine. | Hindsight 0.10.3 already runs here (`127.0.0.1:9177`, REST + `/mcp`); it provides banks, observations, entity graph, mental models, directives, audit. Details in §3. |
| D5 | **Buy first, build the glue.** Before writing a plugin, search the 4,985-plugin market for a compatible one; adopt/trial it if it passes vetting, otherwise build a thin package. | User direction: plug-and-play over from-scratch. |
| **D5.1** | **The 2026-11-10 scout confirms the strategy:** the stack is ~90% buyable. Adopt `dsh-soul-md` (identity), `@vectorize-io/hindsight-coding-agents` (long-term memory, reusing the running Hindsight `:9177`), official session search, `dsh-switchboard` (channel + approvals), `dsh-plugin-heartbeat`, `dsh-automations`, `dsh-push-notify`, `dsh-skill-doctor`, `dsh-session-autarchive`. Custom code collapses to **~140–200 LOC** (curator + optional notify wrapper) plus config/content. Full table and evidence: [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md). |
| D6 | **One channel first** (Telegram), outbound before inbound, approvals later. | Channel breadth is not the product; delivery + trust are. |
| D7 | **Trust is explicit:** Web approvals stay the default; per-surface defaults for unattended/channel-triggered runs; fail-open for memory, fail-closed for policy. | An always-on assistant must be safe to leave alone. |
| **D9** | **Security baseline precedes any community plugin.** DSH does not vet plugin code or filter prompt injection (SAFETY.md: "not undergone a security audit"); plugins are in-process trusted code. So: pinned admission pipeline + capability-reduced runtime policy, plus host controls. Full threat model, audit of the shortlist, and checklist: [`personal-agent-security.md`](personal-agent-security.md). **Revised by D13:** dedicated OS user/container and the egress deny list are deferred; the baseline is telemetry egress off, admission vetting, local telemetry, backups, best-effort unit hardening, with the same-UID residual risk accepted (§8). | Unvetted plugins are arbitrary code with the service user's privileges. |
| **D13** | **Pragmatic security baseline (2026-11-10, permanent).** Kept: telemetry egress off, local-only sinks/digest/alerts, backups + restore drill, pinned/ledgered admission, secrets 0600, `workspace-write`+ask, Hindsight `dsh-personal` bank. Dropped: dedicated user/container, second Hindsight instance, egress deny. Replaced by: egress observe + alert, bank-level isolation, best-effort user-unit hardening. Accepted risk: a compromised plugin owns the human user's data; admission vetting is the compensating control and the full L0 is the upgrade path. | Proportional to a single-user personal assistant; the expensive controls defend against hostile plugins that vetting + approvals price out. |
| **D10** | **Security + telemetry are P0 and permanent.** Every plugin install/upgrade is vetted and recorded in [`plugin-ledger.md`](plugin-ledger.md); telemetry is local-only and redacted, with no third-party export. M0 (baseline) gates all installs. | User decision 2026-11-10: keep security and telemetry as the first priority and vet plugins as they arrive. |
| D8 | **No custom UI until the data exists.** Web GUI + channel messages first; memory/status UI after. | Avoid building dashboards for features that don't run yet. |

## 1. Principles

1. **Every capability is a row.** If disabling it takes more than one patch line, the design is wrong.
2. **Files over databases** for identity/notes; the memory engine is the exception because it is rented.
3. **Seams over forks.** New behavior attaches via `ctx.*` services, events, tools, prompt sections.
4. **Buy commodity, own glue.** Identity, memory policy, presence, and proactivity wiring are the product.
5. **Cache-aware prompt.** Stable prefix first; dynamic memory injected after it as user-context, never
   into the system prompt.
6. **Every plugin earns its place.** Small, pinned, inspectable, removable; no mega-bundles as foundations.

## 2. Target architecture

```
dsh web (personal profile)
├─ core harness: dsh-base + dsh-web-app (+ headless for scripts)        [shipped]
├─ preset "personal"                                                    [config]
│   ├─ identity:   SOUL.md loader → persona-prefix section              [buy or ~80 LOC]
│   ├─ memory:     ctx.memory seam → Hindsight adapter + notes tier     [buy + ~250 LOC]
│   ├─ tools:      memory_retain / memory_recall / memory_reflect       [adapter]
│   └─ policy:     permission preset, sandbox, fail-open memory         [config]
├─ proactivity: dsh-schedule rows (brief, review) + heartbeat plugin    [shipped + buy/build]
├─ presence:   outbound notify → Telegram adapter                       [buy or ~250 LOC]
├─ recall:     session search (FTS5) — official experimental bundle    [buy]
├─ integrations: MCP rows (calendar/mail later)                         [config]
└─ ops: systemd unit, tailnet serve, backups, pinned versions            [existing]
```

## 3. Memory subsystem (added 2026-11-10)

**Engine:** Hindsight, already running locally — `hindsight-api 0.10.3`, `127.0.0.1:9177`, embedded
Postgres; REST OpenAPI (`/openapi.json`) and MCP (`/mcp`). Hermes uses it as an external memory provider;
we mirror that architecture, not its Python adapter.

**Three tiers**

| Tier | Content | Mechanism | Injection |
|---|---|---|---|
| 1. Curated notes | `USER.md`, `MEMORY.md` (bounded) | our notes plugin, agent-editable with caps, curation job | frozen at session start; cache-safe |
| 2. Long-term memory | Hindsight: observations, graph, mental models, reflect | `ctx.memory` seam + Hindsight adapter | per-turn, budgeted (≤1.5–2k tokens), prefetch or sync |
| 3. Episodic | past conversations | official `@deepseek-ai/dsh-experimental-session-search` (FTS5, off by default) | on demand via tools |

**DSH mechanics**

- **Auto-retain:** `agent/turn-stopping` (serial/awaited) → every N turns enqueue a `ctx.jobs` task →
  Hindsight `retain`/`sync_retain` with the turn slice and tags (session, workspace, preset). Never blocks
  the turn; failures logged only.
- **Auto-recall:** two modes mirrored from Hermes:
  - *prefetch* (default): on new user input start recall; inject result with `agent.inject()` — "added
    without waking the driver, lands in the next admitted step".
  - *sync*: `agent/pre-step` waterfall awaits a bounded recall and appends a context message.
  - Injection goes **after the stable prefix** as user-context (KV-cache doctrine), with dedupe, scores,
    and provenance.
- **Tools:** expose exactly three curated tools (`memory_retain`, `memory_recall`, `memory_reflect`) rather
  than Hindsight's ~40 MCP tools. Raw MCP stays available as a debug overlay via `dsh-mcp-client`
  (`transport: streamable-http`, `url: http://127.0.0.1:9177/mcp`).
- **Curation:** daily `dsh-schedule` job → Hindsight `/consolidate`, mental-model refresh, notes
  dedupe/contradiction pass, "what changed" digest.
- **Banks:** `dsh-personal` bank, never Hermes' `josh` bank; tags per session/workspace; trusted-dir
  concept for repos that may not redirect the bank.
- **Config defaults:** `auto_retain: true`, `retain_every_n_turns: 2`, `auto_recall: true`,
  `recall_mode: prefetch`, `recall_budget: mid`, `recall_max_tokens: 1600`, `recall_min_scores` set,
  `recall_types: observation`, `timeout_ms: 400`, `fail_open: true`.
- **Cost/latency:** retain extraction uses a cheap model; recall is local (~100–300 ms); injected tokens
  capped; measure with Hindsight `/llm-requests/stats` and DSH token meter.

**Plugin inventory (revised after the 2026-11-10 scout — buy, don't build)**

| Component | Bought (pinned) | Still ours |
|---|---|---|
| Identity loader | `dsh-soul-md@0.12.2` (explicit 0.2.2-rc.1 compat; persona cards; its memory off) | persona/soul content |
| Long-term memory engine | `@vectorize-io/hindsight-coding-agents@0.8.6` — `serverMode: self-hosted`, `apiUrl: http://127.0.0.1:9177`, new bank (never Hermes' `josh`); auto-capture + first-prompt recall injection | bank policy, budgets, `autoInject` mode |
| Notes / seam option | `dsh-memento@0.5.30` **or** `dsh-hermes-memory@1.2.0` if we want in-DSH gated/audited notes instead of Hindsight pages — never two note stores | notes policy content |
| Episodic recall | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` (exact version; npm `latest` has the wrong cordis peer) | — |
| Curator/digest loop | — | **BUILD ~40–80 LOC** via `dsh-schedule` → Hindsight `/consolidate`, mental-model refresh, digest |
| Channel + approvals | `dsh-switchboard@0.5.22` (TRIAL; fallback `@xmanrui/dsh-im@5.10.0`) | per-surface autonomy policy |
| Phone push | `dsh-push-notify@1.1.0` (optional) | — |
| Notify policy wrapper | — | ~100 LOC **only if** surface routing/quiet-hours are needed |
| Heartbeat | `dsh-plugin-heartbeat@0.8.0` | cadence/quiet-hours config |
| Event triggers | `dsh-automations@0.2.1` (+ `dsh-monitor@0.1.1` if needed) | the rules themselves (config) |
| Skill diagnostics | `dsh-skill-doctor@0.15.0` | curation policy (later) |
| Session hygiene | `dsh-session-autarchive@0.1.7` | — |
| Digest | `dsh-period-report@0.2.1` TRIAL, else native schedule + `dsh-weekly-report@0.1.8` | digest content policy |
| Kanban/agent team | native `team_task_*` + agent-team profile | do not buy a second board |
| Backup | — | our script (Hindsight Postgres + `~/.dsh-personal`) |

**Acceptance tests:** cross-session recall after restart; recall within token budget; fail-open when
Hindsight is down; bank isolation; `forget` removes a fact; poisoning text cannot trigger tools; notes
writes respect caps; cost visible.

**Risks:** daemon/Postgres dependency and upgrades; data outside DSH home (backups!); prompt injection via
memory; cache-hit regression from per-turn injection; extraction quality; dev-preview API churn.

## 4. Buy vs build (resolved 2026-11-10)

The scout result is positive enough that the plan's mechanism layer is now mostly a **pinned install list**
(see [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)). Adoption rule stands: a
plugin enters `personal` only after (1) `engines.dsh` admits 0.2.2-rc.1, (2) it declares `dsh.bundle`,
(3) it was published/updated recently, (4) its config surface is inspectable, (5) it is pinned by exact
version, and (6) it passes a scratch-profile smoke test.

| Layer | Bought | Fallback if the trial fails |
|---|---|---|
| Identity/soul | `dsh-soul-md` | our ~80 LOC loader + `soul/SOUL.md` |
| Long-term memory | `@vectorize-io/hindsight-coding-agents` | `dsh-memento` (in-DSH SQLite seam) or our adapter |
| Notes tier | Hindsight pages/mental models (or `dsh-memento` / `dsh-hermes-memory`) | small notes plugin |
| Session recall | official FTS5 bundle | `dsh-plugin-sessiongraph` |
| Channel + approvals | `dsh-switchboard` | `@xmanrui/dsh-im` (mature, bigger) |
| Phone notify | `dsh-push-notify` | switchboard notices |
| Heartbeat | `dsh-plugin-heartbeat` | our ~100 LOC heartbeat |
| Event triggers | `dsh-automations` | our glue |
| Digest | `dsh-period-report` | native schedule + template |
| Skill diagnostics | `dsh-skill-doctor` | none needed |
| Kanban | native agent team | — |
| Backup | ours (script) | — |

**What remains custom:** a curator/digest job (~40–80 LOC on `dsh-schedule`), an optional surface-agnostic
notify wrapper (~100 LOC), the profile bundle/patch config, persona/skill content, and a backup/restore
script. Everything else is installed, pinned, and disableable.

## 5. Roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | Plan + docs + plugin shortlist; profile skeleton; pinned marketplace sources | Shortlist verified, no unvetted install |
| **M0** | **Scratch-profile smoke tests of the adopted stack** (`scout` profile): soul-md, Hindsight plugin (new bank), switchboard, heartbeat, automations, push, session search | Each ADOPT does its one behavior; no boot conflicts; Hindsight bank isolated |
| **M1** | Install the pinned list into `personal`; curator (~40–80 LOC) + digest; identity content | Cross-session recall after restart; brief delivered to Telegram; heartbeat gated/quiet |
| **M2** | Policy: per-surface autonomy, quiet hours, notification routing; backup/restore for Hindsight + home | Injection/approval tests pass; restore drill works |
| **M3** | Optional: dsh-memento or hermes-memory notes, memory UI, skills curator, second channel/voice | only with a real need |

## 6. Vetting protocol for plugins

The full threat model and admission checklist live in [`personal-agent-security.md`](personal-agent-security.md).
Summary:

1. Check `engines.dsh` against 0.2.2-rc.1 and that `dsh.bundle` exists (compat cache + npm metadata).
2. Inspect the tarball (install scripts, native binaries, `child_process`/`eval`, network domains,
   credential access, dependency count); read the risky sites.
3. Read README + config schema; note data locations and permissions; treat claims as unverified.
4. Pin the exact version and record the sha512; no `latest`, no auto-update; no unreviewed build scripts.
5. Trial in a sandbox profile (`dsh --profile scout --from-default-profile web`) with egress logging; boot,
   test the one behavior that matters, check for unexpected traffic.
6. Only then add to `personal`, as its own bundle row, with a one-line disable path.
7. Record: version, source, sha512, date, reason, rollback command; re-audit on every upgrade.
8. **Security baseline first:** dedicated OS user/container + egress allowlist + `workspace-write`+ask preset;
   never `danger-full-access` as default; treat `dsh-automations` `shell` actions as RCE (disable or gate).

## 7. Open questions

1. Does a market Hindsight/mem0 integration already implement the recall-injection policy (or only tools)?
2. Which Telegram plugin has real inbound auth/pairing, and what is its approval story?
3. Heartbeat: is there a plugin, or do we build the ~100-line scheduler hook?
4. How do we back up Hindsight (embedded Postgres) alongside profile/session backups?
5. Do we want per-project banks now or after the personal bank proves itself?
6. Which memory plugin(s) claim prompt injection — and do they conflict with our stable-prefix policy?
