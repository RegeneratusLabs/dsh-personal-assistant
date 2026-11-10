# Build progress

Living status for the personal-agent build. The build agent updates this after every work block.
Plan: [`personal-agent-design.md`](personal-agent-design.md) · Gates: [`personal-agent-security.md`](personal-agent-security.md)
· Stack: [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md).

**Status:** P0 (design + documentation + plugin scouting) **complete**. **M0 ✅ GREEN (2026-11-10 17:07 AEST,
pragmatic baseline D13)** — unit hardened + verified, telemetry egress off, egress observed + alerted,
local telemetry live (journald cap, token/cost, digest timer, alerts), `dsh-personal` bank isolated, backup +
restore drill PASS, residuals recorded. **M0.5 complete; M1 in progress (2026-11-11 07:44 AEST).** `personal` now runs: official
`session-search@0.2.2-rc.1`, vendor `Hindsight@0.8.6` (config outside Cordis), and **our own** identity,
push and heartbeat bundles + `SOUL.md` — all verified, live, with no errors. Forgetting is a human-invoked
script (Hindsight exposes no delete tool; derived observations survive document delete — recorded). Channel
(`@xmanrui/dsh-im`) remains **HOLD** for a Telegram token/smoke test. Evidence:
[`m1-install-verification.md`](m1-install-verification.md), [`m1-own-code.md`](m1-own-code.md).

## Phase board

| Phase | Scope | Status | Exit gate |
|---|---|---|---|
| P0 | Docs map, build plan, memory design, plugin scouting, security model | ✅ complete | Artifacts in `research/` |
| **M0** | Security & telemetry baseline on the personal host | ✅ **complete 2026-11-10** | Unit hardened + verified, telemetry egress off, egress observed + alerted, local telemetry live, Hindsight `dsh-personal` bank isolated, restore drill passed, residual risks recorded |
| M0.5 | Plugin admission pass (mature-only, D14) | ✅ **complete** — awaiting sign-off | Ledger rows complete; surprises documented; human sign-off |
| M1 | Install curated stack into `personal` (D14 mature-only) | 🟨 **in progress** — memory + recall + identity + push + heartbeat installed & verified; channel HOLD; acceptance gaps remain | Design §3 + shortlist §5 acceptance tests |
| M2 | Curator/digest, notify policy, per-surface autonomy, retention | ⬜ pending M1 | Egress/approval/injection tests pass |
| M3 | Optional notes store / memory UI / skill curator / second channel | ⬜ later | Only with a real need |

## M0 task checklist (pragmatic baseline, D13)

Baseline facts and the literal-vs-possible gaps are in [`m0-baseline-recon.md`](m0-baseline-recon.md); the
adopted posture and its accepted risks are in [`personal-agent-security.md`](personal-agent-security.md) §7–§8.
Status: ⬜ pending · 🟨 in progress · ✅ done.

Security:

- [x] Harden the `dsh-personal` systemd **user** unit best-effort and record which directives actually apply —
      **all applied** (probe + readback), journald sink, exposure 9.8 → **7.0 MEDIUM**, boot/401/model-listing
      verified; `LogFilterPatterns` proved ineffective on user units and was removed (residual documented).
      Details: [`m0-host-hardening.md`](m0-host-hardening.md) §8. Replaces "move off the human user" (D13).
- [x] Egress **observed + alerted**: `table inet dsh_egress` applied (scoped cgroup jump, policy accept, exact
      counters + rate-limited `DSH-EGRESS ` log); verified with a cgroup-attributed connection
      (`DST=3.173.21.63:443` = `api.deepseek.com`); `summarize-egress` Status OK and `check-alerts`
      `egress-observe ok`. Root keepalive timer re-binds after unit restarts (cgroup staleness). No deny list
      (D13). Details: [`m0-egress.md`](m0-egress.md).
- [x] Secrets: credential store 0600, no secrets materialized into the unit environment; rotation of the four
      recon-exposed refs **declined** (accepted risk, D12/D13). Old `~/dsh/logs` cleaned (0700 dir, 0600 files;
      token lines no longer world-readable). Current-process launch token in the local user journal **accepted
      as a documented residual** (0640, local, excluded from backups/exports, tokens die on restart).
- [x] Hindsight: **`dsh-personal` bank created** on the existing `:9177` instance (0 facts, export HTTP 200);
      Hermes banks untouched (`josh 58310`, `hermes-bank-3 29`, `hermes-bank-2 66`). Details:
      [`m0-hindsight-bank.md`](m0-hindsight-bank.md) §8. Plugin config must pin the bank in M1.
- [x] Restore drill: **PASS — 20/20 checks** (profile, workspace, sessions, storages, credentials 0600,
      `dsh-personal` bank export sha256, scratch boot on :7009, authenticated UI 200, clean teardown;
      4.1 s). Evidence: [`m0-backup-restore.md`](m0-backup-restore.md).

Telemetry:

- [x] Disable DSH egress: profile patch applied — `session-log-deepseek`/`plugin-package-inventory-deepseek`
      `enabled: false`, `session-telemetry-otel` `mode: DISABLED`; pre-flighted via `--patch --dump-config`,
      live after restart (backup at `cordis.patch.yml.bak-m0-20261110-154703`). Note: the current
      `opencode-go` route does not attach those fields anyway; patch protects the `deepseek-official` lane.
- [x] Local sinks: systemd user journal (bounded: `SystemMaxUse=2G`, 30-day retention; 2.4 GB → 1.8 GB);
      egress observe + summarizer live; token/cost meter (`scripts/telemetry/token-cost.sh` → §7.3 cost file,
      today 8,978 tokens; spike baseline builds over 3 days); Hindsight `dsh-personal` stats in the digest;
      plugin ledger remains the install/upgrade sink (empty until M1).
- [x] Alerts + digest: `check-alerts.sh` live (**no alerts**; warnings = 4 restarts/24 h from install and
      cost baseline <3 days; 0 skipped); user timer `dsh-telemetry-digest.timer` enabled at 07:00
      (`Persistent=true`) writing a 0600 redacted digest (alerts, egress review, backup age, bank stats,
      token/cost); journald retention applied.
- [x] Secret scan over sinks found 35 URL-token lines in old `~/dsh/logs/*.log` (values masked, never
      printed); new unit logs go to journal (no file log). Cleanup + digest redaction rule documented.

## Resolved M0 decisions (human sign-off 2026-11-10, superseded by D13 where noted)

| # | Decision | Resolution |
|---|---|---|
| M0-D1 | Isolation | **Stay on `josh`; harden the user unit best-effort; accept same-UID secret exposure.** Full L0 (dedicated user/container + deny) is the documented upgrade path. |
| M0-D2 | Hindsight | **Shared instance `:9177`, own bank `dsh-personal` only**; no second Postgres (revises the earlier second-instance answer). |
| M0-D3 | Egress | **Observe + alert, no deny list** (revised from "observe 24 h then deny"). |
| M0-D4 | Rotation | **No rotation now**; accepted residual risk, recorded. |

## Decisions log (recent)

- D9: security baseline precedes any community plugin; DSH does not vet code or prompt injection.
- **D10 (2026-11-10): security + telemetry are P0 and permanent.** Every plugin install/upgrade is vetted
  and recorded in `plugin-ledger.md`; telemetry is local-only, redacted, no third-party export.
- **D11 (2026-11-10, recon):** baseline recorded in [`m0-baseline-recon.md`](m0-baseline-recon.md).
  Consequences: systemd `IPAddressAllow/Deny` is not available on this host build → nftables replaces it;
  Hindsight currently lives inside Hermes's embedded Postgres; `dsh-personal` runs as `josh` with no unit
  hardening; no plugin install and no host change has been made yet.
- **D12 (2026-11-10, first human answers on M0-D1…D4 — superseded by D13 where noted):**
  - **M0-D1 isolation: harden the unit but keep running as `josh`** (dedicated user/container deferred).
  - M0-D2 Hindsight: second instance + own embedded Postgres on `127.0.0.1:9178` — **revised by D13** to a
    `dsh-personal` bank on the shared `:9177` instance.
  - M0-D3 egress: observe-only for ~24 h, then deny+log — **revised by D13** to observe + alert permanently.
  - **M0-D4 rotation: no rotation now**; residual risk accepted — the recon-exposed values were sent to the
    model provider in this session's context. Revisit on any anomaly; noted in `m0-baseline-recon.md` §0.
- **D13 (2026-11-10, human decision — final): pragmatic personal-agent baseline, adopted permanently.**
  Kept: DSH telemetry egress off, local-only sinks/digest/alerts, backups + tested restore, pinned +
  ledgered admission vetting, secrets 0600 and never in env/logs, `workspace-write`+ask preset, no
  `danger-full-access` default, Hindsight `dsh-personal` bank (never `josh`), one Telegram poller per token,
  prompt-injection posture. Dropped: dedicated OS user/container, second Hindsight instance + Postgres,
  egress deny list. Replaced by: egress **observe + alert**, bank-level Hindsight isolation, best-effort
  user-unit hardening with a record of which directives actually apply. **Accepted residual risk:** a
  compromised plugin owns the human user's data, because the service runs as `josh`; compensating controls
  are admission vetting, re-admission on upgrade, approvals and a small pinned surface. **Upgrade trigger**
  for the full L0 (dedicated user/container + deny): a second user, untrusted plugins, remote access, or a
  real incident. Docs updated permanently: `personal-agent-security.md` §4/§7/§8, `AGENTS.md` hard rules +
  phase plan + acceptance tests, and the M0 checklist above.

- **D14 (2026-11-10, human decision — mature-only admission):** plugin selection is **maturity-first**.
  Measured per candidate (npm dl/mo + GitHub stars + license + maintainer + declared DSH compatibility):
  only `@deepseek-ai/dsh-experimental-session-search` (official), `@vectorize-io/hindsight-coding-agents`
  (vendor, 60k★/116k dl/mo) and `@xmanrui/dsh-im` (3.4k★/128k dl/mo, but **no 0.2.2-rc.1 declaration**)
  clear the bar. `dsh-switchboard` (1★, repo has no license file), `dsh-plugin-heartbeat` (3★),
  `dsh-automations` (0★/778 dl/mo), `dsh-push-notify` (2★), `dsh-soul-md` (39★ single-maintainer),
  `dsh-skill-doctor` (1★), `dsh-session-autarchive` (0★), `dsh-period-report`/`dsh-weekly-report` (0–2★)
  are **rejected or replaced by our own small code**. Consequences: third-party surface shrinks to
  2–3 packages; identity/push/heartbeat/automations become ~80–250 LOC of our glue; channel falls to
  `dsh-im` only if the 0.2.2-rc.1 trial passes (else we build a minimal Telegram bridge, not adopt a 1★).
  Full matrix: [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) §0.

## Open questions for the human

1. **Channel decision (open):** a live Telegram smoke test needs a BotFather token + your Telegram user id
   (DM allowlist). With it I test dsh-im delivery/approvals; if upstream #547 reproduces, I build our own
   minimal Telegram bridge. Without a token the channel stays HOLD and the agent is Web-UI-only.
2. **Own-code order for M1:** identity loader (~80 LOC) → ntfy push shim (~60 LOC) → heartbeat loop
   (~100 LOC). Confirm order or reprioritise.
2. **Digest delivery:** currently a local 0600 file (`~/.dsh-personal/telemetry/digest-YYYY-MM-DD.md`) read
   via the unit test / timer; phone push or in-session delivery comes with M1 (`dsh-push-notify` /
   `dsh-switchboard`). Confirm that is fine for v1.

## Work log

- 2026-11-10 — M0 recon complete (read-only); decisions M0-D1…D4 taken and revised once; **D13 pragmatic
  baseline adopted permanently**; docs updated (`personal-agent-security.md`, `AGENTS.md`, this file).
  Repo artifacts in progress: backup/restore, telemetry sinks, egress observe/alert. No host change yet.
- **2026-11-10 15:47–16:10 AEST — M0 block 1 applied (host changes, human-approved):**
  - systemd user-unit hardening drop-in installed (journald sink + `NoNewPrivileges`, `ProtectSystem=strict`,
    `ProtectHome=read-only` + `ReadWritePaths`, `PrivateTmp`, `RestrictAddressFamilies`,
    `RestrictSUIDSGID`, `LockPersonality`, `SystemCallFilter=@system-service`); probe + readback show all
    directives effective; exposure **9.8 → 7.0 MEDIUM**; boot/401/model-listing verified. The unit restarted
    twice (15:47, 15:50) plus a final reload 15:53; current `MainPID` active on `:7002`.
  - telemetry egress patch applied to the personal profile (backup kept `…bak-m0-20261110-154703`).
  - `dsh-personal` Hindsight bank created (0 facts, export 200); Hermes bank counts unchanged.
  - first backup `/home/josh/backups/dsh-personal/daily/20261110T060955Z` (Hindsight `exported`), restore
    drill **PASS 20/20** into scratch `:7009`; live `:7002` untouched.
  - live `check-alerts.sh`: no alerts (1 warning: 3 unit starts/24 h; 2 skipped: egress observe not installed,
    no cost file). Secret scan: 35 old URL-token lines in `~/dsh/logs/*.log` (masked); new unit logs are
    journal-only.
  - Rollbacks: drop-in `rm …/10-hardening.conf` + reload/restart; patch `cp` the `.bak` back + restart; bank
    `curl -X DELETE …/banks/dsh-personal` (empty bank only).

- **2026-11-10 16:59–17:07 AEST — M0 block 2 applied (host changes, approval policy changed to "never ask"
  mid-block; all steps recorded with rollbacks):**
  - egress observe applied (`table inet dsh_egress`, scoped cgroup jump, policy accept); verified with a
    cgroup-attributed connection (counter 1 packet, `DSH-EGRESS … DST=3.173.21.63:443`, `seen_v4` element);
    restart staleness reproduced and fixed with `apply --if-stale` + root keepalive timer (5 min).
  - journald retention drop-in (`SystemMaxUse=2G`, 30-day, 256 MB files); usage 2.4 GB → 1.8 GB.
  - token/cost meter added (`scripts/telemetry/token-cost.sh` → cost file contract, today 8,978 tokens,
    30-day history); wired into the digest's `check-alerts --cost-file`.
  - digest user timer `dsh-telemetry-digest.timer` enabled at 07:00 (oneshot tested, 0600 redacted digest).
  - log cleanup: `~/dsh/logs` 0700 / `*.log` 0600; scratch dirs removed; `/tmp` clean.
  - **M0 exit gate met.** Residuals recorded: same-UID secret exposure (D13), current-process launch token in
    the local user journal (accepted), egress observe needs the keepalive timer (installed), cost-spike
    baseline builds over 3 days, digest is a local file until M1 push.

- **2026-11-10 17:28–17:52 AEST — tooling block, repo-only (no host change, restart NOT performed):**
  - `scripts/ops/dsh-restart.sh` — restart a DSH `--user` unit; hands the job to systemd as a transient
    unit (`systemd-run --user --collect`), which is what makes it safe from inside the target unit (agent
    bash / Web UI terminal). Dry-run + hand-off mechanism verified (`/bin/true` probe, collected).
  - `scripts/ops/dsh-pending.py` — diffs the saved bundle selection against the running Host's live client
    graph (reads the process's own launch token from the unit's log sink/journal, exchanges it for a
    read-only loopback cookie; the token is never printed). Exit 1 when something is pending.
  - Finding (verified): `dsh-web.service` has run since **11-07 17:26**; `dsh-context@0.83.0` (installed
    11-10 17:24) and `dsh-guizang-design` (11-10 17:21) are installed+selected but **not composed** →
    restart required. Packages installed 11-08/11-09 are live, so HMR normally applies; the likely blocker is
    a pending HMR state from the market's cancelled update at 17:19. `dsh-personal.service` has nothing
    pending. The restart itself was **not** run (host change; needs the human — and it would kill the
    answering turn).
  - Reference: `research/dsh-restart-runbook.md`; AGENTS.md environment facts updated. Rollback: delete the
    three files (no host state was touched).

- **2026-11-10 18:33–now — M0.5 admission pass started (D14 mature-only):**
  - measured maturity for all shortlist candidates (npm registry/downloads API + GitHub API); recorded in
    shortlist §0 and D14 above; channel decision = `@xmanrui/dsh-im` over 1★ switchboard.
  - three parallel admission tracks: static scans (`research/admission-scans.md`), scout trials for
    Hindsight + official session-search (`research/admission-trials.md`), and the gating dsh-im
    compatibility trial (`research/admission-dsh-im.md`).
  - no plugin installed into `personal`; scout work uses `~/.dsh` profiles/ports only.

- **2026-11-10 18:33–18:50 AEST — Host-control panel built and installed on the coding host (host change:
  profile install via `plugin_manager`, human-requested; no restart performed):**
  - new local bundle `plugins/dsh-host-control/` (zero-build, mirrors `dsh-profiles`): Host half registers
    `GET /api/host-control/status` + `POST /api/host-control/restart` on the authenticated `/api` channel
    (`ctx.connection.fetch`); client half adds Settings → **Host control** with unit facts, the live
    pending-plugin list (saved `dsh.profile.bundles` vs `ctx.clientModules.clientPath()`) and a confirmed
    restart button. Restart = `systemd-run --user --collect … systemctl --user restart <own unit>`; the unit
    comes from `/proc/self/cgroup`, never from the request, and no model-facing tool is registered.
  - verified on a scratch home (`/tmp`) run as its own transient unit: status JSON, client bundle in the
    graph, method guard 404, restart → new MainPID in ~2 s, pre-restart cookie still valid afterwards, no
    duplicate-route errors, audit line in the unit log. Playwright UI run passed all six checks
    (`scripts/verify-host-control-ui.mjs`; `artifacts/scratch-*.png`). Live hosts untouched.
  - installed into the coding profile (`application: restart-required`, reason `package-moved`), so the
    button needs one bootstrap restart; after it the two pending plugins (`dsh-context`,
    `dsh-guizang-design`) load too. `dsh-pending.py` now reports all three.
  - **not installed into `personal`** (AGENTS.md: human approval required); one `install_bundle` call away.
    Rollback: `remove_bundle` + restart; docs `research/dsh-restart-runbook.md` §6.1.

- **2026-11-10 18:33–19:00 AEST — M0.5 admission pass complete (repo-only + scout profiles; `personal` untouched):**
  - maturity gate D14 measured; stack re-scoped to mature candidates only (shortlist §0, ledger).
  - static scans (`research/admission-scans.md`): integrity MATCH for all three; snapshot evidence in
    `.cache/admission/`. session-search clean; Hindsight clean but no license artifact + cloud/dynamic-bank
    defaults + dormant spawn paths; dsh-im clean of exfiltration/telemetry but 121-pkg tree incl optional
    natives (sharp/libvips, Tencent Go CLI), minified vendored bundle, self-update RPC, undeclared 0.2.2.
  - trials: session-search **PASS** (`:7012`, 3.8 s boot, 401, 0 egress, FTS5 opens), Hindsight **PASS**
    (`:7014`, 3.7 s boot, 401, 0 egress, 8 tools, `dsh-personal` bank untouched), dsh-im **install/compose/boot
    PASS** (`:7013`, 4.3 s, client module 200, no poller) but **compat uncertified + upstream #547 Telegram
    delivery bug on 0.2.2-rc.1** → HOLD.
  - key surprises recorded: Hindsight config is **outside Cordis** (a profile `config:` block is inert; use
    `HINDSIGHT_CONFIG` 0600 + unit `Environment=`); patch replaces row config wholesale; create profiles with
    `dsh --profile X --from-default-profile web --dump-config`.
  - ledger rows written with sha512 + conditions + rollback. No plugin installed; `personal` `:7002` still 401.

- **2026-11-10 18:55–19:09 AEST — restart executed via a scheduled transient unit; pre-flight caught a broken
  plugin (host change: `dsh-web.service` restarted, human-requested):**
  - Pre-flight booted the real pending composition in a scratch home (`:7013`, own transient unit): base +
    web-app + `@local/dsh-host-control` + `dsh-context` + `dsh-guizang-design`, live `node_modules` symlinked.
    Result: guizang-design and host-control ACTIVE + client halves served; **`dsh-context@0.83.0` throws on
    import** — `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-session` — because it imports host packages from its
    **Host** half while the profile sets `autoInstallPeers: false` (only `cosmokit`, `schemastery` are under
    `profiles/web/node_modules/@deepseek-ai/`). Restart cannot fix it; remove it or install peers
    (unsupported second cordis copy). See `research/dsh-restart-runbook.md` §6.
  - Panel improved before the restart: selected-but-not-live packages are now split into **pending** (row
    absent ⇒ restart helps) and **Failed to load** (row present, fiber absent or not ACTIVE ⇒ restart does not
    help), read from `ctx.loader.entries()` fiber states. Verified in the pre-flight host: `pending: []`,
    `failed: ["dsh-context"]`, plus a Playwright pass (all six checks, incl. the failed card).
  - Restart scheduled as a transient timer (`systemd-run --user --on-active`, unit `dsh-bootstrap-restart`) so
    the answering turn could finish first; cancel with `systemctl --user stop dsh-bootstrap-restart.timer`.
  - After it: `dsh-host-control` + `dsh-guizang-design` load, `dsh-context` stays in **Failed to load**.
    Rollback: `remove_bundle` the new bundles + restart; `dsh-context` removal likewise.

- **2026-11-10 19:16–19:30 AEST — M1 start: installed + accepted the two admitted plugins (host change, human "put forward"):**
  - pre-install backup `20261110T091629Z`; installed `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`
    (+39 pkgs) and `@vectorize-io/hindsight-coding-agents@0.8.6` (+1 pkg) into `~/.dsh-personal` profile `personal`.
  - Hindsight pinned **outside Cordis**: `~/.dsh-personal/hindsight/coding-agent.json` 0600 (self-hosted,
    `:9177`, bank `dsh-personal`, dynamicBankId false, autoSeed/autoUpdate/gitIngest off) + unit drop-in
    `20-hindsight.conf` (`HINDSIGHT_CONFIG`), verified in the running process env.
  - session-search override: `storages/session-search.db` 0600 + `openAt: startup`; index opened with FTS5
    schema (user_version 8) at boot → override applied.
  - live host restart 19:17: active, 401, no error/warn lines; egress observe saw only `api.deepseek.com`;
    `check-alerts` no alerts; egress FRESH.
  - functional acceptance via temporary headless profile (same DSH home/plugins/config, removed after):
    memory write (bank 0→4 nodes), **cross-process restart recall** (`amber-fox-42`), **session search**
    found the old session by phrase. Bank isolation held (`dsh-personal` only; `josh` growth is Hermes's own
    writes on the shared instance, not ours).
  - side effect recorded: plugin-generated global skill `~/.agents/skills/hindsight-coding-agent/SKILL.md`
    (83 KB, sha256 recorded) — third-party instruction surface; re-hash on upgrade (M2 alert).
  - channel remains HOLD; identity/push/heartbeat own-code items not started. Details:
    [`m1-install-verification.md`](m1-install-verification.md).

- **2026-11-11 07:39–07:55 AEST — M1 own-code block completed after three build subagents died mid-flight:**
  recovered their partial plugins, fixed heartbeat logging (ctx.logger has no console exporter → stderr) and
  a test-dir permission bug, wrote the missing READMEs, and independently verified everything in scratch
  profiles (no `personal` install by teammates).
  - SOUL loader: 8/8 selftest, headless persona proof ("I'm Mochi…"), live journal line at order 0.
  - Push: inert=0 requests; active=exactly 1 clean POST to a local mock; dead endpoint=turn unaffected.
  - Heartbeat: 26/26 tests; default-off inert; enabled boot logs interval/quiet hours; live nudge stays M2.
  - Installed `@local/dsh-soul`, `@local/dsh-push`, `@local/dsh-heartbeat` + `~/.dsh-personal/soul/SOUL.md`
    (0600); fresh pre-install backup `20261110T214349Z`; live restart 07:44, 401, 0 errors, egress only
    `api.deepseek.com`; all activation lines in journal.
  - Forget: `scripts/memory/forget.sh` (human-invoked, bank-locked, `--list/--doc/--match/--clear`);
    document delete tested 4→3 docs; **honest limit recorded** — Hindsight 0.10.3 has no per-memory delete,
    so derived observations survive a document delete and full erasure needs a bank clear.
  - Stray processes/profiles from the dead subagents were killed and cleaned.
