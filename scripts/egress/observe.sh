#!/usr/bin/env bash
# =============================================================================
# observe.sh — M0 phase 1: OBSERVE egress of the DSH personal service
# =============================================================================
# What it does
#   Creates a dedicated nftables table `inet dsh_egress` whose base output chain
#   is scoped to the service (systemd unit cgroup, or a dedicated uid) and
#   *jumps* into a regular chain that ONLY observes:
#     - an unlimited counter of new outbound connections,
#     - a rate-limited kernel log line per new connection: prefix "DSH-EGRESS ",
#     - per-destination packet counters in dynamic sets (seen_v4 / seen_v6).
#   The base chain policy stays `accept` and the observation chain has no
#   verdict, so this ruleset can never block traffic. Nothing outside the
#   service scope is inspected.
#
# What it does NOT do
#   * No deny/drop rules. M0 (D13) is observe + alert only — there is no egress
#     deny list in M0 (scripts/egress/allowlist.sh is an optional upgrade artifact).
#   * Does not touch UFW, /etc/nftables.conf, or any other nftables table.
#   * Does not install timers, units or edit any file outside $DSH_EGRESS_TABLE.
#
# Subcommands
#   print    [--output FILE]   render the ruleset to stdout (or FILE); no root, no host change
#   check                      `nft -c -f` dry run of the generated ruleset (root for full check)
#   apply                      create/replace table inet dsh_egress          (root)
#   remove                     delete table inet dsh_egress (rollback)       (root)
#   status                     show the loaded table, counters, target freshness (root)
#   help                       this text
#
# Rollback (one command):   sudo nft delete table inet dsh_egress
# Verify afterwards:        sudo nft list table inet dsh_egress
#
# After a service restart the stored cgroup id is stale (systemd recreates the
# unit cgroup); `status` reports "stale" — re-run `apply`. See README/runbook.
# =============================================================================
set -euo pipefail

SCRIPT_NAME=${0##*/}
DSH_EGRESS_TAG=observe
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CONF=${DSH_EGRESS_CONF:-$SCRIPT_DIR/egress.conf}
[[ -r $CONF ]] || { echo "ERROR: config not found: $CONF (copy the whole scripts/egress/ directory or set DSH_EGRESS_CONF)" >&2; exit 1; }
# shellcheck source=egress.conf
. "$CONF"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<EOF
${SCRIPT_NAME} — M0 egress observation for the DSH personal service (OBSERVE ONLY)

Usage:
  ${SCRIPT_NAME} print  [--output FILE]   render the ruleset; no root, no host change
  ${SCRIPT_NAME} check                    nft -c dry run (root for a full check)
  ${SCRIPT_NAME} apply [--if-stale] [--quiet]  create/replace 'table inet ${DSH_EGRESS_TABLE}' (root)
                                          --if-stale: no-op when the target match is fresh
                                          (for a 1-minute root timer that heals a stale
                                          match after a service restart; keeps counters)
  ${SCRIPT_NAME} remove                   delete 'table inet ${DSH_EGRESS_TABLE}' (rollback) (root)
  ${SCRIPT_NAME} status                   show loaded table, counters, target freshness    (root)
  ${SCRIPT_NAME} help                     this text

Environment (also settable in scripts/egress/egress.conf):
  DSH_EGRESS_TARGET_MODE=cgroup|uid   default: ${DSH_EGRESS_TARGET_MODE}
  DSH_EGRESS_CGROUP_PATH              default: ${DSH_EGRESS_CGROUP_PATH}
  DSH_EGRESS_CGROUP_LEVEL             default: ${DSH_EGRESS_CGROUP_LEVEL}
  DSH_EGRESS_SERVICE_USER             default: ${DSH_EGRESS_SERVICE_USER}  (uid mode)
  DSH_EGRESS_LOG_PREFIX               default: "${DSH_EGRESS_LOG_PREFIX}"
  DSH_EGRESS_LOG_RATE / _BURST        default: ${DSH_EGRESS_LOG_RATE} / ${DSH_EGRESS_LOG_BURST}
  DSH_EGRESS_IGNORE_LOOPBACK          default: ${DSH_EGRESS_IGNORE_LOOPBACK}
  DSH_EGRESS_PER_DEST_COUNTERS        default: ${DSH_EGRESS_PER_DEST_COUNTERS}

Target now: $(target_description)

Next steps after 'apply':
  sudo ${SCRIPT_NAME} status
  scripts/egress/summarize-egress.sh summary --since '24 hours ago'
EOF
}

generate_ruleset() {
  local target
  target=$(target_match_expr)

  cat <<EOF
# DSH egress observation ruleset — generated $(timestamp_utc) by scripts/egress/observe.sh
#
# M0 / D13: OBSERVE ONLY. The base chain policy is accept and the observation
# chain has no verdict, so this table cannot block traffic. It is scoped to:
#   ${target}
# Rollback: sudo nft delete table inet ${DSH_EGRESS_TABLE}
#
# The base chain jumps only for the service; all other host traffic is untouched.

table inet ${DSH_EGRESS_TABLE} {
	set seen_v4 {
		type ipv4_addr
		flags dynamic,timeout
		timeout ${DSH_EGRESS_SEEN_TIMEOUT}
		size ${DSH_EGRESS_SEEN_SIZE}
	}
	set seen_v6 {
		type ipv6_addr
		flags dynamic,timeout
		timeout ${DSH_EGRESS_SEEN_TIMEOUT}
		size ${DSH_EGRESS_SEEN_SIZE}
	}

	chain output {
		type filter hook output priority 0; policy accept;
		# scope: only packets from the DSH personal service enter the observation chain
		${target} jump dsh_egress_out
	}

	chain dsh_egress_out {
EOF

  if [[ ${DSH_EGRESS_IGNORE_LOOPBACK} == 1 ]]; then
    cat <<EOF
		# loopback (resolved stub 127.0.0.53, local Hindsight/DSH web): no signal, high volume
		oifname "lo" return

EOF
  fi

  cat <<EOF
		# every new outbound connection from the service (exact count, unlimited)
		ct state new counter

		# kernel journal line per new connection; rate-limited so a burst cannot
		# flood journald. The counter above stays exact.
		ct state new limit rate ${DSH_EGRESS_LOG_RATE} burst ${DSH_EGRESS_LOG_BURST} packets log prefix "${DSH_EGRESS_LOG_PREFIX}" level ${DSH_EGRESS_LOG_LEVEL}

EOF

  if [[ ${DSH_EGRESS_PER_DEST_COUNTERS} == 1 ]]; then
    cat <<EOF
		# per-destination packet counters (exact; elements expire after ${DSH_EGRESS_SEEN_TIMEOUT} idle).
		# Read them with: sudo nft list table inet ${DSH_EGRESS_TABLE}
		meta nfproto ipv4 update @seen_v4 { ip daddr counter }
		meta nfproto ipv6 update @seen_v6 { ip6 daddr counter }

EOF
  fi

  cat <<EOF
	}
}
EOF
}

write_ruleset() { # $1 = output path or "-" for stdout
  local out=$1 target
  target=$(target_match_expr)
  if [[ $out == - ]]; then
    generate_ruleset
  else
    generate_ruleset >"$out"
    info "ruleset written to $out"
  fi
  info "target: $target"
  info "table:  inet $DSH_EGRESS_TABLE (observe only; cannot block; rollback: sudo nft delete table inet $DSH_EGRESS_TABLE)"
}

cmd_print() {
  local out=-
  while (($#)); do
    case $1 in
      --output|-o) [[ $# -ge 2 ]] || die "--output needs a FILE argument"; out=$2; shift 2 ;;
      --output=*) out=${1#*=}; shift ;;
      -h|--help) usage; return 0 ;;
      *) die "print: unknown option '$1' (try: $SCRIPT_NAME help)" ;;
    esac
  done
  write_ruleset "$out"
}

cmd_check() {
  local tmp rc=0
  validate_target
  new_tmp dsh-egress-observe.XXXXXX.nft
  tmp=$TMP_FILE
  generate_ruleset >"$tmp"
  info "dry-run file: $tmp (not installed)"
  check_ruleset_file "$tmp" || rc=$?
  case $rc in
    0) exit 0 ;;
    2) info "check completed with the non-root limitation described above; nothing applied"; exit 0 ;;
    *) exit "$rc" ;;
  esac
}

cmd_apply() {
  local if_stale=0 quiet=0
  while (($#)); do
    case $1 in
      --if-stale) if_stale=1; shift ;;
      --quiet|-q) quiet=1; shift ;;
      -h|--help) usage; return 0 ;;
      *) die "apply: unknown option '$1' (try: $SCRIPT_NAME help)" ;;
    esac
  done
  require_root apply
  validate_target
  if (( if_stale )); then
    nft_init
    if table_exists; then
      local fresh
      fresh=$(target_freshness)
      if [[ $fresh == fresh ]]; then
        info "--if-stale: target is FRESH — leaving the table and its counters alone"
        return 0
      fi
      info "--if-stale: target status is '$fresh' — reloading the observe table"
    else
      info "--if-stale: table is not loaded — loading it"
    fi
  fi
  local tmp
  new_tmp dsh-egress-observe.XXXXXX.nft
  tmp=$TMP_FILE
  generate_ruleset >"$tmp"
  apply_ruleset_file "$tmp"
  if ! table_exists; then die "table inet $DSH_EGRESS_TABLE not visible after load — investigate"; fi
  if (( !quiet )); then
    info "status:"
    "$NFT_BIN" list table inet "$DSH_EGRESS_TABLE" >&2
    info "observe phase active. Let it run, then run:"
    info "  scripts/egress/summarize-egress.sh summary --since '24 hours ago'"
    info "rollback: sudo nft delete table inet $DSH_EGRESS_TABLE"
  fi
}

cmd_remove() {
  require_root remove
  remove_table
  info "verify: sudo nft list table inet $DSH_EGRESS_TABLE   # should say 'No such file or directory'"
}

cmd_status() {
  require_root status
  if ! table_exists; then
    info "table inet $DSH_EGRESS_TABLE is NOT loaded (egress is not being observed)"
    info "load it with: sudo $SCRIPT_NAME apply"
    return 0
  fi
  local fresh
  fresh=$(target_freshness)
  case $fresh in
    fresh) info "target match is FRESH ($(target_description))" ;;
    stale) warn "target match is STALE — the loaded rule no longer points at the live service cgroup (the unit was restarted; systemd recreated the cgroup). Re-run: sudo $SCRIPT_NAME apply" ;;
    *) warn "target freshness unknown" ;;
  esac
  "$NFT_BIN" list table inet "$DSH_EGRESS_TABLE" >&2
  info "new outbound connection counter and seen_* sets above are exact; kernel log lines are rate-limited"
  info "summarize: scripts/egress/summarize-egress.sh summary --since '24 hours ago'"
}

cmd=${1:-help}
shift || true
case $cmd in
  print|dry-run) cmd_print "$@" ;;
  check)         cmd_check "$@" ;;
  apply)         cmd_apply "$@" ;;
  remove|rollback) cmd_remove "$@" ;;
  status)        cmd_status "$@" ;;
  help|-h|--help) usage ;;
  *) die "unknown subcommand '$cmd' (try: $SCRIPT_NAME help)" ;;
esac
