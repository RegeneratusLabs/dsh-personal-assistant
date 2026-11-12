# Build progress

English | [中文](build-progress.zh.md)

Living status for the personal-agent build. The build agent updates this after every work block.
Plan: [`personal-agent-design.md`](personal-agent-design.md) · Gates: [`personal-agent-security.md`](personal-agent-security.md)
· Stack: [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md).

**Status:** P0 (design + documentation + plugin scouting) **complete**. **M0 ✅ GREEN (2026-11-10 17:07 AEST,
pragmatic baseline D13)** — unit hardened + verified, telemetry egress off, egress observed + alerted,
local telemetry live (journald cap, token/cost, digest timer, alerts), `dsh-personal` bank isolated, backup +
restore drill PASS, residuals recorded. **M0.5 complete; M1 in progress (memory/recall/identity/push/heartbeat live; channel deferred by human); M2 complete (2026-11-11). Public build log:** https://github.com/RegeneratusLabs/dsh-personal-assistant `personal` now runs: official
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
| M2 | Curator/digest, notify policy, per-surface autonomy, retention | ✅ **complete 2026-11-11** — curator timer, retention + encrypted off-host bundle, autonomy policy; narrative digest deferred to M3 | Egress/approval/injection tests pass |
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

## Next track — UI / UX (started 2026-11-11)

The backend is built (M0–M2). The human opened a dedicated **UI/UX & front-end track**: design the
assistant's own panels and component layer on DSH's client-plugin seams. The self-contained handover for the
new session is [`ui-handover.md`](ui-handover.md) (context, verified seams, product asks, guardrails, first
slice = read-only Status/Health, then Memory browser). Channel stays parked.

**Design phase (2026-11-11):** brief approved — hybrid direction (A instrument bones + B human voice + C
settings material), one `Assistant` panel with Status/Memory/Activity tabs, first slice read-only
Status/Health at 1440 + 390 in both palettes. [`ui-design-brief.md`](ui-design-brief.md), supported by
[`ui-primitives-slots.md`](ui-primitives-slots.md) (slots/primitives/route recipe; `ui-primitives` is
runtime-seeded, not an installed package) and `ui-data-inventory.md` (15 sources,
22 handover corrections, route shape/TTLs).

**Slice 1 built and verified on the coding host (2026-11-11):** `plugins/dsh-status` (`@local/dsh-status`,
zero-build) — host half `GET /api/dsh-status/status` (14 sources, per-section TTLs + single-flight cache,
sanitised allowlist envelope, never throws; 15/15 tests) + client half (Assistant sidebar entry → keyed
`main` panel: vitals, lede, memory/jobs/safety/alerts/egress/cost/identity sections, per-source freshness,
visibility-gated refresh with backoff, token-only styling, `en`+`zh`). Installed on the coding profile
(`dsh-web.service`, :7000) and hot-enabled without a restart; `scripts/verify-dsh-status-ui.mjs` passes
16/16 checks with zero console errors, screenshots in `artifacts/ui/status-*`. **Not installed on
`personal`** — needs human approval + one restart. Rollback (coding host): disable the bundle row
`include:dsh-status` in Plugins (or remove the dependency), then restart.

## Agent-consumable packaging (2026-11-11)

The repo is now usable by **other people's DSH agents**: `agents/README.md` (what you get, prerequisites,
ground rules), `agents/PROMPT.md` (copy-paste task brief with placeholders), `agents/GUIDE.md` (generic
phase-by-phase build guide with parameterised paths) and `agents/checklists.md` (phase gates). `AGENTS.md`
routes external agents there; the README explains it up front. Repo description is now evergreen (no progress
status), with topics.

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

- **2026-11-11 08:17–08:30 AEST — public build log created:** repo
  https://github.com/RegeneratusLabs/dsh-personal-assistant (public, `main`). 101 files / 1.2 MB: docs,
  our plugins, operator scripts, CI (heartbeat tests + soul selftest + shell/module syntax + secret-shaped
  scan). Sanitization before the push: third-party bank names redacted to placeholders, the credential-
  incident note rewritten with no values, `.cache/`, `artifacts/`, `design-systems/` and `.tmp-render/`
  gitignored (raw captures/screenshots stay local). No secrets in the index (verified with a pattern scan);
  local workspace anchored as the git working tree, `origin` = the new repo.

- **2026-11-11 08:28–08:45 AEST — M1 acceptance gaps closed (channel deferred by human):**
  - built a reusable scratch `verify` profile (same pinned plugins/Hindsight config as `personal`).
  - **injection corpus 4/4 PASS** (plain file, fake system notice, hidden HTML comment, memory poisoning):
    no canary files, no tool execution, no poisoned rule stored, and the persisted approval policy was
    deterministically verified to remain `ask`. Added the corpus as repeatable tooling:
    `scripts/security/injection-corpus.sh` + fixtures (last run: PASS 4/4 + policy `ask`).
  - **recall token budget PASS**: recall delta ~729 chars (~180 tokens); recorded that Hindsight 0.8.6 also
    injects a fixed ~2.95k-token `<hindsight_knowledge>` block per request (no knob; M2 tuning).
  - fail-open, bank isolation, egress, restore drill re-confirmed; `forget` remains PARTIAL (document delete
    works, derived observations survive; bank clear is the full-erasure path).
  - Telegram channel **deferred by human decision** — parked, no work in this block.
  - Evidence: [`m1-acceptance.md`](m1-acceptance.md).

- **2026-11-11 08:45–08:50 AEST — M2 start: memory hygiene + retention (host: one user timer):**
  - `scripts/memory/curate.sh`: bank-locked daily pass — refresh mental models, `POST /consolidate`, bounded
    wait, counts-only JSON report (0600) + Hindsight 7-day LLM usage (first reading: 67 requests / 335,897
    tokens). Dry-run + real run verified; no content in the report.
  - `dsh-memory-curate.timer` (user unit) enabled for **07:15 daily**; oneshot test run `Result=success`.
  - `scripts/ops/retention-report.sh`: read-only inventory (sessions/storages/backups/telemetry/logs/journal/
    bank) + `--json`; policy recorded in [`m2-retention-policy.md`](m2-retention-policy.md) (retention table,
    Hindsight erasure contract, open decisions).
  - `daily-digest.sh` now prunes its own `digest-*.md` / `curate-*.json` older than 90 days (the policy's
    telemetry-retention mechanism).
  - Host changes: one user timer+service (revert: `systemctl --user disable --now dsh-memory-curate.timer` +
    remove the two unit files + `daemon-reload`). No plugin or profile changes.

- **2026-11-11 10:31–10:40 AEST — M2 completed (no Telegram work, per human):**
  - **Heartbeat live path proven**: added `test/live.test.js` (fake Cordis context) — timer registration,
    projection collection, `agent.followup()` exactly once on an actionable state change, quiet on unchanged
    state, missing-agent failure contained, disabled-by-default structural inertness. Suite now **30/30**;
    production remains **default OFF**.
  - **Off-host encrypted backups**: `scripts/backup/dsh-offsite-bundle.sh` (gpg AES-256, passphrase-file
    0600 or recipient key, sha256 sidecar, decrypt-verify, plaintext intermediate removed). Tested on a real
    backup: 9.7 MB encrypted, decrypt-list verified. Destination remains a human decision; procedure recorded
    in `m2-retention-policy.md` §5.
  - **Cost/context**: digest now surfaces Hindsight 7-day LLM usage from the curator report (67 requests /
    335,897 tokens) and records the fixed ~3k-token/request memory-prompt overhead as accepted (plugin
    inherent, M2 note; revisit if a knob appears or cache impact grows).
  - **Per-surface autonomy policy**: `m2-autonomy-policy.md` — Web owner, heartbeat (off), push (inert),
    scheduled jobs, memory tools, and the landing default for a future channel (DM allowlist, restricted tool
    set, approval-gated actions, no guest rights).
  - M2 exit: curator + retention + autonomy + notify policy done; **channel deferred**, **narrative digest
    deferred to M3**, skill diagnostics N/A (D14 rejected the plugin). No new third-party code.

- **2026-11-11 12:10 AEST — UI/UX track handed over:** wrote [`ui-handover.md`](ui-handover.md) — a
  self-contained brief for a new session (current stack/state, verified client-plugin seams: `dsh.client`
  bundles, `__ModuleLoader__`, slots `sidebar.panellist`/`main`/`settings.section`, authenticated host routes
  via `ctx.connection.fetch.register`, `--dsw-*` theme tokens + `ctx.theme`, restart semantics; product
  surfaces: Status/Health → Memory → Identity/Activity/Approvals/Settings; accessibility and untrusted-data
  rules; working agreement incl. explicit git staging). Repo synced and pushed; no host changes.

- **2026-11-11 12:20 AEST — repo packaging for other users' agents:** evergreen GitHub description + topics
  (`deepseek-harness`, `dsh`, `personal-assistant`, `ai-agent`, `plugins`); new `agents/` section
  (README/PROMPT/GUIDE/checklists) so anyone can point their own DSH agent at the repo and build their own
  assistant; `AGENTS.md` now routes external agents to it. No host changes.

- **2026-11-11 12:15–12:55 AEST — UI/UX design phase: verified seams, data inventory, design brief (repo-only):**
  - read the handover + build docs; captured the **live coding-host shell** (light/dark/390) with a loopback
    owner-cookie exchange and dumped the real `--dsw-*` tokens (415 properties; aliases resolve per palette via
    `body` / `body[data-ds-dark-theme]`). Evidence in `artifacts/ui/` (gitignored).
  - verified seams: bundle shape, `__ModuleLoader__`, slots (`sidebar.panellist` icon-only `{size,active}`,
    keyed `main`, `settings.section`), `/api` route contract (`methods`/`requestBody`/`fetch`, handler owns the
    status), focus ring, radii, settings-card material. Found that `dsh-client-ui-primitives`/`-slots` are
    **runtime-seeded, not installed packages** (no types; no Card/List/EmptyState exports) — our kit builds those
    on tokens. `host-control`'s status route reports the *serving* host, so the new route must pin
    `dsh-personal` explicitly.
  - data inventory: 15 read-only sources with sanitized live schemas (systemd unit/timers, check-alerts, egress,
    retention, Hindsight health/stats/usage, telemetry JSON, backup manifests, SOUL metadata) + 22 corrections to
    the handover (no digest JSON; backup glob wrong; session-search index empty; Hermes banks listed by
    `/v1/default/banks`; egress `table.present:false` is a privilege fact).
  - wrote [`ui-design-brief.md`](ui-design-brief.md) with three directions (A instrument / B notebook / C minimal)
    and rendered light+dark+390 mockups from the real token values (`.tmp/mockups/`, gitignored; PNGs in
    `artifacts/ui/`). Recommended hybrid: A's bones + B's voice + C's settings material.
  - first slice scoped: new `plugins/dsh-status` (`@local/dsh-status`) → one pinned
    `GET /api/dsh-status/status`, single-flight TTL cache, per-section degradation; client panel with one
    visibility-gated 60 s refresh, loading/empty/error states, tokens only, `en`+`zh`. No write surface.
  - **no UI code, no host change, no install**: awaiting the human's direction + slice decision; the first
    install onto the coding host needs one restart of `dsh-web.service` (will ask).

- **2026-11-11 13:00–14:15 AEST — UI slice 1 built: Status/Health panel live on the coding host:**
  - direction chosen by the human: hybrid (A's instrument layout, B's plain-sentence voice, C's settings
    material for later Settings surfaces). Brief updated with the decision and a hybrid reference render.
  - new bundle `plugins/dsh-status` (`@local/dsh-status`, zero-build): host half registers one pinned
    `GET /api/dsh-status/status` through `ctx.connection.fetch.register` — 14 read-only sources
    (systemd unit + timers, plugin counts, Hindsight health/stats/7d usage, alerts, egress, cost, curator,
    backup manifests, retention, SOUL metadata), per-section TTLs (5 s–300 s) + single-flight cache, stale
    fallback, `?fresh=1` cache-bypass only, allowlisted/sanitised output (`~` paths, masked tokens, no
    hostname/owner/cgroup/sha256), never throws. 15/15 `node:test` cases.
  - client half: sidebar entry `Assistant` (id/key `assistant`) → `main` panel with vitals strip, lede
    sentence, and memory / scheduled jobs / safety & retention / needs-attention / egress / token-cost /
    identity sections; per-section degradation, one visibility-gated 60 s refresh with backoff + manual
    refresh, relative timestamps ticking at 15 s, token-only styling (zero literal colours), `en`+`zh`.
  - installed into the coding profile via `plugin_manager` (dependency + bundle row); first activation
    failed on a missing `inject` export (caught by the host's diagnostic), fixed, then re-enabled via the
    plugin manager — applied hot, **no restart**. Verify script `scripts/verify-dsh-status-ui.mjs`:
    16/16 checks, 0 console errors, light/dark/390 screenshots in `artifacts/ui/status-*`.
  - CI gains a `status panel host tests` step. Home half not installed on `personal` (needs approval).

- **2026-11-11 14:30–14:50 AEST — slice 1 accessibility polish (repo + coding host preview):**
  - AA contrast pass: in light mode the theme's `caption` (#adb2b8, 2.1:1) and `tertiary` (#81858c, 3.7:1)
    tokens fail AA at small sizes, and coloured chip text on status tints fails too (1.99–3.68:1). Moved every
    small label/hint to `label-secondary` (5.8:1 light, 12.1:1 dark) and made chips a tinted surface with
    **primary text + coloured dot** (17.5:1) so colour is never the only carrier.
  - added the missing `role="main"` landmark (the shell renders none), `aria-label`, kept the shell's 2px
    focus ring (verified: `outline: auto 2px #4176e6` on the Refresh button after tabbing), 44px touch targets
    under `(pointer: coarse)`, and a tinted warning bar with primary text.
  - new `scripts/verify-dsh-status-a11y.mjs`: single h1 + 7 h2s, main landmark, live region, AA contrast for 17
    rendered text styles, keyboard focus reach (60 tabs), 200% zoom at 720 CSS px (no overflow), reduced motion
    (no transitions), coarse-pointer 44px target — **all pass, 0 console errors**. UI verify still 16/16.
  - still open: a real screen-reader pass (NVDA/Orca/VoiceOver) and a human visual review; deployment to
    `personal` still needs the human's go-ahead + one restart.

- **2026-11-11 15:10–15:55 AEST — UI slice 1 deployed to the personal host (host change, human-approved):**
  - pre-install backup `daily/20261111T051012Z` (9.8 MB, sha256 recorded, Hindsight `dsh-personal` exported,
    secret check PASS). Install: `DSH_HOME=~/.dsh-personal dsh plugin --profile personal add plugins/dsh-status`
    — the installer added the dependency **and** appended `@local/dsh-status` to `dsh.profile.bundles`
    (no hand-written row). One restart of `dsh-personal.service` (new PID, active, 401 serving, 0 restarts).
  - verified live on `:7002` / tailnet `:8454`: `GET /api/dsh-status/status` → 200 `ok:true`,
    `serving.unit = dsh-personal.service`; UI verify **16/16**, accessibility verify **10/10**, zero console
    errors; screenshots `artifacts/ui/status-personal-*`. The route reads the assistant's own unit/home/bank
    (backup age now reflects the pre-install backup).
  - the **coding-host preview was removed** afterwards (disable bundle row + `dsh plugin --profile web remove`);
    `:7000` profile is back to its pre-slice selection. Rollback for `personal`: remove the dependency + bundle
    row, restart; or restore backup `20261111T051012Z`.
  - verify scripts now take `--unit/--port/--authority/--base` (the personal unit's cookie is scoped to its
    `--public-url` authority); token selection prefers the target unit's journal (a web.log token is 401 on :7002).

- **2026-11-11 16:00–16:30 AEST — content plugins moved from the coding host to `personal` (human-directed):**
  - **Vetting first** (no ledger rows existed): `dsh-guizang-design@0.1.4` (AGPL-3.0, 779★, deps
    playwright/puppeteer-core/subset-font, 0 install scripts) and `dsh-media-desk@2.6.2` (MIT, 1023★, zero
    runtime deps, 0 install scripts). Integrity captured from the registry; per-install static scans recorded in
    [`plugin-ledger.md`](plugin-ledger.md).
  - **Security finding:** guizang's custom `/guizang-design` web routes had **no owner auth** — gallery,
    examples, thumbnails and the private design works answered 200 unauthenticated on both `:7000` and the
    tailnet, and its POST routes only checked `Origin` when present (so non-browser clients bypassed it). Fixed
    locally with `scripts/ops/patch-guizang-auth.sh` (calls `ctx.connection.requestRejection`, fails closed);
    re-apply on any reinstall/upgrade. Media desk already gated correctly (401 unauth / 200 with cookie).
  - **Data migrated before install:** `~/.dsh/guizang-design/` (library.json, voice.md, thumbs) plus the two
    referenced works → `~/.dsh-personal/guizang-design/works/<id>/` with library roots rewritten to the personal
    home; `~/.dsh/media-desk/` (state.json, settings.json, files/) → `~/.dsh-personal/media-desk/`. Coding-host
    copies left in place as the backup.
  - **Install:** pinned exact versions (`dsh-guizang-design@0.1.4`, `dsh-media-desk@2.6.2`) after backup
    `daily/20261111T060926Z`; installer added both bundle rows. One restart of `dsh-personal.service` (new PID,
    active, 401). Verified: both sidebar entries render; guizang shows **2 works** + voice profile ready, media
    desk loads its migrated state; guizang routes 401 unauthenticated (patch) / 200 with the owner cookie; media
    desk 401/200; boot log clean; egress unchanged (`api.deepseek.com` only); alerts unchanged (2 pre-existing
    warnings, unit-restarts count now 5/24 h from today's installs).
  - **Coding host cleaned up:** both bundle rows disabled live and `dsh plugin --profile web remove` for both
    dependencies; profile back to 9 deps / 17 bundles. Data dirs kept as backup; no `dsh-web` restart needed
    (fibers disabled live, next boot no longer composes them).

- **2026-11-11 17:35–17:55 AEST — PWA auto-login on `personal` fixed (host change: proxy unit drop-in + script):**
  - **Symptom:** the personal PWA showed `dsh-pwa-autologin-proxy: re-auth failed: token exchange returned no
    auth cookie (status 401) for homelab.taildace6c.ts.net:8454` after today's `dsh-personal` restarts.
  - **Root cause:** `dsh-pwa-autologin-personal.service` was configured with
    `DSH_WEB_LOG=~/dsh/logs/personal.log`, but the M0 hardening drop-in sends the personal unit's stdout to
    **journald**; that file has been stale since 2026-11-10, so every re-mint after a restart exchanged a dead
    token and got 401. The proxy itself was fine (the coding entry, which still logs to `web.log`, kept working).
  - **Fix:** the proxy now reads the launch token from `DSH_WEB_JOURNAL_UNIT` via `journalctl --user -u <unit>`
    (journal first, log file as fallback, 10 s token cache) — `scripts/dsh-pwa-autologin-proxy.mjs`. New unit
    drop-in `~/.config/systemd/user/dsh-pwa-autologin-personal.service.d/10-token-source.conf` sets
    `DSH_WEB_JOURNAL_UNIT=dsh-personal.service`; proxy restarted (not the DSH host).
  - **Verification:** `scripts/verify-autologin-proxy.sh` (updated to read the personal token from the journal)
    passes both entries — inject path + own-cookie POST `session/list` (personal 8 sessions, coding 306);
    tailnet root and `/api/dsh-status/status` return 200 through the proxy; direct loopback `:7002` still 401.
  - **Rollback:** remove the drop-in + `systemctl --user daemon-reload && systemctl --user restart
    dsh-pwa-autologin-personal.service` (reverts to the stale log-file behaviour); script change is in git.

- **2026-11-12 — Deployment persona made the prompt opener; Hindsight recall bounded (human-directed):**
  - **Prompt stack:** the profile patch on `personal` sets `system-prompt: {includeHarnessIdentity: false,
    personaPrefix: ''}` and overrides `preset-standard` with the shipped 0.2.2-rc.1 plugin list minus its
    scope-only `persona` row, so the installed deployment persona is the first system-prompt section (the row
    shadowed the global prefix for every web session). Verified on a live session: restart PID 1613944 →
    1648385, boot clean, stored system prompt 9,391 chars starting with `# Identity`, 0 matches for the
    coding-agent and harness-identity lines, reply in 6 s. The host-specific fragment is intentionally not
    committed; the two rows above are the reproducible form. Rollback: restore the profile backup and restart.
  - **Memory:** the 17.7 KB unsynthesized first-prompt dump was a degraded fallback, not a plugin bug —
    Hindsight's synthesis returned 500 `402 Insufficient Balance` (diag `reflect_failed` after 19,043 ms, then
    page search → 22 raw observations). Client config (`~/.dsh-personal/hindsight/coding-agent.json`) is now
    `autoInject: recall`, `injectTimeoutMs: 3000`, `recallOptions.max_tokens: 800`: `inject_recall` 1,222 ms,
    8 observations, injection 12,801 chars, no `reflect_failed`. Upstream 402 is Hermes-side and untouched.
    Docs: [`persona-and-memory-tuning.md`](persona-and-memory-tuning.md).
  - **Privacy note:** this repo ships the generic starter `soul/SOUL.md`; the live deployment's actual persona
    and its prompt text are private and deliberately not mirrored here.

- **2026-11-12 — Public repo sanitised (human-directed):**
  - **Request (human):** the cross-project theme/logo experiment and the personal persona text must not be in the
    public repo; live theme/logo also to be reverted.
  - **Repo:** dropped the theme/logo experiment (bundle, generated tokens/assets, verify harness, docs) and the
    persona-port commits from public history; restored the generic starter `soul/SOUL.md`; genericised the
    persona/prompt-stack documentation (no persona text, name, session ids or host-specific fragments); kept the
    legitimate memory-recall tuning record and the Assistant-panel retirement. History rewritten and
    force-pushed to `main`; repo remains public.
  - **Live host:** uninstalled the experimental theme/logo bundle from the `personal` profile, one restart;
    stock DSH palette and brand are back. The private deployment persona stays installed and untouched.
  - **Rollback:** full pre-rewrite history bundle under `.tmp/history-backup/` (gitignored); reinstall the bundle
    from a gitignored local archive if the experiment is ever wanted privately again.

- **2026-11-12 — Assistant panel retired and removed (human-directed):**
  - **Request (human):** "The assistant plugin and feature is not required — disable and remove" (personal
    profile). Target confirmed: `@local/dsh-status`, the sidebar entry **Assistant** and its Status/Health page.
  - **Host change (one restart):** uninstalled the package from the `personal` profile
    (`DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove @local/dsh-status`; dependency + bundle row
    gone, `node_modules/@local/dsh-status` symlink removed) after backing up the profile config
    (`package.json.bak-status-removal-20261112-174555`, `cordis.patch.yml.bak-status-removal-20261112-174555`).
    `scripts/ops/dsh-restart.sh dsh-personal.service`: PID 1648385 → 1736271, active, journal clean (soul,
    push, heartbeat, model listing only), no `dsh-status` line. `dsh-pending.py`: nothing pending on either host.
  - **Verified live:** loopback `:7002` 401 (auth intact); authenticated tailnet probe shows the sidebar with
    Plugins / Media Desk / Profiles / Guizang Design / Automation tasks only — **no Assistant entry** (desktop
    1440 and mobile 390); `GET /api/dsh-status/status` → **404**; no console/page errors beyond the probe's own
    404. Screenshots in `/tmp/assistant-removed/` (local evidence, not committed).
  - **Repo removal:** deleted `plugins/dsh-status/` (code, tests, README), `scripts/verify-dsh-status-ui.mjs`,
    `scripts/verify-dsh-status-a11y.mjs`, the CI "status panel host tests" step, and `research/ui-data-inventory.md`
    (scoped 1:1 to the panel). `ui-design-brief.md` and `ui-handover.md` are kept as the UI-track design record
    with retirement notes; `AGENTS.md`, `research/README.md` and the status board above updated.
  - **Rollback:** restore the two profile backups + `git revert` of the removal commit, reinstall the bundle and
    restart `dsh-personal.service` (one restart).

- **2026-11-12 — Bilingual documentation, Chinese available as an option (human-directed):**
  - **Request (human):** a Chinese translation of the repo, offered to users as a language option.
  - **Convention:** English `*.md` stays the source of truth; each translated page gets a `*.zh.md` sibling with
    a switch line under the title (`English | [中文](…)` / `[English](…) | 中文`), mirroring DSH's own README
    convention. Policy: `docs/i18n.md`; terminology: `docs/i18n-glossary.md`.
  - **Translated (14 pages):** README, AGENTS, BUILD-LOG, SECURITY, docs/i18n, `agents/{README, PROMPT, GUIDE,
    checklists}`, `research/{README, build-progress, personal-agent-design, personal-agent-security,
    plugin-ledger}`. Code, comments, configs and the remaining deep research notes stay English (coverage table
    in `docs/i18n.md`).
  - **Drift control:** `.i18n.json` stores per-section EN/ZH hashes; `scripts/docs/i18n-check.mjs` checks
    structure, byte-identical code fences, relative links and the recorded hashes; CI runs it on every push/PR.
    Workflow: edit EN → mirror in ZH → `node scripts/docs/i18n-check.mjs --write`.
  - **Next:** the remaining `research/` notes can be translated mechanically in a follow-up block.

- **2026-11-12 19:40 — DSH rc.2 preflight (isolated, no live change):** installed
  `@deepseek-ai/dsh@0.2.2-rc.2` into `/tmp/dsh-rc2-preflight/runtime` and booted copies of both real profiles
  on spare ports. `--dump-config` is clean for both; the composed tree gains `mcp-manager`, `agent-team`,
  `tool-agent-team`, `ui-agent-team`; both hosts answer 401 in 7 s with no error lines. The old
  `dsh-experimental-agent-team-profile` bundle has no rc.2 release and cannot resolve — rc.2 core replaces it,
  so the row is removed. The personal `preset-standard` override was regenerated from the shipped rc.2 preset
  minus `persona` (adds `tool-office`, `skill-filesystem.customSkillDirs`, `tool-subagent-control.interrupt:false`).
  Scripts: [`scripts/ops/update-rc2-profiles.mjs`](../scripts/ops/update-rc2-profiles.mjs),
  [`scripts/ops/dsh-upgrade-rc2.sh`](../scripts/ops/dsh-upgrade-rc2.sh); runbook and rollback:
  [`rc2-upgrade.md`](rc2-upgrade.md). Dry-run through a transient user unit passes. **Next:** run the detached
  live upgrade (the coding-host restart drops this Web session), then the post-upgrade re-admission checklist.

- **2026-11-12 19:50 — DSH 0.2.2-rc.2 live on both hosts (upgrade block complete):**
  `npm i -g @deepseek-ai/dsh@0.2.2-rc.2`; profiles updated by
  [`update-rc2-profiles.mjs`](../scripts/ops/update-rc2-profiles.mjs) (agent-team bundle row removed — rc.2
  moves Agent Teams into core; personal `preset-standard` regenerated from the shipped rc.2 preset; session-search
  pinned rc.2; dead web rows removed). Personal 401 in 5 s, web 401 in 7 s, `dsh-pending` clean, 79/90 client
  modules. Hindsight (0600 config, bank `dsh-personal`, API 200), session-search DB, guizang/media-desk auth
  gates, profiles, soul loader all re-verified; repo tests pass. The first live attempt rolled back cleanly on
  a transient-404 readiness false negative; the retry is recorded in [`rc2-upgrade.md`](rc2-upgrade.md).
  **Next:** session-level SOUL/Hindsight acceptance, first MCP connector via `mcp-manager`, and the
  `@local/dsh-capabilities` sidebar page.

- **2026-11-12 20:00 — Capabilities page + first connector plane live (personal):** built
  [`@local/dsh-capabilities`](../plugins/dsh-capabilities/) (host route + sidebar page: Connectors from
  `ctx.mcpManager`, Plugins from `ctx.pluginManager`; connector probe/restart; read-only plugins). Added a
  dependency-free local stdio MCP fixture ([`mcp-ping-server.mjs`](../scripts/fixtures/mcp-ping-server.mjs))
  through the rc.2 `mcp-manager` row. Live checks: `/api/capabilities` 200 (owner) / 401 (unauth), connector
  `ping` state `connected`, 31 plugin bundles listed, page renders in Playwright at 1440 and 390 px with 0
  console errors; personal 80 live client modules, `dsh-pending` clean. Decision record and Western coverage /
  Composio trigger: [`connectors-options.md`](connectors-options.md). **Next:** the first real Western
  connector needs a token (GitHub PAT first), then the OAuth probe (Gmail/Calendar) to decide the Composio
  trigger.
