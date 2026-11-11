#!/usr/bin/env bash
# daily-digest.sh — local, redacted M0 telemetry digest over the sinks we already have.
#
# Runs the read-only alert checker and (when installed) the egress summarizer, then writes a
# short markdown digest to $DIGEST_DIR (default: $DSH_HOME/telemetry) as 0600. No network,
# no model calls, no secrets: token/key-shaped strings are masked before writing.
#
# Usage: scripts/telemetry/daily-digest.sh [--dsh-home DIR] [--out DIR] [--quiet]
# Exit: 0 digest written (even with alerts; alerts are content), 1 cannot write, 2 usage.
set -euo pipefail

# Deliberately ignore an ambient DSH_HOME (e.g. the coding home ~/.dsh); the
# timer passes DSH_HOME explicitly.
DSH_HOME="${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}"
OUT_DIR=""
QUIET=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home) DSH_HOME="${2:?}"; shift 2 ;;
    --out) OUT_DIR="${2:?}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

OUT_DIR="${OUT_DIR:-$DSH_HOME/telemetry}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR" 2>/dev/null || true
# Retention (M2 policy): digest/curate reports are small but not immortal — keep 90 days.
find "$OUT_DIR" -maxdepth 1 -type f \( -name 'digest-*.md' -o -name 'curate-*.json' \) -mtime +90 -delete 2>/dev/null || true

ts="$(date +%Y%m%dT%H%M%S)"
day="$(date +%Y-%m-%d)"
out="$OUT_DIR/digest-$day.md"
tmp="$(mktemp "${OUT_DIR}/.digest.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

mask() { sed -E 's/([?&]token=)[A-Za-z0-9_-]{8,}/\1<redacted>/g; s/(sk-|oc_sk_)[A-Za-z0-9_-]{8,}/\1<redacted>/g'; }

{
  echo "# Local telemetry digest — $day"
  echo
  echo "_Generated $ts by scripts/telemetry/daily-digest.sh (local only, redacted)._"
  echo
  echo "## Alerts (\`check-alerts.sh\`)"
  echo '```'
  if [[ -x "$REPO_ROOT/scripts/telemetry/check-alerts.sh" ]]; then
    cost_args=()
    if [[ -x "$REPO_ROOT/scripts/telemetry/token-cost.sh" ]]; then
      "$REPO_ROOT/scripts/telemetry/token-cost.sh" --quiet 2>/dev/null || true
      [[ -f "$DSH_HOME/telemetry/cost-today.json" ]] && cost_args=(--cost-file "$DSH_HOME/telemetry/cost-today.json")
    fi
    "$REPO_ROOT/scripts/telemetry/check-alerts.sh" "${cost_args[@]}" 2>&1 | mask || true
  else
    echo "check-alerts.sh not found"
  fi
  echo '```'
  echo
  echo "## Egress (observe + alert, D13)"
  echo '```'
  if [[ -x "$REPO_ROOT/scripts/egress/summarize-egress.sh" ]]; then
    "$REPO_ROOT/scripts/egress/summarize-egress.sh" summary 2>&1 | mask || true
  else
    echo "summarize-egress.sh not found"
  fi
  echo '```'
  echo
  echo "## Backups"
  echo '```'
  if [[ -d "$HOME/backups/dsh-personal" ]]; then
    find "$HOME/backups/dsh-personal" -name manifest.json -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort | tail -3
  else
    echo "no backup root at ~/backups/dsh-personal"
  fi
  echo '```'
  echo
  echo "## Hindsight usage (latest curator report)"
  echo '```'
  latest_curate="$(ls -t "$DSH_HOME"/telemetry/curate-*.json 2>/dev/null | head -1)"
  if [[ -n "$latest_curate" ]]; then
    python3 - "$latest_curate" <<'PYC'
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: print("curator report unreadable"); raise SystemExit
u=d.get("llm_usage_7d") or {}
print("7d: requests=%s tokens=%s" % (u.get("requests","?"), u.get("tokens","?")))
mm=d.get("mental_models") or {}
print("mental models: total=%s refreshed=%s, consolidation wait=%ss" % (mm.get("total","?"), mm.get("refreshed","?"), d.get("consolidation_wait_seconds","?")))
print("fixed memory prompt overhead: ~3k tokens/request (Hindsight 0.8.6 block; accepted, M2)")
PYC
  else
    echo "no curator report yet (RUN: scripts/memory/curate.sh)"
  fi
  echo '```'
  echo
  echo "## Hindsight bank \`dsh-personal\`"
  echo '```'
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 5 http://127.0.0.1:9177/v1/default/banks/dsh-personal/stats 2>/dev/null |
      python3 -c 'import json,sys; d=json.load(sys.stdin); print("nodes=%s documents=%s observations=%s pending_ops=%s" % (d.get("total_nodes"), d.get("total_documents"), d.get("total_observations"), d.get("pending_operations")))' 2>/dev/null ||
      echo "Hindsight stats unavailable"
  fi
  echo '```'
} > "$tmp"

# Defensive redaction pass, then atomically publish with 0600.
mask < "$tmp" > "$tmp.masked"
chmod 600 "$tmp.masked"
mv -f "$tmp.masked" "$out"

[[ "$QUIET" -eq 1 ]] || { echo "digest written: $out"; }
