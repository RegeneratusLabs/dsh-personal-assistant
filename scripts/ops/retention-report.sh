#!/usr/bin/env bash
# retention-report.sh — read-only inventory of everything the personal agent retains.
#
# Answers "what data do we keep, how big is it, how old is it, and what prunes it" without
# writing anything (the *policy* lives in research/m2-retention-policy.md).
#
# Usage: scripts/ops/retention-report.sh [--dsh-home DIR] [--json]
# Exit: 0 ok, 2 usage/not found.
set -euo pipefail

DSH_HOME="${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}"
JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dsh-home) DSH_HOME="${2:?}"; shift 2 ;;
    --json) JSON=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$DSH_HOME" ]]; then echo "ERROR: no DSH home at $DSH_HOME" >&2; exit 2; fi

size_of() { [[ -e "$1" ]] && du -sb "$1" 2>/dev/null | cut -f1 || echo 0; }
count_files() { [[ -d "$1" ]] && find "$1" -type f 2>/dev/null | wc -l | tr -d ' ' || echo 0; }
age_days() { [[ -e "$1" ]] && echo $(( ( $(date +%s) - $(stat -c %Y "$1") ) / 86400 )) || echo -1; }

sessions_dir="$DSH_HOME/sessions"
backup_root="$HOME/backups/dsh-personal"
telemetry="$DSH_HOME/telemetry"

sessions_files=$(count_files "$sessions_dir")
sessions_bytes=$(size_of "$sessions_dir")
oldest_session="$(find "$sessions_dir" -name 'session.v4.jsonl.zstd' -printf '%T@ %p\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-)"
oldest_age=-1; [[ -n "$oldest_session" ]] && oldest_age=$(age_days "$oldest_session")
newest_backup="$(find "$backup_root" -name manifest.json -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
backup_age=-1; [[ -n "$newest_backup" ]] && backup_age=$(age_days "$newest_backup")
daily_count=$(find "$backup_root/daily" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
weekly_count=$(find "$backup_root/weekly" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
backup_bytes=$(size_of "$backup_root")
telemetry_files=$(count_files "$telemetry")
telemetry_bytes=$(size_of "$telemetry")
storages_bytes=$(size_of "$DSH_HOME/storages")
logs_bytes=$(size_of "$HOME/dsh/logs")
journal="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[GM]' | head -1 || echo '?')"
bank_stats="$(curl -fsS -m 5 http://127.0.0.1:9177/v1/default/banks/dsh-personal/stats 2>/dev/null || echo '{}')"
bank_summary="$(printf '%s' "$bank_stats" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("unreachable"); raise SystemExit
print("docs={} nodes={} obs={}".format(d.get("total_documents"),d.get("total_nodes"),d.get("total_observations")))' 2>/dev/null || echo unreachable)"

if [[ "$JSON" -eq 1 ]]; then
  printf '{"sessions":{"files":%s,"bytes":%s,"oldest_age_days":%s},"backups":{"daily":%s,"weekly":%s,"bytes":%s,"newest_age_days":%s},"telemetry":{"files":%s,"bytes":%s},"storages_bytes":%s,"logs_bytes":%s,"journal":"%s","hindsight":"%s"}\n' \
    "$sessions_files" "$sessions_bytes" "$oldest_age" "$daily_count" "$weekly_count" "$backup_bytes" "$backup_age" \
    "$telemetry_files" "$telemetry_bytes" "$storages_bytes" "$logs_bytes" "$journal" "$bank_summary"
  exit 0
fi

printf '%-22s %-12s %s\n' "CLASS" "SIZE" "DETAIL"
printf '%-22s %-12s %s\n' "DSH sessions" "$(numfmt --to=iec "$sessions_bytes" 2>/dev/null || echo "${sessions_bytes}B")" "${sessions_files} file(s); oldest ${oldest_age}d"
printf '%-22s %-12s %s\n' "DSH storages" "$(numfmt --to=iec "$storages_bytes" 2>/dev/null || echo "${storages_bytes}B")" "session projection cache + search index"
printf '%-22s %-12s %s\n' "Backups" "$(numfmt --to=iec "$backup_bytes" 2>/dev/null || echo "${backup_bytes}B")" "${daily_count} daily / ${weekly_count} weekly; newest ${backup_age}d old"
printf '%-22s %-12s %s\n' "Telemetry" "$(numfmt --to=iec "$telemetry_bytes" 2>/dev/null || echo "${telemetry_bytes}B")" "${telemetry_files} file(s): digest, curate, cost"
printf '%-22s %-12s %s\n' "Service logs" "$(numfmt --to=iec "$logs_bytes" 2>/dev/null || echo "${logs_bytes}B")" "~/dsh/logs (0600)"
printf '%-22s %-12s %s\n' "systemd journal" "$journal" "capped 2G / 30d"
printf '%-22s %-12s %s\n' "Hindsight bank" "-" "$bank_summary"
echo
echo "Policy + pruning: research/m2-retention-policy.md"
