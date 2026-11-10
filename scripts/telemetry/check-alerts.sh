#!/usr/bin/env bash
# =============================================================================
# check-alerts.sh — M0 local telemetry alert checker (READ-ONLY)
# =============================================================================
# Runs the M0 alert catalogue against local sinks and exits non-zero when an
# alert fires. It never writes host state, never starts/stops/restarts a unit,
# never calls sudo, and never prints credential values or message bodies.
# Design + thresholds: research/m0-telemetry.md §7.
# D13 baseline: no egress deny list — egress is OBSERVED (nftables log) and
# alerted by the egress-observe check; a DSH-EGRESS-DENY line is also alerted as
# an optional hardening signal, not as the primary control.
#
# Checks (each can be disabled with its flag):
#   1. unit-state        dsh-personal.service is active (systemctl show, read-only)
#   2. unit-restarts     crash-loop / restart burst in the lookback window
#   3. hindsight-health  GET <HINDSIGHT_URL>/health returns status=healthy
#   4. backup-age        newest backup manifest.json age <= --backup-max-age-hours
#   5. egress-deny       any DSH-EGRESS-DENY kernel log line in the window
#   6. egress-observe    (opt-in) observed destination not in the allowlist
#   7. cost-spike        optional daily cost/usage file vs 7-day median
#
# Exit codes: 0 = no alerts, 1 = at least one alert, 2 = a check could not run
# (configuration/permission error) and no alert was raised.
#
# Safe local test (no host reads): point the script at fixtures —
#   scripts/telemetry/check-alerts.sh --journal-file /tmp/journal.txt \
#     --unit-status-file /tmp/unit.txt --health-json /tmp/health.json \
#     --backup-root /tmp/backups --cost-file /tmp/cost.json --json
# =============================================================================
set -uo pipefail

SCRIPT_NAME=${0##*/}
SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# ── defaults (all overridable by environment, flags win) ─────────────────────
UNIT=${DSH_UNIT:-dsh-personal.service}
SCOPE=${DSH_UNIT_SCOPE:-user}                 # user | system
LOOKBACK_HOURS=${LOOKBACK_HOURS:-24}
RESTART_THRESHOLD=${RESTART_THRESHOLD:-3}     # >= this many restarts in window
FAIL_THRESHOLD=${FAIL_THRESHOLD:-3}           # >= this many failed exits
HINDSIGHT_URL=${HINDSIGHT_URL:-http://127.0.0.1:9177}
HINDSIGHT_BANK=${HINDSIGHT_BANK:-dsh-personal}
HINDSIGHT_EXPECTED=${HINDSIGHT_EXPECTED:-auto} # auto | 0 | 1
HINDSIGHT_AUTH_HEADER=${HINDSIGHT_AUTH_HEADER:-}
BACKUP_ROOT=${BACKUP_ROOT:-${HOME}/backups/dsh-personal}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-48}
BACKUP_REQUIRE_HINDSIGHT=${BACKUP_REQUIRE_HINDSIGHT:-0}
EGRESS_DENY_PREFIX=${EGRESS_DENY_PREFIX:-DSH-EGRESS-DENY}
EGRESS_OBSERVE_PREFIX=${EGRESS_OBSERVE_PREFIX:-DSH-EGRESS}
EGRESS_ALLOW_HOSTS=${EGRESS_ALLOW_HOSTS:-"api.deepseek.com opencode.ai api.telegram.org open.feishu.cn open.larksuite.com api.day.app ntfy.sh"}
EGRESS_ALLOW_IPS_FILE=${EGRESS_ALLOW_IPS_FILE:-}
EGRESS_EXPECTED_FILE=${EGRESS_EXPECTED_FILE:-}
EGRESS_SUMMARY_JSON=${EGRESS_SUMMARY_JSON:-}
# Static ranges: loopback, home LAN, tailnet (recon 2026-11-10).
EGRESS_ALLOW_V4_CIDRS_DEFAULT="127.0.0.0/8 192.168.1.0/24 100.64.0.0/10"
EGRESS_ALLOW_V6_PREFIXES_DEFAULT="::1 fd7a:115c:a1e0:"
EGRESS_ALLOW_V4_CIDRS=${EGRESS_ALLOW_V4_CIDRS:-$EGRESS_ALLOW_V4_CIDRS_DEFAULT}
EGRESS_ALLOW_V6_PREFIXES=${EGRESS_ALLOW_V6_PREFIXES:-$EGRESS_ALLOW_V6_PREFIXES_DEFAULT}
COST_FILE=${COST_FILE:-}
# Default to the local token/cost meter output when present (M0/D13 sink wiring).
PERSONAL_HOME="${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}"
if [[ -z ${COST_FILE} && -f "${PERSONAL_HOME}/telemetry/cost-today.json" ]]; then
  COST_FILE="${PERSONAL_HOME}/telemetry/cost-today.json"
fi
COST_MULTIPLIER=${COST_MULTIPLIER:-3}
COST_FLOOR=${COST_FLOOR:-0}
COST_GAP_DAYS=${COST_GAP_DAYS:-7}

JSON=0
CHECK_UNIT_STATE=1
CHECK_UNIT_RESTARTS=1
CHECK_HINDSIGHT=1
CHECK_BACKUP=1
CHECK_EGRESS_DENY=1
CHECK_EGRESS_OBSERVE=1
CHECK_COST=1
JOURNAL_FILE=''
EGRESS_FILE=''
UNIT_STATUS_FILE=''
HEALTH_JSON_FILE=''

# ── output state ─────────────────────────────────────────────────────────────
declare -a CHECK_IDS=() CHECK_STATUS=() CHECK_TITLE=() CHECK_DETAIL=()
ALERTS=0
WARNINGS=0
ERRORS=0

usage() {
  cat <<'USAGE'
check-alerts.sh — M0 local telemetry alert checker (READ-ONLY)

Usage: check-alerts.sh [options]

Options:
  --json                       emit machine-readable JSON instead of text
  --unit NAME                  systemd unit (default: dsh-personal.service)
  --scope user|system          systemd scope (default: user)
  --lookback-hours N           journal window (default: 24)
  --restart-threshold N        restarts in window that fire an alert (default: 3)
  --fail-threshold N           failed exits in window that fire an alert (default: 3)
  --health-url URL             Hindsight base URL (default: http://127.0.0.1:9177)
  --bank NAME                  Hindsight bank (default: dsh-personal; 'josh' is refused)
  --hindsight-expected auto|0|1  unreachable policy: auto alerts (Hindsight is a
                               baseline sink); 0 skips with a warning (default: auto)
  --backup-root DIR            backup root (default: $HOME/backups/dsh-personal)
  --backup-max-age-hours N     fresh-backup threshold (default: 48)
  --backup-require-hindsight   alert when the newest backup has no Hindsight export
  --cost-file FILE             optional daily cost/usage JSON (contract in m0-telemetry.md §7)
  --cost-multiplier X          spike factor vs 7-day median (default: 3)
  --cost-floor N               absolute floor; a spike must exceed it (default: 0)
  --no-egress-observe          disable the observed-destination allowlist check
                               (on by default; D13 has no deny list, so observation
                               plus this alert is the egress control)
  --egress-allow-ips FILE      expected-destination file: IPs, v4 CIDRs, or hostnames
                               (auto: scripts/egress/expected-destinations.txt if present)
  --egress-summary FILE        egress-baseline summarize-egress output (JSON;
                               auto: artifacts/egress/egress-summary.json if present).
                               Preferred over journal parsing; source order:
                               explicit/artifact JSON -> live
                               `scripts/egress/summarize-egress.sh summary --json`
                               (read-only) -> raw kernel journal -> SKIP.
  --egress-file FILE           read egress log lines from FILE (offline test)
  --journal-file FILE          read unit log lines from FILE (offline test; skips journalctl)
  --unit-status-file FILE      read `systemctl show` output from FILE (offline test)
  --health-json FILE           read the /health JSON from FILE (offline test; skips curl)
  --no-unit-state | --no-unit-restarts | --no-hindsight | --no-backup |
  --no-egress | --no-cost      disable one check group
  -h, --help                   this help

Environment overrides: DSH_UNIT, DSH_UNIT_SCOPE, LOOKBACK_HOURS, RESTART_THRESHOLD,
FAIL_THRESHOLD, HINDSIGHT_URL, HINDSIGHT_BANK, HINDSIGHT_EXPECTED,
HINDSIGHT_AUTH_HEADER, BACKUP_ROOT, BACKUP_MAX_AGE_HOURS, EGRESS_ALLOW_HOSTS,
EGRESS_ALLOW_IPS_FILE, EGRESS_ALLOW_V4_CIDRS, EGRESS_ALLOW_V6_PREFIXES, COST_FILE.

Exit: 0 no alerts · 1 alert(s) fired · 2 a check could not run.
USAGE
}

die() { printf '%s: %s\n' "$SCRIPT_NAME" "$1" >&2; exit 2; }

need_arg() { [[ $# -ge 2 && -n ${2:-} ]] || die "option $1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --json) JSON=1 ;;
    --unit) need_arg "$@"; UNIT=$2; shift ;;
    --scope) need_arg "$@"; SCOPE=$2; shift
      [[ $SCOPE == user || $SCOPE == system ]] || die "--scope must be user or system" ;;
    --lookback-hours) need_arg "$@"; LOOKBACK_HOURS=$2; shift ;;
    --restart-threshold) need_arg "$@"; RESTART_THRESHOLD=$2; shift ;;
    --fail-threshold) need_arg "$@"; FAIL_THRESHOLD=$2; shift ;;
    --health-url) need_arg "$@"; HINDSIGHT_URL=$2; shift ;;
    --bank) need_arg "$@"; HINDSIGHT_BANK=$2; shift ;;
    --hindsight-expected) need_arg "$@"; HINDSIGHT_EXPECTED=$2; shift ;;
    --backup-root) need_arg "$@"; BACKUP_ROOT=$2; shift ;;
    --backup-max-age-hours) need_arg "$@"; BACKUP_MAX_AGE_HOURS=$2; shift ;;
    --backup-require-hindsight) BACKUP_REQUIRE_HINDSIGHT=1 ;;
    --cost-file) need_arg "$@"; COST_FILE=$2; shift ;;
    --cost-multiplier) need_arg "$@"; COST_MULTIPLIER=$2; shift ;;
    --cost-floor) need_arg "$@"; COST_FLOOR=$2; shift ;;
    --egress-observe) CHECK_EGRESS_OBSERVE=1 ;;
    --no-egress-observe) CHECK_EGRESS_OBSERVE=0 ;;
    --egress-allow-ips) need_arg "$@"; EGRESS_ALLOW_IPS_FILE=$2; shift ;;
    --egress-summary) need_arg "$@"; EGRESS_SUMMARY_JSON=$2; shift ;;
    --egress-file) need_arg "$@"; EGRESS_FILE=$2; shift ;;
    --journal-file) need_arg "$@"; JOURNAL_FILE=$2; shift ;;
    --unit-status-file) need_arg "$@"; UNIT_STATUS_FILE=$2; shift ;;
    --health-json) need_arg "$@"; HEALTH_JSON_FILE=$2; shift ;;
    --no-unit-state) CHECK_UNIT_STATE=0 ;;
    --no-unit-restarts) CHECK_UNIT_RESTARTS=0 ;;
    --no-hindsight) CHECK_HINDSIGHT=0 ;;
    --no-backup) CHECK_BACKUP=0 ;;
    --no-egress) CHECK_EGRESS_DENY=0; CHECK_EGRESS_OBSERVE=0 ;;
    --no-cost) CHECK_COST=0 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option '$1' (try --help)" ;;
  esac
  shift
done

for n in LOOKBACK_HOURS RESTART_THRESHOLD FAIL_THRESHOLD BACKUP_MAX_AGE_HOURS COST_MULTIPLIER COST_FLOOR COST_GAP_DAYS; do
  [[ ${!n} =~ ^[0-9]+([.][0-9]+)?$ ]] || die "$n must be a number (got '${!n}')"
done

# ── egress artifact discovery (D13: egress observe+alert is the control) ────
# Prefer the egress-baseline artifacts; degrade to live kernel-journal parsing
# (and then to SKIP) when they are absent. Never fail because they are missing.
REPO_DIR=''
if [[ -n $SELF_DIR ]]; then REPO_DIR=$(cd -- "$SELF_DIR/../.." 2>/dev/null && pwd || true); fi
ARTIFACT_EGRESS_SUMMARY=''
ARTIFACT_EXPECTED_FILE=''
EGRESS_SUMMARIZER=''
if [[ -n $REPO_DIR ]]; then
  ARTIFACT_EGRESS_SUMMARY="$REPO_DIR/artifacts/egress/egress-summary.json"
  ARTIFACT_EXPECTED_FILE="$REPO_DIR/scripts/egress/expected-destinations.txt"
fi
EGRESS_SOURCE='journal'
if [[ -n $REPO_DIR && -x "$REPO_DIR/scripts/egress/summarize-egress.sh" ]]; then
  EGRESS_SUMMARIZER="$REPO_DIR/scripts/egress/summarize-egress.sh"
fi
if [[ -z $EGRESS_SUMMARY_JSON && -n $REPO_DIR ]]; then
  for cand in "$ARTIFACT_EGRESS_SUMMARY" \
              "$REPO_DIR/artifacts/egress/summary.json" \
              "$REPO_DIR/artifacts/egress/latest-summary.json"; do
    [[ -r $cand ]] && { EGRESS_SUMMARY_JSON=$cand; break; }
  done
fi
if [[ -z $EGRESS_ALLOW_IPS_FILE && -n $REPO_DIR ]]; then
  for cand in "$ARTIFACT_EXPECTED_FILE" \
              "$REPO_DIR/scripts/egress/allowlist-ips.txt" \
              "$REPO_DIR/scripts/egress/expected-destinations.txt.sample"; do
    [[ -r $cand ]] && { EGRESS_ALLOW_IPS_FILE=$cand; break; }
  done
fi

# ── result recording ─────────────────────────────────────────────────────────
record() { # id status title detail
  CHECK_IDS+=("$1"); CHECK_STATUS+=("$2"); CHECK_TITLE+=("$3"); CHECK_DETAIL+=("$4")
  case $2 in
    alert) ALERTS=$((ALERTS + 1)) ;;
    warn) WARNINGS=$((WARNINGS + 1)) ;;
    error) ERRORS=$((ERRORS + 1)) ;;
  esac
}

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

join_by() { # sep item...
  local sep=$1 out='' v
  shift
  for v in "$@"; do out=${out:+$out$sep}$v; done
  printf '%s' "$out"
}

# ── time helpers ─────────────────────────────────────────────────────────────
now_epoch() { date +%s; }
iso_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ── journal source ───────────────────────────────────────────────────────────
JOURNAL_UNIT_LINES=''
JOURNAL_KERNEL_LINES=''
JOURNAL_ERROR=''

read_journal() { # kind: unit|kernel
  local kind=$1 out=''
  if [[ -n $JOURNAL_FILE ]]; then
    if [[ -r $JOURNAL_FILE ]]; then out=$(cat -- "$JOURNAL_FILE" 2>/dev/null); else die "journal fixture unreadable: $JOURNAL_FILE"; fi
    printf '%s' "$out"
    return 0
  fi
  if ! command -v journalctl >/dev/null 2>&1; then
    JOURNAL_ERROR='journalctl not installed'
    return 1
  fi
  local -a args=(--no-pager -o cat --since "-${LOOKBACK_HOURS}h")
  if [[ $kind == unit ]]; then
    if [[ $SCOPE == user ]]; then args=(--user "${args[@]}" -u "$UNIT"); else args=("${args[@]}" -u "$UNIT"); fi
  else
    args=(-k "${args[@]}")
  fi
  if out=$(journalctl "${args[@]}" 2>/dev/null); then
    printf '%s' "$out"
    return 0
  fi
  JOURNAL_ERROR="journalctl failed (scope=$SCOPE unit=$UNIT); kernel/user journal may need privileges"
  return 1
}

# ── check 1: unit active state ───────────────────────────────────────────────
unit_show_field() { # FIELD -> value from fixture or systemctl show
  local field=$1 file=$2
  sed -n "s/^${field}=//p" "$file" 2>/dev/null | head -n1
}

check_unit_state() {
  [[ $CHECK_UNIT_STATE == 1 ]] || return 0
  if [[ -n $UNIT_STATUS_FILE ]]; then
    [[ -r $UNIT_STATUS_FILE ]] || { record unit-state error "Unit state" "fixture unreadable: $UNIT_STATUS_FILE"; return 0; }
    local active sub
    active=$(unit_show_field ActiveState "$UNIT_STATUS_FILE")
    sub=$(unit_show_field SubState "$UNIT_STATUS_FILE")
    if [[ $active == active ]]; then
      record unit-state ok "Unit state" "offline fixture: ActiveState=active SubState=${sub:-?}"
    else
      record unit-state alert "Unit state" "offline fixture: ActiveState=${active:-unknown} SubState=${sub:-?}"
    fi
    return 0
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    record unit-state skip "Unit state" "systemctl not available"
    return 0
  fi
  local -a args=(show "$UNIT" -p ActiveState -p SubState -p MainPID)
  [[ $SCOPE == user ]] && args=(--user "${args[@]}")
  local out
  if ! out=$(systemctl "${args[@]}" 2>/dev/null) || [[ -z $out ]]; then
    record unit-state skip "Unit state" "systemctl show produced no data (offline fixture hint: --unit-status-file)"
    return 0
  fi
  local active sub
  active=$(sed -n 's/^ActiveState=//p' <<<"$out" | head -n1)
  sub=$(sed -n 's/^SubState=//p' <<<"$out" | head -n1)
  if [[ $active == active ]]; then
    record unit-state ok "Unit state" "ActiveState=active SubState=${sub:-?} (scope=$SCOPE)"
  else
    record unit-state alert "Unit state" "unit ${UNIT} is ${active:-unknown} (SubState=${sub:-?}); alerts cannot fire while the agent is down"
  fi
}

# ── check 2: restart / crash-loop bursts ─────────────────────────────────────
check_unit_restarts() {
  [[ $CHECK_UNIT_RESTARTS == 1 ]] || return 0
  local lines
  if [[ -n $JOURNAL_FILE ]]; then
    lines=$JOURNAL_UNIT_LINES
  else
    lines=$(read_journal unit) || { record unit-restarts skip "Restart burst" "${JOURNAL_ERROR:-journal unavailable}"; return 0; }
  fi
  if [[ -z $lines ]]; then
    record unit-restarts ok "Restart burst" "no unit journal entries in the last ${LOOKBACK_HOURS}h"
    return 0
  fi
  local restarts=0 failures=0 starts=0 max_counter=0 n
  restarts=$(grep -cE 'Scheduled restart job|restart counter is at' <<<"$lines" 2>/dev/null) || restarts=0
  starts=$(grep -cE "Started ${UNIT//./\\.}" <<<"$lines" 2>/dev/null) || starts=0
  failures=$(grep -cE "Main process exited, code=|Failed with result" <<<"$lines" 2>/dev/null) || failures=0
  while IFS= read -r n; do
    [[ $n =~ ^[0-9]+$ ]] && (( n > max_counter )) && max_counter=$n
  done < <(grep -oE 'restart counter is at [0-9]+' <<<"$lines" 2>/dev/null | grep -oE '[0-9]+$' || true)
  local detail="window=${LOOKBACK_HOURS}h starts=$starts failed-exits=$failures restart-schedules=$restarts max-restart-counter=$max_counter"
  if (( max_counter >= RESTART_THRESHOLD )) || (( restarts >= RESTART_THRESHOLD )) || (( failures >= FAIL_THRESHOLD )); then
    record unit-restarts alert "Restart burst" "$detail (thresholds: restarts>=$RESTART_THRESHOLD failures>=$FAIL_THRESHOLD)"
  elif (( starts > 1 )); then
    record unit-restarts warn "Restart burst" "$detail (multiple starts, below alert threshold)"
  else
    record unit-restarts ok "Restart burst" "$detail"
  fi
}

# ── check 3: Hindsight health ────────────────────────────────────────────────
check_hindsight() {
  [[ $CHECK_HINDSIGHT == 1 ]] || return 0
  # D13: the shared :9177 daemon is the baseline sink, but only the dedicated
  # bank may be used. Never read or write the Hermes bank 'josh'.
  if [[ $HINDSIGHT_BANK == josh ]]; then
    record hindsight-health error "Hindsight health" "bank 'josh' is Hermes-owned and must never be used by DSH (AGENTS.md); refusing to check — set --bank dsh-personal"
    return 0
  fi
  local body='' code=''
  if [[ -n $HEALTH_JSON_FILE ]]; then
    if [[ ! -r $HEALTH_JSON_FILE ]]; then record hindsight-health error "Hindsight health" "health fixture unreadable: $HEALTH_JSON_FILE"; return 0; fi
    body=$(cat -- "$HEALTH_JSON_FILE")
    code='200'
  else
    local -a curl_args=(-sS --max-time 5 -w '%{http_code}' -o /dev/stdout)
    [[ -n $HINDSIGHT_AUTH_HEADER ]] && curl_args+=(-H "$HINDSIGHT_AUTH_HEADER")
    local combined
    if ! combined=$(curl "${curl_args[@]}" "${HINDSIGHT_URL%/}/health" 2>/dev/null); then
      code='000'; body=''
    else
      code=${combined: -3}
      body=${combined%???}
    fi
  fi
  local healthy=0
  grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"' <<<"$body" && healthy=1
  if [[ $code == 200 ]] && (( healthy )); then
    local bank_note=''
    if [[ -n ${HINDSIGHT_BANK} ]]; then bank_note=" (bank target: $HINDSIGHT_BANK; presence not asserted)"; fi
    record hindsight-health ok "Hindsight health" "HTTP 200, status=healthy$bank_note"
    return 0
  fi
  local why
  if [[ $code == 200 ]]; then why="HTTP 200 but body status is not 'healthy'"; else why="unreachable or non-200 (HTTP ${code:-000})"; fi
  case $HINDSIGHT_EXPECTED in
    0) record hindsight-health skip "Hindsight health" "$why and HINDSIGHT_EXPECTED=0; check disabled" ;;
    *) record hindsight-health alert "Hindsight health" "Hindsight at ${HINDSIGHT_URL} ${why}; memory capture/audit is blind. Inspect the daemon (Hermes-owned watchdog: do not modify Hermes paths)" ;;
  esac
}

# ── check 4: backup freshness ────────────────────────────────────────────────
check_backup() {
  [[ $CHECK_BACKUP == 1 ]] || return 0
  local root=$BACKUP_ROOT
  [[ -d $root ]] || { record backup-age alert "Backup freshness" "backup root not found: $root (no backups taken?); M0 restore gate cannot pass"; return 0; }
  local newest
  newest=$(find "$root" -maxdepth 4 -type f -name 'manifest.json' -printf '%T@\t%p\n' 2>/dev/null | sort -n | tail -n1 | cut -f2-) || true
  if [[ -z $newest ]]; then
    record backup-age alert "Backup freshness" "no manifest.json under $root (no completed backup) — run scripts/backup/dsh-backup.sh"
    return 0
  fi
  local mtime now age_h detail extra=''
  mtime=$(stat -c %Y -- "$newest" 2>/dev/null) || mtime=0
  now=$(now_epoch)
  age_h=$(( (now - mtime) / 3600 ))
  detail="newest manifest: ${newest#"$root"/} age=${age_h}h (limit ${BACKUP_MAX_AGE_HOURS}h)"
  if command -v jq >/dev/null 2>&1; then
    local hstatus
    hstatus=$(jq -r '.hindsight.status // "unknown"' -- "$newest" 2>/dev/null) || hstatus='unknown'
    extra="; hindsight=${hstatus}"
  fi
  if (( age_h > BACKUP_MAX_AGE_HOURS )); then
    record backup-age alert "Backup freshness" "$detail$extra — stale beyond ${BACKUP_MAX_AGE_HOURS}h"
  elif [[ $BACKUP_REQUIRE_HINDSIGHT == 1 && -n $extra && $extra != *'hindsight=exported'* ]]; then
    record backup-age alert "Backup freshness" "$detail$extra — Hindsight export required and missing"
  else
    record backup-age ok "Backup freshness" "$detail$extra"
  fi
}

# ── check 5/6: egress deny + observed destinations ───────────────────────────
v4_to_int() { # ip -> sets IPV4_INT; returns 1 if not dotted quad
  local IFS=. a b c d
  read -r a b c d <<<"$1"
  [[ $a =~ ^[0-9]{1,3}$ && $b =~ ^[0-9]{1,3}$ && $c =~ ^[0-9]{1,3}$ && $d =~ ^[0-9]{1,3}$ ]] || return 1
  for n in "$a" "$b" "$c" "$d"; do [[ $n -le 255 ]] || return 1; done
  IPV4_INT=$(( (a << 24) | (b << 16) | (c << 8) | d ))
}

v4_in_cidr() { # ip cidr
  local ip=$1 cidr=$2 net bits mask
  [[ $cidr == */* ]] || return 1
  net=${cidr%/*}; bits=${cidr#*/}
  [[ $bits =~ ^[0-9]{1,2}$ ]] || return 1
  (( bits <= 32 )) || return 1
  v4_to_int "$ip" || return 1
  local ip_int=$IPV4_INT
  v4_to_int "$net" || return 1
  local net_int=$IPV4_INT
  if (( bits == 0 )); then mask=0; else mask=$(( (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF )); fi
  (( (ip_int & mask) == (net_int & mask) ))
}

egress_allow_entry() { # ip
  local ip=$1 c p
  [[ $ip == 127.* || $ip == ::1 || $ip == 'localhost' ]] && return 0
  for c in $EGRESS_ALLOW_V4_CIDRS; do v4_in_cidr "$ip" "$c" && return 0; done
  for p in $EGRESS_ALLOW_V6_PREFIXES; do [[ $ip == "$p"* ]] && return 0; done
  if [[ -n $EGRESS_ALLOW_IPS_FILE && -r $EGRESS_ALLOW_IPS_FILE ]]; then
    while IFS= read -r c; do
      [[ -z $c || $c == \#* ]] && continue
      [[ $ip == "$c" ]] && return 0
      [[ $c == */* ]] && v4_in_cidr "$ip" "$c" && return 0
      # Non-IP expected entries are hostnames: resolve and compare.
      if [[ $c =~ [A-Za-z] && $c != */* ]]; then
        while IFS= read -r r; do [[ $ip == "$r" ]] && return 0; done \
          < <(getent ahosts "$c" 2>/dev/null | awk '{print $1}' | sort -u)
      fi
    done <"$EGRESS_ALLOW_IPS_FILE"
  fi
  # Resolve the allowlisted hostnames and accept exact IP matches.
  local h
  for h in $EGRESS_ALLOW_HOSTS; do
    while IFS= read -r c; do [[ $ip == "$c" ]] && return 0; done < <(getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u)
  done
  return 1
}

egress_lines() {
  if [[ -n $EGRESS_FILE ]]; then
    if [[ ! -r $EGRESS_FILE ]]; then die "egress fixture unreadable: $EGRESS_FILE"; fi
    cat -- "$EGRESS_FILE"
  elif [[ -n $JOURNAL_FILE ]]; then
    cat -- "$JOURNAL_FILE"
  else
    read_journal kernel || return 1
  fi
}

egress_destinations() { # lines prefix -> unique "dst|dport" list
  local lines=$1 prefix=$2
  awk -v p="$prefix" '
    index($0, p) {
      dst=""; dpt="";
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^DST=/) { dst = $i; sub(/^DST=/, "", dst) }
        if ($i ~ /^DPT=/) { dpt = $i; sub(/^DPT=/, "", dpt) }
      }
      if (dst != "") print dst "|" dpt
    }' <<<"$lines" 2>/dev/null | sort -u
}

# Parse the egress block's summarize-egress JSON (schema m0-egress-summary-v1)
# into "dst|port|expected" lines, where expected is true|false|empty. Tolerated
# shapes: {destinations|observed|items:[...]} or a top-level array; per entry
# dst|ip|address|host and port|dpt|dport, optional boolean `expected`.
egress_summary_destinations() { # json_file
  local file=$1
  command -v jq >/dev/null 2>&1 || return 1
  [[ -r $file ]] || return 1
  local out
  out=$(jq -r '
    def arr:
      if type == "array" then .
      else (.destinations // .observed // .items // .destinations_observed // []) end;
    arr[]? |
      [ (.dst // .ip // .address // .host // .destination // ""),
        (.dpt // .port // .dport // ""),
        (if has("expected") then (.expected | tostring) else "" end),
        (if has("cdn") then (.cdn | tostring) else "" end) ] | @tsv' -- "$file" 2>/dev/null) || return 1
  [[ -n $out ]] || return 1
  printf '%s\n' "$out" | while IFS=$'\t' read -r dst port expected cdn; do
    [[ -z $dst ]] && continue
    printf '%s|%s|%s|%s\n' "$dst" "$port" "$expected" "$cdn"
  done
}

egress_summary_status() { # json_file
  command -v jq >/dev/null 2>&1 || return 1
  jq -r '.status // ""' -- "$1" 2>/dev/null
}

# One destination: ip|port|host (any field may be empty)
egress_dest_allowed() { # ip port host
  local ip=$1 port=$2 host=$3 h
  # Hostname destinations: allow when the hostname itself is expected.
  if [[ -n $host ]]; then
    for h in $EGRESS_ALLOW_HOSTS; do [[ $host == "$h" ]] && return 0; done
    [[ -n $EGRESS_ALLOW_IPS_FILE && -r $EGRESS_ALLOW_IPS_FILE ]] && \
      grep -Fxq -- "$host" "$EGRESS_ALLOW_IPS_FILE" 2>/dev/null && return 0
  fi
  if [[ $ip =~ ^[0-9a-fA-F:.]+$ ]]; then
    egress_allow_entry "$ip" && return 0
    return 1
  fi
  # ip field held a hostname instead of an address.
  for h in $EGRESS_ALLOW_HOSTS; do [[ $ip == "$h" ]] && return 0; done
  [[ -n $EGRESS_ALLOW_IPS_FILE && -r $EGRESS_ALLOW_IPS_FILE ]] && \
    grep -Fxq -- "$ip" "$EGRESS_ALLOW_IPS_FILE" 2>/dev/null && return 0
  return 1
}

check_egress() {
  local lines=''
  if [[ $CHECK_EGRESS_DENY == 1 || $CHECK_EGRESS_OBSERVE == 1 ]]; then
    lines=$(egress_lines) || { record egress-deny skip "Egress deny" "${JOURNAL_ERROR:-kernel journal unavailable}"; return 0; }
  fi
  if [[ $CHECK_EGRESS_DENY == 1 ]]; then
    local sum_denied=0
    if command -v jq >/dev/null 2>&1 && [[ -n $EGRESS_SUMMARY_JSON && -r $EGRESS_SUMMARY_JSON ]]; then
      sum_denied=$(jq -r '(.denied // []) | length' -- "$EGRESS_SUMMARY_JSON" 2>/dev/null) || sum_denied=0
      [[ $sum_denied =~ ^[0-9]+$ ]] || sum_denied=0
    fi
    if (( sum_denied > 0 )); then
      local denied_list
      denied_list=$(jq -r '(.denied // []) | map((.dst // "?") + ":" + ((.port // "?")|tostring)) | join(", ")' -- "$EGRESS_SUMMARY_JSON" 2>/dev/null) || denied_list=''
      record egress-deny alert "Egress deny" "$sum_denied denied destination(s) in the egress summary: ${denied_list} — deny rules should not exist under D13; investigate"
    elif [[ -z $lines ]]; then
      record egress-deny skip "Egress deny" "no kernel log lines available (fixture/journal empty); deny detection inactive"
    else
      local -a denied=()
      local pair ip
      while IFS= read -r pair; do
        [[ -z $pair ]] && continue
        ip=${pair%%|*}
        denied+=("${pair/|/:}")
      done < <(egress_destinations "$lines" "$EGRESS_DENY_PREFIX")
      if (( ${#denied[@]} > 0 )); then
        record egress-deny alert "Egress deny" "${#denied[@]} denied destination(s): $(join_by ", " "${denied[@]}") — attempt to reach a non-allowlisted endpoint"
      else
        record egress-deny ok "Egress deny" "no ${EGRESS_DENY_PREFIX} lines in the last ${LOOKBACK_HOURS}h"
      fi
    fi
  fi
  if [[ $CHECK_EGRESS_OBSERVE == 1 ]]; then
    local -a unexpected=() review=()
    local inspected=0 pair ip port expected cdn
    local source='' notes='' summary_lines='' summary_ok=0 summary_err='' summary_status=''
    local offline=0
    [[ -n $EGRESS_FILE || -n $JOURNAL_FILE ]] && offline=1

    # 1) Preferred: the egress block's summary JSON (explicit or artifact).
    if [[ -n $EGRESS_SUMMARY_JSON ]]; then
      if [[ ! -r $EGRESS_SUMMARY_JSON ]]; then
        summary_err="configured egress summary unreadable: $EGRESS_SUMMARY_JSON"
      elif summary_lines=$(egress_summary_destinations "$EGRESS_SUMMARY_JSON"); then
        summary_ok=1
        summary_status=$(egress_summary_status "$EGRESS_SUMMARY_JSON")
        source="summary:${EGRESS_SUMMARY_JSON##*/}"
      else
        summary_err="egress summary JSON not parseable (schema m0-egress-summary-v1) or empty: $EGRESS_SUMMARY_JSON"
      fi
    fi

    # 2) No artifact: ask the egress block's summarizer directly (read-only:
    #    it only reads the kernel journal, DNS and optional nft counters).
    if (( ! summary_ok )) && [[ -z $EGRESS_SUMMARY_JSON && $offline == 0 && -n $EGRESS_SUMMARIZER ]]; then
      local live_json=''
      live_json=$(timeout 45 "$EGRESS_SUMMARIZER" summary --json 2>/dev/null) || true
      if [[ -n $live_json ]] && command -v jq >/dev/null 2>&1 && jq -e . >/dev/null 2>&1 <<<"$live_json"; then
        local tmp_lines
        tmp_lines=$(printf '%s' "$live_json" | jq -r '
          def arr:
            if type == "array" then .
            else (.destinations // .observed // .items // []) end;
          arr[]? |
            [ (.dst // .ip // .address // .host // .destination // ""),
              (.dpt // .port // .dport // ""),
              (if has("expected") then (.expected | tostring) else "" end),
              (if has("cdn") then (.cdn | tostring) else "" end) ] | @tsv' 2>/dev/null) || true
        if [[ -n $tmp_lines ]]; then
          summary_lines=$(printf '%s\n' "$tmp_lines" | while IFS=$'\t' read -r ip port expected cdn; do
            [[ -z $ip ]] && continue
            printf '%s|%s|%s|%s\n' "$ip" "$port" "$expected" "$cdn"
          done)
        fi
        summary_ok=1
        summary_status=$(jq -r '.status // ""' <<<"$live_json" 2>/dev/null)
        source='summarize-egress.sh'
      else
        summary_err="${summary_err:-live summarize-egress.sh produced no parseable JSON (is observation installed?)}"
      fi
    fi

    if (( summary_ok )); then
      while IFS='|' read -r ip port expected cdn; do
        [[ -z $ip ]] && continue
        inspected=$((inspected + 1))
        case $expected in
          true|1) continue ;;                                # summarizer's allowlist says expected
          false|0)
            # CDN edge rotation (owner PTR + cdn:true) is "review", not a hard alert.
            if [[ $cdn == true || $cdn == 1 ]]; then review+=("$ip${port:+:$port}"); else unexpected+=("$ip${port:+:$port}"); fi ;;
          *)
            if egress_dest_allowed "$ip" "$port" ''; then continue
            elif [[ $cdn == true || $cdn == 1 ]]; then review+=("$ip${port:+:$port}")
            else unexpected+=("$ip${port:+:$port}"); fi ;;
        esac
      done <<<"$summary_lines"
      if command -v jq >/dev/null 2>&1 && [[ -n $EGRESS_SUMMARY_JSON && -r $EGRESS_SUMMARY_JSON ]]; then
        local unresolved
        unresolved=$(jq -r '.expected.unresolved // ""' -- "$EGRESS_SUMMARY_JSON" 2>/dev/null)
        if [[ -n $unresolved ]]; then
          notes+=" expected-hostname DNS unresolved: $unresolved (degraded config, review)"
          record egress-observe warn "Egress observe" "expected-destinations.txt has unresolved hostnames: $unresolved — DNS may be failing; treat egress comparison as degraded"
        fi
      fi
    else
      if [[ -n $summary_err ]]; then
        notes=" (degraded: $summary_err)"
        record egress-observe warn "Egress observe" "artifact problem, falling back to kernel journal — $summary_err"
      fi
      if [[ -z $lines ]]; then
        record egress-observe skip "Egress observe" "no egress artifacts and no kernel log lines — egress observation not active yet (install scripts/egress/observe.sh; D13 observe rule)${notes}"
        return 0
      fi
      # Raw kernel journal fallback: "DSH-EGRESS ..." but not the deny prefix.
      local observe
      observe=$(grep -F -- "$EGRESS_OBSERVE_PREFIX" <<<"$lines" 2>/dev/null | grep -Fv -- "$EGRESS_DENY_PREFIX" || true)
      source='journal'
      while IFS= read -r pair; do
        [[ -z $pair ]] && continue
        ip=${pair%%|*}
        port=${pair#*|}
        inspected=$((inspected + 1))
        egress_dest_allowed "$ip" "$port" '' || unexpected+=("${pair/|/:}")
      done < <(egress_destinations "$observe" "$EGRESS_OBSERVE_PREFIX")
    fi

    if (( inspected == 0 )) && (( summary_ok )) && [[ $summary_status == degraded ]]; then
      record egress-observe skip "Egress observe" "observation inactive (summarize-egress status=degraded; source=$source) — install the nftables observe rule${notes}"
    elif (( inspected == 0 )); then
      record egress-observe skip "Egress observe" "no ${EGRESS_OBSERVE_PREFIX} lines in the last ${LOOKBACK_HOURS}h — egress observation not active yet (nftables observe rule/timer not installed)${notes}"
    elif (( ${#unexpected[@]} > 0 )); then
      local review_note=''
      (( ${#review[@]} > 0 )) && review_note="; CDN/PTR review only: $(join_by ", " "${review[@]}")"
      record egress-observe alert "Egress observe" "${#unexpected[@]} observed destination(s) outside the expected set (of $inspected, source=$source): $(join_by ", " "${unexpected[@]}") — check the egress ledger before allowing; an unexpected destination is the D13 egress alarm${review_note}"
    elif (( ${#review[@]} > 0 )); then
      record egress-observe warn "Egress observe" "all $inspected destination(s) match an expected host but ${#review[@]} CDN/edge IP(s) rotated (review only, source=$source): $(join_by ", " "${review[@]}")${notes}"
    else
      record egress-observe ok "Egress observe" "all $inspected observed destination(s) inside the expected set (source=$source; expected: static lo/LAN/tailnet + allow hosts + ${EGRESS_ALLOW_IPS_FILE:-no file})${notes}"
    fi
  fi
}

# ── check 7: cost / token spike vs 7-day median ──────────────────────────────
check_cost() {
  [[ $CHECK_COST == 1 ]] || return 0
  if [[ -z $COST_FILE ]]; then
    record cost-spike skip "Cost spike" "no cost file configured (COST_FILE/--cost-file); contract in research/m0-telemetry.md §7"
    return 0
  fi
  [[ -r $COST_FILE ]] || { record cost-spike error "Cost spike" "cost file unreadable: $COST_FILE"; return 0; }
  command -v jq >/dev/null 2>&1 || { record cost-spike error "Cost spike" "jq is required to read the cost file"; return 0; }
  local today
  today=$(date +%F)
  local today_val
  today_val=$(jq -r --arg d "$today" '
    (.entries // []) | map(select(.date == $d)) | if length == 0 then "" else
      (map(.value) | add / length) | tostring end' -- "$COST_FILE" 2>/dev/null) || today_val=''
  if [[ -z $today_val || $today_val == null ]]; then
    record cost-spike skip "Cost spike" "no entry for today ($today) in cost file — collector may not have run"
    return 0
  fi
  local -a base=()
  local v
  while IFS= read -r v; do [[ -n $v ]] && base+=("$v"); done < <(jq -r --arg d "$today" '
    (.entries // []) | map(select(.date < $d)) | sort_by(.date) | .[-'"$COST_GAP_DAYS"':] | .[].value' -- "$COST_FILE" 2>/dev/null)
  if (( ${#base[@]} < 3 )); then
    record cost-spike warn "Cost spike" "only ${#base[@]} baseline day(s) available (need >=3); today=$today_val — spike check inactive"
    return 0
  fi
  local median
  median=$(printf '%s\n' "${base[@]}" | sort -n | awk '{a[NR]=$1} END{ if (NR%2) print a[(NR+1)/2]; else print (a[NR/2]+a[NR/2+1])/2 }')
  local threshold spike=0
  threshold=$(awk -v m="$median" -v x="$COST_MULTIPLIER" 'BEGIN{printf "%.6f", m*x}')
  awk -v t="$today_val" -v th="$threshold" -v f="$COST_FLOOR" 'BEGIN{exit !(t > th && t > f)}' && spike=1
  local detail="today=$today_val baseline_median=$median threshold=${threshold} (x${COST_MULTIPLIER}, floor ${COST_FLOOR}, ${#base[@]} days)"
  if (( spike )); then
    record cost-spike alert "Cost spike" "$detail — daily usage above threshold"
  elif awk -v m="$median" -v f="$COST_FLOOR" 'BEGIN{exit !(m > 0 || f > 0)}'; then
    record cost-spike ok "Cost spike" "$detail"
  else
    record cost-spike warn "Cost spike" "$detail — baseline is zero; first recorded spend will alert"
  fi
}

# ── run ──────────────────────────────────────────────────────────────────────
if [[ -n $JOURNAL_FILE ]]; then
  # One fixture serves both unit and kernel checks in offline mode.
  JOURNAL_UNIT_LINES=$(cat -- "$JOURNAL_FILE" 2>/dev/null || true)
  JOURNAL_KERNEL_LINES=$JOURNAL_UNIT_LINES
fi

check_unit_state
check_unit_restarts
check_hindsight
check_backup
check_egress
check_cost

if (( ALERTS > 0 )); then exit_code=1
elif (( ERRORS > 0 )); then exit_code=2
else exit_code=0; fi

if (( JSON )); then
  printf '{"schema_version":1,"generated_at":"%s","unit":"%s","scope":"%s","lookback_hours":%s,' \
    "$(iso_utc)" "$(json_escape "$UNIT")" "$(json_escape "$SCOPE")" "$LOOKBACK_HOURS"
  printf '"alerts":%d,"warnings":%d,"errors":%d,"exit_code":%d,"checks":[' \
    "$ALERTS" "$WARNINGS" "$ERRORS" "$exit_code"
  i=0
  while (( i < ${#CHECK_IDS[@]} )); do
    (( i > 0 )) && printf ','
    printf '{"id":"%s","status":"%s","title":"%s","detail":"%s"}' \
      "$(json_escape "${CHECK_IDS[$i]}")" "${CHECK_STATUS[$i]}" \
      "$(json_escape "${CHECK_TITLE[$i]}")" "$(json_escape "${CHECK_DETAIL[$i]}")"
    i=$((i + 1))
  done
  printf ']}\n'
else
  printf 'check-alerts: unit=%s scope=%s window=%sh\n' "$UNIT" "$SCOPE" "$LOOKBACK_HOURS"
  i=0
  while (( i < ${#CHECK_IDS[@]} )); do
    printf '  [%-5s] %-16s %s\n' "${CHECK_STATUS[$i]}" "${CHECK_IDS[$i]}" "${CHECK_DETAIL[$i]}"
    i=$((i + 1))
  done
  if (( ALERTS > 0 )); then
    printf 'SUMMARY: %d alert(s), %d warning(s), %d unchecked — ACTION REQUIRED\n' "$ALERTS" "$WARNINGS" "$ERRORS"
  elif (( ERRORS > 0 )); then
    printf 'SUMMARY: %d alert(s), %d warning(s), %d check error(s) — checks incomplete\n' "$ALERTS" "$WARNINGS" "$ERRORS"
  else
    skipped=0
    i=0
    while (( i < ${#CHECK_STATUS[@]} )); do
      [[ ${CHECK_STATUS[$i]} == skip ]] && skipped=$((skipped + 1))
      i=$((i + 1))
    done
    printf 'SUMMARY: no alerts (%d warning(s), %d skipped)\n' "$WARNINGS" "$skipped"
  fi
fi
exit "$exit_code"
