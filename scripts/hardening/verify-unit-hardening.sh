#!/usr/bin/env bash
# verify-unit-hardening.sh — read-only check of the dsh-personal unit hardening.
#
# Shows, per directive, what systemd actually applied to the running unit (a user unit may
# ignore mount-namespace directives), plus a before/after exposure score.
#
# Usage: scripts/hardening/verify-unit-hardening.sh [--user UNIT] [--json]
# Exit: 0 = every requested directive took effect; 1 = at least one differs; 2 = unit not found.
# Read-only: never restarts, edits, or signals anything.
set -euo pipefail

UNIT="dsh-personal.service"
JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --unit) UNIT="${2:?}"; shift 2 ;;
    --user) UNIT="${2:?}"; shift 2 ;;   # accepted for symmetry; user unit is the default
    --json) JSON=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! systemctl --user cat "$UNIT" >/dev/null 2>&1; then
  echo "unit not found: $UNIT" >&2
  exit 2
fi

# directive|expected-value-substring
EXPECTED=(
  "NoNewPrivileges|yes"
  "UMask|0077"
  "PrivateTmp|yes"
  "ProtectSystem|strict"
  "ProtectHome|read-only"
  "ReadWritePaths|.dsh-personal"
  "RestrictAddressFamilies|AF_INET"
  "RestrictSUIDSGID|yes"
  "LockPersonality|yes"
  "SystemCallFilter|@system-service"
)

rows=()
fail=0
for entry in "${EXPECTED[@]}"; do
  key="${entry%%|*}"
  want="${entry##*|}"
  got="$(systemctl --user show "$UNIT" -p "$key" --value 2>/dev/null || true)"
  got="$(printf '%s' "$got" | tr '\n' ' ' | sed 's/ *$//')"
  if [[ -z "$got" ]] || [[ "$got" == "no" ]] || [[ "$got" == "false" ]]; then
    status="MISSING"
    fail=1
  elif [[ "$key" == "SystemCallFilter" ]]; then
    # systemd reports the EXPANDED syscall list, not the @group name; a long list
    # containing clone/clone3 means @system-service was applied.
    if [[ ${#got} -gt 200 && "$got" == *" clone "* ]]; then status="ok"; else status="DIFF"; fail=1; fi
  elif [[ "$got" == *"$want"* ]]; then
    status="ok"
  else
    status="DIFF"
    fail=1
  fi
  # Truncate the long SystemCallFilter value for display.
  shown="$got"
  if [[ ${#shown} -gt 90 ]]; then shown="${shown:0:87}..."; fi
  rows+=("$status|$key|$shown")
done

# What logging target is the unit actually using?
log_target="$(systemctl --user show "$UNIT" -p StandardOutput --value 2>/dev/null || true)"

echo "Unit: $UNIT"
echo "StandardOutput: ${log_target:-<unset>}  (expect: journal)"
echo
printf '%-8s %-26s %s\n' "STATUS" "DIRECTIVE" "EFFECTIVE VALUE"
for r in "${rows[@]}"; do
  IFS='|' read -r st k v <<<"$r"
  printf '%-8s %-26s %s\n' "$st" "$k" "$v"
done

if [[ "$JSON" -eq 1 ]]; then
  printf '\n{"unit":"%s","standard_output":"%s","failed":%s}\n' "$UNIT" "$log_target" "$fail"
fi

echo
echo "== exposure score =="
if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze security --user "$UNIT" --no-pager 2>/dev/null | tail -3 || echo "(systemd-analyze security --user unavailable)"
fi

echo
if [[ "$fail" -ne 0 ]]; then
  echo "RESULT: at least one directive did not take effect (user-unit limitation or drop-in not loaded)."
  exit 1
fi
echo "RESULT: all requested directives took effect."
