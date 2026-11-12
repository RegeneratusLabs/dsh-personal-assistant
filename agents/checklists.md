# Phase checklists (copy into your build progress file)

English | [中文](checklists.zh.md)

Tick only what you have verified on your host. Every unchecked box is a reason not to install the next
plugin.

## M0 — security & telemetry baseline

- [ ] Isolation decision recorded (pragmatic single-user **or** dedicated user/container), residual risks written down
- [ ] `dsh --version` and unit/service location confirmed; backup destination has free space
- [ ] Unit hardening drop-in applied; every requested directive verified with `systemctl --user show`
- [ ] Boot tested: UI serves (401 without cookie), one model call works, no error lines in journal
- [ ] DSH telemetry egress disabled (`session-log-deepseek`, `plugin-package-inventory-deepseek`, OTel `DISABLED`), pre-flighted with `--dump-config`
- [ ] Egress observation live for the service cgroup; expected destinations documented; alert on unexpected ones
- [ ] journald retention capped; digest timer + alert checker installed
- [ ] Token/cost meter producing local data; no third-party telemetry export
- [ ] Credential store 0600; no secrets in unit env/logs/prompts/telemetry; secret-scan clean
- [ ] Backup script runs; **restore drill passed** into a scratch home on a scratch port
- [ ] M0 exit written in the progress file

## M0.5 — plugin admission

- [ ] Maturity data measured for every candidate (stars, dl/month, license, publisher, maintenance, DSH compatibility)
- [ ] 0–3★ single-author packages rejected or replaced with your own code; reasons recorded
- [ ] Exact versions pinned; sha512 recorded
- [ ] Tarball scanned: no unreviewed install scripts, native binaries, `eval`, unexplained `child_process`, unexpected network domains, credential access
- [ ] Dependencies audited; no `latest`; no auto-update
- [ ] Scratch-profile trial passed (boot + the one behaviour that matters + egress watched)
- [ ] Ledger rows complete (version, sha512, scan, trial, verdict, rollback)
- [ ] Human sign-off recorded

## M1 — stack install

- [ ] Session search installed at the exact version; index path + `openAt` pinned explicitly
- [ ] Memory plugin pinned self-hosted; `HINDSIGHT_CONFIG` 0600 file; bank is yours only; autoSeed/autoUpdate/gitIngest off
- [ ] Identity: your own `SOUL.md` injected at persona order 0; missing file is a no-op; size cap in place
- [ ] Optional push/heartbeat installed **inert/default-off**
- [ ] No shell automations, no plugin/credential tools in unattended surfaces
- [ ] Live host boots clean; no unexpected egress; alerts clean
- [ ] Acceptance: cross-session + restart recall; recall within budget; fail-open when memory is down; bank isolation; session search finds an old conversation; injection payloads cannot trigger tools; no secrets in logs; backup/restore still passes

## M2 — hygiene & policy

- [ ] Memory curator scheduled; report is counts-only and 0600
- [ ] Retention policy written: what/where/how long/what prunes it
- [ ] Erasure contract documented and tested (what "forget" actually removes)
- [ ] Encrypted off-host backup bundle produced and decryption verified
- [ ] Per-surface autonomy policy written (Web, heartbeat, push, schedules, future channel)
- [ ] No new unvetted dependency; every bundle row disableable; rollback recorded
- [ ] Progress file updated; commits pushed; CI green
