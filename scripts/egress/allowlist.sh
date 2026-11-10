#!/usr/bin/env bash
# =============================================================================
# allowlist.sh — OPTIONAL deny-list artifact for DSH egress
# =============================================================================
# ⚠  NOT USED IN M0 / D13.  ⚠
# D13 (human decision, permanent) drops the egress deny list: M0 is OBSERVE +
# ALERT only (observe.sh + summarize-egress.sh + scripts/telemetry/check-alerts.sh).
# This script is kept in the repo as an *apply-ready upgrade artifact* for a
# later, explicitly-approved higher-assurance step. NO M0 runbook step loads it.
# If it ever is loaded, `summarize-egress.sh` reports DSH-EGRESS-DENY events as
# an alert, because they must not exist in M0.
#
# What it would do
#   table inet dsh_egress (same scoped-jump shape as observe.sh), but the
#   service's packets are filtered deny-by-default inside the jumped chain:
#     established/related · loopback · static LAN/tailnet sets ·
#     hostname sets (dns_v4/dns_v6, refreshed from expected-destinations.txt) ·
#     temporary npm window (npm_v4/npm_v6) · then log+drop everything else.
#   Other host traffic is never inspected (the base chain only jumps for the
#   service and keeps policy accept).
#
# Subcommands
#   print      [--output FILE]      render the ruleset (no root, no host change)
#   check                           nft -c dry run (root for full kernel check)
#   apply                           create/replace table inet dsh_egress        (root)
#   remove                          delete table inet dsh_egress (rollback)     (root)
#   status                          table + deny counter + target freshness     (root)
#   npm-on     [--ttl 1h] [--dry-run]   open a temporary registry.npmjs.org window (root)
#   npm-off                         close the npm window                         (root)
#   help
#
# Two hard warnings
#   1. FAIL-OPEN ON RESTART (cgroup mode): nft resolves the unit cgroup when the
#      ruleset is loaded. systemd destroys the cgroup on stop, so after any
#      restart the stored id matches nothing and NOTHING is filtered. `status`
#      detects this ("STALE"); re-run apply after every restart, or use uid mode
#      with a dedicated service user (no staleness), or a system-unit ExecStartPost.
#   2. DNS/CDN rotation: hostname sets are point-in-time IP snapshots. Run the
#      5-minute refresh timer (refresh-dns-sets.sh) and expect occasional
#      transient denies at CDN edges.
#
# Rollback (one command):   sudo nft delete table inet dsh_egress
# =============================================================================
set -euo pipefail

SCRIPT_NAME=${0##*/}
DSH_EGRESS_TAG=allowlist
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CONF=${DSH_EGRESS_CONF:-$SCRIPT_DIR/egress.conf}
[[ -r $CONF ]] || { echo "ERROR: config not found: $CONF (copy the whole scripts/egress/ directory or set DSH_EGRESS_CONF)" >&2; exit 1; }
# shellcheck source=egress.conf
. "$CONF"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<EOF
${SCRIPT_NAME} — OPTIONAL deny-list artifact (NOT used in M0 / D13)

Usage:
  ${SCRIPT_NAME} print    [--output FILE]   render the ruleset (no root, no host change)
  ${SCRIPT_NAME} check                      nft -c dry run (root for full check)
  ${SCRIPT_NAME} apply                      create/replace table inet ${DSH_EGRESS_TABLE}   (root)
  ${SCRIPT_NAME} remove                     delete table inet ${DSH_EGRESS_TABLE} (rollback) (root)
  ${SCRIPT_NAME} status                     loaded table, deny counter, target freshness    (root)
  ${SCRIPT_NAME} npm-on   [--ttl 1h] [--dry-run]  temporary registry.npmjs.org allow window
  ${SCRIPT_NAME} npm-off                    close the npm window
  ${SCRIPT_NAME} help

M0 note: this file is an optional upgrade artifact; D13 has no deny list. Its
companion refresher is refresh-dns-sets.sh (hostname sets must be refreshed from
the hostname lines of expected-destinations.txt before/while this is loaded).

Target now: $(target_description)
Rollback:   sudo nft delete table inet ${DSH_EGRESS_TABLE}
EOF
}

# ── ruleset rendering ───────────────────────────────────────────────────────
cidr_list() { # space-separated -> "a, b, c" (validated by nft at load time)
  local out='' c
  for c in $1; do
    [[ -n $out ]] && out+=', '
    out+=$c
  done
  printf '%s' "$out"
}

generate_ruleset() {
  local target v4 v6
  target=$(target_match_expr)
  v4=$(cidr_list "$DSH_EGRESS_ALLOW_V4_CIDRS")
  v6=$(cidr_list "$DSH_EGRESS_ALLOW_V6_CIDRS")
  [[ -n $v4 ]] || die "DSH_EGRESS_ALLOW_V4_CIDRS is empty"
  [[ -n $v6 ]] || die "DSH_EGRESS_ALLOW_V6_CIDRS is empty"

  cat <<EOF
# DSH egress DENY ruleset — OPTIONAL upgrade artifact, generated $(timestamp_utc)
#
# ⚠ NOT used in M0 / D13 (which is observe + alert only). Loading this turns the
#   M0 observation into enforcement; every DSH-EGRESS-DENY line then alerts.
#
# Scope: ${target}
# Fail-open caveat: in cgroup mode nft resolves the cgroup at LOAD time; after a
# service restart the id is stale and nothing is filtered (fail-open). Re-run
# apply after restarts, or use DSH_EGRESS_TARGET_MODE=uid with a dedicated user.
# Rollback: sudo nft delete table inet ${DSH_EGRESS_TABLE}

table inet ${DSH_EGRESS_TABLE} {
	set allow_v4 {
		type ipv4_addr
		flags interval
		auto-merge
		elements = { ${v4} }
	}
	set allow_v6 {
		type ipv6_addr
		flags interval
		auto-merge
		elements = { ${v6} }
	}
	set dns_v4 {
		type ipv4_addr
		flags timeout
		timeout ${DSH_EGRESS_DNS_SET_TTL}
	}
	set dns_v6 {
		type ipv6_addr
		flags timeout
		timeout ${DSH_EGRESS_DNS_SET_TTL}
	}
	set npm_v4 {
		type ipv4_addr
		flags timeout
		timeout ${DSH_EGRESS_NPM_TTL}
	}
	set npm_v6 {
		type ipv6_addr
		flags timeout
		timeout ${DSH_EGRESS_NPM_TTL}
	}

	chain output {
		type filter hook output priority 0; policy accept;
		${target} jump dsh_egress_out
	}

	chain dsh_egress_out {
		# 1. replies / already-approved flows are not re-evaluated
		ct state established,related counter accept

		# 2. loopback: systemd-resolved stub 127.0.0.53, local services
		oifname "lo" counter accept

		# 3. local networks (static sets; see DSH_EGRESS_ALLOW_V4/V6_CIDRS)
		ip daddr @allow_v4 counter accept
		ip6 daddr @allow_v6 counter accept

		# 4. hostname allow sets, refreshed by refresh-dns-sets.sh:
		#    hostname lines of expected-destinations.txt, resolved with getent
		ip daddr @dns_v4 counter accept
		ip6 daddr @dns_v6 counter accept

		# 5. temporary npm registry window (npm-on / npm-off), TTL ${DSH_EGRESS_NPM_TTL}
		ip daddr @npm_v4 counter accept
		ip6 daddr @npm_v6 counter accept

		# 6. deny-by-default, logged (rate-limited) and counted
		limit rate ${DSH_EGRESS_DENY_RATE} burst ${DSH_EGRESS_DENY_BURST} packets log prefix "${DSH_EGRESS_DENY_PREFIX}" level ${DSH_EGRESS_DENY_LEVEL}
		counter drop
	}
}
EOF
}

write_ruleset() { # $1 = path or -
  local out=$1
  if [[ $out == - ]]; then generate_ruleset; else generate_ruleset >"$out"; info "ruleset written to $out"; fi
  info "table: inet $DSH_EGRESS_TABLE (DENY — optional artifact, not M0)"
}

cmd_print() {
  local out=-
  while (($#)); do
    case $1 in
      --output|-o) [[ $# -ge 2 ]] || die "--output needs a FILE"; out=$2; shift 2 ;;
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
  new_tmp dsh-egress-allowlist.XXXXXX.nft
  tmp=$TMP_FILE
  generate_ruleset >"$tmp"
  info "dry-run file: $tmp (not installed)"
  check_ruleset_file "$tmp" || rc=$?
  case $rc in
    0) exit 0 ;;
    2) info "check limited to grammar parsing (non-root); nothing applied"; exit 0 ;;
    *) exit "$rc" ;;
  esac
}

cmd_apply() {
  require_root apply
  validate_target
  local tmp
  new_tmp dsh-egress-allowlist.XXXXXX.nft
  tmp=$TMP_FILE
  generate_ruleset >"$tmp"
  apply_ruleset_file "$tmp"
  info "⚠ DENY ruleset loaded (optional artifact; not part of M0/D13)."
  info "next: sudo $SCRIPT_DIR/refresh-dns-sets.sh apply   (fills dns_* sets; otherwise every hostname is denied)"
  info "restart fail-open: re-run apply after any service restart (cgroup mode)"
  info "rollback: sudo nft delete table inet $DSH_EGRESS_TABLE"
}

cmd_remove() {
  require_root remove
  remove_table
}

cmd_status() {
  require_root status
  if ! table_exists; then
    info "table inet $DSH_EGRESS_TABLE is not loaded (optional deny artifact not in use)"
    return 0
  fi
  local fresh
  fresh=$(target_freshness)
  case $fresh in
    fresh) info "target match is FRESH ($(target_description))" ;;
    stale) warn "target match is STALE — nothing is being filtered (fail-open) until you re-run: sudo $SCRIPT_NAME apply" ;;
  esac
  "$NFT_BIN" list table inet "$DSH_EGRESS_TABLE" >&2
}

# ── npm window ──────────────────────────────────────────────────────────────
resolve_npm_ips() { # -> sets NPM_V4 / NPM_V6 globals, prints human lines
  local h ip
  NPM_V4=''; NPM_V6=''
  local -a hosts=()
  for h in $DSH_EGRESS_NPM_HOSTNAMES; do hosts+=("$h"); done
  ((${#hosts[@]})) || die "DSH_EGRESS_NPM_HOSTNAMES is empty"
  for h in "${hosts[@]}"; do
    local found=0
    while IFS= read -r ip; do
      [[ -n $ip ]] || continue
      [[ $ip == ::ffff:* ]] && continue
      found=1
      if [[ $ip == *:* ]]; then
        [[ -n $NPM_V6 ]] && NPM_V6+=', '
        NPM_V6+=$ip
      else
        [[ -n $NPM_V4 ]] && NPM_V4+=', '
        NPM_V4+=$ip
      fi
    done < <(getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u || true)
    (( found )) || warn "no addresses resolved for npm host '$h'"
  done
  [[ -n $NPM_V4 || -n $NPM_V6 ]] || die "could not resolve any npm registry address (check DNS)"
  printf '%s\n' "resolved npm window: v4=[${NPM_V4}] v6=[${NPM_V6}]"
}

npm_batch_text() { # $1 = ttl
  local ttl=$1
  cat <<EOF
flush set inet ${DSH_EGRESS_TABLE} npm_v4
flush set inet ${DSH_EGRESS_TABLE} npm_v6
EOF
  [[ -n ${NPM_V4:-} ]] && printf 'add element inet %s npm_v4 { %s timeout %s }\n' "$DSH_EGRESS_TABLE" "$NPM_V4" "$ttl"
  [[ -n ${NPM_V6:-} ]] && printf 'add element inet %s npm_v6 { %s timeout %s }\n' "$DSH_EGRESS_TABLE" "$NPM_V6" "$ttl"
  return 0
}

cmd_npm_on() {
  local ttl=$DSH_EGRESS_NPM_TTL dry=0
  while (($#)); do
    case $1 in
      --ttl) [[ $# -ge 2 ]] || die "--ttl needs a value"; ttl=$2; shift 2 ;;
      --ttl=*) ttl=${1#*=}; shift ;;
      --dry-run|-n) dry=1; shift ;;
      -h|--help) usage; return 0 ;;
      *) die "npm-on: unknown option '$1'" ;;
    esac
  done
  [[ $ttl =~ ^[0-9]+[smhd]$ ]] || die "--ttl must look like 30m, 1h, 3600s (got '$ttl')"
  resolve_npm_ips
  local tmp
  new_tmp dsh-egress-npm.XXXXXX.nft
  tmp=$TMP_FILE
  npm_batch_text "$ttl" >"$tmp"
  if (( dry )); then
    info "npm-on --dry-run: batch that WOULD be loaded (nothing applied):"
    cat "$tmp" >&2
    return 0
  fi
  require_root npm-on
  table_exists || die "table inet $DSH_EGRESS_TABLE is not loaded — run: sudo $SCRIPT_NAME apply"
  "$NFT_BIN" -f "$tmp"
  info "npm registry window open for ${ttl} (registry.npmjs.org only)."
  info "close it as soon as the install finishes: sudo $SCRIPT_NAME npm-off"
}

cmd_npm_off() {
  require_root npm-off
  if ! table_exists; then
    info "table inet $DSH_EGRESS_TABLE is not loaded — nothing to do"
    return 0
  fi
  "$NFT_BIN" flush set inet "$DSH_EGRESS_TABLE" npm_v4 2>/dev/null || true
  "$NFT_BIN" flush set inet "$DSH_EGRESS_TABLE" npm_v6 2>/dev/null || true
  info "npm registry window closed (npm_v4/npm_v6 flushed)"
}

cmd=${1:-help}
shift || true
case $cmd in
  print|dry-run)  cmd_print "$@" ;;
  check)          cmd_check "$@" ;;
  apply)          cmd_apply "$@" ;;
  remove|rollback) cmd_remove "$@" ;;
  status)         cmd_status "$@" ;;
  npm-on)         cmd_npm_on "$@" ;;
  npm-off)        cmd_npm_off "$@" ;;
  help|-h|--help) usage ;;
  *) die "unknown subcommand '$cmd' (try: $SCRIPT_NAME help)" ;;
esac
