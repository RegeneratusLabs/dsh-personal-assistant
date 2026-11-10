#!/usr/bin/env bash
# dsh-backup.sh — M0 backup of the DSH "personal" home.
#
# Repo artifact. Safe to run by hand; it makes NO host-state change beyond
# creating files under BACKUP_ROOT. It never runs sudo/systemctl/nft, never
# stops the service, and never touches Hermes data. Hindsight export is
# bank-scoped REST only: the shared instance on 127.0.0.1:9177 (M0-D13), bank
# `dsh-personal` (never bank `josh` or any other Hermes bank), never the embedded
# Postgres. A missing bank is fail-soft (clearly logged, exit 0); the bank is
# created 2026-11-10 (M0 block 1); export stays fail-soft if it is ever absent.
#
# What gets backed up (one timestamped dir, 0700 dirs / 0600 files):
#   profiles/            # profile bundles, patches, plugin-manager state
#   cordis.patch.yml     # home-level patch layer
#   .credentials.yaml    # credential refs (600 in the tarball; never printed)
#   workspace/           # assistant workspace
#   storages/            # DSH storages (session projection cache, workspace state)
#   sessions/            # session transcripts
#   manifest.json        # sha256 + size per artifact, DSH version, repo git HEAD,
#                        # timestamps, per-tree file counts, Hindsight status
#   SHA256SUMS           # sha256sum -c compatible
#   hindsight/…          # bank dsh-personal export from :9177, when the bank exists
#
# Explicitly NOT backed up: logs/ (may contain conversation content),
# .anonymous-user-id (regenerated), the DSH install tree (/home/josh/dsh),
# the repo itself, and anything under ~/.hermes.
#
# Usage:
#   scripts/backup/dsh-backup.sh [options]
#   scripts/backup/dsh-backup.sh --verify <backup-dir>
#
# Options:
#   -h, --help          this text
#   --verify DIR        verify an existing backup dir offline (no writes)
#   --no-prune          create the backup but skip retention pruning
#   --no-weekly         create the backup but skip the weekly promotion
#
# Environment (all optional):
#   DSH_PERSONAL_HOME   target DSH home; wins over DSH_HOME
#   DSH_HOME            target DSH home; default "$HOME/.dsh-personal"
#                       (an ambient DSH_HOME="$HOME/.dsh" is ignored, because
#                       that is the agent's own session home, not the personal one)
#   BACKUP_ROOT         default "$HOME/backups/dsh-personal"
#   DAILY_KEEP=14       daily backups kept
#   WEEKLY_KEEP=8       weekly backups kept
#   CREATE_WEEKLY=1     promote the first backup of each ISO week to weekly/
#   PRUNE=1             enable retention pruning
#   LOG_RETENTION_DAYS=90
#   DSH_BIN             default /home/josh/dsh/node/bin/dsh
#   PROFILE=personal    profile name booted by the service (recorded only)
#   SERVICE_UNIT=dsh-personal.service  systemd unit name (recorded only; never controlled)
#   HINDSIGHT_URL       default http://127.0.0.1:9177 (shared instance, M0-D13, final)
#   HINDSIGHT_BANK      default dsh-personal; any other bank is refused (josh/hermes-bank-3*
#                       are Hermes-owned). REST export only — never Postgres.
#   HINDSIGHT_TIMEOUT_SECONDS=30
#   HINDSIGHT_EXPORT=1  kill switch: 0 disables Hindsight export entirely (no request)
#
# Exit codes:
#   0  backup OK (Hindsight export skipped/unavailable is not a failure)
#   1  hard failure (bad config, tar failure, verification failure)
#   2  another backup holds the lock
#   3  secret-leak check failed (no backup published; inspect the 0600 log)
#
# Restore drill: scripts/backup/dsh-restore-drill.sh
# Runbook + evidence format: research/m0-backup-restore.md
#
set -euo pipefail
umask 077
IFS=$'\n\t'

SELF_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd -- "${SELF_DIR}/../.." && pwd)

# ── configuration ────────────────────────────────────────────────────────────
BACKUP_ROOT=${BACKUP_ROOT:-${HOME}/backups/dsh-personal}
DAILY_KEEP=${DAILY_KEEP:-14}
WEEKLY_KEEP=${WEEKLY_KEEP:-8}
CREATE_WEEKLY=${CREATE_WEEKLY:-1}
PRUNE=${PRUNE:-1}
LOG_RETENTION_DAYS=${LOG_RETENTION_DAYS:-90}
DSH_BIN=${DSH_BIN:-/home/josh/dsh/node/bin/dsh}
PROFILE=${PROFILE:-personal}
SERVICE_UNIT=${SERVICE_UNIT:-dsh-personal.service}
# M0-D13 (final): the shared Hindsight instance on 127.0.0.1:9177 is the target.
# Only the `dsh-personal` bank is exported, over REST, read-only. Bank `josh` and
# every other Hermes bank are refused; the embedded Postgres is never contacted.
HINDSIGHT_URL=${HINDSIGHT_URL:-http://127.0.0.1:9177}
HINDSIGHT_URL=${HINDSIGHT_URL%/}
HINDSIGHT_BANK=${HINDSIGHT_BANK:-dsh-personal}
HINDSIGHT_TIMEOUT_SECONDS=${HINDSIGHT_TIMEOUT_SECONDS:-30}
HINDSIGHT_EXPORT=${HINDSIGHT_EXPORT:-1} # 0 = kill switch: no Hindsight request at all

REQUIRED_ENTRIES=(profiles cordis.patch.yml .credentials.yaml workspace storages sessions)

TS=''
LOG_FILE=''
STARTED_ISO=''
STARTED_MS=0
TARBALL=''
STAGING=''
BACKUP_DIR=''
DSH_HOME_DIR=''
DSH_VERSION='unknown'
NODE_VERSION='unknown'
LOG_IS_OPEN=0

# ── output helpers ───────────────────────────────────────────────────────────
now_ms() { date +%s%3N; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

log() {
  local line
  line="$(now_iso) $*"
  printf '%s\n' "$line" >&2
  if [[ $LOG_IS_OPEN == 1 ]]; then
    printf '%s\n' "$line" >>"$LOG_FILE"
  fi
}
warn() { log "WARN: $*"; }
note() { log "note: $*"; }
die() { local msg=$1 code=${2:-1}; log "ERROR: $msg"; exit "$code"; }

usage() {
  sed -n '3,60p' "${BASH_SOURCE[0]}" | sed -n '/^# /p' | sed 's/^# \{0,1\}//'
}

# ── configuration resolution ─────────────────────────────────────────────────
# Deliberately does not trust an inherited DSH_HOME pointing at ~/.dsh: inside a
# DSH session that variable names the agent's own home, not the personal one.
resolve_dsh_home() {
  if [[ -n ${DSH_PERSONAL_HOME:-} ]]; then
    printf '%s' "${DSH_PERSONAL_HOME%/}"
    return 0
  fi
  if [[ -n ${DSH_HOME:-} ]]; then
    if [[ ${DSH_HOME%/} == "${HOME}/.dsh" ]]; then
      printf 'dsh-backup: ignoring ambient DSH_HOME=%s (agent session home); using %s\n' \
        "${DSH_HOME}" "${HOME}/.dsh-personal" >&2
      printf '%s' "${HOME}/.dsh-personal"
      return 0
    fi
    printf '%s' "${DSH_HOME%/}"
    return 0
  fi
  printf '%s' "${HOME}/.dsh-personal"
}

ensure_secure_dir() {
  local dir=$1
  if [[ -e $dir ]]; then
    [[ -d $dir ]] || die "'$dir' exists and is not a directory"
    [[ -O $dir ]] || die "'$dir' is not owned by the current user; refusing to chmod it"
    chmod 700 -- "$dir"
  else
    mkdir -p -- "$dir"
    chmod 700 -- "$dir"
  fi
}

file_sha256() { sha256sum -- "$1" | awk '{print $1}'; }
file_size() { stat -c %s -- "$1"; }

dir_file_count() {
  local dir=$1
  [[ -d $dir ]] || { printf '0'; return 0; }
  find "$dir" -type f -printf '.' 2>/dev/null | wc -c | tr -d ' '
}

dir_bytes() {
  local dir=$1
  local out
  [[ -e $dir ]] || { printf '0'; return 0; }
  out=$(du -sb -- "$dir" 2>/dev/null || true)
  printf '%s' "${out%%$'\t'*}"
}

# Extracts likely credential VALUES from the credentials file without printing
# them. Only keys that name a secret and values of length >= 8 are considered.
extract_credential_values() {
  local creds=$1
  [[ -f $creds && -r $creds ]] || return 0
  awk '
    /^[[:space:]]*[A-Za-z0-9_.\/-]+[[:space:]]*:/ {
      line = $0
      sub(/^[[:space:]]*/, "", line)
      k = line
      sub(/[[:space:]]*:.*/, "", k)
      v = line
      sub(/^[^:]*:[[:space:]]*/, "", v)
      sub(/[[:space:]]*$/, "", v)
      gsub(/^["'\'']|["'\'']$/, "", v)
      if (toupper(k) ~ /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|GRANT)/ && length(v) >= 8 && v !~ /[[:space:]]/) {
        print v
      }
    }
  ' "$creds"
}

SECRET_SHAPE_RE='sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer [A-Za-z0-9._~+/-]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}'

# ── secret-leak check ────────────────────────────────────────────────────────
# Scans our own metadata (names, manifest, SHA256SUMS, log) for credential
# values or credential-shaped strings. The tarball legitimately contains the
# credentials file, so it is checked only for its file mode, never grepped.
SECRET_CHECK_RESULT='fail'
SECRET_CHECK_DETAIL='not-run'
SECRET_VALUES_COUNT=0

check_no_secrets() {
  local leak=0
  local target f name
  local -a values=()
  local -a scan=()

  if [[ -f ${DSH_HOME_DIR}/.credentials.yaml ]]; then
    mapfile -t values < <(extract_credential_values "${DSH_HOME_DIR}/.credentials.yaml" || true)
  fi
  SECRET_VALUES_COUNT=${#values[@]}

  scan=("$BACKUP_DIR/manifest.json" "$BACKUP_DIR/SHA256SUMS")
  [[ -n $LOG_FILE ]] && scan+=("$LOG_FILE")

  for f in "${scan[@]}"; do
    [[ -f $f ]] || continue
    if grep -Eq -- "$SECRET_SHAPE_RE" "$f"; then
      warn "secret-shaped string found in $(basename -- "$f")"
      leak=1
    fi
    if ((SECRET_VALUES_COUNT > 0)); then
      if grep -Fq -f <(printf '%s\n' "${values[@]}") -- "$f"; then
        warn "a credential value was found in $(basename -- "$f")"
        leak=1
      fi
    fi
  done

  # File/dir names must not embed credential values or obvious secret shapes.
  while IFS= read -r f; do
    name=$(basename -- "$f")
    [[ $name == '.credentials.yaml' ]] && continue
    if [[ $name =~ ^.*(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}).*$ ]]; then
      warn "secret-shaped filename: $name"
      leak=1
    fi
    if ((SECRET_VALUES_COUNT > 0)); then
      local v
      for v in "${values[@]}"; do
        if [[ $name == *"$v"* ]]; then
          warn "a credential value appears in a filename"
          leak=1
          break
        fi
      done
    fi
  done < <(find "$BACKUP_DIR" -mindepth 1 -print 2>/dev/null)

  # The tarball must carry .credentials.yaml as mode 600 (owner rw only).
  local mode_line
  mode_line=$(tar -tvzf "$TARBALL" 2>/dev/null | awk '$NF ~ /(^|\/)\.credentials\.yaml$/ {print $1}' | head -n 1 || true)
  if [[ -n $mode_line ]]; then
    if [[ $mode_line != -rw------- && $mode_line != -r-------- ]]; then
      warn "tarball entry .credentials.yaml has mode $mode_line (expected -rw-------)"
      leak=1
    fi
  else
    warn "tarball does not contain .credentials.yaml"
    leak=1
  fi

  if ((leak == 0)); then
    SECRET_CHECK_RESULT='pass'
    SECRET_CHECK_DETAIL='no credential values or secret-shaped strings in filenames, manifest, SHA256SUMS, or log'
    note "secret check: PASS (${SECRET_VALUES_COUNT} credential values compared, never printed)"
  else
    SECRET_CHECK_RESULT='fail'
    SECRET_CHECK_DETAIL='leak detected; backup not published, inspect the 0600 log and rotate if needed'
    log "secret check: FAIL ($SECRET_CHECK_DETAIL)"
  fi
}

# ── manifest assembly helpers ────────────────────────────────────────────────
ARTIFACTS_JSON='[]'
add_artifact() {
  local rel=$1
  local abs="${BACKUP_DIR}/${rel}"
  local hash size
  hash=$(file_sha256 "$abs")
  size=$(file_size "$abs")
  ARTIFACTS_JSON=$(jq -c --arg p "$rel" --arg h "$hash" --argjson s "$size" \
    '. + [{path: $p, sha256: $h, size_bytes: $s}]' <<<"$ARTIFACTS_JSON")
}

INCLUDED_JSON='{}'
add_included_tree() {
  local name=$1 path=$2
  local files bytes
  files=$(dir_file_count "$path")
  bytes=$(dir_bytes "$path")
  INCLUDED_JSON=$(jq -c --arg n "$name" --argjson f "$files" --argjson b "$bytes" \
    '. + {($n): {files: $f, bytes: $b}}' <<<"$INCLUDED_JSON")
}
add_included_file() {
  local name=$1 path=$2
  local bytes
  bytes=$(file_size "$path")
  INCLUDED_JSON=$(jq -c --arg n "$name" --argjson b "$bytes" \
    '. + {($n): {files: 1, bytes: $b}}' <<<"$INCLUDED_JSON")
}

EXTERNAL_SYMLINKS_JSON='[]'
collect_external_symlinks() {
  local link target
  while IFS= read -r link; do
    target=$(readlink -- "$link" 2>/dev/null || true)
    [[ -z $target ]] && continue
    case $target in
      /*)
        if [[ $target != "$DSH_HOME_DIR"/* ]]; then
          EXTERNAL_SYMLINKS_JSON=$(jq -c --arg p "${link#"$DSH_HOME_DIR"/}" --arg t "$target" \
            '. + [{path: $p, target: $t}]' <<<"$EXTERNAL_SYMLINKS_JSON")
        fi
        ;;
      *)
        # Relative symlink: resolve and keep it only when it escapes the home.
        local resolved
        resolved=$(readlink -f -- "$link" 2>/dev/null || true)
        if [[ -n $resolved && $resolved != "$DSH_HOME_DIR"/* ]]; then
          EXTERNAL_SYMLINKS_JSON=$(jq -c --arg p "${link#"$DSH_HOME_DIR"/}" --arg t "$resolved" \
            '. + [{path: $p, target: $t}]' <<<"$EXTERNAL_SYMLINKS_JSON")
        fi
        ;;
    esac
  done < <(find "${DSH_HOME_DIR}/profiles" -type l 2>/dev/null || true)
}

# ── Hindsight export (fail soft, bank-scoped REST only) ─────────────────────
# M0-D13: export bank `dsh-personal` from the SHARED instance (default :9177).
# Hard refusals: any bank other than `dsh-personal` (so never `josh`/`hermes-bank-3*`) and
# any non-HTTP(S) target. This script never uses psql/pg_dump and never touches
# the embedded Postgres or ~/.hermes.
HINDSIGHT_JSON='{"status":"not-attempted","detail":"not run"}'

hindsight_export() {
  local detail='' code ctype rel http_code status='unavailable'
  local hdir="${BACKUP_DIR}/hindsight"
  local tmp="${STAGING}/hindsight/export.tmp"

  if [[ $HINDSIGHT_EXPORT != 1 ]]; then
    log "Hindsight export: DISABLED by HINDSIGHT_EXPORT=${HINDSIGHT_EXPORT} (kill switch); no request made"
    HINDSIGHT_JSON=$(jq -nc --arg u "$HINDSIGHT_URL" --arg b "$HINDSIGHT_BANK" \
      '{url:$u, bank:$b, scope:"shared-existing-instance (M0-D13)", status:"disabled",
        detail:"HINDSIGHT_EXPORT=0 kill switch; Hindsight export not attempted, DSH_HOME backup is complete"}')
    return 0
  fi

  if [[ $HINDSIGHT_BANK != 'dsh-personal' ]]; then
    log "Hindsight export: REFUSED bank '$HINDSIGHT_BANK' — only bank 'dsh-personal' may be exported (never josh/hermes-bank-3*)"
    HINDSIGHT_JSON=$(jq -nc --arg u "$HINDSIGHT_URL" --arg b "$HINDSIGHT_BANK" \
      '{url:$u, bank:$b, scope:"shared-existing-instance (M0-D13)", status:"refused-hermes-bank",
        detail:"only bank dsh-personal may be exported; Hermes-owned banks (josh/hermes-bank-3*) are always refused"}')
    return 0
  fi

  if [[ ! $HINDSIGHT_URL =~ ^https?:// ]]; then
    log "Hindsight export: REFUSED target '$HINDSIGHT_URL' — REST export needs an http(s) URL; no Postgres/DB contact"
    HINDSIGHT_JSON=$(jq -nc --arg u "$HINDSIGHT_URL" --arg b "$HINDSIGHT_BANK" \
      '{url:$u, bank:$b, scope:"shared-existing-instance (M0-D13)", status:"refused-invalid-target",
        detail:"only an http(s) REST export URL is allowed; direct Postgres access is never performed"}')
    return 0
  fi

  log "Hindsight export: shared instance (M0-D13), bank-scoped REST only (bank $HINDSIGHT_BANK); no DB access"
  mkdir -p -- "$hdir"
  chmod 700 -- "$hdir"
  mkdir -p -- "${STAGING}/hindsight"

  code=$(curl -sS -m "$HINDSIGHT_TIMEOUT_SECONDS" -o "$tmp" -w '%{http_code} %{content_type}' \
    "${HINDSIGHT_URL}/v1/default/banks/${HINDSIGHT_BANK}/export" 2>/dev/null) || code='000'
  http_code=${code%% *}
  ctype=${code#* }
  [[ $ctype == "$code" || $ctype == '000' ]] && ctype='application/octet-stream'

  if [[ $http_code == '200' ]]; then
    local ext='bin'
    case $ctype in
      *json*) ext='json' ;;
      *zip*|*octet-stream*) ext='bin' ;;
    esac
    rel="hindsight/${HINDSIGHT_BANK}-export.${ext}"
    mv -- "$tmp" "${BACKUP_DIR}/${rel}"
    chmod 600 -- "${BACKUP_DIR}/${rel}"
    add_artifact "$rel"
    note "Hindsight export: OK (${rel}, $(file_size "${BACKUP_DIR}/${rel}") bytes, content-type ${ctype})"
    HINDSIGHT_JSON=$(jq -nc --arg u "$HINDSIGHT_URL" --arg b "$HINDSIGHT_BANK" \
      --arg a "$rel" --arg c "$ctype" --arg code "$http_code" \
      '{url:$u, bank:$b, scope:"shared-existing-instance (M0-D13)", status:"exported",
        artifact:$a, http_code:$code, content_type:$c,
        detail:"bank export via GET /v1/default/banks/{bank}/export (REST only, no DB contact)"}')
    return 0
  fi

  rm -f -- "$tmp"
  rmdir -- "${STAGING}/hindsight" 2>/dev/null || true
  rmdir -- "$hdir" 2>/dev/null || true
  case $http_code in
    '000')
      status='unavailable'
      detail="no Hindsight API reachable at ${HINDSIGHT_URL}"
      log "Hindsight export: SKIPPED — ${detail}"
      log "  The shared instance is expected on 127.0.0.1:9177 (M0-D13); it may simply be down."
      log "  Fail-soft: the DSH_HOME backup above is complete and valid."
      ;;
    '404')
      status='bank_missing'
      detail="bank '${HINDSIGHT_BANK}' does not exist yet on ${HINDSIGHT_URL} (created 2026-11-10 in M0 block 1)"
      log "Hindsight export: BANK MISSING — bank '${HINDSIGHT_BANK}' does not exist yet on the shared instance."
      log "  It was created 2026-11-10 in M0 block 1; no retry, no DB contact."
      log "  Fail-soft: the DSH_HOME backup above is complete and valid — re-run this script after the bank is seeded"
      log "  so the bank export is included in the backup."
      ;;
    *)
      status='unavailable'
      detail="HTTP ${http_code} from ${HINDSIGHT_URL}"
      warn "Hindsight export: FAILED SOFT — ${detail}"
      log "  The DSH_HOME backup above is still valid; Hindsight data is missing from this backup."
      ;;
  esac
  HINDSIGHT_JSON=$(jq -nc --arg u "$HINDSIGHT_URL" --arg b "$HINDSIGHT_BANK" \
    --arg s "$status" --arg d "$detail" --arg c "$http_code" \
    '{url:$u, bank:$b, scope:"shared-existing-instance (M0-D13)", status:$s, http_code:$c, detail:$d}')
}

# ── retention ────────────────────────────────────────────────────────────────
is_backup_dir_name() {
  local name=$1
  [[ $name =~ ^[0-9]{8}T[0-9]{6}Z$ ]] && return 0
  [[ $name =~ ^[0-9]{4}-W[0-9]{2}-[0-9]{8}T[0-9]{6}Z$ ]] && return 0
  return 1
}

prune_kind() {
  local dir=$1 keep=$2 kind=$3
  local -a all=()
  local n remove i name path
  [[ -d $dir ]] || return 0
  mapfile -t all < <(find "$dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort)
  n=${#all[@]}
  remove=$((n - keep))
  ((remove > 0)) || return 0
  for ((i = 0; i < remove; i++)); do
    name=${all[$i]}
    if ! is_backup_dir_name "$name"; then
      warn "retention: keeping unexpected entry '$kind/$name'"
      continue
    fi
    path="${dir}/${name}"
    case $path in
      "$BACKUP_ROOT"/daily/* | "$BACKUP_ROOT"/weekly/*) ;;
      *) warn "retention: refusing to delete '$path' (outside BACKUP_ROOT)"; continue ;;
    esac
    rm -rf -- "$path"
    log "retention: pruned $kind/$name"
  done
}

apply_retention() {
  [[ $PRUNE == 1 ]] || { note 'retention: disabled (--no-prune/PRUNE=0)'; return 0; }
  prune_kind "${BACKUP_ROOT}/daily" "$DAILY_KEEP" daily
  prune_kind "${BACKUP_ROOT}/weekly" "$WEEKLY_KEEP" weekly
  if [[ -d ${BACKUP_ROOT}/logs && $LOG_RETENTION_DAYS =~ ^[0-9]+$ ]]; then
    find "${BACKUP_ROOT}/logs" -mindepth 1 -maxdepth 1 -type f -name '*-backup.log' \
      -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true
  fi
}

promote_weekly() {
  [[ $CREATE_WEEKLY == 1 ]] || { note 'weekly: promotion disabled'; return 0; }
  local iso_week weekdir
  iso_week=$(date -u +%G-W%V)
  if [[ -n $(find "${BACKUP_ROOT}/weekly" -mindepth 1 -maxdepth 1 -type d -name "${iso_week}-*" -print -quit 2>/dev/null) ]]; then
    note "weekly: ${iso_week} already has a weekly backup; not promoting"
    return 0
  fi
  weekdir="${BACKUP_ROOT}/weekly/${iso_week}-${TS}"
  mkdir -p -- "${BACKUP_ROOT}/weekly"
  chmod 700 -- "${BACKUP_ROOT}/weekly"
  if cp -al -- "${BACKUP_DIR}/." "$weekdir/" 2>/dev/null; then
    log "weekly: promoted ${iso_week} -> weekly/${iso_week}-${TS} (hardlink copy)"
  else
    cp -a -- "${BACKUP_DIR}/." "$weekdir/"
    log "weekly: promoted ${iso_week} -> weekly/${iso_week}-${TS} (copy)"
  fi
  chmod -R u+rwX,go-rwx -- "$weekdir" 2>/dev/null || true
}

# ── verify an existing backup ────────────────────────────────────────────────
verify_backup() {
  local dir=$1
  local fail=0 tar entry mode_line tar_list
  local -a problems=()

  dir=$(cd -- "$dir" 2>/dev/null && pwd) || die "verify: '$1' is not a directory"
  [[ -f ${dir}/manifest.json ]] || die "verify: missing manifest.json in '$dir'"
  [[ -f ${dir}/SHA256SUMS ]] || die "verify: missing SHA256SUMS in '$dir'"

  tar=$(find "$dir" -mindepth 1 -maxdepth 1 -type f -name '*.tar.gz' -print -quit 2>/dev/null || true)
  [[ -n $tar ]] || die "verify: no *.tar.gz in '$dir'"

  if jq -e '.schema_version == 1 and (.artifacts | length >= 1) and (.dsh.version | type == "string")' \
    "$dir/manifest.json" >/dev/null 2>&1; then
    printf 'PASS manifest.json schema (schema_version/artifacts/dsh.version)\n'
  else
    fail=1
    problems+=('manifest.json schema invalid')
    printf 'FAIL manifest.json schema\n'
  fi

  if (cd "$dir" && sha256sum -c --quiet SHA256SUMS); then
    printf 'PASS sha256sum -c SHA256SUMS\n'
  else
    fail=1
    problems+=('sha256 mismatch')
    printf 'FAIL sha256sum -c SHA256SUMS\n'
  fi

  if gzip -t -- "$tar" 2>/dev/null; then
    printf 'PASS gzip integrity: %s\n' "$(basename -- "$tar")"
  else
    fail=1
    problems+=('gzip integrity')
    printf 'FAIL gzip integrity: %s\n' "$(basename -- "$tar")"
  fi

  # Read the member list once: `tar | grep -q` would trip pipefail via SIGPIPE.
  if ! tar_list=$(tar -tzf "$tar" 2>/dev/null); then
    fail=1
    problems+=('tarball unreadable')
    tar_list=''
  fi
  for entry in "${REQUIRED_ENTRIES[@]}"; do
    if grep -Eq -- "(^|/)${entry//./\\.}(/|$)" <<<"$tar_list"; then
      printf 'PASS tarball contains %s\n' "$entry"
    else
      fail=1
      problems+=("tarball missing ${entry}")
      printf 'FAIL tarball missing %s\n' "$entry"
    fi
  done

  mode_line=$(tar -tvzf "$tar" 2>/dev/null | awk '$NF ~ /(^|\/)\.credentials\.yaml$/ {print $1}' | head -n 1 || true)
  if [[ $mode_line == -rw------- || $mode_line == -r-------- ]]; then
    printf 'PASS .credentials.yaml is %s in the tarball\n' "$mode_line"
  else
    fail=1
    problems+=("credentials mode ${mode_line:-missing}")
    printf 'FAIL .credentials.yaml mode is %s (expected -rw-------)\n' "${mode_line:-missing}"
  fi

  if grep -Eq -- "$SECRET_SHAPE_RE" "$dir/manifest.json" 2>/dev/null; then
    fail=1
    problems+=('secret-shaped string in manifest.json')
    printf 'FAIL secret-shaped string in manifest.json\n'
  else
    printf 'PASS no secret-shaped strings in manifest.json\n'
  fi

  local hstatus hdetail hbank
  hstatus=$(jq -r '.hindsight.status // "unknown"' "$dir/manifest.json" 2>/dev/null || printf 'unknown')
  hdetail=$(jq -r '.hindsight.detail // ""' "$dir/manifest.json" 2>/dev/null || true)
  hbank=$(jq -r '.hindsight.bank // "unknown"' "$dir/manifest.json" 2>/dev/null || printf 'unknown')
  if [[ $hbank != 'dsh-personal' ]]; then
    fail=1
    problems+=("hindsight bank is '$hbank', expected dsh-personal")
    printf 'FAIL hindsight bank is %s (expected dsh-personal)\n' "$hbank"
  fi
  case $hstatus in
    exported) printf 'PASS hindsight bank export present (bank dsh-personal, %s)\n' "$(jq -r '.hindsight.artifact' "$dir/manifest.json")" ;;
    bank_missing) printf 'INFO hindsight: bank dsh-personal not created yet (%s) — fail-soft, re-backup after the bank is seeded\n' "$hdetail" ;;
    disabled) printf 'INFO hindsight export disabled by HINDSIGHT_EXPORT=0 — fail-soft\n' ;;
    unavailable) printf 'INFO hindsight status unavailable (%s) — fail-soft, not a backup failure\n' "$hdetail" ;;
    refused-*) printf 'INFO hindsight export refused by safety guard: %s (%s)\n' "$hstatus" "$hdetail" ;;
    *) printf 'INFO hindsight status: %s (%s) — fail-soft, not a backup failure\n' "$hstatus" "$hdetail" ;;
  esac

  if ((fail == 0)); then
    printf '\nVERIFY: PASS — %s\n' "$dir"
    return 0
  fi
  printf '\nVERIFY: FAIL — %s\n' "$dir"
  printf 'problems:\n'
  printf '  - %s\n' "${problems[@]}"
  return 1
}

# ── main backup ──────────────────────────────────────────────────────────────
parse_args() {
  local arg
  while (($# > 0)); do
    arg=$1
    case $arg in
      -h | --help)
        usage
        exit 0
        ;;
      --verify)
        shift
        [[ $# -ge 1 ]] || die "--verify needs a backup directory"
        verify_backup "$1"
        exit $?
        ;;
      --no-prune) PRUNE=0 ;;
      --no-weekly) CREATE_WEEKLY=0 ;;
      *) die "unknown argument: $arg (try --help)" ;;
    esac
    shift
  done
}

main() {
  parse_args "$@"

  command -v jq >/dev/null || die "jq is required"
  command -v curl >/dev/null || die "curl is required"
  command -v tar >/dev/null || die "tar is required"
  command -v sha256sum >/dev/null || die "sha256sum is required"

  DSH_HOME_DIR=$(resolve_dsh_home)
  [[ -d $DSH_HOME_DIR ]] || die "DSH home '$DSH_HOME_DIR' does not exist"
  [[ -r $DSH_HOME_DIR ]] || die "DSH home '$DSH_HOME_DIR' is not readable"
  if [[ ! -d ${DSH_HOME_DIR}/profiles && ! -f ${DSH_HOME_DIR}/.credentials.yaml ]]; then
    die "'$DSH_HOME_DIR' does not look like a DSH home (no profiles/ and no .credentials.yaml)"
  fi
  [[ -x $DSH_BIN ]] || warn "DSH binary '$DSH_BIN' is missing or not executable; version will be 'unknown'"

  if [[ -x $DSH_BIN ]]; then
    DSH_VERSION=$("$DSH_BIN" --version 2>/dev/null | head -n 1 || true)
    [[ -n $DSH_VERSION ]] || DSH_VERSION='unknown'
    local node_bin
    node_bin=$(dirname -- "$DSH_BIN")/node
    if [[ -x $node_bin ]]; then
      NODE_VERSION=$("$node_bin" --version 2>/dev/null | head -n 1 || true)
    fi
  fi

  STARTED_ISO=$(now_iso)
  STARTED_MS=$(now_ms)
  TS=$(date -u +%Y%m%dT%H%M%SZ)

  ensure_secure_dir "$BACKUP_ROOT"
  mkdir -p -- "${BACKUP_ROOT}/daily" "${BACKUP_ROOT}/weekly" "${BACKUP_ROOT}/logs"
  chmod 700 -- "${BACKUP_ROOT}/daily" "${BACKUP_ROOT}/weekly" "${BACKUP_ROOT}/logs"

  LOCK_FILE="${BACKUP_ROOT}/.backup.lock"
  exec 9>"$LOCK_FILE"
  chmod 600 -- "$LOCK_FILE" 2>/dev/null || true
  if ! flock -n 9; then
    die "another backup is already running (lock: $LOCK_FILE)" 2
  fi

  LOG_FILE="${BACKUP_ROOT}/logs/${TS}-backup.log"
  if [[ -e $LOG_FILE ]]; then
    LOG_FILE="${BACKUP_ROOT}/logs/${TS}-$$-backup.log"
  fi
  (umask 077 && : >"$LOG_FILE")
  chmod 600 -- "$LOG_FILE"
  LOG_IS_OPEN=1

  log "dsh-backup starting: DSH_HOME=$DSH_HOME_DIR BACKUP_ROOT=$BACKUP_ROOT DSH=$DSH_VERSION"
  log "profile=$PROFILE unit=$SERVICE_UNIT (recorded only; the service is not touched)"

  STAGING="${BACKUP_ROOT}/.staging-${TS}-$$"
  mkdir -p -- "$STAGING"
  chmod 700 -- "$STAGING"
  # shellcheck disable=SC2064 # expand paths now on purpose
  trap '[[ -n ${STAGING:-} ]] && rm -rf -- "${STAGING:-}"' EXIT

  BACKUP_DIR="$STAGING"
  local t_extract_start t_extract_end t_hs_start t_hs_end
  t_extract_start=$(now_ms)

  TARBALL="${BACKUP_DIR}/dsh-personal-${TS}.tar.gz"
  local -a tar_entries=()
  for entry in "${REQUIRED_ENTRIES[@]}"; do
    if [[ -e ${DSH_HOME_DIR}/${entry} ]]; then
      tar_entries+=("$entry")
    else
      warn "expected entry '${entry}' is absent from $DSH_HOME_DIR; continuing without it"
    fi
  done
  ((${#tar_entries[@]} > 0)) || die "nothing to back up under '$DSH_HOME_DIR'"

  log "tar entries: $(printf '%s ' "${tar_entries[@]}")"
  tar --numeric-owner --one-file-system \
    --exclude='profiles/*/node_modules/.cache' \
    --exclude='profiles/*/.pnpm-debug.log' \
    -C "$DSH_HOME_DIR" -czf "$TARBALL" "${tar_entries[@]}"
  chmod 600 -- "$TARBALL"

  t_extract_end=$(now_ms)
  note "tar produced $(file_size "$TARBALL") bytes"

  # ── contents inventory ──
  add_included_tree profiles "${DSH_HOME_DIR}/profiles"
  add_included_tree workspace "${DSH_HOME_DIR}/workspace"
  add_included_tree storages "${DSH_HOME_DIR}/storages"
  add_included_tree sessions "${DSH_HOME_DIR}/sessions"
  if [[ -f ${DSH_HOME_DIR}/cordis.patch.yml ]]; then
    add_included_file cordis.patch.yml "${DSH_HOME_DIR}/cordis.patch.yml"
  fi
  if [[ -f ${DSH_HOME_DIR}/.credentials.yaml ]]; then
    add_included_file .credentials.yaml "${DSH_HOME_DIR}/.credentials.yaml"
  fi
  collect_external_symlinks

  add_artifact "$(basename -- "$TARBALL")"

  # ── Hindsight (fail soft) ──
  t_hs_start=$(now_ms)
  hindsight_export
  t_hs_end=$(now_ms)

  # ── git HEAD of the build repo (recorded; null when not a git repo) ──
  local git_json='null' git_error=''
  if git -C "$REPO_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    git_json=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || printf 'null')
    [[ $git_json == null ]] || git_json=$(printf '%s' "$git_json" | jq -c -Rs .)
  else
    git_error='not a git repository'
  fi

  local uid gid uname_s home_bytes
  uid=$(stat -c %u -- "$DSH_HOME_DIR")
  gid=$(stat -c %g -- "$DSH_HOME_DIR")
  uname_s=$(id -un)
  home_bytes=$(dir_bytes "$DSH_HOME_DIR")

  local finished_iso total_ms
  finished_iso=$(now_iso)
  total_ms=$(( $(now_ms) - STARTED_MS ))

  local retention_json timings_json source_json excluded_json tar_ms hs_ms
  tar_ms=$((t_extract_end - t_extract_start))
  hs_ms=$((t_hs_end - t_hs_start))
  retention_json=$(jq -nc --argjson d "$DAILY_KEEP" --argjson w "$WEEKLY_KEEP" \
    --arg prune "$PRUNE" \
    '{daily_keep:$d, weekly_keep:$w, prune_enabled:($prune=="1")}')
  timings_json=$(jq -nc \
    --argjson tar "$tar_ms" \
    --argjson hindsight "$hs_ms" \
    --argjson total "$total_ms" \
    '{tar_and_stage_ms:$tar, hindsight_ms:$hindsight, total_ms:$total}')
  source_json=$(jq -nc --argjson uid "$uid" --argjson gid "$gid" --arg user "$uname_s" \
    --argjson bytes "$home_bytes" \
    '{owner_uid:$uid, owner_gid:$gid, owner_user:$user, home_bytes:$bytes}')
  excluded_json=$(jq -nc '[
    "logs/ — may contain conversation content; use journald/file logs separately",
    ".anonymous-user-id — regenerated identity, deliberately not preserved",
    "DSH install tree (/home/josh/dsh) — reinstall from the pinned DSH version",
    "the build repo itself — versioned separately",
    "~/.hermes and Hermes Hindsight data — never touched or backed up here"
  ]')

  jq -n \
    --arg id "$TS" \
    --arg started "$STARTED_ISO" \
    --arg finished "$finished_iso" \
    --arg hostname "$(uname -n)" \
    --arg dsh_home "$DSH_HOME_DIR" \
    --arg dsh_version "$DSH_VERSION" \
    --arg node_version "$NODE_VERSION" \
    --arg dsh_bin "$DSH_BIN" \
    --arg profile "$PROFILE" \
    --arg unit "$SERVICE_UNIT" \
    --arg backup_root "$BACKUP_ROOT" \
    --arg repo_dir "$REPO_DIR" \
    --argjson git_head "$git_json" \
    --arg git_error "$git_error" \
    --argjson artifacts "$ARTIFACTS_JSON" \
    --argjson included "$INCLUDED_JSON" \
    --argjson excluded "$excluded_json" \
    --argjson external_symlinks "$EXTERNAL_SYMLINKS_JSON" \
    --argjson hindsight "$HINDSIGHT_JSON" \
    --argjson retention "$retention_json" \
    --argjson timings "$timings_json" \
    --argjson source "$source_json" \
    '{
      schema_version: 1,
      backup: {id:$id, kind:"daily", started_at:$started, finished_at:$finished, hostname:$hostname},
      dsh: {home:$dsh_home, profile:$profile, version:$dsh_version, node_version:$node_version,
            bin:$dsh_bin, unit:$unit, unit_control:"recorded-only (this script never runs systemctl)"},
      repo: {dir:$repo_dir, git_head:$git_head, git_head_note:$git_error},
      source: $source,
      artifacts: $artifacts,
      contents: {included: $included, excluded: $excluded, external_symlinks: $external_symlinks},
      hindsight: $hindsight,
      retention: $retention,
      timings: $timings
    }' >"${BACKUP_DIR}/manifest.json.tmp"
  mv -- "${BACKUP_DIR}/manifest.json.tmp" "${BACKUP_DIR}/manifest.json"
  chmod 600 -- "${BACKUP_DIR}/manifest.json"

  (cd "$BACKUP_DIR" && sha256sum -- "$(basename -- "$TARBALL")" >SHA256SUMS)
  local hs_artifact
  hs_artifact=$(jq -r '.hindsight.artifact // empty' "${BACKUP_DIR}/manifest.json")
  if [[ -n $hs_artifact ]]; then
    (cd "$BACKUP_DIR" && sha256sum -- "$hs_artifact" >>SHA256SUMS)
  fi
  chmod 600 -- "${BACKUP_DIR}/SHA256SUMS"

  check_no_secrets
  if [[ $SECRET_CHECK_RESULT != 'pass' ]]; then
    log "aborting: secret check failed; staging dir removed, nothing published"
    rm -rf -- "$STAGING"
    STAGING=''
    exit 3
  fi

  # Re-write the manifest with the secret-check result before publishing.
  jq --arg status "$SECRET_CHECK_RESULT" --arg detail "$SECRET_CHECK_DETAIL" \
    --argjson n "$SECRET_VALUES_COUNT" \
    '.secrets_check = {status:$status, detail:$detail, credential_values_compared:$n}' \
    "${BACKUP_DIR}/manifest.json" >"${BACKUP_DIR}/manifest.json.tmp"
  mv -- "${BACKUP_DIR}/manifest.json.tmp" "${BACKUP_DIR}/manifest.json"
  chmod 600 -- "${BACKUP_DIR}/manifest.json"

  # ── publish ──
  local final_dir="${BACKUP_ROOT}/daily/${TS}"
  if [[ -e $final_dir ]]; then
    sleep 1
    TS=$(date -u +%Y%m%dT%H%M%SZ)
    final_dir="${BACKUP_ROOT}/daily/${TS}"
    [[ -e $final_dir ]] && die "backup dir '$final_dir' already exists"
  fi
  mv -- "$STAGING" "$final_dir"
  STAGING=''
  trap - EXIT

  BACKUP_DIR="$final_dir"
  log "published: $BACKUP_DIR"
  promote_weekly
  apply_retention

  local total_final
  total_final=$(( $(now_ms) - STARTED_MS ))
  log "summary: id=$TS dsh=$DSH_VERSION artifacts=$(jq '.artifacts|length' "$final_dir/manifest.json") \
size=$(du -sh -- "$final_dir" | awk '{print $1}') total_ms=$total_final"

  # Redacted, human-checkable one-liner.
  printf 'BACKUP OK  %s\n' "$final_dir"
  printf '  tarball : %s (%s bytes, sha256 %s)\n' "$(basename -- "$TARBALL")" \
    "$(file_size "$final_dir/$(basename -- "$TARBALL")")" \
    "$(jq -r '.artifacts[0].sha256' "$final_dir/manifest.json")"
  printf '  manifest: %s\n' "$final_dir/manifest.json"
  printf '  verify  : %s --verify %s\n' "${BASH_SOURCE[0]}" "$final_dir"
  printf '  drill   : %s --backup %s\n' "${SELF_DIR}/dsh-restore-drill.sh" "$final_dir"
  printf '  hindsight: %s\n' "$(jq -r '.hindsight.status' "$final_dir/manifest.json")"
  printf '  log     : %s\n' "$LOG_FILE"
}

main "$@"
