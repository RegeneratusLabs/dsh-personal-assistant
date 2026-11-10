#!/usr/bin/env bash
# =============================================================================
# summarize-egress.sh — turn M0 egress observation into a reviewable report
# =============================================================================
# Reads the kernel log lines produced by observe.sh (`DSH-EGRESS ` prefix),
# aggregates them per destination, resolves owners (reverse DNS + the expected
# destination list) and reports whether every observed destination was expected.
#
# D13: M0 has NO deny list. This report is the compensating control: an
# observed destination outside expected-destinations.txt is an ALERT.
#
# Inputs
#   * journald kernel log:  journalctl -k -o short-unix --since ...   (no root needed
#                           when the local user is in group `adm`; verified on host)
#   * dmesg fallback:       requires root (kernel.dmesg_restrict=1 on this host)
#   * nft counters:         require root (`nft list ...`); optional, exact counts
#   * --file fixture:       offline testing / digest input
#
# Outputs
#   * markdown report to stdout (default)                       ← the ledger table
#   * --json machine-readable summary to stdout                 ← alert contract
#   * --write-artifacts [DIR] egress-summary.json + egress-summary.md
#   * --tsv FILE              flat destination list (dst, port, proto, events, ...)
#
# Exit codes (contract for scripts/telemetry/check-alerts.sh / digest)
#   0  report produced; observation active; no unexpected destination
#   2  ALERT: at least one observed destination is not in the expected list
#   3  DEGRADED: observation not active (no DSH-EGRESS log lines; table missing)
#   1  usage/config error
#
# Subcommands
#   summary   aggregate + report (default options below)
#   journal   print the raw matching kernel log lines (diagnostic)
#   help      this text
#
# Expected destinations: expected-destinations.txt (or --expected FILE). Lines are
# hostnames (resolved with getent ahosts) or IPs/CIDRs. Nothing is written to the
# host; this script never calls nft with -f and never needs root.
# =============================================================================
set -euo pipefail

SCRIPT_NAME=${0##*/}
DSH_EGRESS_TAG=summarize
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
CONF=${DSH_EGRESS_CONF:-$SCRIPT_DIR/egress.conf}
[[ -r $CONF ]] || { echo "ERROR: config not found: $CONF (copy the whole scripts/egress/ directory or set DSH_EGRESS_CONF)" >&2; exit 1; }
# shellcheck source=egress.conf
. "$CONF"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

# ── defaults (flags win) ────────────────────────────────────────────────────
SINCE='24 hours ago'
UNTIL=''
BOOT=0
SOURCE=$DSH_EGRESS_JOURNAL_SOURCE        # auto|journal|dmesg|file
FIXTURE=''
EXPECTED_FILE=$DSH_EGRESS_EXPECTED_FILE
ALLOW_IPS_FILE=''
NO_PTR=0
JSON=0
OUT_FILE=''
WRITE_ARTIFACTS=0
ARTIFACT_DIR=$DSH_EGRESS_ARTIFACT_DIR
TSV_FILE=''
LENIENT=0
ALLOW_EMPTY=0
TOP=200

usage() {
  cat <<EOF
${SCRIPT_NAME} — M0 egress report / alert contract (OBSERVE ONLY; D13)

Usage:
  ${SCRIPT_NAME} summary [options]     aggregate + report (default subcommand)
  ${SCRIPT_NAME} journal [options]     dump raw matching kernel log lines
  ${SCRIPT_NAME} help

Options:
  --since SPEC            journal window start (default: '${SINCE}')
  --until SPEC            journal window end (default: now)
  --boot                  whole current boot (overrides --since/--until)
  --source auto|journal|dmesg|file   log source (default: ${SOURCE}; 'file' needs --file)
  --file FILE             read log lines from FILE instead of the journal (offline test)
  --expected FILE         expected-destinations file (default: ${EXPECTED_FILE})
  --allow-ips FILE        extra reviewed IP/CIDR entries, one per line (optional)
  --no-ptr                skip reverse-DNS owner lookup (faster, no DNS per dst)
  --json                  emit machine-readable JSON instead of markdown
  --out FILE              write the report to FILE (instead of stdout)
  --write-artifacts [DIR] write egress-summary.json + egress-summary.md to DIR
                          (default: ${ARTIFACT_DIR} under the repo root)
  --tsv FILE              also write a flat destination table to FILE
  --lenient               exit 0 even when unexpected destinations were observed
  --allow-empty           exit 0 when no kernel log lines were found (default: exit 3)
  --top N                 max destination rows in the report (default: ${TOP})
  -h, --help              this text

Exit codes: 0 clean · 2 unexpected destination(s) · 3 observation inactive/degraded · 1 error
Root is NOT required: journalctl -k works for members of group adm on this host;
nft counters are reported only when root (otherwise a note is printed).

Expected destination entries (expected-destinations.txt):
  hostname            e.g. api.deepseek.com      (resolved with getent at run time)
  IPv4 address/CIDR   e.g. 192.168.1.0/24
  IPv6 address/CIDR   e.g. fd7a:115c:a1e0::/48
  # comment / blank lines ignored
EOF
}

need_arg() { [[ $# -ge 2 && -n ${2:-} ]] || die "$1 needs an argument"; }

parse_args() {
  while (($#)); do
    case $1 in
      --since) need_arg "$@"; SINCE=$2; shift 2 ;;
      --until) need_arg "$@"; UNTIL=$2; shift 2 ;;
      --boot) BOOT=1; shift ;;
      --source) need_arg "$@"; SOURCE=$2; shift 2 ;;
      --file) need_arg "$@"; FIXTURE=$2; SOURCE=file; shift 2 ;;
      --expected) need_arg "$@"; EXPECTED_FILE=$2; shift 2 ;;
      --allow-ips) need_arg "$@"; ALLOW_IPS_FILE=$2; shift 2 ;;
      --no-ptr) NO_PTR=1; shift ;;
      --json) JSON=1; shift ;;
      --out) need_arg "$@"; OUT_FILE=$2; shift 2 ;;
      --write-artifacts) WRITE_ARTIFACTS=1
        if [[ ${2:-} == -* || -z ${2:-} ]]; then shift; else ARTIFACT_DIR=$2; shift 2; fi ;;
      --write-artifacts=*) WRITE_ARTIFACTS=1; ARTIFACT_DIR=${1#*=}; shift ;;
      --tsv) need_arg "$@"; TSV_FILE=$2; shift 2 ;;
      --lenient) LENIENT=1; shift ;;
      --allow-empty) ALLOW_EMPTY=1; shift ;;
      --top) need_arg "$@"; TOP=$2; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option '$1' (try: $SCRIPT_NAME help)" ;;
    esac
  done
  [[ $TOP =~ ^[0-9]+$ ]] || die "--top must be a number (got '$TOP')"
}

# ── collect raw kernel log lines ────────────────────────────────────────────
collect_lines() {
  local out=''
  case $SOURCE in
    file)
      [[ -n $FIXTURE ]] || die "--source file needs --file FILE"
      [[ -r $FIXTURE ]] || die "log fixture not readable: $FIXTURE"
      out=$(cat -- "$FIXTURE")
      SOURCE_KIND=file
      ;;
    dmesg)
      out=$(dmesg 2>/dev/null) || die "dmesg is not readable (kernel.dmesg_restrict=1); re-run with root or use the journal"
      SOURCE_KIND=dmesg
      ;;
    journal|auto)
      local -a args=(-k -o short-unix --no-pager)
      if (( BOOT )); then
        args+=(-b)
      else
        args+=(--since "$SINCE")
        [[ -n $UNTIL ]] && args+=(--until "$UNTIL")
      fi
      if out=$(journalctl "${args[@]}" 2>/dev/null); then
        SOURCE_KIND=journal
      elif [[ $SOURCE == auto ]]; then
        out=$(dmesg 2>/dev/null || true)
        [[ -n $out ]] || die "no kernel log source available: journalctl -k failed and dmesg needs root"
        SOURCE_KIND=dmesg
      else
        die "journalctl -k is not readable; either join group adm or run with root"
      fi
      ;;
    *) die "--source must be auto|journal|dmesg|file (got '$SOURCE')" ;;
  esac
  # keep only lines produced by our nft rules (either prefix)
  LINES=$(grep -F -e "${DSH_EGRESS_LOG_PREFIX}" -e "${DSH_EGRESS_DENY_PREFIX}" <<<"$out" || true)
  LINE_COUNT=$(grep -c . <<<"$LINES" || true)
  [[ -n $LINE_COUNT ]] || LINE_COUNT=0
}

# ── aggregate ───────────────────────────────────────────────────────────────
# output rows: kind|dst|dpt|proto|events|first_epoch|last_epoch|interfaces
aggregate_rows() {
  awk -v obs="${DSH_EGRESS_LOG_PREFIX}" -v deny="${DSH_EGRESS_DENY_PREFIX}" '
    function epochof(tok) { return (tok ~ /^[0-9]+(\.[0-9]+)?$/) ? tok : "" }
    {
      kind = ""
      if (index($0, deny) > 0)      kind = "deny"
      else if (index($0, obs) > 0)  kind = "observe"
      else next
      dst = ""; dpt = ""; proto = ""; oif = ""
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^DST=/)   { dst = $i;   sub(/^DST=/, "", dst) }
        if ($i ~ /^DPT=/)   { dpt = $i;   sub(/^DPT=/, "", dpt) }
        if ($i ~ /^PROTO=/) { proto = $i; sub(/^PROTO=/, "", proto); proto = tolower(proto) }
        if ($i ~ /^OUT=/)   { oif = $i;   sub(/^OUT=/, "", oif) }
      }
      if (dst == "") next
      ep = epochof($1)
      key = kind SUBSEP dst SUBSEP dpt SUBSEP proto
      n[key]++
      if (!(key in first)) first[key] = ep
      if (ep != "" && (first[key] == "" || ep + 0 < first[key] + 0)) first[key] = ep
      if (ep != "" && (ep + 0 > last[key] + 0)) last[key] = ep
      if (!(key in oifs)) oifs[key] = oif
    }
    END {
      for (k in n) {
        split(k, p, SUBSEP)
        printf "%s|%s|%s|%s|%d|%s|%s|%s\n", p[1], p[2], p[3], p[4], n[k],
               (first[k] == "" ? "-" : first[k]), (last[k] == "" ? "-" : last[k]), oifs[k]
      }
    }' <<<"$LINES" | sort -t'|' -k1,1 -k5,5nr
}

# ── ip / cidr helpers ───────────────────────────────────────────────────────
v4_to_int() { # ip -> global IPV4_INT
  local IFS=. a b c d
  read -r a b c d <<<"$1"
  [[ ${a:-} =~ ^[0-9]{1,3}$ && ${b:-} =~ ^[0-9]{1,3}$ && ${c:-} =~ ^[0-9]{1,3}$ && ${d:-} =~ ^[0-9]{1,3}$ ]] || return 1
  local n
  for n in "$a" "$b" "$c" "$d"; do (( n <= 255 )) || return 1; done
  IPV4_INT=$(( (a << 24) | (b << 16) | (c << 8) | d ))
}

v4_in_cidr() { # ip cidr
  local ip=$1 cidr=$2 net bits mask ip_int net_int
  [[ $cidr == */* ]] || return 1
  net=${cidr%/*}; bits=${cidr#*/}
  [[ $bits =~ ^[0-9]{1,2}$ ]] && (( bits <= 32 )) || return 1
  v4_to_int "$ip" || return 1
  ip_int=$IPV4_INT
  v4_to_int "$net" || return 1
  net_int=$IPV4_INT
  if (( bits == 0 )); then mask=0; else mask=$(( (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF )); fi
  (( (ip_int & mask) == (net_int & mask) ))
}

v6_expand() { # ip -> 32 lowercase hex chars, or fail
  local ip=${1,,}
  ip=${ip%%\%*}
  [[ -n $ip ]] || return 1
  local left='' right=''
  if [[ $ip == *::* ]]; then left=${ip%%::*}; right=${ip#*::}; else left=$ip; right=; fi
  [[ $right == *::* ]] && return 1
  local -a l=() r=()
  [[ -n $left ]] && IFS=: read -ra l <<<"$left"
  [[ -n $right ]] && IFS=: read -ra r <<<"$right"
  local total=$(( ${#l[@]} + ${#r[@]} )) fill
  (( total <= 8 )) || return 1
  fill=$(( 8 - total ))
  local out='' g
  for g in "${l[@]}"; do
    [[ $g =~ ^[0-9a-f]{1,4}$ ]] || return 1
    printf -v g '%04x' "0x$g"; out+=$g
  done
  local i
  for (( i = 0; i < fill; i++ )); do out+='0000'; done
  for g in "${r[@]}"; do
    [[ $g =~ ^[0-9a-f]{1,4}$ ]] || return 1
    printf -v g '%04x' "0x$g"; out+=$g
  done
  [[ ${#out} -eq 32 ]] || return 1
  printf '%s\n' "$out"
}

v6_in_cidr() { # ip cidr
  local ip=$1 cidr=$2 net bits a b n rem mask x y
  [[ $cidr == */* ]] || return 1
  net=${cidr%/*}; bits=${cidr#*/}
  [[ $bits =~ ^[0-9]{1,3}$ ]] && (( bits <= 128 )) || return 1
  a=$(v6_expand "$ip") || return 1
  b=$(v6_expand "$net") || return 1
  n=$(( bits / 4 )); rem=$(( bits % 4 ))
  [[ ${a:0:n} == "${b:0:n}" ]] || return 1
  if (( rem > 0 )); then
    x=${a:n:1}; y=${b:n:1}
    mask=$(( (0xF << (4 - rem)) & 0xF ))
    (( (0x$x & mask) == (0x$y & mask) )) || return 1
  fi
  return 0
}

# ── expected destinations / classification ─────────────────────────────────
declare -A IP_EXPECTED=()   # exact ip -> label (host:NAME / static / extra)
declare -A PTR_CACHE=()
declare -a STATIC_V4=() STATIC_V6=()
EXPECTED_HOSTNAMES=''
EXPECTED_RESOLVED=0
EXPECTED_HOSTNAME_COUNT=0
EXPECTED_UNRESOLVED=''

load_expected() {
  local f=$EXPECTED_FILE entry ip h
  [[ -r $f ]] || die "expected destinations file not readable: $f (set DSH_EGRESS_EXPECTED_FILE or --expected)"
  EXPECTED_FILE_ABS=$(CDPATH= cd -- "$(dirname -- "$f")" && pwd)/$(basename -- "$f")
  local -a hostnames=()
  while IFS= read -r entry; do
    [[ -z $entry ]] && continue
    if [[ $entry == */* ]]; then
      if [[ $entry == *:* ]]; then STATIC_V6+=("$entry"); else STATIC_V4+=("$entry"); fi
    elif [[ $entry =~ ^[0-9a-fA-F:.]+$ ]]; then
      IP_EXPECTED["${entry,,}"]='static'
    else
      hostnames+=("$entry")
    fi
  done < <(expected_lines)
  if ((${#hostnames[@]} == 0)) && [[ -n ${DSH_EGRESS_HOSTNAMES:-} ]]; then
    # fall back to the config list only when the file had no hostname entries
    local h2
    for h2 in $DSH_EGRESS_HOSTNAMES; do hostnames+=("$h2"); done
  fi
  for h in "${hostnames[@]}"; do
    local found=0
    while IFS= read -r ip; do
      [[ -z $ip ]] && continue
      ip=${ip,,}
      [[ $ip == ::ffff:* ]] && continue
      IP_EXPECTED["$ip"]="host:$h"
      found=1
      EXPECTED_RESOLVED=$((EXPECTED_RESOLVED + 1))
    done < <(getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u || true)
    (( found )) || EXPECTED_UNRESOLVED+="${EXPECTED_UNRESOLVED:+, }$h"
  done
  EXPECTED_HOSTNAME_COUNT=${#hostnames[@]}
  EXPECTED_HOSTNAMES=$(printf '%s ' "${hostnames[@]}")
  EXPECTED_HOSTNAMES=${EXPECTED_HOSTNAMES% }

  if [[ -n $ALLOW_IPS_FILE ]]; then
    [[ -r $ALLOW_IPS_FILE ]] || die "--allow-ips file not readable: $ALLOW_IPS_FILE"
    while IFS= read -r entry; do
      [[ -z $entry ]] && continue
      if [[ $entry == */* ]]; then
        if [[ $entry == *:* ]]; then STATIC_V6+=("$entry"); else STATIC_V4+=("$entry"); fi
      elif [[ $entry =~ ^[0-9a-fA-F:.]+$ ]]; then
        IP_EXPECTED["${entry,,}"]='extra'
      fi
    done < <(sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -- "$ALLOW_IPS_FILE" | grep -v '^$' || true)
  fi
}

# classify_ip <ip> -> sets MATCH_LABEL and EXPECTED_FLAG (1/0)
classify_ip() {
  local ip=${1,,} c
  MATCH_LABEL='unexpected'; EXPECTED_FLAG=0
  if [[ $ip == 127.* || $ip == ::1 ]]; then
    MATCH_LABEL='loopback'; EXPECTED_FLAG=1; return 0
  fi
  for c in "${STATIC_V4[@]:-}"; do
    [[ -n $c ]] || continue
    if v4_in_cidr "$ip" "$c"; then MATCH_LABEL="static:$c"; EXPECTED_FLAG=1; return 0; fi
  done
  for c in "${STATIC_V6[@]:-}"; do
    [[ -n $c ]] || continue
    if v6_in_cidr "$ip" "$c"; then MATCH_LABEL="static:$c"; EXPECTED_FLAG=1; return 0; fi
  done
  if [[ -n ${IP_EXPECTED[$ip]:-} ]]; then
    MATCH_LABEL=${IP_EXPECTED[$ip]}; EXPECTED_FLAG=1; return 0
  fi
  return 1
}

ptr_for() { # ip -> hostname or ''
  local ip=$1 out=''
  [[ $NO_PTR == 1 ]] && { printf '%s\n' ''; return 0; }
  if [[ -n ${PTR_CACHE[$ip]+x} ]]; then printf '%s\n' "${PTR_CACHE[$ip]}"; return 0; fi
  out=$(timeout 3 getent hosts "$ip" 2>/dev/null | awk 'NR==1{print $2}' || true)
  PTR_CACHE["$ip"]=$out
  printf '%s\n' "$out"
}

cdn_hint() { # ptr/hostname -> 1 if it looks like a CDN edge
  local s=${1,,}
  case $s in
    *cloudfront*|*cloudflare*|*akamai*|*fastly*|*googleusercontent*|*azureedge*|*edgekey*) printf '1' ;;
    *) printf '0' ;;
  esac
}

fmt_epoch() {
  local e=$1
  [[ $e =~ ^[0-9]+([.][0-9]+)?$ ]] || { printf '%s' '-'; return 0; }
  date -d "@${e%%.*}" '+%Y-%m-%dT%H:%M:%S%:z' 2>/dev/null || printf '%s' '-'
}

epoch_or_null() { # epoch-or-dash -> bare number for JSON, or null
  local e=${1-}
  if [[ $e =~ ^[0-9]+([.][0-9]+)?$ ]]; then printf '%s' "${e%%.*}"; else printf 'null'; fi
}

json_str() { # escape a JSON string value
  local s=${1-}
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  s=${s//$'\n'/ }
  printf '"%s"' "$s"
}

# ── nft counters (optional, root) ───────────────────────────────────────────
NFT_READABLE=0
NFT_NOTE=''
declare -a NFT_SET_LINES=()     # name|dst|packets|bytes
read_nft_counters() {
  local table=$DSH_EGRESS_TABLE set text flat body
  if ! command -v nft >/dev/null 2>&1 && [[ ! -x /usr/sbin/nft ]]; then
    NFT_NOTE='nft binary not found on this host'
    return 0
  fi
  local nft_bin
  nft_bin=${DSH_EGRESS_NFT:-/usr/sbin/nft}
  [[ -x $nft_bin ]] || nft_bin=$(command -v nft 2>/dev/null || true)
  [[ -n $nft_bin ]] || { NFT_NOTE='nft binary not found'; return 0; }
  if ! text=$("$nft_bin" list table inet "$table" 2>&1); then
    if grep -qi 'operation not permitted\|permission denied' <<<"$text"; then
      NFT_NOTE='nft counters need root (CAP_NET_ADMIN): re-run with sudo for exact per-destination counts'
    else
      NFT_NOTE="table inet $table is not loaded (run: sudo scripts/egress/observe.sh apply)"
    fi
    return 0
  fi
  NFT_READABLE=1
  for set in seen_v4 seen_v6; do
    body=$("$nft_bin" list set inet "$table" "$set" 2>/dev/null || true)
    [[ -n $body ]] || continue
    flat=$(printf '%s' "$body" | tr '\n' ' ')
    flat=$(sed -e 's/.*elements = {//' -e 's/}.*//' <<<"$flat")
    while IFS='|' read -r dst packets bytes; do
      [[ -n $dst ]] || continue
      NFT_SET_LINES+=("$set|$dst|$packets|$bytes")
    done < <(printf '%s\n' "$flat" | tr ',' '\n' | awk '
      { gsub(/^[ \t]+|[ \t]+$/, "");
        if ($0 == "") next;
        dst = $1; pk = 0; by = 0;
        for (i = 1; i <= NF; i++) {
          if ($i == "counter" && $(i+1) == "packets") pk = $(i+2);
          if ($i == "counter" && $(i+1) == "bytes") by = $(i+2);
          if ($i == "packets") pk = $(i+1);
          if ($i == "bytes") by = $(i+1);
        }
        printf "%s|%d|%d\n", dst, pk, by }')
  done
  [[ -n $NFT_NOTE ]] || NFT_NOTE="exact counters read from table inet $table (per-destination seen_* sets)"
}

# ── render ──────────────────────────────────────────────────────────────────
declare -a ROWS=()          # kind|dst|dpt|proto|events|first|last|iface
declare -a OBS_ROWS=() DENY_ROWS=()
declare -a UNEXPECTED=()
TOTAL_EVENTS=0
DEST_COUNT=0

build_report() {
  local row kind dst dpt proto events first last iface owner ptr match expected cdn
  ROWS=()
  OBS_ROWS=(); DENY_ROWS=(); UNEXPECTED=()
  TOTAL_EVENTS=0; DEST_COUNT=0
  local obs_count=0 obs_events=0 deny_count=0 deny_events=0 unexpected_count=0
  while IFS='|' read -r kind dst dpt proto events first last iface; do
    [[ -n $kind ]] || continue
    classify_ip "$dst" || true
    match=$MATCH_LABEL; expected=$EXPECTED_FLAG
    ptr=$(ptr_for "$dst")
    owner=${ptr:-}
    cdn=$(cdn_hint "$owner")
    TOTAL_EVENTS=$((TOTAL_EVENTS + events))
    if [[ $kind == deny ]]; then
      DENY_ROWS+=("$kind|$dst|$dpt|$proto|$events|$first|$last|$iface|$owner|$match|$expected|$cdn")
      deny_count=$((deny_count + 1)); deny_events=$((deny_events + events))
    else
      OBS_ROWS+=("$kind|$dst|$dpt|$proto|$events|$first|$last|$iface|$owner|$match|$expected|$cdn")
      obs_count=$((obs_count + 1)); obs_events=$((obs_events + events))
      if [[ $expected != 1 ]]; then
        unexpected_count=$((unexpected_count + 1))
        UNEXPECTED+=("${dst}${dpt:+:$dpt}")
      fi
    fi
    DEST_COUNT=$((DEST_COUNT + 1))
  done < <(aggregate_rows)
  OBS_DESTS=$obs_count; OBS_EVENTS=$obs_events
  DENY_DESTS=$deny_count; DENY_EVENTS=$deny_events
  UNEXPECTED_COUNT=$unexpected_count
}

report_status() {
  if (( LINE_COUNT == 0 )); then printf 'degraded'; return; fi
  if (( UNEXPECTED_COUNT > 0 || DENY_DESTS > 0 )); then printf 'alert'; return; fi
  printf 'ok'
}

# table cell for one row
row_owner() { # owner match cdn
  local owner=$1 match=$2 cdn=$3 out=${1:-'-'}
  [[ -z $owner ]] && out='-'
  [[ $cdn == 1 ]] && out+=" (CDN)"
  printf '%s' "$out"
}

row_expected() { # expected match
  if [[ $1 == 1 ]]; then printf 'yes (%s)' "$2"; else printf '**NO**'; fi
}

render_markdown() {
  local src_label='' scope table_state counters_line expected_line row kind dst dpt proto events first last iface owner match expected cdn i=0
  case ${SOURCE_KIND:-} in
    journal) src_label='journalctl -k -o short-unix (kernel log)' ;;
    dmesg) src_label='dmesg (kernel ring buffer) — timestamps unavailable' ;;
    file) src_label="fixture ${FIXTURE}" ;;
    *) src_label='?' ;;
  esac
  scope=$(target_description)
  if [[ $NFT_READABLE == 1 ]]; then
    table_state="present (counters readable)"
  elif [[ -n $NFT_NOTE ]]; then
    table_state="not readable: ${NFT_NOTE}"
  else
    table_state='unknown'
  fi
  counters_line="nft counters: ${table_state}"
  expected_line="expected list: ${EXPECTED_FILE_ABS:-$EXPECTED_FILE} (${EXPECTED_RESOLVED} IPs resolved from ${EXPECTED_HOSTNAME_COUNT} hostname(s)"
  expected_line+="${EXPECTED_UNRESOLVED:+, UNRESOLVED: $EXPECTED_UNRESOLVED})"

  local window
  if (( BOOT )); then
    window='current boot'
  elif [[ -n $UNTIL ]]; then
    window="since '${SINCE}' until '${UNTIL}'"
  else
    window="since '${SINCE}'"
  fi
  cat <<EOF
# DSH personal egress summary (M0 / D13: observe + alert, no deny list)

- **Generated:** $(timestamp_utc)
- **Window:** ${window}
- **Source:** ${src_label}
- **Matched kernel lines:** ${LINE_COUNT} (rate-limited by nft to ${DSH_EGRESS_LOG_RATE} burst ${DSH_EGRESS_LOG_BURST}; counts below are a lower bound)
- **Service scope:** ${scope} — every row is outbound traffic of the DSH personal service; no other host process is inspected
- **Ruleset:** table inet ${DSH_EGRESS_TABLE} — ${table_state}
- **${expected_line}**
- **Status:** $(report_status | tr '[:lower:]' '[:upper:]')

EOF

  if (( LINE_COUNT == 0 )); then
    cat <<EOF
## ⚠ Observation inactive

No \`${DSH_EGRESS_LOG_PREFIX}\` kernel log lines were found in this window, so no
egress can be reviewed. This is a **degraded** state (exit code 3), not a clean one.

1. Is the ruleset loaded?   \`sudo scripts/egress/observe.sh status\`
2. Load it:                 \`sudo scripts/egress/observe.sh apply\`
3. Is the target match fresh? Restarting the unit makes the stored cgroup id stale;
   re-run \`apply\` after any restart (or a restart hook).
4. Is the service actually making connections? \`sudo nft list table inet ${DSH_EGRESS_TABLE}\`

EOF
  fi

  cat <<EOF
## Destinations observed (${OBS_DESTS} destinations, ${OBS_EVENTS} logged events)

| # | destination | port/proto | events | first seen | last seen | owner (PTR) | expected |
|---:|---|---|---:|---|---|---|---|
EOF
  i=0
  for row in "${OBS_ROWS[@]:-}"; do
    [[ -n $row ]] || continue
    i=$((i + 1)); (( i <= TOP )) || break
    IFS='|' read -r kind dst dpt proto events first last iface owner match expected cdn <<<"$row"
    printf '| %d | `%s` | %s/%s | %d | %s | %s | %s | %s |\n' \
      "$i" "$dst" "${dpt:--}" "$proto" "$events" "$(fmt_epoch "$first")" "$(fmt_epoch "$last")" \
      "$(row_owner "$owner" "$match" "$cdn")" "$(row_expected "$expected" "$match")"
  done
  (( OBS_DESTS > TOP )) && printf '\n_Only the top %d rows are shown (--top %s)._\n' "$TOP" "$TOP"
  echo
  if (( UNEXPECTED_COUNT > 0 )); then
    cat <<EOF
## 🚨 Unexpected destinations (${UNEXPECTED_COUNT}) — ALERT

$(printf '%s\n' "${UNEXPECTED[@]}" | sed 's/^/- `/;s/$/`/')

Review each one before doing anything else. If it is expected, add it to
\`scripts/egress/expected-destinations.txt\` with a one-line justification in
\`research/m0-egress.md\` §8 — never just to silence the alert.

EOF
  fi

  if (( DENY_DESTS > 0 )); then
    cat <<EOF
## Deny events (${DENY_DESTS} destinations, ${DENY_EVENTS} events) — ALERT

These only appear if the **optional** deny artifact (\`allowlist.sh\`) is loaded.
D13 says M0 has no deny list, so this section must be empty in M0; a line here
means a deny-capable ruleset is active or an old table was left in place.

| # | destination | port/proto | events | first seen | last seen | owner (PTR) |
|---:|---|---|---:|---|---|---|
EOF
    i=0
    for row in "${DENY_ROWS[@]:-}"; do
      [[ -n $row ]] || continue
      i=$((i + 1)); (( i <= TOP )) || break
      IFS='|' read -r kind dst dpt proto events first last iface owner match expected cdn <<<"$row"
      printf '| %d | `%s` | %s/%s | %d | %s | %s | %s |\n' "$i" "$dst" "${dpt:--}" "$proto" "$events" "$(fmt_epoch "$first")" "$(fmt_epoch "$last")" "${owner:--}"
    done
    echo
  fi

  if (( NFT_READABLE )) && ((${#NFT_SET_LINES[@]} > 0)); then
    cat <<EOF
## Exact per-destination counters (nft \`seen_*\` sets, all packets)

| set | destination | packets | bytes |
|---|---|---:|---:|
EOF
    local line s d p b
    for line in "${NFT_SET_LINES[@]}"; do
      IFS='|' read -r s d p b <<<"$line"
      printf '| %s | `%s` | %s | %s |\n' "$s" "$d" "$p" "$b"
    done
    echo
  fi

  cat <<EOF
## Notes / caveats

- Kernel log lines are rate-limited at **${DSH_EGRESS_LOG_RATE} burst ${DSH_EGRESS_LOG_BURST}** per rule, so the
  event counts are a lower bound; the nft counters are exact when read as root.
- $( [[ ${DSH_EGRESS_IGNORE_LOOPBACK} == 1 ]] && printf 'Loopback traffic is not logged (DNS stub 127.0.0.53, local Hindsight/DSH web).' || printf 'Loopback traffic is included in the counts.' )
- Owners are reverse-DNS names, not credentials or URLs. No message bodies, headers or payloads are logged.
- $( [[ $NFT_READABLE == 1 ]] && printf 'nft counters read as root.' || printf 'Exact nft counters were not read (%s). Run `sudo %s summary` for them.' "${NFT_NOTE:-no root}" "$SCRIPT_NAME" )
- This report never writes host state; artifacts are plain files under the repo.
EOF
}

render_json() {
  local status exit_code row kind dst dpt proto events first last iface owner match expected cdn sep
  status=$(report_status)
  case $status in ok) exit_code=0 ;; alert) exit_code=2 ;; *) exit_code=3 ;; esac
  local entries='' deny_entries='' unexpected_json='' nft_json
  for row in "${OBS_ROWS[@]:-}"; do
    [[ -n $row ]] || continue
    IFS='|' read -r kind dst dpt proto events first last iface owner match expected cdn <<<"$row"
    sep=','
    if ((${#entries} == 0)); then sep=''; fi
    entries+="${sep}{\"dst\":$(json_str "$dst"),\"port\":${dpt:--1},\"proto\":$(json_str "$proto"),\"events\":${events},\"first_seen\":$(json_str "$(fmt_epoch "$first")"),\"last_seen\":$(json_str "$(fmt_epoch "$last")"),\"first_seen_epoch\":$(epoch_or_null "$first"),\"last_seen_epoch\":$(epoch_or_null "$last"),\"owner\":$(json_str "$owner"),\"expected\":$( [[ $expected == 1 ]] && printf true || printf false ),\"match\":$(json_str "$match"),\"cdn\":$( [[ $cdn == 1 ]] && printf true || printf false ),\"source\":\"observe\"}"
  done
  for row in "${DENY_ROWS[@]:-}"; do
    [[ -n $row ]] || continue
    IFS='|' read -r kind dst dpt proto events first last iface owner match expected cdn <<<"$row"
    sep=','
    ((${#deny_entries} == 0)) && sep=''
    deny_entries+="${sep}{\"dst\":$(json_str "$dst"),\"port\":${dpt:--1},\"proto\":$(json_str "$proto"),\"events\":${events},\"first_seen\":$(json_str "$(fmt_epoch "$first")"),\"last_seen\":$(json_str "$(fmt_epoch "$last")"),\"owner\":$(json_str "$owner"),\"source\":\"deny\"}"
  done
  if ((${#UNEXPECTED[@]} == 0)); then unexpected_json='[]'; else
    local u sep2=''
    unexpected_json='['
    for u in "${UNEXPECTED[@]}"; do unexpected_json+="${sep2}$(json_str "$u")"; sep2=','; done
    unexpected_json+=']'
  fi
  local sets_json='['
  local line s d p b sep3=''
  for line in "${NFT_SET_LINES[@]:-}"; do
    [[ -n $line ]] || continue
    IFS='|' read -r s d p b <<<"$line"
    sets_json+="${sep3}{\"set\":$(json_str "$s"),\"dst\":$(json_str "$d"),\"packets\":${p:-0},\"bytes\":${b:-0}}"
    sep3=','
  done
  sets_json+=']'
  if [[ $NFT_READABLE == 1 ]]; then
    nft_json="{\"readable\":true,\"note\":$(json_str "${NFT_NOTE}"),\"sets\":${sets_json}}"
  else
    nft_json="{\"readable\":false,\"reason\":$(json_str "${NFT_NOTE:-not read}"),\"sets\":[]}"
  fi

  cat <<EOF
{
  "schema_version": "m0-egress-summary-v1",
  "generated_at": $(json_str "$(timestamp_utc)"),
  "status": $(json_str "$status"),
  "exit_code": ${exit_code},
  "window": {"since": $(json_str "$SINCE"), "until": $(json_str "${UNTIL:-now}"), "boot": $( ((BOOT)) && printf true || printf false )},
  "source": {"kind": $(json_str "${SOURCE_KIND:-unknown}"), "lines_matched": ${LINE_COUNT}, "rate_limited": true, "log_prefix": $(json_str "${DSH_EGRESS_LOG_PREFIX}")},
  "target": {"mode": $(json_str "${DSH_EGRESS_TARGET_MODE}"), "description": $(json_str "$(target_description)"), "cgroup_path": $(json_str "${DSH_EGRESS_CGROUP_PATH}"), "cgroup_level": ${DSH_EGRESS_CGROUP_LEVEL}, "service_user": $(json_str "${DSH_EGRESS_SERVICE_USER}")},
  "table": {"name": $(json_str "inet ${DSH_EGRESS_TABLE}"), "present": $( [[ $NFT_READABLE == 1 ]] && printf true || printf false )},
  "expected": {"file": $(json_str "${EXPECTED_FILE_ABS:-$EXPECTED_FILE}"), "hostnames": $(json_str "$EXPECTED_HOSTNAMES"), "hostname_count": ${EXPECTED_HOSTNAME_COUNT}, "resolved_ips": ${EXPECTED_RESOLVED}, "unresolved": $(json_str "$EXPECTED_UNRESOLVED")},
  "counts": {"destinations": ${OBS_DESTS}, "events": ${OBS_EVENTS}, "unexpected_destinations": ${UNEXPECTED_COUNT}, "denied_destinations": ${DENY_DESTS}, "deny_events": ${DENY_EVENTS}},
  "destinations": [${entries}],
  "denied": [${deny_entries}],
  "unexpected": ${unexpected_json},
  "nft_counters": ${nft_json},
  "notes": [
    "kernel log lines are rate-limited: event counts are a lower bound",
    "loopback is excluded from observation by default (DSH_EGRESS_IGNORE_LOOPBACK=1)",
    "an unexpected destination is an ALERT (D13: no deny list; this is the compensating control)"
  ]
}
EOF
}

render_tsv() {
  local row kind dst dpt proto events first last iface owner match expected cdn
  {
    printf 'kind\tdst\tport\tproto\tevents\tfirst_seen\tlast_seen\towner\texpected\tmatch\tcdn\n'
    for row in "${OBS_ROWS[@]:-}" "${DENY_ROWS[@]:-}"; do
      [[ -n $row ]] || continue
      IFS='|' read -r kind dst dpt proto events first last iface owner match expected cdn <<<"$row"
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$kind" "$dst" "${dpt:--}" "$proto" "$events" "$(fmt_epoch "$first")" "$(fmt_epoch "$last")" "$owner" "$expected" "$match" "$cdn"
    done
  } >"$TSV_FILE"
  info "TSV written to $TSV_FILE"
}

# ── main ────────────────────────────────────────────────────────────────────
cmd_summary() {
  parse_args "$@"
  collect_lines
  load_expected
  build_report
  read_nft_counters

  local rendered
  if [[ $JSON == 1 ]]; then rendered=$(render_json); else rendered=$(render_markdown); fi

  if [[ -n $TSV_FILE ]]; then render_tsv; fi

  if (( WRITE_ARTIFACTS )); then
    local dir=$ARTIFACT_DIR
    [[ $dir = /* ]] || dir=$REPO_ROOT/$dir
    mkdir -p "$dir"
    local tj tm
    tj=$(mktemp "$dir/.egress-summary.XXXXXX.json")
    tm=$(mktemp "$dir/.egress-summary.XXXXXX.md")
    render_json >"$tj"
    render_markdown >"$tm"
    mv -f "$tj" "$dir/egress-summary.json"
    mv -f "$tm" "$dir/egress-summary.md"
    info "artifacts written: $dir/egress-summary.json, $dir/egress-summary.md"
  fi

  if [[ -n $OUT_FILE ]]; then
    printf '%s\n' "$rendered" >"$OUT_FILE"
    info "report written to $OUT_FILE"
  else
    printf '%s\n' "$rendered"
  fi

  local status
  status=$(report_status)
  case $status in
    ok) info "status: ok — all observed destinations are expected"; exit 0 ;;
    alert)
      if (( UNEXPECTED_COUNT > 0 )); then
        warn "status: ALERT — ${UNEXPECTED_COUNT} unexpected destination(s): ${UNEXPECTED[*]}"
      fi
      if (( DENY_DESTS > 0 )); then
        warn "status: ALERT — ${DENY_DESTS} DSH-EGRESS-DENY destination(s): a deny-capable ruleset is loaded (must not be in M0/D13)"
      fi
      if (( LENIENT )); then
        info "lenient mode: exiting 0"
        exit 0
      fi
      exit 2 ;;
    degraded)
      warn "status: DEGRADED — observation inactive: no '${DSH_EGRESS_LOG_PREFIX}' kernel log lines in the window"
      info "fix: sudo scripts/egress/observe.sh status   then   sudo scripts/egress/observe.sh apply"
      (( ALLOW_EMPTY )) && { info "allow-empty: exiting 0"; exit 0; }
      exit 3 ;;
  esac
}

cmd_journal() {
  parse_args "$@"
  collect_lines
  printf '%s\n' "$LINES"
  info "${LINE_COUNT} matching kernel log line(s) from ${SOURCE_KIND:-?}"
}

cmd=${1:-summary}
shift || true
case $cmd in
  summary|report) cmd_summary "$@" ;;
  journal|lines)  cmd_journal "$@" ;;
  help|-h|--help) usage ;;
  *) die "unknown subcommand '$cmd' (try: $SCRIPT_NAME help)" ;;
esac
