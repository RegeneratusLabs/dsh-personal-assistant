# M1 install + acceptance verification — 2026-11-10 19:16–19:30 AEST

Human sign-off: "Yes put forward". Only the **two admitted** plugins were installed (D14 mature gate);
nothing else third-party entered `personal`.

## Installed (pinned exact, into `~/.dsh-personal`, profile `personal`)

| Package | Version | sha512 (verified) | Profile change |
|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | `0.2.2-rc.1` | `sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` | +39 pkgs; bundle appended |
| `@vectorize-io/hindsight-coding-agents` | `0.8.6` | `sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` | +1 pkg; bundle appended |

Pre-install backup: `~/backups/dsh-personal/daily/20261110T091629Z` (Hindsight `exported`).

## Config changes (all reversible, no secrets)

1. **Hindsight config outside Cordis** (M0.5 finding): `~/.dsh-personal/hindsight/coding-agent.json`
   mode 0600 — `serverMode:"self-hosted"`, `apiUrl:"http://127.0.0.1:9177"`, `bankId:"dsh-personal"`,
   `dynamicBankId:false`, `autoInject:"reflect"`, `retainSessions:true`, `autoSeed:false`,
   `autoUpdate:false`, `gitIngest:"none"`.
2. Unit drop-in `~/.config/systemd/user/dsh-personal.service.d/20-hindsight.conf`:
   `Environment=HINDSIGHT_CONFIG=%h/.dsh-personal/hindsight/coding-agent.json` (verified present in the
   running process env). Rollback: delete the drop-in + `daemon-reload` + restart.
3. Profile patch: `optional-session-query-sqlite` → `path: …/storages/session-search.db`, `openAt: startup`
   (both keys restated because a patch replaces the row config wholesale). Backup:
   `cordis.patch.yml.bak-m1-20261110-191714`.

## Boot + isolation evidence (live host, restarted 19:17)

- unit active, `/` → **401**; journal: no error/warn/`did not activate` lines.
- session-search index: `~/.dsh-personal/storages/session-search.db` **0600**, FTS5 tables
  (`persisted_docs*`, `persisted_sessions`, `search_state`), `user_version = 8` → the override applied.
- egress observe (service cgroup, 20 min window): only `3.173.21.63:443` = `api.deepseek.com` (model
  listing), **no cloud Hindsight endpoint, no npm/telegram**.
- `dsh-personal` bank stayed empty until a session ran; Hermes banks untouched by us (the `josh` count moved
  because **Hermes itself** is writing on the shared instance — not our process; both plugins are inert
  without a session).
- live checks: `check-alerts.sh` → **no alerts** (2 warnings: restarts/24 h, cost baseline <3 days; 0 skipped);
  egress observe **FRESH**.

## Functional acceptance (headless profile in the same DSH home, same plugin versions/config)

Because the live Web host needs a human browser turn, acceptance ran through a temporary `personal-test`
profile (headless template + the same two pinned plugins + the same model route + same
`HINDSIGHT_CONFIG`). This exercises the identical plugins/config; the profile was removed afterwards.

| Test | Result |
|---|---|
| **Memory write** | headless turn: model called `hindsight_ingest_document`; bank `dsh-personal` went **0 → 4 nodes / 2 docs / 1 observation**; reply `stored-ok` |
| **Cross-process (restart) recall** | new headless process asked for the phrase → replied **`amber-fox-42`** (recall via memory tools) |
| **Session search** | new headless process: `session_search` returned the earlier session `session-92a7028e…` with snippet `hindsight_ingest_document {"title":"M1 acceptance phrase","content":"the M1 acceptance phrase is amber-fox-42."}` |
| **Bank isolation** | all writes landed in bank **`dsh-personal`** (11 nodes/4 docs by the end); never `josh`; `~/.hermes` untouched |
| **No cloud Hindsight** | bank traffic went to `127.0.0.1:9177` (proved by the writes landing in the local bank); Hindsight cloud URL never contacted |
| **Fail-open when :9177 down** | **not tested** (would disturb the shared Hermes instance) — M1/M2 item |
| **`forget` removes a fact** | not tested — M1 item |

## Side effect to track

- The Hindsight plugin writes a **global skill** on cold start: `~/.agents/skills/hindsight-coding-agent/SKILL.md`
  (83,070 B, sha256 `ea819c1cc7e5b132c126f91c83a490d1e794693750af00bc8c781d8c3f3f8d90`). DSH loaded it into the
  session skill catalog (observed mid-session). It is generated docs, not code, but it is a **third-party-
  written instruction surface outside the repo** and it describes dynamic per-repo banks (we pin one bank).
  Keep for now; **re-hash on every Hindsight upgrade and alert on change** (M2). Removal is likely futile —
  the plugin re-creates it when missing.
- Test sessions remain in `~/.dsh-personal/sessions/` (they contain the acceptance phrase; harmless, and
  searchable — the live index picks them up on the next restart).

## Rollback (full M1 install)

```sh
DSH_HOME=/home/josh/.dsh-personal /home/josh/dsh/node/bin/dsh plugin --profile personal remove \
  @vectorize-io/hindsight-coding-agents @deepseek-ai/dsh-experimental-session-search
rm ~/.config/systemd/user/dsh-personal.service.d/20-hindsight.conf
# restore the pre-install patch backup, then:
systemctl --user daemon-reload && systemctl --user restart dsh-personal.service
```
Bank `dsh-personal` keeps its data (delete via REST only after a backup if ever needed).
