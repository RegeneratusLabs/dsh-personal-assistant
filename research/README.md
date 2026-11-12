# DSH as a personal AI assistant — research bundle

Research run on 2026-11-09 for the question: *how could DSH (`@deepseek-ai/dsh` 0.2.2-rc.1) become a
personal AI assistant in the style of Hermes Agent / OpenClaw, and what is being done in this space?*

## Read this first

- **[`dsh-as-personal-assistant.md`](dsh-as-personal-assistant.md)** — the synthesis: landscape, DSH
  capability map, gap analysis, three build paths, phased plan with acceptance tests, and open questions.
  (The main deliverable.)
- **Building the agent now?** Start with **[`personal-agent-design.md`](personal-agent-design.md)** — the
  build plan (decisions, architecture, memory subsystem, phases, vetting protocol) — plus
  **[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)**: the verified
  buy-vs-build stack (~90% plug-and-play). The documentation map is
  [`personal-agent-docs.md`](personal-agent-docs.md).

## Supporting research notes

| File | Scope | Basis |
|---|---|---|
| [`personal-agent-design.md`](personal-agent-design.md) | **the build plan**: decisions D1–D8, architecture, memory design (3 tiers/Hindsight), phases, plugin vetting | this session |
| [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) | **buy-vs-build stack**: pinned candidates per layer, custom delta (~140–200 LOC), install order, smoke tests, do-not-use | 3 scouts + npm/compat verification |
| [`personal-agent-security.md`](personal-agent-security.md) | **security model**: what DSH vets (not code/injection), threat model, tarball audit of the shortlist, OS isolation, telemetry baseline, admission checklist, incident response | DSH docs + static scan of six tarballs |
| [`build-progress.md`](build-progress.md) | phase board, M0 security/telemetry checklist, decisions, open questions — updated every work block | this session |
| [`plugin-ledger.md`](plugin-ledger.md) | every plugin approved/under vetting/rejected with version, sha512, scan result, rollback | this session |
| [`plugin-scout-memory.md`](plugin-scout-memory.md) | memory/identity: 15 candidates, Hindsight vs memento vs mem0, identity matrix | index + npm + READMEs |
| [`plugin-scout-channels.md`](plugin-scout-channels.md) | channels/notify/remote/voice: 24 candidates, switchboard vs dsh-im, egress/security | index + npm + READMEs |
| [`plugin-scout-proactivity.md`](plugin-scout-proactivity.md) | heartbeat/automation/session/skill/security: 24 candidates, engine landmines | index + npm + READMEs |
| [`personal-agent-docs.md`](personal-agent-docs.md) | **documentation map for the build**: five doc corpora, 13-step reading path, concern→docs table, gaps | docs site + repo clone + installed READMEs |
| [`docs-official-site.md`](docs-official-site.md) | all 95 English docs-site pages classified (31 HIGH / 33 MEDIUM / 31 LOW) with per-page scope and gaps | docs site, all pages fetched |
| [`docs-installed-packages.md`](docs-installed-packages.md) | all 330 installed packages by area; READMEs that are authoring guides; how the Web profile composes 4 agent presets | installed tree + `--dump-default-config` |
| [`hermes.md`](hermes.md) | Hermes Agent architecture, features, "why it feels like a PA", 12 lessons for DSH | Local install `~/.hermes` (v0.23.0) + official docs |
| [`openclaw.md`](openclaw.md) | OpenClaw gateway/channels/nodes/memory/security, clone-wave ecosystem, 10 lessons for DSH | Primary docs, repo metadata, press |
| [`landscape.md`](landscape.md) | Letta/Goose/Open Interpreter/Kortix/Manus/DIY setups, convergent 10-layer architecture, feature matrix, hard problems | Primary sources + GitHub API |
| [`dsh-audit.md`](dsh-audit.md) | What DSH 0.2.2-rc.1 actually ships: plugin architecture, seams, interaction surfaces, persistence, gap table, 5 build recommendations (S/M/L) | 330-package install + composed config dumps |
| [`dsh-ecosystem.md`](dsh-ecosystem.md) | The community plugin market (4,872 entries) mined for channel/memory/proactivity/voice/mobile plugins | `dsh-plugin-catalog` index + local install |

## Build-phase docs (M0/M0.5, added 2026-11-10)

| File | Scope |
|---|---|
| [`m0-baseline-recon.md`](m0-baseline-recon.md) | read-only host/DSH/Hindsight baseline + the literal-vs-possible M0 gaps |
| [`m0-host-hardening.md`](m0-host-hardening.md) | systemd user-unit hardening: probe, apply, verify (9.8 → 7.0 MEDIUM), residual token note |
| [`m0-egress.md`](m0-egress.md) | nftables observe+alert (no deny, D13), keepalive timer, summarizer/ledger |
| [`m0-telemetry.md`](m0-telemetry.md) | telemetry-disable patch, local sinks, digest/alerts, token/cost meter, redaction |
| [`m0-hindsight-bank.md`](m0-hindsight-bank.md) | `dsh-personal` bank on shared `:9177`, never `josh`, export/backup |
| [`m0-backup-restore.md`](m0-backup-restore.md) | backup script + restore drill (PASS 20/20) and the remaining import gap |
| [`admission-scans.md`](admission-scans.md) | M0.5 static scans: integrity, scripts/native/subprocess/eval/domains/deps, verdicts |
| [`admission-trials.md`](admission-trials.md) | M0.5 scout trials: Hindsight + official session-search (boot/egress/config proofs) |
| [`admission-dsh-im.md`](admission-dsh-im.md) | M0.5 gating trial: `/dsh-im` on 0.2.2-rc.1 (compatible boot, uncertified, upstream Telegram bug) |
| [`m1-own-code.md`](m1-own-code.md) | M1 own-code bundles: SOUL identity loader, ntfy push, quiet heartbeat, human-invoked forget + verification evidence |
| [`m1-install-verification.md`](m1-install-verification.md) | M1 install + acceptance evidence: pinned plugin installs, Hindsight config outside Cordis, write/recall/search proof, side effects, rollback |
| [`m2-retention-policy.md`](m2-retention-policy.md) | M2 memory curator (daily Hindsight consolidation) + retention/erasure policy and inventory |
| [`m2-autonomy-policy.md`](m2-autonomy-policy.md) | per-surface autonomy defaults (Web, heartbeat, push, schedules, future channel) |
| [`ui-handover.md`](ui-handover.md) | handover brief for the new UI/UX track: context, DSH client-plugin seams, product asks, working agreement |
| [`ui-design-brief.md`](ui-design-brief.md) | **UI track design brief**: IA and panel model, verified token system, three visual directions with mockups, component kit, a11y/untrusted-data rules (slice 1 Status/Health shipped then **retired 2026-11-12**) | live shell capture + installed seams |
| [`ui-primitives-slots.md`](ui-primitives-slots.md) | verified DSH client seams: slot catalog + props, 311 primitive exports, client-module contract, `/api` route recipe, defensive rules | installed 0.2.2-rc.1 tree + shell bundle |
| [`dsh-restart-runbook.md`](dsh-restart-runbook.md) | restarting a DSH host + pending-plugin detection (host-control UI, scripts/ops) |

## One-paragraph answer

The field has converged on one architecture — a general agent harness wrapped in an always-on runtime with
chat channels, memory tiers, scheduling/heartbeat, a trust/policy layer and a persona. DSH already ships
the harness half (sessions, tools, sandbox, approvals, skills, MCP, subagents/teams, goals, schedule, web
GUI, headless/SDK/ACP). It lacks the assistant half: IM channels, outbound notifications, long-term memory,
channel-aware approvals and proactive heartbeat. Those are plugin-shaped against DSH's seams, and the
community market already contains ~130 channel bridges, ~229 memory plugins and ~277 proactivity plugins,
including two near-complete assistant bundles (`dsh-bao`, `@starsharryzhu/dsh-assistant`). The
highest-leverage work is therefore integration and hardening: a curated "personal assistant" profile
bundle, a `ctx.channels` seam with a Telegram provider first, a memory subsystem with curation, and a
channel-aware approval/trust policy — not another agent loop.

## Caveats

- DSH is a developer preview (breaking changes announced); marketplace plugins are unvetted and vary widely
  in quality. Counts are keyword/category matches from 2026-11-09 and will drift.
- Local inspection was read-only; no credentials or personal memory/chat content were read or reproduced.
