# M0 Hindsight bank — `dsh-personal` on the shared instance (D13)

> **Document status: HISTORICAL PRE-APPLY SNAPSHOT (2026-11-10).** The M0 block was applied and verified later the same day; see [build-progress.md](build-progress.md) and [AGENTS.md](../AGENTS.md) for the current state. Do not read a "not applied" line below as current.

State at writing (pre-apply): **prepared, not applied** — creating a bank is a host-data change and needs the human's go-ahead.
Owner: Lead. Related: [`m0-baseline-recon.md`](m0-baseline-recon.md) §3 ·
[`personal-agent-security.md`](personal-agent-security.md) §8 (D13) · [`build-progress.md`](build-progress.md).

## 1. What exists

- Hindsight 0.10.3, already running as `josh` on `http://127.0.0.1:9177` (REST + `/mcp`), backed by the
  **Hermes-managed** embedded Postgres `~/.pg0/instances/hindsight-embed-hermes`.
- Banks today: `josh` (58,310 facts), `hermes-bank-3` (29), `hermes-bank-2` (66). **No `dsh-personal` bank.**
- The personal agent's future memory plugin will be configured with `bankId: dsh-personal`; never `josh`.

## 2. Decision (D13)

A second Hindsight instance + Postgres was evaluated and **dropped**. The assistant uses the shared `:9177`
instance with its **own bank**. Isolation is therefore **policy-level** (bank id + plugin config + audit
logs), not process/DB-level. This is recorded as an accepted residual risk: anything running as `josh` can
still reach the Hermes banks at the API/DB level; the compensating controls are explicit config, the
`dsh-personal`-only rule, the `josh`-bank refusal guards in our scripts, and re-verification on every plugin
upgrade.

## 3. Apply (human — writes one bank to the shared instance)

```sh
cd /home/josh/projects/DSH-playground
scripts/hindsight/create-dsh-bank.sh --dry-run     # shows the PUT, changes nothing
scripts/hindsight/create-dsh-bank.sh --verify-export
```

The script:

1. refuses `josh`/`hermes-bank-3`/`hermes-bank-2`/`hermes`/`default` bank ids and any id containing `/`;
2. lists existing banks (read-only) and creates `dsh-personal` only if absent via
   `PUT /v1/default/banks/dsh-personal`;
3. reads back `/v1/default/banks/dsh-personal/stats` (expect 0 facts) and prints the bank inventory
   (ids + fact counts only — no content);
4. with `--verify-export`, probes `GET /v1/default/banks/dsh-personal/export` (the endpoint the backup
   script uses) and reports HTTP code/size/sha256.

No Hermes bank content is read, no Postgres access, no writes outside the new bank.

## 4. Verify

```sh
curl -s http://127.0.0.1:9177/v1/default/banks | python3 -m json.tool | grep -E 'bank_id|fact_count'
curl -s http://127.0.0.1:9177/v1/default/banks/dsh-personal/stats | python3 -m json.tool | head
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9177/v1/default/banks/dsh-personal/export   # 200
```

Expected: four banks; `dsh-personal` with 0 facts; `josh`/`hermes-bank-3*` untouched (same fact counts).

## 5. Rollback

```sh
# Only safe while the bank is empty (M0). Removes the bank and its (empty) data:
curl -X DELETE http://127.0.0.1:9177/v1/default/banks/dsh-personal
```

Once the agent stores memories, rollback means backup-first then restore the bank export — never a blind
DELETE. Record both paths in the ledger when M1 starts writing.

## 6. M0/M1 acceptance notes

- M0 (this block): bank exists, empty, export works, "no Hermes content touched" evidence recorded.
- M1: the Hindsight plugin config must pin `bankId: dsh-personal`, `serverMode: self-hosted`,
  `apiUrl: http://127.0.0.1:9177`; verify with a write/read round-trip, audit logs (`/audit-logs` filtered to
  bank `dsh-personal`), and a check that a `josh`-bank recall never appears in personal sessions.
- Backup: bank export is part of `scripts/backup/dsh-backup.sh` (fail-soft until the bank exists).
- The Hermes watchdog timer (`hindsight-hermes-watchdog.timer`, every 5 min) keeps the shared instance
  healthy; we do not modify it.

## 7. Open risks

- Shared instance: a bug in the future plugin or a wrong `bankId` could read Hermes memories. Mitigation is
  config review + the guard here + audit-log checks; not an OS boundary.
- The instance is unauthenticated on loopback (as Hermes configured it); any local process can call it.
- Bank export size grows with memories; the backup script must keep the export bounded/retained.

## 8. Applied — result (2026-11-10 16:09 AEST)

- `scripts/hindsight/create-dsh-bank.sh --verify-export` created bank **`dsh-personal`** on
  `http://127.0.0.1:9177`; `/stats` shows 0 nodes / 0 documents / 0 observations; export probe
  `GET /v1/default/banks/dsh-personal/export` → **HTTP 200, 66 bytes**.
- Bank inventory after: `dsh-personal 0`, `josh 58310`, `hermes-bank-3 29`, `hermes-bank-2 66` — the Hermes banks are
  **unchanged** (same fact counts as recon), and no Hermes content was read.
- First backup includes `hindsight/dsh-personal-export.json` (`status: exported`) and the restore drill
  passes with `--require-hindsight` (20/20 checks).
- Remaining before M1: the Hindsight plugin config must pin `bankId: dsh-personal`; verify a write/read
  round-trip and audit logs then; bank import/recall on restore is still an M0 open item (export is covered,
  import is designed but not exercised against a non-empty bank).
