# Decision register

One row per decision that still shapes the project. The **rationale stays in the source document**; this page
exists so a future session does not have to reconstruct the decision history from six files.

Status: **ACTIVE** (governs current work) · **SUPERSEDED** (kept for history; the replacement is named) ·
**PROPOSED** (recommended in the audit; needs the owner's sign-off) · **WITHDRAWN**.

| # | Date | Decision | Status | Source / replacement |
|---|---|---|---|---|
| D1 | 2026-11-09 | **Compose, don't fork.** The assistant is a profile of pinned plugins on documented DSH seams; no core patches or custom agent loop. | **ACTIVE** | [design](../research/personal-agent-design.md) §0 |
| D2 | 2026-11-09 | **One profile (`personal`), one umbrella bundle `@local/dsh-assistant`**, rows disableable one at a time. | **SUPERSEDED in mechanism** — one profile stands; the umbrella bundle was never built and each feature ships as its own bundle. | [design](../research/personal-agent-design.md); actual composition in the live profile |
| D3 | 2026-11-09 | **Identity:** `soul/SOUL.md` is the source of truth, injected at prompt order 0 by a small loader. | **ACTIVE** | [design](../research/personal-agent-design.md); [loader doc](../research/m1-soul-loader.md); [plugin](../plugins/dsh-soul/README.md) |
| D4 | 2026-11-09 | **Memory in three tiers:** bounded curated notes, Hindsight semantic memory, FTS5 session search; do not write a memory engine. | **ACTIVE** (backend default reopened by D18) | [design](../research/personal-agent-design.md) §3; [memory doc](../research/memory-personal-agent.md) |
| D5 | 2026-11-09 | **Buy first, build the glue.** Search the market before writing a plugin; build a thin package if nothing mature fits. | **ACTIVE** | [design](../research/personal-agent-design.md) §4 |
| D5.1 | 2026-11-10 | The scout's adopt list (soul-md, switchboard, heartbeat, automations, push-notify, …) makes ~90% of the stack buyable. | **SUPERSEDED by D14** — those packages were rejected on maturity. | [shortlist](../research/personal-agent-plugin-shortlist.md) §0 |
| D6 | 2026-11-10 | **One channel first** (Telegram), outbound before inbound, approvals later. | **ACTIVE** | [design](../research/personal-agent-design.md) |
| D7 | 2026-11-10 | **Trust is explicit:** Web approvals by default; per-surface defaults for unattended/channel runs; fail-open for memory, fail-closed for policy. | **ACTIVE** | [design](../research/personal-agent-design.md); [autonomy policy](../research/m2-autonomy-policy.md) |
| D8 | 2026-11-10 | **No custom UI until the data exists.** Web GUI and channel messages first; memory/status UI later. | **WITHDRAWN** — a Status panel was built, then retired at the owner's request (2026-11-12); product UI is now planned in DIRECTION §7. | [UI handover](../research/ui-handover.md); [DIRECTION](product/DIRECTION.md) |
| D9 | 2026-11-10 | **Security baseline precedes any community plugin.** DSH does not audit plugin code or filter prompt injection; plugins are trusted in-process code. | **ACTIVE** | [security](../research/personal-agent-security.md) |
| D10 | 2026-11-10 | **Security and telemetry are P0 and permanent.** Every install/upgrade is vetted and ledgered; telemetry is local-only, redacted, never exported. | **ACTIVE** | [security](../research/personal-agent-security.md); [ledger](../research/plugin-ledger.md) |
| D11 | 2026-11-10 | **Baseline facts:** systemd `IPAddressAllow/Deny` unavailable on this host; Hindsight is shared with Hermes; the service runs as the human user. | **SUPERSEDED as facts** — the controls built on them are recorded in the M0 docs; the tenant/user model still stands. | [recon](../research/m0-baseline-recon.md) |
| D12 | 2026-11-10 | First M0 answers: harden but stay on the human user; second Hindsight instance; egress observe then deny; no credential rotation. | **SUPERSEDED by D13** (shared instance, permanent observe+alert). | [build-progress](../research/build-progress.md) |
| D13 | 2026-11-10 | **Pragmatic security baseline, permanent:** telemetry egress off; local-only journal/digest/alerts; tested backups; pinned/ledgered admission; secrets 0600; `workspace-write`+ask; egress observed+alerted; bank `dsh-personal`. Accepted residual: a compromised plugin owns the user's data. Upgrade trigger: second user, untrusted plugins, remote access, incident. | **ACTIVE** | [security](../research/personal-agent-security.md) §7–§8 |
| D14 | 2026-11-10 | **Mature plugins only.** No 0–3★ single-author packages on core surfaces; prefer first-party/vendor code; own the thin glue. | **ACTIVE** | [shortlist](../research/personal-agent-plugin-shortlist.md) §0; [ledger](../research/plugin-ledger.md) |
| D15 | 2026-11-14 | **The product is a general personal assistant** (Hermes-class), not a narrow vertical harness. The B2B services doc is parked. | **PROPOSED** | [audit](product/AUDIT-2026-11-14.md) §9 |
| D16 | 2026-11-14 | **Distribution:** signed desktop app supervising a pinned local DSH host; documented server mode; no managed cloud in v1. | **PROPOSED** | [DIRECTION](product/DIRECTION.md) §6 |
| D17 | 2026-11-14 | **Channel:** build a small owned Telegram bridge on DSH session/approval APIs; do not wait for `dsh-im` (#547) and do not adopt its 121-dep tree. | **PROPOSED** | [DIRECTION](product/DIRECTION.md) §5 |
| D18 | 2026-11-14 | **Memory default:** local-first (bounded block + FTS5); Hindsight becomes an opt-in deep-memory connector, never a first-run dependency. | **PROPOSED** | [DIRECTION](product/DIRECTION.md) §5 |
| D19 | 2026-11-14 | **Freeze the homelab deployment as a reference** (tag/branch or `reference/`); it is evidence, not the install path. | **PROPOSED** | [audit](product/AUDIT-2026-11-14.md) §9 |
| D20 | 2026-11-14 | **Licensing/branding:** MIT wrapper, own name/marks, no DeepSeek marks; drop AGPL content plugins from the distributed product; add third-party notices. | **PROPOSED** | [audit](product/AUDIT-2026-11-14.md) §9 |

**Sub-decisions:** `M0-D1` (stay on the human user) and `M0-D4` (no credential rotation) remain in force under
D13; `M0-D2`/`M0-D3` were revised by D13. Their detail is in the [build-progress decisions log](../research/build-progress.md#decisions-log-recent).

---

## How to add a decision

1. If it changes the product, architecture, security posture or an earlier decision, give it the next ID here.
2. Put the reasoning in a source document (a plan, an audit, an admission note) and link it from the row.
3. Mark the earlier row **SUPERSEDED** and name its replacement; never delete the history.
4. **PROPOSED** rows need an explicit owner sign-off before they become **ACTIVE**. Record the date of the
   sign-off, not the date of the proposal.
