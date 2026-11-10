#!/usr/bin/env bash
# curate.sh — daily memory hygiene for the personal agent's Hindsight bank (M2).
#
# Runs the maintenance pass DSH itself does not schedule:
#   1. snapshot bank stats + 7-day LLM usage before,
#   2. refresh every mental model the bank has (none by default),
#   3. trigger consolidation of unconsolidated memories, then wait (bounded) for it to drain,
#   4. snapshot after and write a 0600 JSON report with COUNTS ONLY (no memory text, no prompts).
#
# Local-only: talks to 127.0.0.1, never the cloud, never the Hermes bank.
#
# Usage: scripts/memory/curate.sh [--bank dsh-personal] [--base-url URL] [--dry-run]
#                                 [--wait-seconds N] [--report-dir DIR] [--quiet]
# Exit: 0 ok (including a bank with nothing to do), 1 request/consolidation failure, 2 guard/usage.
set -euo pipefail

BASE_URL="http://127.0.0.1:9177"
BANK="dsh-personal"
DRY_RUN=0
WAIT_SECONDS=60
REPORT_DIR="${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}/telemetry"
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:?}"; shift 2 ;;
    --bank) BANK="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --wait-seconds) WAIT_SECONDS="${2:?}"; shift 2 ;;
    --report-dir) REPORT_DIR="${2:?}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$BANK" in
  josh|becca|becca-work|hermes) echo "REFUSED: '$BANK' is a Hermes bank; curate only 'dsh-personal'." >&2; exit 2 ;;
esac
[[ "$BANK" == "dsh-personal" ]] || { echo "REFUSED: --bank must be dsh-personal" >&2; exit 2; }

say() { [[ "$QUIET" -eq 1 ]] || echo "$@"; }
get() { curl -fsS -m 10 "$@"; }

stats="$(get "${BASE_URL}/v1/default/banks/${BANK}/stats")" || { echo "ERROR: cannot read bank stats (${BASE_URL})" >&2; exit 1; }
summary_before="$(printf '%s' "$stats" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(json.dumps({k:d.get(k) for k in ("total_nodes","total_documents","total_observations","pending_consolidation","failed_consolidation","last_consolidated_at")}))')"
say "bank ${BANK} before: ${summary_before}"

usage="$(get "${BASE_URL}/v1/default/banks/${BANK}/llm-requests/stats?period=7d" || echo '{}')"
usage_totals="$(printf '%s' "$usage" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("{}"); raise SystemExit
b=d.get("buckets") or []
t=sum(int((x.get("tokens") or {}).get("total") or 0) for x in b)
r=sum(int(x.get("total") or 0) for x in b)
print(json.dumps({"requests":r,"tokens":t,"period":d.get("period")}))' 2>/dev/null || echo '{}')"
say "Hindsight 7d usage: ${usage_totals}"

models="$(get "${BASE_URL}/v1/default/banks/${BANK}/mental-models" || echo '{"items":[]}')"
model_ids="$(printf '%s' "$models" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for it in d.get("items",[]):
    mid=it.get("id") or it.get("mental_model_id")
    if mid: print(mid)' 2>/dev/null || true)"
model_count="$(printf '%s' "$model_ids" | grep -c . || true)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  say "dry-run: would refresh ${model_count} mental model(s) and trigger consolidation; nothing sent"
  exit 0
fi

refreshed=0
while IFS= read -r mid; do
  [[ -z "$mid" ]] && continue
  code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/v1/default/banks/${BANK}/mental-models/${mid}/refresh" || echo 000)"
  [[ "$code" == "200" || "$code" == "202" ]] && refreshed=$((refreshed + 1))
  say "mental model ${mid}: refresh HTTP ${code}"
done <<< "$model_ids"

code="$(curl -sS -m 30 -o /tmp/curate-consolidate.json -w '%{http_code}' -X POST \
  -H 'content-type: application/json' -d '{}' "${BASE_URL}/v1/default/banks/${BANK}/consolidate" || echo 000)"
if [[ "$code" != "200" && "$code" != "202" ]]; then
  echo "ERROR: consolidate failed (HTTP ${code})" >&2; exit 1
fi
say "consolidation triggered (HTTP ${code})"

# Bounded wait: consolidation runs server-side; poll pending_consolidation until it drains.
waited=0
while [[ "$waited" -lt "$WAIT_SECONDS" ]]; do
  stats="$(get "${BASE_URL}/v1/default/banks/${BANK}/stats" || echo '{}')"
  state="$(printf '%s' "$stats" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("unknown"); raise SystemExit
p=d.get("pending_consolidation") or 0
f=d.get("failed_consolidation") or 0
print(f"{p}:{f}")' 2>/dev/null || echo 'unknown')"
  pending="${state%%:*}"
  if [[ "$pending" == "0" || "$pending" == "unknown" ]]; then break; fi
  sleep 5; waited=$((waited + 5))
done

stats_after="$(get "${BASE_URL}/v1/default/banks/${BANK}/stats" || echo '{}')"
mkdir -p "$REPORT_DIR"; chmod 700 "$REPORT_DIR" 2>/dev/null || true
report="$REPORT_DIR/curate-$(date +%Y-%m-%d).json"
python3 - "$report" "$BANK" "$summary_before" "$usage_totals" "$model_count" "$refreshed" "$waited" "$stats_after" <<'PY'
import json,sys
report, bank, before, usage, models, refreshed, waited, after = sys.argv[1:9]
def j(x):
    try: return json.loads(x)
    except Exception: return {}
data = {
  "schema_version": 1,
  "bank": bank,
  "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
  "before": j(before),
  "after": {k: j(after).get(k) for k in ("total_nodes","total_documents","total_observations","pending_consolidation","failed_consolidation","last_consolidated_at")},
  "mental_models": {"total": int(models or 0), "refreshed": int(refreshed or 0)},
  "consolidation_wait_seconds": int(waited or 0),
  "llm_usage_7d": j(usage),
}
open(report,"w").write(json.dumps(data,indent=2)+"\n")
__import__("os").chmod(report, 0o600)
print("report:", report)
print("after:", json.dumps(data["after"]))
PY
[[ "$QUIET" -eq 1 ]] || echo "curate done"
