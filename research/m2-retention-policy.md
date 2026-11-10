# M2 — memory hygiene + retention policy (2026-11-11)

M2's first slice: keep long-term memory from drifting and make "what do we keep, for how long, and how is it
removed" an explicit, testable contract. Two pieces:

1. [`scripts/memory/curate.sh`](../scripts/memory/curate.sh) — the daily maintenance pass DSH does not
   schedule (consolidation + mental-model refresh + a counts-only report).
2. [`research/m2-retention-policy.md`](m2-retention-policy.md) (this file) +
   [`scripts/ops/retention-report.sh`](../scripts/ops/retention-report.sh) — the retention inventory and
   policy, plus the erasure contract.

## 1. Curator

| Item | Value |
|---|---|
| Schedule | `dsh-memory-curate.timer` (user unit), daily **07:15** local, `Persistent=true`, randomised ≤5 min |
| What it does | snapshot bank stats + 7-day Hindsight LLM usage → refresh every mental model (none yet) → `POST /consolidate` (all unconsolidated memories) → bounded wait (default 60 s, timer passes 120 s) → snapshot after |
| Output | `~/.dsh-personal/telemetry/curate-YYYY-MM-DD.json` (0600): counts, timestamps, mental-model refresh count, consolidation wait, `llm_usage_7d` — **no memory text, no prompts** |
| Safety | bank locked to `dsh-personal` (refuses Hermes banks), loopback only, no cloud, fail-soft polling, idempotent (nothing pending = no-op) |
| Manual run | `scripts/memory/curate.sh --dry-run` / `scripts/memory/curate.sh --wait-seconds 30` |

First observed usage: Hindsight's own retain/reflect work cost **67 requests / 335,897 tokens over 7 days**
(surfaced in the report; it is metered separately from the DSH token meter).

## 2. Retention policy

| Data class | Location | Keep | Pruned by | Notes |
|---|---|---|---|---|
| DSH sessions | `$DSH_HOME/sessions/` | **indefinite for now** | nothing yet (monitored) | 16 files / 208 KB today; the session-search index is derived and rebuildable |
| DSH storages | `$DSH_HOME/storages/` | current | rebuildable caches | projection cache + `session-search.db` (safe to delete, rebuilds) |
| Backups | `~/backups/dsh-personal/` | **14 daily / 8 weekly** | `dsh-backup.sh` hardlink retention | plaintext + credentials → local only; off-host/encrypted copy still an open decision |
| Telemetry reports | `$DSH_HOME/telemetry/` | **90 days** | digest pre-run prune (`digest-*.md`, `curate-*.json`), cost history 30 entries | all 0600/0700 |
| systemd journal | `/var/log/journal` | **2 GB / 30 days** | journald `50-dsh-retention.conf` | unit logs live here |
| Service logs | `~/dsh/logs/` | current | manual | 0700 dir / 0600 files; the personal unit logs to journald, so this is mostly legacy |
| Hindsight bank | `dsh-personal` on `:9177` | **indefinite** | explicit erasure only (below) | documents/observations/mental models; never the Hermes bank |
| Hindsight daemon logs | `~/.hindsight/profiles/hermes.log*` | Hermes-owned | Hermes | **not ours to touch** |

## 3. Erasure contract (Hindsight 0.10.3 limits)

- **Document delete** — `scripts/memory/forget.sh --doc <id> --yes`: removes the source document; *derived
  observations survive* and can still be recalled (tested: 10 observation hits after deleting the source).
- **Bank clear** — `scripts/memory/forget.sh --clear --yes`: removes all memories/observations for
  `dsh-personal`. **Destructive**; run `scripts/backup/dsh-backup.sh` first.
- **Conversation transcripts** — sessions live in DSH's session store, not in Hindsight; deleting a memory
  fact does not rewrite past transcripts. A "right to be forgotten" request must therefore cover both
  Hindsight (above) and the session store (manual deletion).
- There is no per-memory delete endpoint in this Hindsight version; if a later release adds one, adopt it
  behind `forget.sh` and re-run the M1 acceptance test.

## 4. Inventory (read-only)

`scripts/ops/retention-report.sh` prints the current classes/sizes/ages (and `--json` for the digest).
Snapshot 2026-11-11: sessions 208 KB/16 files · storages 119 KB · backups 9.8 MB (3 daily/1 weekly, newest
0 d) · telemetry 7.6 KB · service logs 110 KB · journal 1.9 GB · bank docs 8/nodes 30/obs 10.

## 5. Open decisions (M2)

1. Off-host + encrypted backups (currently local plaintext containing credentials).
2. Session pruning once the store is large (e.g. archive/remove > 90 d) — needs a safe, backed-up procedure.
3. Whether to raise the fixed Hindsight prompt overhead issue (~3k tokens/request) into a budget alert.
