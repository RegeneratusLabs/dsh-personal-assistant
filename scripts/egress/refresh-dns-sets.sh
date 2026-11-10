#!/usr/bin/env bash
# =============================================================================
# refresh-dns-sets.sh — hostname→IP set refresher for the OPTIONAL deny artifact
# =============================================================================
# ⚠  NOT USED IN M0 / D13.  ⚠
# D13 dropped the egress deny list; M0 is observe + alert only. This script only
# matters if allowlist.sh is loaded (optional, later, approved step). It resolves
# the hostname lines of expected-destinations.txt with `getent ahosts` and
# atomically replaces the nftables sets dns_v4 / dns_v6.
#
# Contract for the optional deny artifact
#   * Sets owned by this script: dns_v4, dns_v6 (only writer).
#   * Source of truth for hostnames: expected-destinations.txt (hostname lines),
#     or DSH_EGRESS_HOSTNAMES if that file is unreadable.
#   * Fail-safe: if ANY hostname fails to resolve, NOTHING is changed (the old
#     elements stay), exit 1. --allow-partial opts into replacing with the
#     subset that did resolve.
#   * Atomic: flush+add for both families are sent as one `nft -f` batch, so a
#     connection never sees a half-empty set.
#   * Idempotent: when the desired contents equal the current contents, no nft
#     command is run at all (no churn, no log spam).
#   * Entries carry a TTL (DSH_EGRESS_DNS_SET_TTL, default 15m), so if this
#     refresher stops, stale IPs self-expire (fail-closed) instead of lingering.
#
# Subcommands
#   print  [--expected FILE] [--allow-partial]   resolve + print plan & batch (no root)
#   check  [...]                                 nft -c dry run (root for full check)
#   apply  [...]                                 atomically replace dns_v4/dns_v6   (root)
#   status [...]                                 current vs desired, drift, unresolved (root)
#   print-units                                  print the shipped systemd service+timer
#   help
#
# Timer: dsh-egress-dns.timer (5-minute interval) is shipped as a TEXT ARTIFACT
# only — it is NOT installed by this tooling. See scripts/egress/README.md.
# Rollback: sudo systemctl disable --now dsh-egress-dns.timer
#           sudo nft delete table inet dsh_egress
# =============================================================================
set -euo pipefail

SCRIPT_NAME=${0##*/}
DSH_EGRESS_TAG=refresh-dns
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CONF=${DSH_EGRESS_CONF:-$SCRIPT_DIR/egress.conf}
[[ -r $CONF ]] || { echo "ERROR: config not found: $CONF (copy the whole scripts/egress/ directory or set DSH_EGRESS_CONF)" >&2; exit 1; }
# shellcheck source=egress.conf
. "$CONF"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

EXPECTED_FILE_OPT=${DSH_EGRESS_EXPECTED_FILE:-}
ALLOW_PARTIAL=0
QUIET=0

usage() {
  cat <<EOF
${SCRIPT_NAME} — hostname→IP set refresher for the OPTIONAL deny artifact
(NOT part of M0 / D13; only needed if allowlist.sh is loaded)

Usage:
  ${SCRIPT_NAME} print  [--expected FILE] [--allow-partial] [--quiet]
  ${SCRIPT_NAME} check  [...]
  ${SCRIPT_NAME} apply  [...]            atomically replace dns_v4/dns_v6   (root)
  ${SCRIPT_NAME} status [...]            current vs desired + drift          (root)
  ${SCRIPT_NAME} print-units             print the shipped systemd service+timer text
  ${SCRIPT_NAME} help

Options:
  --expected FILE     hostname source (default: ${DSH_EGRESS_EXPECTED_FILE})
  --allow-partial     replace sets with whatever resolved when a hostname fails
                      (default is all-or-nothing: a failed lookup changes nothing)
  --quiet             less output (applies to apply/status)

Sets (in table inet ${DSH_EGRESS_TABLE}, created by allowlist.sh):
  dns_v4, dns_v6      hostname-resolved IPs; TTL ${DSH_EGRESS_DNS_SET_TTL}

Rollback: sudo nft delete table inet ${DSH_EGRESS_TABLE}
EOF
}

parse_opts() {
  while (($#)); do
    case $1 in
      --expected) [[ $# -ge 2 ]] || die "--expected needs a FILE"; EXPECTED_FILE_OPT=$2; shift 2 ;;
      --expected=*) EXPECTED_FILE_OPT=${1#*=}; shift ;;
      --allow-partial) ALLOW_PARTIAL=1; shift ;;
      --quiet|-q) QUIET=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option '$1' (try: $SCRIPT_NAME help)" ;;
    esac
  done
}

# ── hostnames + resolution ──────────────────────────────────────────────────
load_hostnames() {
  HOSTS=()
  local f=${EXPECTED_FILE_OPT:-${DSH_EGRESS_EXPECTED_FILE:-$SCRIPT_DIR/expected-destinations.txt}}
  if [[ -r $f ]]; then
    mapfile -t HOSTS < <(expected_lines | awk '!/\// && $0 !~ /^[0-9a-fA-F:.]+$/ { print }')
  else
    warn "expected file unreadable ($f); falling back to DSH_EGRESS_HOSTNAMES"
    # shellcheck disable=SC2206
    local -a fallback=($DSH_EGRESS_HOSTNAMES)
    HOSTS=("${fallback[@]}")
  fi
  ((${#HOSTS[@]})) || die "no hostnames to resolve (expected file has no hostname lines and DSH_EGRESS_HOSTNAMES is empty)"
}

resolve_all() {
  DESIRED_V4=(); DESIRED_V6=()
  RESOLVED=0; FAILED=0
  RESOLVE_PLAN=()
  local h ip found
  for h in "${HOSTS[@]}"; do
    found=0
    while IFS= read -r ip; do
      [[ -n $ip ]] || continue
      if [[ $ip == ::ffff:* ]]; then continue; fi
      found=1
      RESOLVE_PLAN+=("$h|$ip")
      if [[ $ip == *:* ]]; then DESIRED_V6+=("$ip"); else DESIRED_V4+=("$ip"); fi
    done < <(getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u || true)
    if (( found )); then
      RESOLVED=$((RESOLVED + 1))
    else
      FAILED=$((FAILED + 1))
      warn "unresolved hostname: $h"
    fi
  done
  DESIRED_V4=($(printf '%s\n' "${DESIRED_V4[@]:-}" | grep -v '^$' | sort -u || true))
  DESIRED_V6=($(printf '%s\n' "${DESIRED_V6[@]:-}" | grep -v '^$' | sort -u || true))
  if (( FAILED > 0 )) && (( !ALLOW_PARTIAL )); then
    die "${FAILED} hostname(s) failed to resolve — refusing to touch the sets (fail-safe).
  Fix DNS first, or pass --allow-partial to load only the resolved subset."
  fi
}

# ── batch rendering ─────────────────────────────────────────────────────────
join_list() { # array name -> comma list (call via eval-free indirection)
  local -n arr=$1
  local out='' x
  for x in "${arr[@]:-}"; do
    [[ -n $x ]] || continue
    [[ -n $out ]] && out+=', '
    out+=$x
  done
  printf '%s' "$out"
}

batch_text() {
  local v4 v6
  v4=$(join_list DESIRED_V4)
  v6=$(join_list DESIRED_V6)
  {
    printf 'flush set inet %s dns_v4\n' "$DSH_EGRESS_TABLE"
    printf 'flush set inet %s dns_v6\n' "$DSH_EGRESS_TABLE"
    if [[ -n $v4 ]]; then
      printf 'add element inet %s dns_v4 { %s }\n' "$DSH_EGRESS_TABLE" "$v4"
    fi
    if [[ -n $v6 ]]; then
      printf 'add element inet %s dns_v6 { %s }\n' "$DSH_EGRESS_TABLE" "$v6"
    fi
  }
}

print_plan() {
  local row h ip
  info "hostnames (${#HOSTS[@]}) from ${EXPECTED_FILE_OPT:-$DSH_EGRESS_EXPECTED_FILE}"
  for row in "${RESOLVE_PLAN[@]:-}"; do
    [[ -n $row ]] || continue
    h=${row%%|*}; ip=${row#*|}
    printf '  %-32s %s\n' "$h" "$ip"
  done
  info "desired: ${#DESIRED_V4[@]} IPv4 + ${#DESIRED_V6[@]} IPv6 element(s) for sets dns_v4/dns_v6"
  printf '--- nft batch (atomic, one transaction) ---\n'
  batch_text
}

# ── current set contents (root) ─────────────────────────────────────────────
CURRENT_V4=(); CURRENT_V6=()
dump_set() { # $1 = set name -> prints one element key per line
  local set=$1 text flat
  text=$("$NFT_BIN" list set inet "$DSH_EGRESS_TABLE" "$set" 2>/dev/null) || return 1
  flat=$(printf '%s' "$text" | tr '\n' ' ')
  flat=$(sed -e 's/.*elements = {//' -e 's/}.*//' <<<"$flat")
  printf '%s\n' "$flat" | tr ',' '\n' | awk '
    { gsub(/^[ \t]+|[ \t]+$/, "");
      if ($0 == "") next;
      print $1 }'
}

read_current() {
  nft_init
  table_exists || die "table inet $DSH_EGRESS_TABLE is not loaded — run: sudo scripts/egress/allowlist.sh apply"
  mapfile -t CURRENT_V4 < <(dump_set dns_v4 || true)
  mapfile -t CURRENT_V6 < <(dump_set dns_v6 || true)
  CURRENT_V4=($(printf '%s\n' "${CURRENT_V4[@]:-}" | grep -v '^$' | sort -u || true))
  CURRENT_V6=($(printf '%s\n' "${CURRENT_V6[@]:-}" | grep -v '^$' | sort -u || true))
}

diff_sets() { # desired_array current_array -> sets ADDED/REMOVED globals
  local -n des=$1 cur=$2
  local d c
  ADDED=(); REMOVED=()
  local -A seen_cur=() seen_des=()
  for c in "${cur[@]:-}"; do [[ -n $c ]] && seen_cur["$c"]=1; done
  for d in "${des[@]:-}"; do
    [[ -n $d ]] || continue
    seen_des["$d"]=1
    [[ -n ${seen_cur[$d]:-} ]] || ADDED+=("$d")
  done
  for c in "${cur[@]:-}"; do
    [[ -n $c ]] || continue
    [[ -n ${seen_des[$c]:-} ]] || REMOVED+=("$c")
  done
}

# ── subcommands ─────────────────────────────────────────────────────────────
cmd_print() {
  parse_opts "$@"
  load_hostnames
  resolve_all
  print_plan
}

cmd_check() {
  local tmp rc=0
  parse_opts "$@"
  load_hostnames
  resolve_all
  validate_target
  new_tmp dsh-egress-dns.XXXXXX.nft
  tmp=$TMP_FILE
  batch_text >"$tmp"
  info "dry-run file: $tmp (not installed)"
  check_ruleset_file "$tmp" || rc=$?
  case $rc in
    0) exit 0 ;;
    2) info "check limited to grammar parsing (non-root); nothing applied"; exit 0 ;;
    *) exit "$rc" ;;
  esac
}

cmd_apply() {
  local tmp changed=0
  parse_opts "$@"
  require_root apply
  load_hostnames
  resolve_all
  validate_target
  nft_init
  table_exists || die "table inet $DSH_EGRESS_TABLE is not loaded — run: sudo scripts/egress/allowlist.sh apply first"
  read_current
  diff_sets DESIRED_V4 CURRENT_V4
  local add4=${#ADDED[@]} rem4=${#REMOVED[@]}
  diff_sets DESIRED_V6 CURRENT_V6
  local add6=${#ADDED[@]} rem6=${#REMOVED[@]}
  if (( add4 + rem4 + add6 + rem6 == 0 )); then
    info "no change (dns sets already match resolution: ${#DESIRED_V4[@]} IPv4 + ${#DESIRED_V6[@]} IPv6)"
    return 0
  fi
  new_tmp dsh-egress-dns.XXXXXX.nft
  tmp=$TMP_FILE
  batch_text >"$tmp"
  info "refreshing sets: +${add4}/-${rem4} IPv4, +${add6}/-${rem6} IPv6 ($(timestamp_utc))"
  "$NFT_BIN" -f "$tmp" || die "nft -f failed; sets were left unchanged (atomic batch)"
  info "sets refreshed (atomic). Read back with: sudo ${SCRIPT_NAME} status"
}

cmd_status() {
  local drift4 drift6 row
  parse_opts "$@"
  require_root status
  load_hostnames
  resolve_all
  read_current
  info "table: inet $DSH_EGRESS_TABLE (present)"
  local fresh
  fresh=$(target_freshness)
  [[ $fresh == stale ]] && warn "target match is STALE — the deny rules are not filtering anything; re-run allowlist.sh apply"
  info "hostnames: ${#HOSTS[@]} resolved, ${FAILED} failed"
  info "current: ${#CURRENT_V4[@]} IPv4 + ${#CURRENT_V6[@]} IPv6; desired: ${#DESIRED_V4[@]} IPv4 + ${#DESIRED_V6[@]} IPv6"
  diff_sets DESIRED_V4 CURRENT_V4; drift4=$(( ${#ADDED[@]} + ${#REMOVED[@]} ))
  if (( drift4 > 0 )); then
    warn "IPv4 drift: missing=${#ADDED[@]} extra=${#REMOVED[@]}"
    printf '  missing: %s\n' "${ADDED[*]:-none}"
    printf '  extra:   %s\n' "${REMOVED[*]:-none}"
  fi
  diff_sets DESIRED_V6 CURRENT_V6; drift6=$(( ${#ADDED[@]} + ${#REMOVED[@]} ))
  if (( drift6 > 0 )); then
    warn "IPv6 drift: missing=${#ADDED[@]} extra=${#REMOVED[@]}"
    printf '  missing: %s\n' "${ADDED[*]:-none}"
    printf '  extra:   %s\n' "${REMOVED[*]:-none}"
  fi
  if (( drift4 + drift6 == 0 )); then info "dns sets match the current resolution (no drift)"; fi
}

cmd_print_units() {
  local f
  for f in dsh-egress-dns.service dsh-egress-dns.timer; do
    printf '===== %s (%s) =====\n' "$f" "$SCRIPT_DIR/$f"
    [[ -r $SCRIPT_DIR/$f ]] || die "unit artifact missing: $SCRIPT_DIR/$f"
    cat -- "$SCRIPT_DIR/$f"
    echo
  done
  info "these are text artifacts ONLY — not installed. Install/rollback: scripts/egress/README.md"
}

cmd=${1:-help}
shift || true
case $cmd in
  print|dry-run) cmd_print "$@" ;;
  check)         cmd_check "$@" ;;
  apply)         cmd_apply "$@" ;;
  status)        cmd_status "$@" ;;
  print-units|units) cmd_print_units ;;
  help|-h|--help) usage ;;
  *) die "unknown subcommand '$cmd' (try: $SCRIPT_NAME help)" ;;
esac
