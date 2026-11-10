#!/usr/bin/env bash
# token-cost.sh — best-effort local token/usage meter for the personal agent (M0/D13).
#
# Reads the rebuildable session projection cache ($DSH_HOME/storages/session_projcache/sessions/*.json),
# sums token totals per session, attributes each session to the local date of its last write, and emits
# the cost-file contract consumed by check-alerts.sh:
#   {schema_version:1, unit:"tokens", entries:[{date,value},…]}
# It also keeps a small rolling history so a spike baseline exists over time.
#
# Local only, no network, no model calls, no message bodies. DSH has no price table and the personal
# route is a flat-rate subscription, so token counts are the cost proxy (a USD file can be fed later).
#
# Usage: scripts/telemetry/token-cost.sh [--dsh-home DIR] [--out FILE] [--history FILE] [--quiet]
# Exit: 0 written, 2 usage, 1 cannot write.
set -euo pipefail

# Deliberately ignore an ambient DSH_HOME (e.g. the coding home ~/.dsh); use the
# personal home by default, DSH_PERSONAL_HOME to override.
DSH_HOME="${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}"
OUT=""
HISTORY=""
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home) DSH_HOME="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --history) HISTORY="${2:?}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

OUT="${OUT:-$DSH_HOME/telemetry/cost-today.json}"
HISTORY="${HISTORY:-$DSH_HOME/telemetry/token-usage-history.json}"
CACHE_DIR="$DSH_HOME/storages/session_projcache/sessions"
mkdir -p "$(dirname "$OUT")"
chmod 700 "$(dirname "$OUT")" 2>/dev/null || true

python3 - "$CACHE_DIR" "$OUT" "$HISTORY" <<'PY'
import glob
import datetime
import json
import os
import sys

cache_dir, out_path, history_path = sys.argv[1], sys.argv[2], sys.argv[3]

# --- read the projection cache (best effort: skip unreadable/partial records) ---
sessions = []
for path in glob.glob(os.path.join(cache_dir, "*.json")):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            record = json.load(fh).get("record", {})
        usage = record.get("rows", {}).get("tokenUsage", {}).get("val", {}).get("totals", {})
        if not isinstance(usage, dict):
            continue
        tokens = sum(int(usage.get(k) or 0) for k in
                     ("uncachedInputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"))
        if tokens <= 0:
            continue
        day = datetime.datetime.fromtimestamp(os.path.getmtime(path)).astimezone().date().isoformat()
        sessions.append((day, tokens))
    except Exception:
        continue

today = datetime.date.today().isoformat()
today_tokens = sum(t for d, t in sessions if d == today)
session_count = sum(1 for d, _ in sessions if d == today)

# --- rolling history: upsert today, keep the last 30 days ---
history = {}
try:
    with open(history_path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    for entry in raw.get("entries", []):
        if isinstance(entry, dict) and isinstance(entry.get("date"), str):
            history[entry["date"]] = int(entry.get("value") or 0)
except Exception:
    history = {}
history[today] = today_tokens

entries = [{"date": d, "value": v} for d, v in sorted(history.items())][-30:]
payload = {"schema_version": 1, "unit": "tokens", "entries": entries}

os.makedirs(os.path.dirname(history_path), exist_ok=True)
for path, data in ((history_path, {"schema_version": 1, "unit": "tokens", "entries": entries}),
                   (out_path, payload)):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
PY

if [[ "$QUIET" -eq 0 ]]; then
  python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("cost file: %s (unit=%s, %d day(s))" % (sys.argv[1], d["unit"], len(d["entries"])))
for e in d["entries"][-3:]:
    print("  %s  %s" % (e["date"], e["value"]))
PY
fi
