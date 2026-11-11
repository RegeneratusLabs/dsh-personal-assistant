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

## 2026-11-11 — M1 acceptance gaps
- Prompt-injection corpus 4/4 PASS (plain file, fake system notice, hidden HTML comment, memory poisoning):
  no canary, no tool execution, no approval change, no poisoned rule stored. Corpus now reproducible via
  `scripts/security/injection-corpus.sh`.
- Recall token budget PASS (~180-token recall delta); recorded a fixed ~3k-token Hindsight prompt block as an
  M2 cost item. `forget` stays partial (Hindsight lacks per-memory delete). Telegram channel deferred.
- Evidence: `research/m1-acceptance.md`.

## 2026-11-11 — M2 start: memory hygiene + retention
- Daily Hindsight curator (`curate.sh` + `dsh-memory-curate.timer` 07:15): mental-model refresh,
  consolidation, counts-only report + 7-day Hindsight LLM usage (67 req / 335,897 tokens first reading).
- Retention policy (`research/m2-retention-policy.md`) and read-only inventory (`retention-report.sh`):
  sessions, storages, backups 14/8, telemetry 90 d (digest prunes its own reports), journald 2 GB/30 d,
  Hindsight erasure contract (document delete vs derived observations vs bank clear).

## 2026-11-11 — M2 complete
- Heartbeat live path proven in an integration harness (30/30 tests): one identified nudge per changed
  state, quiet otherwise, default OFF in production.
- Encrypted off-host backup bundle (`dsh-offsite-bundle.sh`, AES-256 + sha256, decrypt-verified);
  retention policy updated with the procedure.
- Cost/context: digest surfaces Hindsight 7-day LLM usage; fixed ~3k-token memory prompt overhead recorded
  as accepted.
- Per-surface autonomy policy written; channel remains deferred by the human, narrative digest → M3.

## 2026-11-11 — UI/UX track handed over
- Self-contained handover (`research/ui-handover.md`) for a new UI session: verified DSH client-plugin seams
  (bundles, slots, host routes, theme tokens, restart semantics), product surfaces, guardrails, first
  slice = read-only Status/Health then Memory browser. Channel parked.

## 2026-11-11 — reusable by other people's agents
- Evergreen repo description + topics; new `agents/` section (README, copy-paste prompt, generic build guide,
  phase checklists) so a user can point their own DSH agent at the repo to build their own assistant.
  `AGENTS.md` routes external agents there.

## 2026-11-11 — this repository
- Public build log created: docs, our plugins, operator scripts, CI (plugin tests + shell syntax + a
  secret-shaped string scan).

## 2026-11-11 — UI/UX design brief (direction pick pending)
- Captured the live Web shell (light/dark/390) and its real `--dsw-*` token values; verified the client-plugin
  seams that the next slices build on (sidebar entry icon, keyed main panel, authenticated `/api` fetch route,
  focus ring, radii, settings-card material). Correction: `ui-primitives`/`ui-slots` ship inside the shell bundle,
  not as installed packages — cards/lists/empty states are ours to build on tokens.
- Inventoried every read-only data source the assistant UI needs (systemd, alerts, egress, retention, Hindsight,
  telemetry, backups, identity) with sanitized schemas and a recommended single status route.
- Wrote `research/ui-design-brief.md`: IA (one Assistant panel, Status/Memory/Activity tabs), token system, three
  visual directions with mockups (instrument / notebook / minimal), component kit, accessibility and
  untrusted-data rules, and the first slice (read-only Status/Health). No UI code or host change yet.

## 2026-11-11 — UI slice 1: Status/Health panel live on the coding host
- Direction picked (hybrid: instrument layout, human sentences, native settings material) and the brief
  approved. Built `plugins/dsh-status`: one pinned `GET /api/dsh-status/status` aggregating 14 read-only
  sources with per-section TTLs, single-flight cache, allowlisted/sanitised output and per-section
  degradation (15/15 tests), plus the Assistant sidebar panel (vitals, memory, jobs, safety, alerts,
  egress, cost, identity; token-only styling; visibility-gated refresh; en+zh).
- Installed on the coding profile and enabled hot (no restart); `scripts/verify-dsh-status-ui.mjs` passes
  16/16 with zero console errors; light/dark/390 evidence in `artifacts/ui/` (local only). Not installed
  on the `personal` host — that needs human approval and one restart.

## 2026-11-11 — slice 1 accessibility polish
- Contrast: small text and status chips moved to AA-safe token pairs (5.8:1+ light, 12.1:1 dark; chips use
  primary text + a coloured dot instead of coloured text on a tint). Added the missing `role="main"` landmark,
  a live region for freshness, 44px coarse-pointer touch targets, and kept the shell's visible focus ring.
- New `scripts/verify-dsh-status-a11y.mjs` passes 10/10 (headings, landmark, live region, 17 text-style
  contrast samples, keyboard focus, 200% zoom, reduced motion, touch target); UI verify stays 16/16.
- Still pending: real screen-reader pass, and deploying the panel to the `personal` host (approval + restart).

## 2026-11-11 — Status/Health panel deployed to the personal host
- Pre-install backup `daily/20261111T051012Z` (9.8 MB, sha256 + Hindsight export + secret check), installed
  `@local/dsh-status` into the `personal` profile (installer added the dependency and bundle row), one restart
  of `dsh-personal.service`.
- Verified live at `:7002` / tailnet `:8454`: route 200 with `serving.unit = dsh-personal.service`, UI verify
  16/16, accessibility verify 10/10, zero console errors. The coding-host preview was removed afterwards.
- Rollback: remove the dependency + bundle row and restart, or restore backup `20261111T051012Z`.

## 2026-11-11 — Guizang Design + Media Desk moved to the personal host
- Vetted both community plugins (no prior ledger rows): `dsh-guizang-design@0.1.4` (AGPL-3.0, 779★) and
  `dsh-media-desk@2.6.2` (MIT, 1023★); no install scripts, no telemetry, no credential access.
- Security: guizang's own `/guizang-design` routes had no owner auth (200 unauthenticated over the tailnet,
  private works included); media desk already gated through `connection.requestRejection`. Fixed guizang locally
  with `scripts/ops/patch-guizang-auth.sh` (fails closed 403) — re-apply on reinstall/upgrade.
- Migrated data to `~/.dsh-personal/{guizang-design,media-desk}` (library + 2 works + voice profile + thumbs;
  media-desk state/settings), installed both pinned versions from backup `daily/20261111T060926Z`, one restart of
  `dsh-personal.service`. Both panels render with their data; routes 401 unauthenticated / 200 authenticated;
  egress unchanged.
- Coding profile: both rows disabled live and dependencies removed; data dirs kept as the backup copy.
