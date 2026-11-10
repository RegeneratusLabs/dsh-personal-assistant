# Build log

Chronological, link-first record of the build. Detail lives in `research/`.

## 2026-11-09 — research & design (P0)
- DSH capability audit, landscape scans (Hermes/OpenClaw/Letta…), plugin-market scouting (4,985 packages),
  personal-host runbook. Output: `research/dsh-as-personal-assistant.md`, `personal-agent-design.md`,
  `personal-agent-plugin-shortlist.md`, `personal-agent-security.md`.

## 2026-11-10 — security & telemetry baseline (M0, green)
- Read-only recon of host/DSH/Hindsight; found systemd lacks `IPAddressAllow/Deny` on this build, Hindsight
  is Hermes's shared instance, and the service ran unhardened as the human user.
- Human decision **D13**: pragmatic security baseline (accepted same-UID risk; egress observe+alert;
  local-only telemetry; tested backups; vetting as the control).
- Applied: systemd user-unit hardening (exposure 9.8 → 7.0), DSH telemetry egress off, nftables egress
  observation + keepalive timer, journald retention, token/cost meter, digest timer, `dsh-personal`
  Hindsight bank, first backup + **restore drill PASS 20/20**.
- Docs: `m0-*.md`.

## 2026-11-10 — plugin admission (M0.5)
- Human decision **D14**: mature plugins only, no 0–3★ single-author packages.
- Measured every shortlist candidate; rejected switchboard (1★, no repo license), heartbeat (3★),
  automations (0★), push (2★), soul-md (39★ single-maintainer), etc.
- Static scans + scratch trials: official session-search **PASS**, vendor Hindsight
  **PASS-WITH-CONDITIONS**, `@xmanrui/dsh-im` boot-compatible but **HOLD** (upstream Telegram bug).
- Docs: `admission-*.md`, `plugin-ledger.md`.

## 2026-11-10 — curated stack (M1, in progress)
- Installed `session-search@0.2.2-rc.1` + `Hindsight@0.8.6`; Hindsight config pinned outside Cordis
  (`HINDSIGHT_CONFIG`, 0600) because a profile `config:` block is provably inert for it.
- Functional acceptance: memory write (bank 0→4 nodes), cross-process restart recall (`amber-fox-42`),
  session search by phrase; bank isolation held.
- Docs: `m1-install-verification.md`.

## 2026-11-11 — our own glue (M1)
- Rebuilt three lost subagent deliverables: `@local/dsh-soul` (SOUL.md persona at order 0),
  `@local/dsh-push` (ntfy, inert by default, no bodies), `@local/dsh-heartbeat` (default OFF, quiet,
  26 unit tests).
- Installed all three + `~/.dsh-personal/soul/SOUL.md` (0600); live restart clean, no errors, egress only
  `api.deepseek.com`; post-install restore drill **PASS 20/20**.
- Found and recorded a real limit: Hindsight 0.10.3 has no delete tool/endpoint, and derived observations
  survive a source-document delete → `forget` is a human-invoked script; full erasure is a bank clear.
- Telegram channel remains on hold; M2 (policy & glue, heartbeat live-nudge, digest, injection corpus) next.

## 2026-11-11 — this repository
- Public build log created: docs, our plugins, operator scripts, CI (plugin tests + shell syntax + a
  secret-shaped string scan).
