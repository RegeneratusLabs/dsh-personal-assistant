#!/usr/bin/env bash
# dsh-restore-drill.sh — M0 restore drill: prove a backup boots and serves.
#
# Repo artifact. Runs entirely in a throwaway DSH home and a throwaway port:
#   * NEVER touches the live service (127.0.0.1:7002), its unit, or its DSH home
#   * NEVER runs sudo/systemctl/nft/useradd/chown; no host-state change
#   * NEVER touches ~/.hermes; Hindsight import is deliberately out of scope
#   * NEVER prints the launch token; the raw boot log is deleted on cleanup
#
# Pipeline:
#   1. preflight  — backup integrity (sha256sum -c, gzip), port free, paths safe
#   2. restore    — extract the tarball into $DRILL_ROOT/<ts>
#   3. rebase     — rewrite the old DSH home path to the scratch home (profiles,
#                   sessions, storages) and relink profile node_modules symlinks
#   4. evidence   — profile/workspace/sessions/storages present; counts vs manifest;
#                   Hindsight bank `dsh-personal` export present (M0-D13, shared :9177;
#                   absent today → WARN unless --require-hindsight, which fails)
#   5. boot       — DSH_HOME=<scratch> dsh --profile personal --host 127.0.0.1
#                   --port <drill port> --no-open --trusted-host … for bounded time
#   6. serve      — expect HTTP (401 = fence up; tokenized URL = 200 UI)
#   7. teardown   — SIGTERM/SIGKILL only the drill PID, confirm the port is free,
#                   remove the scratch home (unless --keep)
#   8. PASS/FAIL  — per-check evidence + timings; exit 0 only when every check passed
#
# Usage:
#   scripts/backup/dsh-restore-drill.sh [options]
#
# Options:
#   -h, --help             this text
#   --backup DIR           backup dir to restore (default: newest under BACKUP_ROOT/daily)
#   --scratch-home DIR     restore target (default: $DRILL_ROOT/<utc timestamp>)
#   --port N               drill port (default 7009; 7002/7000 are refused)
#   --keep                 keep the scratch home and the redacted boot log
#   --allow-empty          do not fail when the backup has zero sessions
#   --require-hindsight    fail when the backup has no Hindsight bank export (post-bank gate)
#
# Environment:
#   BACKUP_ROOT            default "$HOME/backups/dsh-personal"
#   DRILL_ROOT             default /tmp/dsh-restore-drill
#   DRILL_PORT=7009        drill listen port
#   LIVE_PORT=7002         live personal port that must never be touched
#   BOOT_TIMEOUT_SECONDS=60
#   DSH_BIN                default /home/josh/dsh/node/bin/dsh
#   PROFILE=personal
#   REQUIRE_HINDSIGHT=0    same as --require-hindsight
#
# Exit codes: 0 PASS, 1 FAIL (a check failed), 2 bad usage/preflight.
#
# Runbook + expected evidence: research/m0-backup-restore.md
#
set -euo pipefail
umask 077
IFS=$'\n\t'

SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd -- "${SELF_DIR}/../.." && pwd)

# ── configuration ────────────────────────────────────────────────────────────
BACKUP_ROOT=${BACKUP_ROOT:-${HOME}/backups/dsh-personal}
DRILL_ROOT=${DRILL_ROOT:-/tmp/dsh-restore-drill}
DRILL_PORT=${DRILL_PORT:-7009}
LIVE_PORT=${LIVE_PORT:-7002}
BOOT_TIMEOUT_SECONDS=${BOOT_TIMEOUT_SECONDS:-60}
DSH_BIN=${DSH_BIN:-/home/josh/dsh/node/bin/dsh}
PROFILE=${PROFILE:-personal}
ALLOW_EMPTY=${ALLOW_EMPTY:-0}
REQUIRE_HINDSIGHT=${REQUIRE_HINDSIGHT:-0}
KEEP=0

BACKUP_DIR=''
SCRATCH_HOME=''
ORIG_HOME=''
DRILL_PID=''
BOOT_LOG=''
BOOT_LOG_REDACTED=''
COOKIE_JAR=''
TARBALL=''
EXTRACT_MS=0
BOOT_MS=0
TOTAL_START_MS=0
CLEANED=0

CHECK_NAMES=()
CHECK_STATUS=()
CHECK_DETAILS=()

# ── output helpers ───────────────────────────────────────────────────────────
now_ms() { date +%s%3N; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() { printf '%s %s\n' "$(now_iso)" "$*" >&2; }
die() { local msg=$1 code=${2:-2}; log "ERROR: $msg"; exit "$code"; }

record() { # record pass|fail|warn|info "name" "detail"
  local status=$1 name=$2 detail=${3:-}
  CHECK_STATUS+=("$status")
  CHECK_NAMES+=("$name")
  CHECK_DETAILS+=("$detail")
  case $status in
    pass) printf 'PASS  %s%s\n' "$name" "${detail:+ — $detail}" ;;
    fail) printf 'FAIL  %s%s\n' "$name" "${detail:+ — $detail}" ;;
    warn) printf 'WARN  %s%s\n' "$name" "${detail:+ — $detail}" ;;
    *) printf 'INFO  %s%s\n' "$name" "${detail:+ — $detail}" ;;
  esac
}

usage() { sed -n '3,50p' "${BASH_SOURCE[0]}" | sed -n '/^# /p' | sed 's/^# \{0,1\}//'; }

# ── configuration resolution ─────────────────────────────────────────────────
# An inherited DSH_HOME pointing at ~/.dsh is the agent session home, not the
# personal one; it is ignored here for the same reason as in dsh-backup.sh.
resolve_dsh_home() {
  if [[ -n ${DSH_PERSONAL_HOME:-} ]]; then
    printf '%s' "${DSH_PERSONAL_HOME%/}"
    return 0
  fi
  if [[ -n ${DSH_HOME:-} && ${DSH_HOME%/} != "${HOME}/.dsh" ]]; then
    printf '%s' "${DSH_HOME%/}"
    return 0
  fi
  printf '%s' "${HOME}/.dsh-personal"
}

port_in_use() {
  # awk reads the whole `ss` stream, so `pipefail` cannot be tripped by SIGPIPE.
  ss -ltn 2>/dev/null | awk -v p=":$1" 'index($4, p) == length($4) - length(p) + 1 { found = 1 } END { exit !found }'
}

http_code() {
  curl -sS -m 3 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || printf '000'
}

# ── safety guards ────────────────────────────────────────────────────────────
assert_safe_scratch() {
  local p=$1 root live
  root=$(realpath -m -- "$DRILL_ROOT")
  live=$(realpath -m -- "$(resolve_dsh_home)")
  p=$(realpath -m -- "$p")
  case $p in
    "$root"/*) ;;
    /tmp/*) ;;
    *) die "refusing scratch home outside '$root' or /tmp: $p" 2 ;;
  esac
  [[ $p != '/' ]] || die "refusing scratch home '/'" 2
  [[ $p != "${HOME}" ]] || die "refusing to restore over \$HOME" 2
  [[ $p != "$live" && $p != "$live"/* ]] || die "refusing to restore over the live DSH home: $p" 2
  [[ -n ${BACKUP_DIR:-} && $p != "$(realpath -m -- "$BACKUP_DIR")"* ]] || die "refusing scratch home inside the backup dir" 2
}

assert_no_sed_metachars() {
  local p=$1 label=$2
  if [[ $p == *'#'* || $p == *'&'* || $p == *'\'* ]]; then
    die "$label path contains sed metacharacters (# & \\); refusing to rebase: $p" 2
  fi
}

# ── preflight ────────────────────────────────────────────────────────────────
resolve_backup() {
  local arg=$1 newest
  if [[ -n $arg ]]; then
    BACKUP_DIR=$(cd -- "$arg" 2>/dev/null && pwd) || die "backup dir '$arg' not found" 2
    return 0
  fi
  [[ -d ${BACKUP_ROOT}/daily ]] || die "no backups under ${BACKUP_ROOT}/daily; run dsh-backup.sh first" 2
  newest=$(find "${BACKUP_ROOT}/daily" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort | tail -n 1)
  if [[ -z $newest ]]; then
    newest=$(find "${BACKUP_ROOT}/weekly" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort | tail -n 1)
    [[ -n $newest ]] || die "no backups found under ${BACKUP_ROOT}" 2
    BACKUP_DIR="${BACKUP_ROOT}/weekly/${newest}"
  else
    BACKUP_DIR="${BACKUP_ROOT}/daily/${newest}"
  fi
}

preflight() {
  command -v jq >/dev/null || die 'jq is required' 2
  command -v curl >/dev/null || die 'curl is required' 2
  command -v tar >/dev/null || die 'tar is required' 2
  command -v sha256sum >/dev/null || die 'sha256sum is required' 2
  [[ -x $DSH_BIN ]] || die "DSH binary '$DSH_BIN' is not executable" 2

  resolve_backup "$1"
  [[ -f ${BACKUP_DIR}/manifest.json ]] || die "no manifest.json in '$BACKUP_DIR'" 2
  TARBALL=$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.tar.gz' -print -quit 2>/dev/null || true)
  [[ -n $TARBALL ]] || die "no *.tar.gz in '$BACKUP_DIR'" 2

  # drill port must exist only on loopback and must not collide with live/GUI ports
  [[ $DRILL_PORT =~ ^[0-9]+$ ]] || die "DRILL_PORT must be numeric: '$DRILL_PORT'" 2
  if [[ $DRILL_PORT == "$LIVE_PORT" || $DRILL_PORT == 7000 ]]; then
    die "refusing drill port $DRILL_PORT (live personal=$LIVE_PORT, GUI=7000); use e.g. 7009" 2
  fi
  if port_in_use "$DRILL_PORT"; then
    die "drill port $DRILL_PORT is already in use; pick another with --port" 2
  fi

  ORIG_HOME=$(jq -r '.dsh.home // empty' "${BACKUP_DIR}/manifest.json" 2>/dev/null || true)
  [[ -n $ORIG_HOME ]] || ORIG_HOME=$(resolve_dsh_home)

  if [[ -n $SCRATCH_HOME ]]; then
    SCRATCH_HOME=$(realpath -m -- "$SCRATCH_HOME")
    if [[ -d $SCRATCH_HOME ]] && [[ -n $(find "$SCRATCH_HOME" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true) ]]; then
      die "scratch home '$SCRATCH_HOME' already exists and is not empty; choose a fresh path" 2
    fi
  else
    SCRATCH_HOME=$(realpath -m -- "${DRILL_ROOT}/$(date -u +%Y%m%dT%H%M%SZ)")
  fi
  assert_safe_scratch "$SCRATCH_HOME"
  assert_no_sed_metachars "$ORIG_HOME" 'original DSH home'

  printf 'backup    : %s\n' "$BACKUP_DIR"
  printf 'scratch   : %s\n' "$SCRATCH_HOME"
  printf 'drill port: %s (live port %s is never touched)\n' "$DRILL_PORT" "$LIVE_PORT"
  printf 'original  : %s\n' "$ORIG_HOME"
}

# ── restore ──────────────────────────────────────────────────────────────────
verify_backup_integrity() {
  local fail=0
  if (cd "$BACKUP_DIR" && sha256sum -c --quiet SHA256SUMS >/dev/null 2>&1); then
    record pass 'backup sha256sum -c SHA256SUMS'
  else
    record fail 'backup sha256sum -c SHA256SUMS'
    fail=1
  fi
  if gzip -t -- "$TARBALL" 2>/dev/null; then
    record pass 'backup gzip integrity'
  else
    record fail 'backup gzip integrity'
    fail=1
  fi
  ((fail == 0))
}

extract_backup() {
  local t0 t1
  mkdir -p -- "$SCRATCH_HOME"
  chmod 700 -- "$SCRATCH_HOME"
  t0=$(now_ms)
  if ! tar -xzf "$TARBALL" -C "$SCRATCH_HOME" 2>/dev/null; then
    record fail 'tarball extraction'
    return 1
  fi
  t1=$(now_ms)
  EXTRACT_MS=$((t1 - t0))
  chmod 600 -- "${SCRATCH_HOME}/.credentials.yaml" 2>/dev/null || true
  if [[ -d ${SCRATCH_HOME}/.credentials.yaml ]]; then
    record fail '.credentials.yaml restored as a file'
    return 1
  fi
  record pass 'tarball extraction' "${EXTRACT_MS} ms"
}

rebase_paths() {
  local count=0 relinked=0 link target orig f
  local -a cells=()
  if [[ -n $ORIG_HOME && $ORIG_HOME != "$SCRATCH_HOME" ]]; then
    mapfile -t cells < <(grep -rlI -- "$ORIG_HOME" "$SCRATCH_HOME" 2>/dev/null || true)
    for f in "${cells[@]}"; do
      sed -i "s#${ORIG_HOME}#${SCRATCH_HOME}#g" -- "$f"
      count=$((count + 1))
    done
  fi
  record pass 'restored paths rebased to scratch home' "${count} text files"

  # Profile bundles linked with relative paths break when the home moves.
  # Re-point each broken symlink at the same target under the ORIGINAL home,
  # when that target still exists on this machine (drill runs on the source host).
  if [[ -d ${SCRATCH_HOME}/profiles && -d $ORIG_HOME ]]; then
    while IFS= read -r link; do
      [[ -L $link ]] || continue
      [[ -e $link ]] && continue
      orig="${ORIG_HOME}/${link#"$SCRATCH_HOME"/}"
      target=$(readlink -f -- "$orig" 2>/dev/null || true)
      if [[ -n $target && -e $target ]]; then
        ln -sfn -- "$target" "$link"
        relinked=$((relinked + 1))
      fi
    done < <(find "${SCRATCH_HOME}/profiles" -type l 2>/dev/null || true)
    record pass 'profile bundle symlinks relinked' "$relinked relinked"
  else
    record warn 'profile bundle symlinks relinked' 'original home absent; run dsh plugin --profile personal install if boot complains'
  fi
}

count_files() { find "$1" -type f -printf '.' 2>/dev/null | wc -c | tr -d ' '; }

check_restored_data() {
  local sessions storages workspace expected_sessions expected_storages expected_workspace fail=0
  [[ -d ${SCRATCH_HOME}/profiles/${PROFILE} ]] && record pass "profile restored: profiles/${PROFILE}" \
    || { record fail "profile restored: profiles/${PROFILE}"; fail=1; }
  [[ -f ${SCRATCH_HOME}/cordis.patch.yml ]] && record pass 'home patch restored: cordis.patch.yml' \
    || { record fail 'home patch restored: cordis.patch.yml'; fail=1; }
  if [[ -f ${SCRATCH_HOME}/.credentials.yaml ]]; then
    local mode
    mode=$(stat -c %a -- "${SCRATCH_HOME}/.credentials.yaml")
    if [[ $mode == 600 ]]; then record pass '.credentials.yaml restored 0600'
    else record fail '.credentials.yaml restored mode' "$mode"; fail=1; fi
  else
    record fail '.credentials.yaml restored'; fail=1
  fi

  sessions=$(count_files "${SCRATCH_HOME}/sessions")
  storages=$(count_files "${SCRATCH_HOME}/storages")
  workspace=$(count_files "${SCRATCH_HOME}/workspace")
  expected_sessions=$(jq -r '.contents.included.sessions.files // 0' "${BACKUP_DIR}/manifest.json" 2>/dev/null || printf '0')
  expected_storages=$(jq -r '.contents.included.storages.files // 0' "${BACKUP_DIR}/manifest.json" 2>/dev/null || printf '0')
  expected_workspace=$(jq -r '.contents.included.workspace.files // 0' "${BACKUP_DIR}/manifest.json" 2>/dev/null || printf '0')

  if ((sessions > 0)); then
    record pass 'sessions restored' "$sessions files ($expected_sessions in manifest)"
  elif [[ $ALLOW_EMPTY == 1 ]]; then
    record warn 'sessions restored' 'none (allowed by --allow-empty)'
  else
    record fail 'sessions restored' '0 files (use --allow-empty for an empty profile)'
    fail=1
  fi
  if ((storages > 0)); then
    record pass 'storages restored' "$storages files ($expected_storages in manifest)"
  elif [[ $ALLOW_EMPTY == 1 ]]; then
    record warn 'storages restored' 'none (allowed by --allow-empty)'
  else
    record fail 'storages restored' '0 files'
    fail=1
  fi
  if ((sessions != expected_sessions)); then
    record warn 'session file count vs manifest' "$sessions restored vs $expected_sessions expected"
  fi
  if ((storages != expected_storages)); then
    record warn 'storage file count vs manifest' "$storages restored vs $expected_storages expected"
  fi
  if ((workspace == expected_workspace)); then
    record pass 'workspace restored' "$workspace files (matches manifest)"
  else
    record warn 'workspace restored' "$workspace files vs $expected_workspace in manifest"
  fi
  ((fail == 0))
}

# ── Hindsight bank export check (M0-D13: shared :9177, bank dsh-personal) ────
check_hindsight_export() {
  local hstatus hbank hartifact hdetail hasha
  hstatus=$(jq -r '.hindsight.status // "absent"' "${BACKUP_DIR}/manifest.json" 2>/dev/null || printf 'absent')
  hbank=$(jq -r '.hindsight.bank // "unknown"' "${BACKUP_DIR}/manifest.json" 2>/dev/null || printf 'unknown')
  hdetail=$(jq -r '.hindsight.detail // ""' "${BACKUP_DIR}/manifest.json" 2>/dev/null || true)
  hartifact=$(jq -r '.hindsight.artifact // empty' "${BACKUP_DIR}/manifest.json" 2>/dev/null || true)

  if [[ $hbank == 'josh' ]]; then
    record fail 'hindsight bank is dsh-personal (never josh)' "manifest records bank '$hbank'"
    return 1
  fi
  record pass 'hindsight bank is dsh-personal (never josh)'

  case $hstatus in
    exported)
      if [[ -z $hartifact || ! -f ${BACKUP_DIR}/${hartifact} ]]; then
        record fail 'hindsight bank export artifact present' "${hartifact:-<none recorded>}"
        return 1
      fi
      hasha=$(jq -r --arg p "$hartifact" '.artifacts[] | select(.path == $p) | .sha256' \
        "${BACKUP_DIR}/manifest.json" 2>/dev/null || true)
      if [[ -n $hasha ]] && (cd "$BACKUP_DIR" && printf '%s  %s\n' "$hasha" "$hartifact" | sha256sum -c --quiet - >/dev/null 2>&1); then
        record pass 'hindsight bank export present + sha256' \
          "bank dsh-personal, $(stat -c %s -- "${BACKUP_DIR}/${hartifact}") bytes"
      else
        record fail 'hindsight bank export sha256' "$hartifact"
        return 1
      fi
      ;;
    bank_missing | unavailable | disabled | absent)
      if [[ $REQUIRE_HINDSIGHT == 1 ]]; then
        record fail 'hindsight bank export present' "$hstatus — ${hdetail:-no detail} (--require-hindsight)"
        return 1
      fi
      record warn 'hindsight bank export present' \
        "$hstatus — ${hdetail:-not covered}; bank dsh-personal is created in the next M0 host block, re-run backup+drill then (memory-bank restore is still M0-open)"
      ;;
    refused-*)
      record fail 'hindsight export not blocked by a safety guard' "$hstatus: $hdetail"
      return 1
      ;;
    *)
      record warn 'hindsight bank export present' "unknown status '$hstatus'"
      ;;
  esac
  return 0
}

# ── boot + serve ─────────────────────────────────────────────────────────────
wait_for_http() {
  local deadline=$((SECONDS + BOOT_TIMEOUT_SECONDS)) code
  while ((SECONDS < deadline)); do
    if [[ -n $DRILL_PID ]] && ! kill -0 "$DRILL_PID" 2>/dev/null; then
      printf 'process-died'
      return 1
    fi
    code=$(http_code "http://127.0.0.1:${DRILL_PORT}/")
    case $code in
      200 | 301 | 302 | 401 | 403)
        printf '%s' "$code"
        return 0
        ;;
    esac
    sleep 0.5
  done
  printf 'timeout'
  return 1
}

wait_for_token() {
  # The shell prints the launch URL right after the listener binds; the HTTP probe
  # can win that race, so give the token line a short bounded grace period.
  local deadline=$((SECONDS + 10))
  while ((SECONDS < deadline)); do
    grep -q 'token=' "$BOOT_LOG" 2>/dev/null && return 0
    if [[ -n $DRILL_PID ]] && ! kill -0 "$DRILL_PID" 2>/dev/null; then
      return 1
    fi
    sleep 0.2
  done
  return 1
}

start_and_verify_boot() {
  local t0 t1 first_code="" token="" login_code="" login_bytes=0 rc=0
  BOOT_LOG="${SCRATCH_HOME}/drill-boot.log"
  BOOT_LOG_REDACTED="${SCRATCH_HOME}/drill-boot.redacted.log"
  COOKIE_JAR="${SCRATCH_HOME}/.drill-cookies"
  : >"$BOOT_LOG"
  chmod 600 -- "$BOOT_LOG"

  t0=$(now_ms)
  env DSH_HOME="$SCRATCH_HOME" \
    DSH_TELEMETRY_MODE=DISABLED DSH_TELEMETRY_DISABLED=1 \
    "$DSH_BIN" --profile "$PROFILE" --host 127.0.0.1 --port "$DRILL_PORT" --no-open \
    --trusted-host "127.0.0.1:${DRILL_PORT}" >"$BOOT_LOG" 2>&1 &
  DRILL_PID=$!

  first_code=$(wait_for_http) || {
    t1=$(now_ms)
    BOOT_MS=$((t1 - t0))
    record fail 'drill instance booted' "HTTP wait failed ($first_code) after ${BOOT_MS} ms"
    rc=1
  }
  if ((rc == 0)); then
    t1=$(now_ms)
    BOOT_MS=$((t1 - t0))
    record pass 'drill instance serves HTTP' "HTTP ${first_code} on http://127.0.0.1:${DRILL_PORT}/ in ${BOOT_MS} ms"
  fi

  # Prove the running process really is the drill instance on the drill port.
  if [[ -n $DRILL_PID ]] && kill -0 "$DRILL_PID" 2>/dev/null; then
    local cmdline
    cmdline=$(tr '\0' ' ' <"/proc/${DRILL_PID}/cmdline" 2>/dev/null || true)
    if [[ $cmdline == *"--port ${DRILL_PORT}"* && $cmdline != *"--port ${LIVE_PORT}"* ]]; then
      record pass 'drill process isolation' "pid $DRILL_PID bound to --port ${DRILL_PORT}, not ${LIVE_PORT}"
    else
      record fail 'drill process isolation' "unexpected cmdline for pid $DRILL_PID"
      rc=1
    fi
  fi

  # A tokenized launch URL proves the authenticated UI serves, not just the fence.
  wait_for_token || true
  token=$(sed -nE 's/.*[?&]token=([A-Za-z0-9_.~-]+).*/\1/p' "$BOOT_LOG" | head -n 1 || true)
  if [[ -n $token ]]; then
    local login_out
    login_out=$(curl -sS -m 5 -L -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
      -o /dev/null -w '%{http_code} %{size_download}' \
      "http://127.0.0.1:${DRILL_PORT}/?token=${token}" 2>/dev/null || printf '000 0')
    IFS=' ' read -r login_code login_bytes <<<"$login_out"
    case $login_code in
      200) record pass 'authenticated UI serves' "HTTP 200 via launch token, ${login_bytes} bytes of index" ;;
      30*) record warn 'authenticated UI serves' "HTTP ${login_code} via launch token (redirect not followed)" ;;
      *) record fail 'authenticated UI serves' "HTTP ${login_code} via launch token"; rc=1 ;;
    esac
  else
    record warn 'authenticated UI serves' 'no launch token in boot log; plain endpoint check only'
  fi

  # Redact the launch token before anything is kept or printed.
  sed -E 's/(token=)[A-Za-z0-9_.~-]+/\1<redacted>/g' "$BOOT_LOG" >"$BOOT_LOG_REDACTED"
  chmod 600 -- "$BOOT_LOG_REDACTED"
  rm -f -- "$BOOT_LOG"

  if grep -Eq 'EADDRINUSE|listen EACCES|UnhandledPromiseRejection' "$BOOT_LOG_REDACTED"; then
    record fail 'boot log clean' 'fatal listen/boot error in log'
    rc=1
  else
    local errs
    errs=$(grep -Ec 'ERROR|Error:|fatal' "$BOOT_LOG_REDACTED" 2>/dev/null || true)
    record pass 'boot log clean' "${errs:-0} error-shaped lines; $(stat -c %s -- "$BOOT_LOG_REDACTED") bytes (redacted)"
  fi
  if grep -Eq 'token=[A-Za-z0-9_.~-]{8,}' "$BOOT_LOG_REDACTED"; then
    record fail 'no launch token in retained logs' 'token=<value> still present after redaction'
    rc=1
  else
    record pass 'no launch token in retained logs'
  fi
  ((rc == 0))
}

terminate_drill() {
  local waited=0
  [[ -n ${DRILL_PID:-} ]] || return 0
  if kill -0 "$DRILL_PID" 2>/dev/null; then
    kill -TERM "$DRILL_PID" 2>/dev/null || true
    while ((waited < 40)); do
      kill -0 "$DRILL_PID" 2>/dev/null || break
      sleep 0.25
      waited=$((waited + 1))
    done
    if kill -0 "$DRILL_PID" 2>/dev/null; then
      kill -KILL "$DRILL_PID" 2>/dev/null || true
    fi
  fi
  wait "$DRILL_PID" 2>/dev/null || true
  DRILL_PID=''
}

verify_port_free() {
  local waited=0
  while ((waited < 20)); do
    port_in_use "$DRILL_PORT" || return 0
    sleep 0.25
    waited=$((waited + 1))
  done
  return 1
}

cleanup() {
  local dest
  [[ $CLEANED == 1 ]] && return 0
  CLEANED=1
  terminate_drill
  if [[ -n ${BOOT_LOG:-} && -f $BOOT_LOG ]]; then
    dest="${SCRATCH_HOME:-/tmp}/drill-boot.redacted.log"
    sed -E 's/(token=)[A-Za-z0-9_.~-]+/\1<redacted>/g' "$BOOT_LOG" >"$dest" 2>/dev/null || true
    rm -f -- "$BOOT_LOG"
  fi
  # The browser-session cookie is drill-only; never retain it, even with --keep.
  [[ -n ${COOKIE_JAR:-} ]] && rm -f -- "$COOKIE_JAR"
  if [[ ${KEEP:-0} == 1 ]]; then
    log "scratch home kept: $SCRATCH_HOME (redacted boot log retained, raw log removed)"
  else
    if [[ -n ${SCRATCH_HOME:-} && -d $SCRATCH_HOME ]]; then
      rm -rf -- "$SCRATCH_HOME"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── main ─────────────────────────────────────────────────────────────────────
parse_args() {
  local arg
  while (($# > 0)); do
    arg=$1
    case $arg in
      -h | --help) usage; exit 0 ;;
      --backup) shift; [[ $# -ge 1 ]] || die '--backup needs a directory' 2; BACKUP_DIR=$1 ;;
      --scratch-home) shift; [[ $# -ge 1 ]] || die '--scratch-home needs a directory' 2; SCRATCH_HOME=$1 ;;
      --port) shift; [[ $# -ge 1 ]] || die '--port needs a number' 2; DRILL_PORT=$1 ;;
      --keep) KEEP=1 ;;
      --allow-empty) ALLOW_EMPTY=1 ;;
      --require-hindsight) REQUIRE_HINDSIGHT=1 ;;
      *) die "unknown argument: $arg (try --help)" 2 ;;
    esac
    shift
  done
}

print_summary() {
  local total_ms failures=0 i
  total_ms=$(( $(now_ms) - TOTAL_START_MS ))
  for ((i = 0; i < ${#CHECK_STATUS[@]}; i++)); do
    [[ ${CHECK_STATUS[$i]} == 'fail' ]] && failures=$((failures + 1))
  done
  printf '\n──────────────────────────────────────────────────────────────\n'
  printf 'RESTORE DRILL %s — %s\n' "$([[ $failures -eq 0 ]] && printf PASS || printf FAIL)" "$(now_iso)"
  printf 'backup  : %s\n' "$BACKUP_DIR"
  printf 'scratch : %s (%s)\n' "$SCRATCH_HOME" "$([[ $KEEP == 1 ]] && printf 'kept' || printf 'removed on exit')"
  printf 'port    : %s (live %s untouched)\n' "$DRILL_PORT" "$LIVE_PORT"
  printf 'timings : extract=%s ms  boot=%s ms  total=%s ms\n' "$EXTRACT_MS" "$BOOT_MS" "$total_ms"
  printf 'checks  : %s passed, %s warned, %s failed\n' \
    "$(printf '%s\n' "${CHECK_STATUS[@]}" | grep -c '^pass$' || true)" \
    "$(printf '%s\n' "${CHECK_STATUS[@]}" | grep -c '^warn$' || true)" \
    "$failures"
  if ((failures > 0)); then
    printf 'failed checks:\n'
    for ((i = 0; i < ${#CHECK_STATUS[@]}; i++)); do
      [[ ${CHECK_STATUS[$i]} == 'fail' ]] && printf '  - %s (%s)\n' "${CHECK_NAMES[$i]}" "${CHECK_DETAILS[$i]}"
    done
    return 1
  fi
  return 0
}

main() {
  parse_args "$@"
  TOTAL_START_MS=$(now_ms)
  log 'dsh-restore-drill starting (repo artifact; live service is not touched)'
  preflight "${BACKUP_DIR}"

  verify_backup_integrity || die 'backup failed integrity checks; drill aborted before restoring' 1
  extract_backup || die 'extraction failed' 1

  local pre_ok=0
  rebase_paths
  check_restored_data || pre_ok=1
  check_hindsight_export || true
  ((pre_ok == 0)) || { print_summary || true; die 'restored data checks failed; drill aborted before boot' 1; }

  start_and_verify_boot || true
  terminate_drill
  if verify_port_free; then
    record pass 'drill instance stopped' "port ${DRILL_PORT} is free"
  else
    record fail 'drill instance stopped' "port ${DRILL_PORT} is still in use"
  fi
  if [[ -f ${SCRATCH_HOME}/drill-boot.redacted.log ]]; then
    if [[ $KEEP == 1 ]]; then
      record pass 'redacted boot log retained' "${SCRATCH_HOME}/drill-boot.redacted.log"
    else
      record pass 'redacted boot log captured' 'scratch home (and its log) removed on exit'
    fi
  fi

  print_summary
}

main "$@"
