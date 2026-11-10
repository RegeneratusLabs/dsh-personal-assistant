#!/usr/bin/env bash
# lib.sh — shared helpers for scripts/egress/*.sh
#
# Sourced by the four scripts in this directory; never executed directly.
# Callers must set SCRIPT_DIR and source egress.conf before sourcing this file.
# Nothing in here changes host state except through apply_ruleset_file() /
# remove_table() / run_nft_apply(), which are only reached from `apply`/`remove`
# subcommands that first call require_root().

# ── output ──────────────────────────────────────────────────────────────────
info() { printf '[%s] %s\n' "${DSH_EGRESS_TAG:-egress}" "$*" >&2; }
warn() { printf '[%s] WARNING: %s\n' "${DSH_EGRESS_TAG:-egress}" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "${DSH_EGRESS_TAG:-egress}" "$*" >&2; exit 1; }

is_root() { [[ ${EUID:-$(id -u)} -eq 0 ]]; }

# require_root <action> — refuse host-changing subcommands when not root.
require_root() {
  local action=${1:-apply}
  is_root && return 0
  cat >&2 <<EOF
[${DSH_EGRESS_TAG:-egress}] ERROR: '$action' changes host firewall state and requires root.
  This repo ships apply-ready scripts only: NOTHING is applied unless the human
  runs the apply/remove subcommand with sudo. Non-root modes (print / dry-run /
  resolution preview) are always available and never touch the host.

  Typical sequence (review each printed ruleset before applying):
      scripts/egress/${SCRIPT_NAME:-observe.sh} print            # dry run (no root)
      scripts/egress/${SCRIPT_NAME:-observe.sh} check            # nft -c (root best)
      sudo scripts/egress/${SCRIPT_NAME:-observe.sh} apply       # host change
  Rollback for everything in this tooling:
      sudo nft delete table inet ${DSH_EGRESS_TABLE}
EOF
  exit 3
}

# ── nft binary ──────────────────────────────────────────────────────────────
NFT_BIN=''
nft_init() {
  [[ -n $NFT_BIN ]] && return 0
  if [[ -n ${DSH_EGRESS_NFT:-} ]]; then
    NFT_BIN=$DSH_EGRESS_NFT
  else
    local c
    for c in /usr/sbin/nft /sbin/nft; do
      if [[ -x $c ]]; then NFT_BIN=$c; break; fi
    done
    [[ -n $NFT_BIN ]] || NFT_BIN=$(command -v nft 2>/dev/null || true)
  fi
  [[ -n $NFT_BIN && -x $NFT_BIN ]] || die "nftables 'nft' binary not found (install nftables or set DSH_EGRESS_NFT)"
  info "using nft: $NFT_BIN ($("$NFT_BIN" --version 2>/dev/null | head -n1))"
}

# ── target description (who is filtered) ────────────────────────────────────
cgroup_depth() { # path -> number of components (root = 0, so this is the level)
  local p=${1#/}
  p=${p%/}
  awk -F/ '{print NF}' <<<"$p"
}

service_uid() {
  local uid=${DSH_EGRESS_SERVICE_UID:-}
  if [[ -z $uid ]]; then
    local user=${DSH_EGRESS_SERVICE_USER:?DSH_EGRESS_SERVICE_USER is not set}
    uid=$(getent passwd "$user" 2>/dev/null | cut -d: -f3 || true)
    [[ -n $uid ]] || die "service user '$user' not found (getent passwd)"
  fi
  [[ $uid =~ ^[0-9]+$ ]] || die "invalid service uid '$uid'"
  printf '%s\n' "$uid"
}

# target_match_expr — the single nft match expression that scopes the chain.
#   cgroup mode: socket cgroupv2 level <N> "<path>"   (resolved at load time)
#   uid mode:    meta skuid <uid>
target_match_expr() {
  case ${DSH_EGRESS_TARGET_MODE:-cgroup} in
    cgroup)
      local path=${DSH_EGRESS_CGROUP_PATH#/}
      path=${path%/}
      [[ -n $path ]] || die "DSH_EGRESS_CGROUP_PATH is empty"
      local depth wanted
      depth=$(cgroup_depth "$path")
      wanted=${DSH_EGRESS_CGROUP_LEVEL:-$depth}
      [[ $wanted =~ ^[0-9]+$ ]] || die "DSH_EGRESS_CGROUP_LEVEL must be numeric (got '$wanted')"
      if (( wanted != depth )); then
        die "DSH_EGRESS_CGROUP_LEVEL=$wanted does not match the $depth path components of '$path'
  nft resolves this path to a cgroup id at load time and the kernel reports the
  ancestor at level $wanted, so the two must agree — refusing to generate a rule
  that could silently never match."
      fi
      printf 'socket cgroupv2 level %d "%s"' "$depth" "$path"
      ;;
    uid)
      printf 'meta skuid %s' "$(service_uid)"
      ;;
    *)
      die "DSH_EGRESS_TARGET_MODE must be 'cgroup' or 'uid' (got '${DSH_EGRESS_TARGET_MODE:-}')"
      ;;
  esac
}

target_description() {
  case ${DSH_EGRESS_TARGET_MODE:-cgroup} in
    cgroup) printf 'cgroup %s (level %s)' "${DSH_EGRESS_CGROUP_PATH}" "$(cgroup_depth "${DSH_EGRESS_CGROUP_PATH}")" ;;
    uid)    printf 'uid %s (user %s)' "$(service_uid)" "${DSH_EGRESS_SERVICE_USER}" ;;
  esac
}

# validate_target — fail early with an actionable message when the target does
# not exist. `socket cgroupv2` paths are resolved by nft when the ruleset is
# loaded, so the unit cgroup must exist before `apply`/`check`.
validate_target() {
  case ${DSH_EGRESS_TARGET_MODE:-cgroup} in
    cgroup)
      local cg=/sys/fs/cgroup/${DSH_EGRESS_CGROUP_PATH#/}
      if [[ ! -d $cg ]]; then
        die "target cgroup does not exist: $cg
  nft resolves 'socket cgroupv2' paths at load time, and systemd removes a
  service cgroup when the unit stops — start the unit first, then re-run.
      systemctl --user status dsh-personal.service
      ls -d $cg"
      fi
      info "target: $(target_description)"
      ;;
    uid)
      info "target: $(target_description)"
      ;;
  esac
}

# ── nft query/apply helpers (root only; never called from print modes) ──────
table_exists() {
  nft_init
  "$NFT_BIN" list table inet "$DSH_EGRESS_TABLE" >/dev/null 2>&1
}

# apply_ruleset_file <file> — replace table inet <TABLE> with the file contents.
# Two netlink transactions (delete-if-present, then load); the window without a
# policy is milliseconds and is documented in research/m0-egress.md.
apply_ruleset_file() {
  local file=$1
  nft_init
  if table_exists; then
    info "replacing existing table inet $DSH_EGRESS_TABLE"
    "$NFT_BIN" delete table inet "$DSH_EGRESS_TABLE" \
      || die "could not delete the existing table; nothing was loaded"
  fi
  if ! "$NFT_BIN" -f "$file"; then
    die "nft -f failed; table inet $DSH_EGRESS_TABLE is now ABSENT.
  Clean up / retry:
      sudo nft list ruleset | grep -A5 $DSH_EGRESS_TABLE
      sudo nft delete table inet $DSH_EGRESS_TABLE   # if a partial table exists
      sudo scripts/egress/${SCRIPT_NAME:-observe.sh} apply"
  fi
  info "loaded table inet $DSH_EGRESS_TABLE"
}

remove_table() {
  nft_init
  if ! table_exists; then
    info "table inet $DSH_EGRESS_TABLE is not present — nothing to remove"
    return 0
  fi
  "$NFT_BIN" delete table inet "$DSH_EGRESS_TABLE"
  info "removed table inet $DSH_EGRESS_TABLE (egress is unobserved again)"
}

# check_ruleset_file <file> — `nft -c` dry run.
# Returns 0 = passed, 2 = non-root limitation (grammar OK, kernel check skipped),
# exits 1 on a real rejection. Never writes anything.
check_ruleset_file() {
  local file=$1 out rc=0
  nft_init
  out=$("$NFT_BIN" -c -f "$file" 2>&1) || rc=$?
  if [[ -n $out ]]; then printf '%s\n' "$out" >&2; fi
  if (( rc == 0 )); then
    info "nft -c: ruleset parsed and accepted by the kernel check path"
    return 0
  fi
  if grep -qiE 'operation not permitted|cache initialization failed' <<<"$out" \
     && ! grep -qiE 'syntax error|unknown (set|symbol|chain|table)|invalid' <<<"$out"; then
    warn "nft -c needs root/CAP_NET_ADMIN to run its kernel check: it reported a"
    warn "permission limit, NOT a syntax problem. Grammar parsing passed; nothing"
    warn "was applied (nft -c never commits). Re-run as root for a full check."
    return 2
  fi
  die "nft -c rejected the generated ruleset (errors above); nothing was applied"
}

# target_freshness — is the LOADED rule still pointing at the live target?
#   missing | fresh | stale
# In cgroup mode nft prints the resolved path when the stored cgroup id still
# belongs to that cgroup; when systemd recreates the unit cgroup (any restart)
# the id is stale and nft falls back to printing a bare numeric id.
target_freshness() {
  nft_init
  table_exists || { printf 'missing\n'; return 0; }
  local dump line sys_uid
  dump=$("$NFT_BIN" list chain inet "$DSH_EGRESS_TABLE" output 2>/dev/null || true)
  case ${DSH_EGRESS_TARGET_MODE:-cgroup} in
    cgroup)
      line=$(grep -E 'socket cgroupv2 level [0-9]+' <<<"$dump" | head -n1 || true)
      [[ -n $line ]] || { printf 'stale\n'; return 0; }
      if grep -qF "\"${DSH_EGRESS_CGROUP_PATH#/}\"" <<<"$line"; then
        printf 'fresh\n'
      else
        printf 'stale\n'
      fi
      ;;
    uid)
      sys_uid=$(service_uid)
      if grep -qE "meta skuid ${sys_uid}( |\$)" <<<"$dump"; then printf 'fresh\n'; else printf 'stale\n'; fi
      ;;
  esac
}

# ── expected-destinations file ──────────────────────────────────────────────
# expected_lines — non-comment, trimmed entries (hostnames and IPs/CIDRs mixed).
expected_lines() {
  local f=${DSH_EGRESS_EXPECTED_FILE:-$SCRIPT_DIR/expected-destinations.txt}
  [[ -r $f ]] || die "expected destinations file is not readable: $f (set DSH_EGRESS_EXPECTED_FILE)"
  sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -- "$f" | grep -v '^$' || true
}

# expected_hostnames — hostname entries only (no '/', not an address).
expected_hostnames() {
  expected_lines | awk '!/\// && $0 !~ /^[0-9a-fA-F:.]+$/ { print }'
}

# expected_static_entries — IP/CIDR entries only.
expected_static_entries() {
  expected_lines | awk '/\// || $0 ~ /^[0-9a-fA-F:.]+$/ { print }'
}

# ── temp files ──────────────────────────────────────────────────────────────
# Temp files are registered here and removed by an EXIT trap set when this lib is
# sourced. Scripts must NOT set their own EXIT trap afterwards.
TMP_FILES=()
_tmp_cleanup() {
  local f
  if (( ${#TMP_FILES[@]} == 0 )); then return 0; fi
  for f in "${TMP_FILES[@]}"; do
    if [[ -n $f ]]; then rm -f -- "$f" || true; fi
  done
  return 0
}
trap '_tmp_cleanup' EXIT

# new_tmp <template> — sets TMP_FILE in the CURRENT shell (no command
# substitution: an array append inside $(...) would be lost in the subshell).
new_tmp() { # $1 = mktemp -t template
  TMP_FILE=$(mktemp -t "${1:-dsh-egress.XXXXXX}")
  TMP_FILES+=("$TMP_FILE")
}

# ── misc ────────────────────────────────────────────────────────────────────
timestamp_utc() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

require_conf() {
  [[ -r $CONF ]] || die "config not found: $CONF (copy the whole scripts/egress/ directory, or set DSH_EGRESS_CONF)"
}
