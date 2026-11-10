# dsh-personal-assistant

A personal AI assistant built by **composing pinned plugins on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)** — no fork, no custom agent loop. This repository is both the build and its public engineering log: every decision, plugin admission, security control, failure and fix is recorded under [`research/`](research/).

**Status:** M0 (security & telemetry) ✅ · M0.5 (plugin admission) ✅ · M1 (curated stack) 🟨 — identity, memory, recall, push and heartbeat are live; the Telegram channel is **on hold** pending an upstream delivery fix.

[![ci](https://github.com/RegeneratusLabs/dsh-personal-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/RegeneratusLabs/dsh-personal-assistant/actions/workflows/ci.yml)

## What it does today

| Layer | Component | State |
|---|---|---|
| Identity | `@local/dsh-soul` + [`soul/SOUL.md`](soul/SOUL.md) — persona, tone, untrusted-content and approval rules injected at prompt order 0 | live |
| Long-term memory | `@vectorize-io/hindsight-coding-agents@0.8.6`, self-hosted Hindsight on `127.0.0.1:9177`, bank `dsh-personal` only | live |
| Session recall | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` (FTS5 index, durable file) | live |
| Phone push | `@local/dsh-push` — ntfy notifications on turn/approval/question, no message bodies | installed, inert until `NTFY_URL` |
| Proactivity | `@local/dsh-heartbeat` — quiet, default-OFF loop with quiet hours and change-gated nudges | installed, disabled by design |
| Channel | `@xmanrui/dsh-im` (mature Telegram/IM plugin) | **HOLD** — not certified for this DSH version and an open upstream bug (#547) breaks final-answer delivery |
| Security & telemetry | hardened systemd user unit, DSH telemetry egress disabled, nftables egress observe+alert, journald sink, digest timer, token/cost meter, backups + restore drill | live |

Deliberately **not** installed: the long tail of 0–3★ single-author market plugins (switchboard, heartbeat,
automations, push-notify, soul-md, …). They are rejected in [`research/plugin-ledger.md`](research/plugin-ledger.md);
where the capability matters, we wrote the small piece ourselves ([`plugins/`](plugins/)).

## Architecture

```
dsh-personal.service (systemd --user, 127.0.0.1:7002, tailnet via tailscale serve)
├─ DSH 0.2.2-rc.1 (profile "personal", home ~/.dsh-personal)
│  ├─ identity   @local/dsh-soul ──► $DSH_HOME/soul/SOUL.md (0600)
│  ├─ memory     @vectorize-io/hindsight-coding-agents ──► Hindsight :9177, bank dsh-personal
│  ├─ recall     session-search (FTS5) ──► $DSH_HOME/storages/session-search.db
│  ├─ push       @local/dsh-push ──► ntfy (inert by default)
│  └─ heartbeat  @local/dsh-heartbeat (default OFF)
├─ local telemetry: journald · nftables egress observe+alert · token/cost · digest timer
└─ backups: ~/backups/dsh-personal (profile + workspace + Hindsight bank export)
```

## How it is built (and what makes this repo useful)

The engineering record is the product. Read in this order:

| Doc | What it covers |
|---|---|
| [`research/README.md`](research/README.md) | index of all research notes |
| [`research/build-progress.md`](research/build-progress.md) | phase board, decisions log, work log, open questions (updated every block) |
| [`research/personal-agent-design.md`](research/personal-agent-design.md) | target architecture, memory design, phase plan, decisions D1–D13 |
| [`research/personal-agent-security.md`](research/personal-agent-security.md) | threat model, DSH's real security posture, admission checklist, residual risks |
| [`research/m0-baseline-recon.md`](research/m0-baseline-recon.md) | host/DSH/Hindsight recon + the literal-vs-possible gate findings |
| [`research/m0-host-hardening.md`](research/m0-host-hardening.md) · [`m0-egress.md`](research/m0-egress.md) · [`m0-telemetry.md`](research/m0-telemetry.md) · [`m0-backup-restore.md`](research/m0-backup-restore.md) | the four M0 controls, their verification and limits |
| [`research/admission-scans.md`](research/admission-scans.md) · [`admission-trials.md`](research/admission-trials.md) · [`admission-dsh-im.md`](research/admission-dsh-im.md) | M0.5 static scans and scratch-profile trials for each admitted candidate |
| [`research/m1-install-verification.md`](research/m1-install-verification.md) · [`m1-own-code.md`](research/m1-own-code.md) | M1 install + functional acceptance evidence, including honest gaps |
| [`research/plugin-ledger.md`](research/plugin-ledger.md) | every plugin approved, installed or rejected, with version, sha512, scan, trial, rollback |
| [`BUILD-LOG.md`](BUILD-LOG.md) | one-screen chronological milestone log |

### Decisions worth knowing

- **D13 — pragmatic security baseline.** Single-user host, accepted same-UID risk; instead of a dedicated
  OS user we keep telemetry egress off, egress observed and alerted, backups tested, plugins vetted and
  pinned. Full reasoning and residuals: security doc §7–§8.
- **D14 — mature plugins only.** Measured npm/GitHub adoption per candidate; no 0–3★ single-author packages
  on core surfaces; own the small glue instead.
- **Least mechanism.** One profile, bundle rows disableable one at a time; no core patches.

## Using the pieces

```sh
# unit tests (no host needed)
cd plugins/dsh-heartbeat && node --test          # 26 tests
node plugins/dsh-soul/selftest.mjs              # loader edge cases

# host checks (read-only)
scripts/telemetry/check-alerts.sh               # alerts: unit, Hindsight, backup age, egress
scripts/hardening/verify-unit-hardening.sh      # what systemd actually applied
sudo scripts/egress/observe.sh status           # egress observation target freshness

# backup + restore drill (live host untouched; drill on :7009)
scripts/backup/dsh-backup.sh
scripts/backup/dsh-restore-drill.sh --require-hindsight

# forget a memory document / clear the bank (human-invoked, bank-locked)
scripts/memory/forget.sh --list
scripts/memory/forget.sh --match <text> --yes
```

## Security notes for readers

- No credentials, tokens or captured prompts are in this repository (CI runs a secret-shaped string scan;
  raw captures are gitignored).
- The docs describe a real homelab host (private LAN IP, tailnet name, local ports). Nothing here is
  reachable from the public internet.
- Third-party bank names in the build log are redacted to placeholders.
- DSH is a developer preview: this build pins exact versions and treats every DSH/plugin upgrade as a
  re-vetting event. See [`SECURITY.md`](SECURITY.md) to report an issue.

## License

MIT — see [`LICENSE`](LICENSE).
