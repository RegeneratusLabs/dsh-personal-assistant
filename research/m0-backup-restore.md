# M0 backup + restore drill

Status: **repo artifacts complete and self-tested on the live host (read-only w.r.t. host state)**. Hindsight
target is final per **D13**: the shared Hindsight instance `http://127.0.0.1:9177`, bank **`dsh-personal`
only**, REST export only (never bank `josh`/any Hermes bank, never the embedded Postgres, never
`~/.hermes`). The bank is created in the **next M0 host block**, so today's export is fail-soft
(`bank_missing`/`unavailable`) and memory-bank restore/import stays an **M0 open item**. The real backup has
**not** been written to `~/backups/dsh-personal` yet because that path is outside the build agent's write
sandbox; the human runs that command (§4). M0 exit item "restore tested" is therefore **partially** green:
profile/sessions/storages/workspace/UI restore is proven; memory-bank restore is still open.

Artifacts:

| Path | Purpose |
|---|---|
| [`scripts/backup/dsh-backup.sh`](../scripts/backup/dsh-backup.sh) | timestamped backup + manifest + retention + Hindsight bank export + offline `--verify` |
| [`scripts/backup/dsh-restore-drill.sh`](../scripts/backup/dsh-restore-drill.sh) | restore a backup into a scratch `DSH_HOME`, boot it on :7009, prove it serves and that the bank export is present, clean up, PASS/FAIL |
| this file | runbook, evidence, rollback, residual risks |

All changes are repo-only: no unit change, no service restart, no `sudo`/`systemctl`/`nft`/`chown`/`useradd`,
no writes under `~/.hermes`, no Hermes DB contact.

## 1. What gets backed up

Target: `DSH_HOME` = `~/.dsh-personal` by default (`DSH_PERSONAL_HOME` wins over `DSH_HOME`; an inherited
`DSH_HOME=~/.dsh` — the agent's own session home — is detected and ignored with a note). The script is
identity-agnostic: it reads whatever `DSH_HOME` it is pointed at, records `owner_uid/gid`, and takes the
service unit name as a variable (`SERVICE_UNIT`, recorded only, never controlled).

Included (one tarball, top-level names preserved for a simple `tar -C` restore):

- `profiles/` — profile bundles, patch layers, plugin-manager state, `node_modules` links
- `cordis.patch.yml` — home-level patch layer
- `.credentials.yaml` — credential refs, **mode 600 inside the tarball** and never printed
- `workspace/` — assistant workspace
- `storages/` — DSH storages (workspace state, session projection cache)
- `sessions/` — session transcripts (`session.v4.jsonl.zstd`, locks)

Plus, outside the tarball, the Hindsight bank export (`hindsight/dsh-personal-export.*`) when the bank is
reachable (fail-soft otherwise).

Excluded deliberately (recorded in `manifest.json.contents.excluded`): `logs/` (may contain conversation
content — journald/file logs have their own telemetry story), `.anonymous-user-id` (regenerated identity),
the DSH install tree (`/home/josh/dsh`, reinstall from the pinned version), the repo (versioned separately),
`~/.hermes` and Hermes Hindsight data.

## 2. Layout, manifest, retention

```
$BACKUP_ROOT/                       # default ~/backups/dsh-personal, mode 0700
├── daily/<YYYYmmddTHHMMSSZ>/       # 0700
│   ├── dsh-personal-<ts>.tar.gz    # 0600
│   ├── manifest.json               # 0600
│   ├── SHA256SUMS                  # 0600, `sha256sum -c` compatible
│   └── hindsight/<bank>-export.*   # 0600, only when the bank export succeeded
├── weekly/<ISO-Www>-<ts>/          # 0700, hardlink copy of the first daily backup of the ISO week
├── logs/<ts>-backup.log            # 0600, redacted run log (scanned for leaks)
└── .backup.lock                    # 0600, flock guard against concurrent runs
```

Retention: **14 daily + 8 weekly** (`DAILY_KEEP`, `WEEKLY_KEEP`). Pruning runs after a successful publish,
deletes only directories whose names match the timestamp pattern and whose canonical path is under
`$BACKUP_ROOT/daily/` or `$BACKUP_ROOT/weekly/`, and logs every deletion. `--no-prune` / `PRUNE=0` disables
it. Backup logs older than `LOG_RETENTION_DAYS=90` are pruned too.

`manifest.json` (schema_version 1) records: backup id/kind/start/finish/hostname; DSH version + Node version
+ bin path + profile + unit (record-only); repo dir and **git HEAD**; source owner and bytes; per-artifact
sha256 + size; per-tree file counts/bytes; excluded paths; external symlinks; Hindsight status; retention
settings; timings; and the secret-leak check result. On this host the repo is **not a git repository**, so
`repo.git_head` is `null` with `git_head_note: "not a git repository"` — it will be populated automatically
once the repo is versioned.

Writes are atomic-ish: everything is built in `$BACKUP_ROOT/.staging-<ts>-<pid>` and only `mv`d to
`daily/<ts>` after the secret check passes. A failed run leaves no published half-backup.

Concurrency: `flock -n` on `$BACKUP_ROOT/.backup.lock`; a second run exits **2** without touching anything.

## 3. Secret handling and the "no secrets in filenames/logs" check

- The script never prints `.credentials.yaml` content. It extracts likely credential *values* in memory
  (`toupper(key) ~ /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|GRANT)/`, value length ≥ 8) and compares — never
  echoes — them, then scans:
  - artifact **filenames** (credential values and `sk-…`/`ghp_…`/`xox…`/`AKIA…` shapes),
  - `manifest.json`, `SHA256SUMS`, and the **run log** (exact credential values + generic secret shapes
    including JWT/`Bearer`/private-key markers),
  - the tarball's `.credentials.yaml` **mode** (`-rw-------` required).
- Result is written to `manifest.json.secrets_check`; the value count is recorded, values never are.
- On a positive leak the staging dir is removed, nothing is published, and the script exits **3**.
- The tarball is the one place credentials belong; it is mode 0600 inside a 0700 dir, but **not encrypted**
  (see §9).
- The restore drill prints only a **redacted** boot log (`token=<redacted>`, pattern-verified); the raw boot
  log with the launch token is deleted on cleanup, and the drill-only browser cookie jar is deleted even
  with `--keep`.

## 4. Human-run commands

Run from the repo, as the user that owns `~/.dsh-personal` (today `josh`; if a dedicated user/container is
ever adopted, run these as that user or point `DSH_PERSONAL_HOME` at the home, and expect root only for the
final `chown` of a real restore).

### 4.1 Backup

```bash
cd ~/projects/DSH-playground
./scripts/backup/dsh-backup.sh
```

Defaults: `DSH_HOME=~/.dsh-personal`, `BACKUP_ROOT=~/backups/dsh-personal`, DSH binary
`/home/josh/dsh/node/bin/dsh`, profile `personal`, retention 14/8, Hindsight
`http://127.0.0.1:9177` bank `dsh-personal` (REST only, `HINDSIGHT_EXPORT=1`).

Expected output on today's host (bank not created yet — fail-soft, exit 0):

```
Hindsight export: shared instance (M0-D13), bank-scoped REST only (bank dsh-personal); no DB access
Hindsight export: BANK MISSING — bank 'dsh-personal' does not exist yet on the shared instance.
  It is created in the next M0 host block; no retry, no DB contact.
  Fail-soft: the DSH_HOME backup above is complete and valid — re-run this script after the bank is seeded
  so the bank export is included in the backup.
secret check: PASS (4 credential values compared, never printed)
published: /home/josh/backups/dsh-personal/daily/<ts>
...
BACKUP OK  /home/josh/backups/dsh-personal/daily/<ts>
  tarball : dsh-personal-<ts>.tar.gz (20186 bytes, sha256 050bcbe4…)
  hindsight: bank_missing
```

Once the bank exists the same run prints `Hindsight export: OK (hindsight/dsh-personal-export.json, …)` and
the manifest carries `hindsight.status: "exported"` with the artifact hashed into `SHA256SUMS`. If the API is
down instead, status is `unavailable` and the message says the API is unreachable. Both are fail-soft.

Exit codes: `0` OK (Hindsight `bank_missing`/`unavailable`/`disabled` is not a failure), `1` hard failure,
`2` lock held, `3` secret-leak check failed (nothing published).

Useful overrides: `BACKUP_ROOT=/elsewhere ./scripts/backup/dsh-backup.sh`,
`DSH_PERSONAL_HOME=/home/dsh/.dsh-personal`, `HINDSIGHT_BANK=…` (only `dsh-personal` is accepted),
`HINDSIGHT_URL=…` (http(s) only), `HINDSIGHT_EXPORT=0` (kill switch: no Hindsight request at all),
`--no-prune`, `--no-weekly`.

### 4.2 Verify (offline, fast; run after every backup or before a restore)

```bash
./scripts/backup/dsh-backup.sh --verify ~/backups/dsh-personal/daily/<ts>
```

Expected: `PASS` lines for manifest schema, `sha256sum -c`, gzip integrity, all six required tarball
entries, `.credentials.yaml` mode 600, bank name `dsh-personal`, and no secret-shaped strings in the
manifest; then `VERIFY: PASS — <dir>`. Hindsight `unavailable`/`bank_missing`/`disabled` prints as `INFO`
(fail-soft); `exported` prints `PASS hindsight bank export present`. Exit `1` on any real failure (tampered
tarball, mismatch, missing entry, bad credential mode, wrong/missing bank).

### 4.3 Restore drill (bounded, throwaway, never touches :7002)

```bash
# auto-pick newest daily backup; scratch under /tmp/dsh-restore-drill/<ts>; port 7009
./scripts/backup/dsh-restore-drill.sh

# or pin a backup / path / port, keep the scratch, or require the bank export (post-bank gate)
./scripts/backup/dsh-restore-drill.sh --backup ~/backups/dsh-personal/daily/<ts>
./scripts/backup/dsh-restore-drill.sh --port 7012 --keep
./scripts/backup/dsh-restore-drill.sh --require-hindsight
```

What it does: verifies the backup (`sha256sum -c`, `gzip -t`), extracts into `<DRILL_ROOT>/<ts>`, rebases
the old `DSH_HOME` path to the scratch path in text files (4 files today: profile patch + session/storage
JSON), re-points profile `node_modules` symlinks that a move broke (1 today: `@local/dsh-profiles` →
repo), checks profile/patch/credentials/workspace/sessions/storages counts against the manifest, checks the
**Hindsight bank export** recorded in the manifest (bank must be `dsh-personal`; when `exported`, the
artifact must exist and match its sha256; when absent it is a WARN — or a FAIL with `--require-hindsight`),
boots `DSH_HOME=<scratch> dsh --profile personal --host 127.0.0.1 --port 7009 --no-open --trusted-host
127.0.0.1:7009` with `DSH_TELEMETRY_MODE=DISABLED DSH_TELEMETRY_DISABLED=1` for a bounded time, checks
`HTTP 401` on `/` (auth fence up) plus `HTTP 200` via the launch token (authenticated UI), proves the PID is
bound to `--port 7009` and not 7002, SIGTERMs only that PID, confirms the port is free, removes the scratch,
and prints PASS/FAIL with timings. Exit `0` PASS, `1` a check failed, `2` bad usage/preflight.

Expected today (bank not created yet): `RESTORE DRILL PASS` with one WARN
(`hindsight bank export present — bank_missing …`); after the bank exists, the same run shows
`PASS hindsight bank export present + sha256`, and `--require-hindsight` is the gate that must then be green.

## 5. Real restore procedure (not the drill)

The drill proves the artifacts; this is the disaster-recovery path. **Ask the human before stopping the
service** — stopping `dsh-personal.service` is a host change the agent must not do.

1. Stop the service (human, in their terminal): `systemctl --user stop dsh-personal.service`.
2. Preserve the broken home for forensics: `mv ~/.dsh-personal ~/.dsh-personal.broken-<ts>`.
3. Verify the chosen backup first: `./scripts/backup/dsh-backup.sh --verify <dir>`.
4. Extract: `mkdir -m 700 ~/.dsh-personal && tar -xzf <dir>/dsh-personal-<ts>.tar.gz -C ~/.dsh-personal`.
   (Extract as the service user so ownership is right; if restoring as root, `chown -R <service-user>:
   ~/.dsh-personal` afterwards — root action, human-run.)
5. Restore credentials mode: `chmod 600 ~/.dsh-personal/.credentials.yaml`; confirm `test -d` failed (it is
   a file).
6. Rebase paths if the home moved (identity migration): replace the old home path with the new one in
   `profiles/*/cordis.patch.yml` and the sessions/storages JSON (the drill does this with `sed`; the old path
   is `manifest.json.dsh.home`).
7. Re-link profile bundles if the profile's `node_modules` points outside the home and the target moved:
   `dsh plugin --profile personal install` (network/pnpm; needs human approval) — or keep the repo at the
   recorded `external_symlinks` target.
8. Hindsight (M0 open item): if `manifest.json.hindsight.status == "exported"`, import that bank export into
   a recovered `dsh-personal` bank on the shared `:9177` instance (POST
   `/v1/default/banks/dsh-personal/import` against the same instance that produced it). This is **not
   implemented or tested** — it is a follow-up once the bank exists; never import into bank `josh` and never
   touch the embedded Postgres directly.
9. Start the service (human): `systemctl --user start dsh-personal.service`; verify `HTTP 401` on
   `http://127.0.0.1:7002/` and one authenticated session.
10. Keep `~/.dsh-personal.broken-<ts>` until the restored host passes an acceptance turn, then remove it
    (human decision).

Rollback for a real restore: stop the service, `mv ~/.dsh-personal ~/.dsh-personal.failed-<ts>`,
`mv ~/.dsh-personal.broken-<ts> ~/.dsh-personal`, start the service.

## 6. Hindsight (D13 final: shared `:9177`, bank `dsh-personal` only)

Current host reality (see [`m0-baseline-recon.md`](m0-baseline-recon.md) §3): Hindsight 0.10.3 runs as
`josh` on `127.0.0.1:9177`, backed by Hermes's embedded Postgres
(`~/.pg0/instances/hindsight-embed-hermes`), with banks `josh` (58k facts), `hermes-bank-3`, `hermes-bank-2`. **There is
no `dsh-personal` bank yet** — it is created in the next M0 host block. D13 dropped the second `:9178`
instance; M0 uses the shared instance.

Script policy — hard rules, no flag to override them:

- **Bank scope:** only bank `dsh-personal` is exportable. Any other bank (including `josh`, and therefore
  `hermes-bank-3*`) is refused before any request (`status: refused-hermes-bank`).
- **Transport:** REST only — `GET {HINDSIGHT_URL}/v1/default/banks/dsh-personal/export`. The script never
  runs `psql`/`pg_dump`, never opens the embedded Postgres, never touches `~/.hermes`. A non-HTTP(S) target
  is refused (`status: refused-invalid-target`).
- **Default target:** `http://127.0.0.1:9177` (override `HINDSIGHT_URL` for tests/diagnostics).
- **Kill switch:** `HINDSIGHT_EXPORT=0` disables the export entirely — no request is made, status
  `disabled`, backup still valid (verified with a counting fake server: 0 hits).
- **Fail-soft statuses:** `bank_missing` (HTTP 404; bank not created yet — "no retry loop, no DB contact"),
  `unavailable` (API unreachable or other HTTP error), `disabled` (kill switch). In every case the backup is
  published and the script exits 0 with a clear log line; `--verify` reports `INFO`, not `FAIL`.
- **Export contract:** the response body is stored under `hindsight/` with an extension derived from
  `content-type`, hashed into `SHA256SUMS`, and described by `manifest.json.hindsight` (`scope`, `status`,
  `http_code`, `content_type`, `artifact`, `detail`).
- **Import:** bank export → recovered instance is still an M0 open item (§5 step 8); not implemented/tested.
- **No pg_dump for M0.** The earlier plan's `pg_dump` fallback is kept only as an optional future note: if a
  dedicated instance with its own embedded Postgres is ever added, an operator may dump it **as that
  instance's service user**; that is out of scope for M0 (D13), and the Hermes DB
  (`~/.pg0/instances/hindsight-embed-hermes`) must never be dumped from our side.

## 7. Test evidence (2026-11-10, this host)

All runs were read-only against `~/.dsh-personal`; test output went to `/tmp` because `~/backups` is outside
the agent's write sandbox. The Hindsight paths were exercised against **fake local HTTP responders**
(ports 9917/9918/9919), **not** the real `:9177` instance: D13 says the bank will be created later, and the
safe tests here must not contact Hermes's instance. Test roots were removed after the runs. After each drill:
no `:7009` listener, no scratch dir left, live `:7002` still `HTTP 401`.

Environment: Ubuntu 24.04 / bash 5.2.21 / GNU userland / `shellcheck` **not installed** (gates used:
`bash -n` on both scripts + manual static review); DSH 0.2.2-rc.1, Node v24.22.1; repo is not a git
repository. Defaults verified in code: `HINDSIGHT_URL=http://127.0.0.1:9177`, `HINDSIGHT_BANK=dsh-personal`,
`HINDSIGHT_EXPORT=1`.

### 7.1 Backup: DSH_HOME part + fail-soft Hindsight

`bash -n scripts/backup/dsh-backup.sh` and `bash -n scripts/backup/dsh-restore-drill.sh`: OK.

Unreachable API (`HINDSIGHT_URL=http://127.0.0.1:9917`, nothing listening) → exit 0:

```
Hindsight export: shared instance (M0-D13), bank-scoped REST only (bank dsh-personal); no DB access
Hindsight export: SKIPPED — no Hindsight API reachable at http://127.0.0.1:9917
Hindsight JSON: {"status":"unavailable","http_code":"000","detail":"no Hindsight API reachable at http://127.0.0.1:9917"}
BACKUP OK  …  hindsight: unavailable
```

Fake 404 (bank not created yet) → exit 0:

```
Hindsight export: BANK MISSING — bank 'dsh-personal' does not exist yet on the shared instance.
  It is created in the next M0 host block; no retry, no DB contact.
  Fail-soft: the DSH_HOME backup above is complete and valid — re-run this script after the bank is seeded
Hindsight JSON: {"status":"bank_missing","http_code":"404","detail":"bank 'dsh-personal' does not exist yet on … (created in the next M0 host block)"}
VERIFY: PASS — …   (INFO hindsight: bank dsh-personal not created yet — fail-soft)
```

Fake 200 (bank exists) → exit 0, `status:"exported"`, artifact `hindsight/dsh-personal-export.json` (48 B),
hashed into `SHA256SUMS`; `--verify` prints `PASS hindsight bank export present (bank dsh-personal, …)` and
`VERIFY: PASS`. Manifest fields on this run: `dsh.version 0.2.2-rc.1`, `dsh.node_version v24.22.1`,
`dsh.unit dsh-personal.service`, `repo.git_head null` (`not a git repository`), per-tree counts profiles 11
files / workspace 0 / storages 2 / sessions 2, `external_symlinks` = `@local/dsh-profiles` →
`/home/josh/projects/DSH-playground/plugins/dsh-profiles`, `secrets_check.credential_values_compared 4`;
tarball 20,186 B, sha256
`050bcbe4d3e065c22405bacedb86eb16bdb02c6fded4ecf3d68ed6992d76fa8c`; dirs 700, files 600.

Kill switch: `HINDSIGHT_EXPORT=0` with a fake API that appends every hit to a file → status `disabled`,
**0 requests received**, exit 0. Hard refusals: `HINDSIGHT_BANK=josh` → `refused-hermes-bank`;
`HINDSIGHT_BANK=hermes-bank-3` → `refused-hermes-bank`; `HINDSIGHT_URL=postgres://127.0.0.1:5432/hindsight` →
`refused-invalid-target`; all exit 0 with the backup intact.

Consecutive runs are idempotent (new timestamped dirs; weekly promoted once per ISO week; a held lock exits
2). Retention drill: 21 daily + 11 weekly entries → pruned to 14 daily + 8 weekly, every deletion logged;
names that do not match the backup timestamp pattern are left alone.

### 7.2 Verify

```text
PASS manifest.json schema (schema_version/artifacts/dsh.version)
PASS sha256sum -c SHA256SUMS
PASS gzip integrity: dsh-personal-<ts>.tar.gz
PASS tarball contains profiles / cordis.patch.yml / .credentials.yaml / workspace / storages / sessions
PASS .credentials.yaml is -rw------- in the tarball
PASS no secret-shaped strings in manifest.json
INFO hindsight: bank dsh-personal not created yet (…) — fail-soft        # or PASS when exported
VERIFY: PASS — <dir>
```

Negative test: one tampered byte in the tarball → `FAIL sha256sum -c`, `FAIL gzip`, drill aborts before
restoring (exit 1). A manifest whose bank is not `dsh-personal` fails verification.

### 7.3 Restore drill

Against the fake-200 backup (`exported`), `--require-hindsight` → exit 0:

```text
PASS  … profile restored … .credentials.yaml restored 0600 … sessions restored — 2 files (2 in manifest)
PASS  storages restored — 2 files (2 in manifest)
PASS  workspace restored — 0 files (matches manifest)
PASS  hindsight bank is dsh-personal (never josh)
PASS  hindsight bank export present + sha256 — bank dsh-personal, 48 bytes
PASS  drill instance serves HTTP — HTTP 401 on http://127.0.0.1:7009/ in 3771 ms
PASS  authenticated UI serves — HTTP 200 via launch token, 40402 bytes of index
PASS  drill instance stopped — port 7009 is free …
RESTORE DRILL PASS
timings : extract=5 ms  boot=3771 ms  total=4179 ms
checks  : 20 passed, 0 warned, 0 failed
```

Against the `bank_missing` backup: default run → `RESTORE DRILL PASS` (`19 passed, 1 warned`, the WARN is
the absent bank export with the "created in the next host block" explanation); `--require-hindsight` →
`RESTORE DRILL FAIL` (`19 passed, 0 warned, 1 failed`, exit 1) — this is the gate to require after the bank
exists. Post-conditions: live `:7002` `HTTP 401`, 0 listeners on `:7009`, 0 scratch leftovers.

Safety refusals (all exit 2, before anything is written): `--port 7002` (live) and `--port 7000` (GUI), an
already-occupied port, and a non-empty `--scratch-home`.

## 8. Rollback

- These artifacts are additive repo files; rollback is `rm` them (or `git checkout` once the repo is
  versioned): `scripts/backup/dsh-backup.sh`, `scripts/backup/dsh-restore-drill.sh`,
  `research/m0-backup-restore.md`.
- Backup artifacts: keep them; to remove, delete `~/backups/dsh-personal` (human decision — it is the only
  copy of that data) or raise `DAILY_KEEP`/`WEEKLY_KEEP` and re-run, or run with `--no-prune`.
- Hindsight export kill switch (no code change): `HINDSIGHT_EXPORT=0`, e.g.
  `HINDSIGHT_EXPORT=0 ./scripts/backup/dsh-backup.sh` — back up the DSH home with no Hindsight request.
- Drill: no persistent state by design. `--keep` leaves a scratch home (contains a 0600 copy of
  `.credentials.yaml` — treat as sensitive and delete it); otherwise the trap removes the scratch and kills
  only its own PID. If a run is interrupted, the trap still cleans up; if a stray drill process survived,
  `kill <pid recorded in the drill log>` — the drill never touches `:7002`.
- A real restore: see §5 (keep the pre-restore home and swap back).

## 9. Open risks

1. **Backups are plaintext and contain credentials.** 0700/0600 protects against other users, not root or a
   compromised `josh` process (which D13 accepts anyway). Off-host replication and encryption at rest are
   not implemented; a stolen backup directory exposes `~/.dsh-personal/.credentials.yaml` plus every session.
2. **Hindsight bank is not in the backup yet.** The `dsh-personal` bank does not exist until the next M0 host
   block; until then every backup records `bank_missing` (or `unavailable` if `:9177` is down). A restored
   host would boot with sessions/storages but no long-term memory, so the M0 gate "restore tested" is only
   partially covered until the bank exists, is exported in a backup, and the import path is implemented.
3. **Hindsight import is untested**: no restore path from `hindsight/dsh-personal-export.*` into a recovered
   `dsh-personal` bank has been implemented or exercised. First post-bank task is implement it, import into a
   scratch instance/bank, and prove recall.
4. **Restore on a different machine** is not exercised: profile `node_modules` uses a symlink into the build
   repo, so a foreign host needs the repo (or `dsh plugin --profile personal install`) before boot; the
   drill only re-links on this host.
5. The drill **boots the real profile**, so it performs the profile's normal outbound calls (e.g. model
   listing) exactly as the live service does; telemetry exporters are disabled via
   `DSH_TELEMETRY_MODE=DISABLED`/`DSH_TELEMETRY_DISABLED=1`, but the drill is not network-isolated (no
   `nft`/`IPAddressAllow` change is made by these scripts).
6. The drill proves the UI serves and (when exported) that the bank export artifact is present and intact —
   not that a restored session can be resumed end-to-end or that recalled memory is correct.
7. Retention prunes with `rm -rf`, scoped by name pattern + path prefix; a human pointing `BACKUP_ROOT` at a
   directory containing same-named directories could lose them. `--no-prune` exists; review before first
   run on a new root.
8. `DSH 0.2.2-rc.1` is a developer preview: a backup restored into a later DSH may need session/format
   migrations, and old backups may not boot a future major version. Keep the DSH version recorded in the
   manifest (`dsh.version`) and pin the restore binary to it.
9. Scripts assume GNU coreutils/bash ≥ 4 and Linux `ss`/`flock`/`tar --numeric-owner` (true on Ubuntu
   24.04). Not ported to macOS/BSD.
10. `shellcheck` is not installed on this host, so lint coverage is `bash -n` + manual review only; run
    `shellcheck scripts/backup/*.sh` when available and fix anything it reports.
11. Backup logs are kept 90 days in `$BACKUP_ROOT/logs` (0600) and are redacted by check, not by warranty:
    if a future message ever embeds a token of an unrecognised shape, the checker may miss it.
12. `git_head` is `null` because the build repo has no `.git`; the manifest cannot pin the exact script
    revision it ran from. Version the repo (or add a content hash) to close this.
13. The shared `:9177` instance is Hermes's: we only ever call the bank-scoped REST export for
    `dsh-personal`, but that instance's availability/latency/upgrade cadence is Hermes's, not ours. A Hermes
    upgrade or DB migration can break export/import between M0 and M1.

## 10. What still needs the human

1. **Create bank `dsh-personal` on the shared `:9177` instance** in the next M0 host block (never bank
   `josh`). Then re-run `./scripts/backup/dsh-backup.sh` (expect `hindsight.status: "exported"`) and
   `./scripts/backup/dsh-restore-drill.sh --require-hindsight` (expect 0 warnings, 0 failures) — that is the
   memory half of the restore gate.
2. **Run the real backup** on the host into the default root and paste the evidence into the build log:
   `cd ~/projects/DSH-playground && ./scripts/backup/dsh-backup.sh` (agent cannot write `~/backups`).
3. **Implement/test Hindsight import** from the export artifact into a recovered `dsh-personal` bank, and add
   a recall check to the drill (M0 open item #3 above).
4. **Decide/approve scheduling** (host change): a `systemd --user` timer or cron entry for daily backups and
   a weekly drill, e.g. `17 3 * * *` backup + `17 4 * * 0` drill, logging to journald (not a world-readable
   file). Scripts are idempotent and lock-guarded, so overlap is safe; add `--require-hindsight` to the
   drill only after the bank exists.
5. **Decide off-host copy + encryption** (the largest residual risk): e.g. `restic`/`age`/`gpg` to the NAS,
   with the key not stored next to `~/.dsh-personal`. Until then the backup is single-host, plaintext.
6. **After the identity decision** (D13 keeps the service on `josh` for now): if a dedicated user/container
   is ever adopted, re-run backup+drill as that user and re-record `owner_uid`; a real restore needs root
   only to `chown -R` the restored home.
7. **Version the build repo** (`git init`/first commit) so `manifest.json.repo.git_head` is populated, then
   re-run a backup.
8. **Rotate the recon-exposed credentials** when D4 is revisited; backups made before rotation keep the old
   values, so take a fresh backup after rotation and prune/retire old ones deliberately.
9. **Review the retained-scratch caveat** before using `--keep` on a production drill: it leaves a 0600 copy
   of the credential file and a redacted boot log.
10. **Install `shellcheck`** (apt) and run it on both scripts; `shellcheck` was unavailable in this block.

## 11. Decisions and assumptions recorded here

- **D13 final (human decision):** M0 uses the shared Hindsight instance `http://127.0.0.1:9177`, bank
  `dsh-personal` only; the second `:9178` instance is dropped. The bank is created in the next M0 host block.
- **Hard Hindsight safety guards, no override flag**: only bank `dsh-personal` is exportable; bank
  `josh`/`hermes-bank-3*` are refused before any request; HTTP(S) REST only — no `psql`/`pg_dump`, no embedded
  Postgres contact, no `~/.hermes` writes.
- **Kill switch instead of opt-in**: `HINDSIGHT_EXPORT=0` disables Hindsight export entirely (no request);
  the previous `HINDSIGHT_ALLOW_SHARED_INSTANCE` gate is gone because D13 makes the shared instance default.
- **Fail-soft bank coverage**: `bank_missing` (404, bank not created yet), `unavailable` (API down), and
  `disabled` are all non-fatal with clear messages; no retry loop, no DB fallback.
- **Drill gate**: the drill verifies profile/workspace/sessions/storages counts against the manifest and the
  Hindsight bank export (bank name + artifact sha256); a missing export is a WARN by default and a FAIL with
  `--require-hindsight`, which is the post-bank gate.
- **Ambient `DSH_HOME` is not trusted**: the scripts default to `~/.dsh-personal` and ignore an inherited
  `DSH_HOME=~/.dsh` (DSH session home), printing a note; `DSH_PERSONAL_HOME` is the explicit override.
- **Restore drill boots the real profile on `:7009`**, accepts `HTTP 401` on `/` as "serving" (the auth fence
  is the unit's expected unauthenticated answer, same as the live `:7002`), and additionally proves the
  authenticated UI with the launch token.
- **The drill rebases paths and re-links symlinks** in the scratch copy; it never edits the live home or the
  backup. This is what makes "restore into a different home" work on this host.
- **No host changes by the agent**: only temp processes on `:7009` and temp files under `/tmp`; test roots
  removed. Live `:7002` was probed read-only for the post-condition only.
- **Test isolation**: Hindsight paths were tested with fake local responders on 9917/9918/9919, not the real
  `:9177`; the first real run will report `bank_missing` until the bank is created.

## Applied — first real backup + drill (2026-11-10 16:09 AEST)

- `scripts/backup/dsh-backup.sh` → `/home/josh/backups/dsh-personal/daily/20261110T060955Z`
  (tarball 22,849 B, sha256 `cc436098…eb6f5c93`; `Hindsight export: OK` → `hindsight/dsh-personal-export.json`,
  66 B; secret check PASS with 4 credential values compared but never printed; weekly promoted).
- `scripts/backup/dsh-restore-drill.sh --backup … --require-hindsight` → **PASS, 20/20 checks, 0 warned,
  0 failed** (extract 5 ms, boot 3,749 ms, total 4,148 ms): profile/patch/credentials 0600, sessions 2/2,
  storages 2/2, workspace matches manifest, bank `dsh-personal` export sha256 verified, scratch `:7009`
  401 then authenticated 200, process proven on 7009 not 7002, clean teardown, no launch token retained.
- Live `:7002` untouched throughout (401 after). Backup root `/home/josh/backups/dsh-personal` is plaintext
  and contains `.credentials.yaml` — **off-host copy + encryption-at-rest remain a human decision**.
- Remaining open item: bank **import/recall** on restore (export is covered; import is designed but not yet
  exercised against a non-empty bank).
