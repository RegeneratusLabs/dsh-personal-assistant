# Documentation index — the map for this repository

English only for now (see §11). This is the **single entry point** for every document in the repo. If a doc is
not listed here, it is scratch, generated, or private.

**The one rule:** `docs/` and the root files are **current truth**; `research/` is the **append-only record** of
how we got here. Never treat a `research/` file as the current plan — it may be a pre-apply snapshot, a
superseded decision, or a dated market survey. Each file's status line says which it is.

---

## 1. Read by role

**"What is this project?"**
[README.md](../README.md) → [docs/product/AUDIT-2026-11-14.md](product/AUDIT-2026-11-14.md) (where we are)
→ [docs/product/DIRECTION.md](product/DIRECTION.md) (where we are going).

**"I want to use it."** There is no consumer product yet. The honest status is in
[README.md](../README.md#product-status-2026-11-14); the plan is [DIRECTION.md](product/DIRECTION.md) §8.

**"I want to build my own with a DSH agent."** [agents/README.md](../agents/README.md) →
[agents/PROMPT.md](../agents/PROMPT.md) → [agents/GUIDE.md](../agents/GUIDE.md) →
[agents/checklists.md](../agents/checklists.md). This is the builder path, not the product.

**"I am maintaining this repo."** [AGENTS.md](../AGENTS.md) (standing orders) →
[DIRECTION.md](product/DIRECTION.md) §8 (current milestone) → [DECISIONS.md](DECISIONS.md) (what is settled)
→ [research/build-progress.md](../research/build-progress.md) (what actually happened, newest at the bottom).

**"I am operating the reference host."** [research/dsh-restart-runbook.md](../research/dsh-restart-runbook.md) ·
[research/rc2-upgrade.md](../research/rc2-upgrade.md) · [scripts/egress/README.md](../scripts/egress/README.md) ·
[scripts/connectors/README.md](../scripts/connectors/README.md) · [SECURITY.md](../SECURITY.md).

**"I need the security model or plugin rules."** [research/personal-agent-security.md](../research/personal-agent-security.md)
(current policy) · [research/plugin-ledger.md](../research/plugin-ledger.md) (every install/rejection) ·
[research/m2-retention-policy.md](../research/m2-retention-policy.md) ·
[research/m2-autonomy-policy.md](../research/m2-autonomy-policy.md).

---

## 2. Status legend

| Tag | Meaning | Trust it for |
|---|---|---|
| **CANONICAL** | Current source of truth; updated by its owner. | Decisions, plans, policy. |
| **CURRENT** | Current for its narrow scope (a component, a runbook). | Operating that component. |
| **EVIDENCE** | Record of a build phase, test or trial. Facts were true when written. | Audit trail, reproducing results. |
| **REFERENCE** | Dated snapshot of something external (DSH docs, market, package list). | Context, not current facts. |
| **HISTORICAL** | Superseded plan/scout; kept for the "why". | Understanding the path, not following it. |
| **RETIRED** | The thing it describes was removed. | Design salvage only. |
| **PRIVATE** | Present locally but excluded from git. | The owner only. |
| **FIXTURE** | Test data, not documentation. | Nothing; ignore in reviews. |

Every document that could be mistaken for the current plan or a live state carries a status line in its first ten lines; when a doc changes state, update the line *and* this
index in the same commit.

---

## 3. Canonical — product, decisions, front door

| Document | What it is | Status |
|---|---|---|
| [README.md](../README.md) | Front door: product status, reference deployment, engineering log, security notes. | **CANONICAL** |
| [docs/product/AUDIT-2026-11-14.md](product/AUDIT-2026-11-14.md) | Product-readiness audit: verdict, P0/P1 findings, Hermes parity, five competing identities, readiness gates, D15–D20. A dated snapshot. | **CANONICAL** (2026-11-14) |
| [docs/product/DIRECTION.md](product/DIRECTION.md) | The product: definition, user, promise/non-goals, wrapper architecture, distribution choice, 90-day plan, acceptance tests, kill criteria. | **CANONICAL** |
| [docs/DECISIONS.md](DECISIONS.md) | One register for D1–D20: decision, date, status, source. Detailed rationale stays in the source doc. | **CANONICAL** |
| [docs/INDEX.md](INDEX.md) | This map. | **CANONICAL** |
| [AGENTS.md](../AGENTS.md) | Standing orders for a DSH build agent working in this workspace (security rules, gates, conventions). | **CANONICAL** (agent) |
| [SECURITY.md](../SECURITY.md) | Vulnerability-reporting policy. | **CANONICAL** |
| [BUILD-LOG.md](../BUILD-LOG.md) | One-screen chronological milestone log. | **EVIDENCE** |

## 4. Builder path (for other people's DSH agents)

| Document | What it is | Status |
|---|---|---|
| [agents/README.md](../agents/README.md) | What the agent will build, prerequisites, ground rules. | **CURRENT** |
| [agents/PROMPT.md](../agents/PROMPT.md) | Copy-paste task brief with host placeholders. | **CURRENT** |
| [agents/GUIDE.md](../agents/GUIDE.md) | Generic phase-by-phase build guide (recon → M0 → admission → stack → policy). | **CURRENT** |
| [agents/checklists.md](../agents/checklists.md) | Phase gates to copy into a build-progress file. | **CURRENT** |
| [soul/README.md](../soul/README.md) | How the reference identity file is loaded and edited. | **CURRENT** |
| [soul/SOUL.md](../soul/SOUL.md) | The reference persona. Content, not code; replace it with your own. | **CURRENT** (content) |

## 5. Policies

| Document | What it is | Status |
|---|---|---|
| [research/personal-agent-security.md](../research/personal-agent-security.md) | Threat model, DSH's real security posture, admission checklist, residual risks (D13). | **CURRENT** policy |
| [research/m2-retention-policy.md](../research/m2-retention-policy.md) | What is kept, for how long, and the erasure contract. | **CURRENT** policy |
| [research/m2-autonomy-policy.md](../research/m2-autonomy-policy.md) | Per-surface autonomy defaults (Web, heartbeat, push, schedules, channel). | **CURRENT** policy |
| [research/plugin-ledger.md](../research/plugin-ledger.md) | Every plugin approved, installed or rejected: version, sha512, scan, trial, rollback. | **CURRENT** ledger |
| [docs/i18n.md](i18n.md) | Bilingual policy, pairing rules, coverage. | **CURRENT** policy |
| [docs/i18n-glossary.md](i18n-glossary.md) | English → Simplified Chinese terminology. | **CURRENT** |
| [docs/i18n.zh.md](i18n.zh.md) | Chinese translation of the i18n policy. | **CURRENT** |

## 6. Component docs (live next to the code)

These are the authoritative docs for each plugin/script; they are not duplicated here.

| Document | What it is | Status |
|---|---|---|
| [plugins/dsh-soul/README.md](../plugins/dsh-soul/README.md) | Identity loader: file contract, order, config, rollback, tests. | **CURRENT** |
| [plugins/dsh-memory-personal/README.md](../plugins/dsh-memory-personal/README.md) | Memory: bounded profile, three tools, Hindsight, budgets, design rules. | **CURRENT** |
| [plugins/dsh-push/README.md](../plugins/dsh-push/README.md) | ntfy push: payload, privacy, env, install/remove. | **CURRENT** |
| [plugins/dsh-heartbeat/README.md](../plugins/dsh-heartbeat/README.md) | Heartbeat: decision/pulse model, default-OFF, live test. | **CURRENT** |
| [plugins/dsh-capabilities/README.md](../plugins/dsh-capabilities/README.md) | Capabilities/Connectors panel + Composio. **Admin surface, not product.** | **CURRENT** (admin) |
| [plugins/dsh-host-control/README.md](../plugins/dsh-host-control/README.md) | Restart/pending-plugin panel. **Admin surface, not product.** | **CURRENT** (admin) |
| [plugins/dsh-profiles/README.md](../plugins/dsh-profiles/README.md) | Multi-host profile switcher. **Admin surface, not product.** | **CURRENT** (admin) |
| [scripts/egress/README.md](../scripts/egress/README.md) | Egress observe + alert: what is applied, commands, rollback. | **CURRENT** |
| [scripts/connectors/README.md](../scripts/connectors/README.md) | MCP connector setup and credential helper. | **CURRENT** |

## 7. Operator runbooks and current reference

| Document | What it is | Status |
|---|---|---|
| [research/dsh-restart-runbook.md](../research/dsh-restart-runbook.md) | Restart a DSH host safely; detect pending plugins. | **CURRENT** |
| [research/rc2-upgrade.md](../research/rc2-upgrade.md) | Preflight/rollback runbook for the rc.2 upgrade. | **CURRENT** (dated) |
| [research/connectors-options.md](../research/connectors-options.md) | Connector coverage decision and Composio trigger. Homelab scope. | **CURRENT** (homelab) |
| [research/persona-and-memory-tuning.md](../research/persona-and-memory-tuning.md) | Prompt-opener override and recall tuning measurements. | **EVIDENCE** |
| [research/memory-personal-agent.md](../research/memory-personal-agent.md) | Why the coding-agent memory client was replaced; measurements and rejected options. | **EVIDENCE** |
| [research/m1-soul-loader.md](../research/m1-soul-loader.md) | Design record for the identity loader (its "not installed" line is historical). | **EVIDENCE** |
| [research/m1-own-code.md](../research/m1-own-code.md) | Identity/push/heartbeat/forget build record. | **EVIDENCE** |
| [research/m1-install-verification.md](../research/m1-install-verification.md) | M1 install + functional acceptance evidence. | **EVIDENCE** |
| [research/m1-acceptance.md](../research/m1-acceptance.md) | Injection corpus, recall budget, honest gaps. | **EVIDENCE** |
| [research/m0-baseline-recon.md](../research/m0-baseline-recon.md) | Pre-build host/DSH/Hindsight baseline. | **HISTORICAL** |
| [research/m0-host-hardening.md](../research/m0-host-hardening.md) | Unit-hardening design and verification. Status line is pre-apply. | **HISTORICAL** (pre-apply snapshot) |
| [research/m0-egress.md](../research/m0-egress.md) | Egress observe design. Status line is pre-apply. | **HISTORICAL** (pre-apply snapshot) |
| [research/m0-telemetry.md](../research/m0-telemetry.md) | Telemetry-disable patch, sinks, digest. Status line is pre-apply. | **HISTORICAL** (pre-apply snapshot) |
| [research/m0-hindsight-bank.md](../research/m0-hindsight-bank.md) | Bank creation. Status line is pre-apply. | **HISTORICAL** (pre-apply snapshot) |
| [research/m0-backup-restore.md](../research/m0-backup-restore.md) | Backup/restore drill design and evidence. | **EVIDENCE** |

Retention and autonomy policies are listed once, in §5.

## 8. Engineering record — historical

| Document | What it is | Status | Use instead |
|---|---|---|---|
| [research/build-progress.md](../research/build-progress.md) | 607-line work log: phase board, checklists, decisions, every work block. Newest at the bottom. | **EVIDENCE** | [DIRECTION.md](product/DIRECTION.md) for the plan |
| [research/personal-agent-design.md](../research/personal-agent-design.md) | The 2026-11-10 build plan (D1–D14, memory tiers, phases). | **HISTORICAL** | [DIRECTION.md](product/DIRECTION.md), [DECISIONS.md](DECISIONS.md) |
| [research/personal-agent-plugin-shortlist.md](../research/personal-agent-plugin-shortlist.md) | Buy-vs-build market survey; its adopt list was overridden by D14. | **HISTORICAL** | [plugin-ledger.md](../research/plugin-ledger.md) |
| [research/admission-scans.md](../research/admission-scans.md) | Static tarball scans for three candidates. | **EVIDENCE** | [plugin-ledger.md](../research/plugin-ledger.md) |
| [research/admission-trials.md](../research/admission-trials.md) | Scratch-profile trials (Hindsight, session search). | **EVIDENCE** | [plugin-ledger.md](../research/plugin-ledger.md) |
| [research/admission-dsh-im.md](../research/admission-dsh-im.md) | dsh-im compatibility trial (HOLD, #547). | **EVIDENCE** | [plugin-ledger.md](../research/plugin-ledger.md) |
| [research/plugin-scout-memory.md](../research/plugin-scout-memory.md) | 15 memory/identity candidates. | **HISTORICAL** | D14 + ledger |
| [research/plugin-scout-channels.md](../research/plugin-scout-channels.md) | 24 channel/notify candidates. | **HISTORICAL** | D17 + ledger |
| [research/plugin-scout-proactivity.md](../research/plugin-scout-proactivity.md) | 24 proactivity/session/skill candidates. | **HISTORICAL** | DIRECTION §5 |
| [research/personal-profile-setup.md](../research/personal-profile-setup.md) | First host setup runbook (2026-11-09). Host-specific. | **HISTORICAL** | [scripts/setup-personal-profile.sh](../scripts/setup-personal-profile.sh) |
| [research/ui-handover.md](../research/ui-handover.md) | Handover for the retired UI track. **Do not execute it.** | **RETIRED** | [DIRECTION.md](product/DIRECTION.md) §7 |
| [research/ui-design-brief.md](../research/ui-design-brief.md) | IA, tokens, visual directions, a11y rules. Panel retired; design system reusable. | **RETIRED** (salvage) | DIRECTION §7 |
| [research/ui-primitives-slots.md](../research/ui-primitives-slots.md) | Verified DSH client seams, slot catalog, route recipe. | **REFERENCE** | Re-verify against the installed version |

## 9. Research background — context only

| Document | What it is | Status |
|---|---|---|
| [research/dsh-as-personal-assistant.md](../research/dsh-as-personal-assistant.md) | 2026-11-09 synthesis: landscape, capability map, gap analysis, three build paths. | **REFERENCE** (dated) |
| [research/dsh-audit.md](../research/dsh-audit.md) | What DSH 0.2.2-rc.1 shipped: plugin architecture, seams, persistence, gaps. | **REFERENCE** (rc.1) |
| [research/dsh-ecosystem.md](../research/dsh-ecosystem.md) | Community plugin market survey. | **REFERENCE** (2026-11-09) |
| [research/hermes.md](../research/hermes.md) | Hermes Agent architecture and 12 lessons for DSH. The parity baseline. | **REFERENCE** |
| [research/openclaw.md](../research/openclaw.md) | OpenClaw architecture and lessons. | **REFERENCE** |
| [research/landscape.md](../research/landscape.md) | Letta/Goose/Open Interpreter/Manus/DIY comparison. | **REFERENCE** |
| [research/docs-official-site.md](../research/docs-official-site.md) | All 95 DSH docs-site pages classified. | **REFERENCE** (rc.1) |
| [research/docs-installed-packages.md](../research/docs-installed-packages.md) | All 330 installed DSH packages by area (rc.1). | **REFERENCE** (rc.1) |
| [research/personal-agent-docs.md](../research/personal-agent-docs.md) | DSH documentation map for the build (rc.1). | **REFERENCE** (rc.1) |
| [research/README.md](../research/README.md) | Index of the research archive. | **HISTORICAL** (index) |

## 10. Private, fixtures, and generated

| Path | What it is | Status |
|---|---|---|
| `research/business/dsh-harness-business.md` (local, not in git) | B2B productised-services decision doc. It argues *against* the consumer direction; parked until a business decision. | **PRIVATE / PARKED** |
| [scripts/security/fixtures/hidden-comment.md](../scripts/security/fixtures/hidden-comment.md) | Injection-test fixture ("Quarterly notes"). | **FIXTURE** — not documentation |
| `.cache/`, `artifacts/`, `.tmp/`, `.tmp-render/`, `design-systems/` | Local caches, screenshots, scratch. Gitignored. | **GENERATED** |

---

## 11. Bilingual coverage

The policy is in [docs/i18n.md](i18n.md). 14 docs have a `.zh.md` sibling:

`README` · `AGENTS` · `BUILD-LOG` · `SECURITY` · `agents/{README, GUIDE, PROMPT, checklists}` ·
`docs/i18n` · `research/{README, build-progress, personal-agent-design, personal-agent-security, plugin-ledger}`.

**Going forward:** translate the canonical user-facing page first (this index, DIRECTION, the consumer docs),
not the archive. A translated pair must be edited together and re-recorded with
`node scripts/docs/i18n-check.mjs --write`; CI compares heading structure, code fences and section hashes.
English-only archive docs are acceptable and should stay that way.

---

## 12. Rules for adding or moving a document

1. **One question, one document.** If a new note answers the same question as an existing doc, edit that doc.
2. **Current truth goes in `docs/`** (or the root). Phase evidence goes in `research/` as
   `m<N>-<topic>.md` or `admission-<subject>.md`. Builder material goes in `agents/`. Component docs live
   next to the component.
3. **Every doc starts with a status line** from §2 and, when superseded, names what replaces it.
4. **Never create a second index.** Add the row here.
5. **Dated snapshots say so in the title or status** (`as of 2026-11-14`) and are never edited to look current;
   write a new doc instead.
6. **Decisions get an ID** in [DECISIONS.md](DECISIONS.md) when accepted, with a link to the rationale.
7. **Private docs stay out of git** and are listed in §10 so future work knows they exist.
