#!/usr/bin/env bash
# =============================================================================
# scan-logs-for-secrets.sh — M0 local secret-leak scanner (READ-ONLY)
# =============================================================================
# Scans local log/telemetry paths for credential-shaped strings. It prints ONLY
# `file:line`, a type label, and a REDACTED match (first/last characters plus
# length). The full matched value is never printed and never written anywhere.
# Exit: 0 = no findings, 1 = findings, 2 = usage/IO error.
#
# This is a leak *detector*, not a redactor: it does not modify logs. Run it
# before exporting/copying telemetry and on a schedule (digest §7).
# Design: research/m0-telemetry.md §3–§4.
#
# Default targets (when no PATH is given): existing DSH log directories
#   $HOME/dsh/logs   $DSH_HOME/logs
# Explicit paths may be files, directories (scanned recursively), or '-'
# (stdin). Compressed logs (.zst/.zstd/.gz) are decompressed on the fly.
#
# Examples:
#   scripts/telemetry/scan-logs-for-secrets.sh
#   scripts/telemetry/scan-logs-for-secrets.sh /var/log/syslog
#   scripts/telemetry/scan-logs-for-secrets.sh --json --exclude '*.jsonl'
#   zstd -dc session.v4.jsonl.zstd | scripts/telemetry/scan-logs-for-secrets.sh -
# =============================================================================
set -uo pipefail

SCRIPT_NAME=${0##*/}
JSON=0
QUIET_OK=0
MAX_FILE_SIZE=${MAX_FILE_SIZE:-67108864}   # 64 MiB per file
COMPRESSED=auto                            # auto | 0
SCANNED_FILES=0
SKIPPED=0
FINDINGS=0
declare -a FINDINGS_RAW=()   # "file\tline\ttype\tmasked"
declare -a EXCLUDES=()
declare -a PATHS=()

usage() {
  cat <<'USAGE'
scan-logs-for-secrets.sh — read-only credential scan for local logs

Usage: scan-logs-for-secrets.sh [options] [PATH...]

PATH may be a file, a directory (recursive), or '-' for stdin. A bare PATH that
does not exist is an error (exit 2). With no PATH, existing default DSH log
directories are scanned.

Options:
  --json                     machine-readable output (findings still redacted)
  --exclude GLOB             skip paths matching GLOB (repeatable)
  --max-file-size BYTES      skip files larger than this (default: 67108864)
  --no-compressed            do not decompress .zst/.zstd/.gz files
  --quiet-ok                 print nothing when there are no findings
  -h, --help                 this help

Exit: 0 clean · 1 findings · 2 usage/IO error.
USAGE
}

die() { printf '%s: %s\n' "$SCRIPT_NAME" "$1" >&2; exit 2; }
note() { printf '%s: %s\n' "$SCRIPT_NAME" "$1" >&2; }

need_arg() { [[ $# -ge 2 && -n ${2:-} ]] || die "option $1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --json) JSON=1 ;;
    --exclude) need_arg "$@"; EXCLUDES+=("$2"); shift ;;
    --max-file-size) need_arg "$@"; MAX_FILE_SIZE=$2; shift ;;
    --no-compressed) COMPRESSED=0 ;;
    --quiet-ok) QUIET_OK=1 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [[ $# -gt 0 ]]; do PATHS+=("$1"); shift; done; break ;;
    -) PATHS+=("-") ;;
    -*) die "unknown option '$1' (try --help)" ;;
    *) PATHS+=("$1") ;;
  esac
  shift
done

[[ $MAX_FILE_SIZE =~ ^[0-9]+$ ]] || die "--max-file-size must be an integer"

# ── pattern catalogue: type|ERE ──────────────────────────────────────────────
# Keep specific patterns before generic ones (a match is reported once, under
# the first type that matched it).
PATTERNS=(
  'private-key|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'
  'anthropic-key|sk-ant-[A-Za-z0-9_-]{20,}'
  'openai-or-deepseek-key|sk-[A-Za-z0-9_-]{20,}'
  'opencode-key|oc_sk_[A-Za-z0-9_-]{16,}'
  'slack-token|xox[baprs]-[A-Za-z0-9-]{10,}'
  'github-token|gh[pousr]_[A-Za-z0-9]{20,}'
  'github-fine-grained-pat|github_pat_[A-Za-z0-9_]{20,}'
  'aws-access-key|AKIA[0-9A-Z]{16}'
  'google-api-key|AIza[0-9A-Za-z_-]{35}'
  'telegram-bot-token|[0-9]{8,10}:[A-Za-z0-9_-]{35}'
  'jwt|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'authorization-header|[Aa]uthorization: *(Bearer|Basic) +[A-Za-z0-9._~+/=-]{16,}'
  'url-credential|[?&](token|access_token|api_key|apikey|key|sig|signature)=[A-Za-z0-9._~%+-]{16,}'
  'bearer-token|Bearer +[A-Za-z0-9._~+/=-]{20,}'
  'keyed-secret|(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|client[_-]?secret)["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?[A-Za-z0-9._~+/=-]{16,}'
)

# ── redaction ────────────────────────────────────────────────────────────────
generic_redact() { # raw -> masked with length
  local s=$1 n=${#1}
  if (( n <= 8 )); then printf '<redacted len=%d>' "$n"
  else printf '%s…%s (len %d)' "${s:0:4}" "${s: -2}" "$n"; fi
}

redact_match() { # type raw
  local type=$1 raw=$2
  case $type in
    private-key)
      printf '[private-key-header]'
      return 0 ;;
    authorization-header)
      # Keep only the scheme label, never the credential.
      if [[ $raw =~ ^([Aa]uthorization: *(Bearer|Basic) +)(.+)$ ]]; then
        printf '%s<redacted len=%d>' "${BASH_REMATCH[1]}" "${#BASH_REMATCH[3]}"
      else
        printf '[authorization-header <redacted>]'
      fi
      return 0 ;;
    url-credential)
      # Keep the query-parameter name; never the value.
      if [[ $raw =~ ^([?&][A-Za-z_]+=)(.+)$ ]]; then
        printf '%s<redacted len=%d>' "${BASH_REMATCH[1]}" "${#BASH_REMATCH[2]}"
      else
        printf '[url-credential <redacted>]'
      fi
      return 0 ;;
    bearer-token)
      printf 'Bearer <redacted len=%d>' "$(( ${#raw} - 7 ))"
      return 0 ;;
    keyed-secret)
      # Preserve the key name (not a secret), redact the value.
      if [[ $raw =~ ^(.*[=:][[:space:]]*[\"\']?)([A-Za-z0-9._~+/=-]{16,})$ ]]; then
        local pre=${BASH_REMATCH[1]}
        pre=${pre%\"}; pre=${pre%\'}
        printf '%s<redacted len=%d>' "$pre" "${#BASH_REMATCH[2]}"
      else
        generic_redact "$raw"
      fi
      return 0 ;;
    *)
      generic_redact "$raw"
      return 0 ;;
  esac
}

# ── finding recording ────────────────────────────────────────────────────────
declare -A SEEN=() SEEN_AT_LINE=()
# Strong/weak pattern pairs: when the strong type matches a line, the weak type
# is not reported again for that line (same credential, less informative label).
# "strong:weak"
OVERLAP_PAIRS=(
  'anthropic-key:openai-or-deepseek-key'
  'authorization-header:bearer-token'
  'url-credential:keyed-secret'
)

overlap_strong_for() { # weak type -> strong type or ''
  local pair
  for pair in "${OVERLAP_PAIRS[@]}"; do
    [[ ${pair#*:} == "$1" ]] && { printf '%s' "${pair%%:*}"; return 0; }
  done
  printf ''
}

overlap_weak_for() { # strong type -> weak type or ''
  local pair
  for pair in "${OVERLAP_PAIRS[@]}"; do
    [[ ${pair%%:*} == "$1" ]] && { printf '%s' "${pair#*:}"; return 0; }
  done
  printf ''
}

record_finding() { # file line type raw
  local file=$1 line=$2 type=$3 raw=$4 key="$1:$2:$3:$4"
  [[ -n ${SEEN[$key]:-} ]] && return 0
  local strong weak
  strong=$(overlap_strong_for "$type")
  if [[ -n $strong && -n ${SEEN_AT_LINE["$file:$line:$strong"]:-} ]]; then return 0; fi
  weak=$(overlap_weak_for "$type")
  if [[ -n $weak && -n ${SEEN_AT_LINE["$file:$line:$weak"]:-} ]]; then
    # The strong pattern fired after the weak one; drop the weaker record.
    local out=() rec
    for rec in "${FINDINGS_RAW[@]}"; do
      [[ $rec == "$file"$'\t'"$line"$'\t'"$weak"$'\t'* ]] && continue
      out+=("$rec")
    done
    FINDINGS_RAW=("${out[@]}")
    FINDINGS=$((FINDINGS - 1))
  fi
  SEEN[$key]=1
  SEEN_AT_LINE["$file:$line:$type"]=1
  local masked
  masked=$(redact_match "$type" "$raw")
  FINDINGS_RAW+=("$file"$'\t'"$line"$'\t'"$type"$'\t'"$masked")
  FINDINGS=$((FINDINGS + 1))
}

# ── file scanning ────────────────────────────────────────────────────────────
# Every pattern is one grep pass over the source. Compressed sources are
# streamed (never fully buffered); stdin is buffered once so all passes match
# the same bytes. All values are redacted before they reach the output arrays.
scan_source() { # label kind src
  local label=$1 kind=$2 src=$3 entry ptype pat hit
  local -a cmd
  case $kind in
    file) cmd=(cat -- "$src") ;;
    zstd) cmd=(zstd -dc -- "$src") ;;
    gzip) cmd=(gzip -dc -- "$src") ;;
    stdin) cmd=(printf '%s\n' "$STDIN_DATA") ;;
    *) die "internal: unknown source kind $kind" ;;
  esac
  for entry in "${PATTERNS[@]}"; do
    ptype=${entry%%|*}
    pat=${entry#*|}
    while IFS= read -r hit; do
      [[ -z $hit ]] && continue
      record_finding "$label" "${hit%%:*}" "$ptype" "${hit#*:}"
    done < <("${cmd[@]}" 2>/dev/null | grep -naoE -- "$pat" 2>/dev/null)
  done
}

scan_file() { # path
  local f=$1 size=0 kind=''
  [[ -f $f ]] || return 0
  size=$(stat -c %s -- "$f" 2>/dev/null) || size=0
  if (( size > MAX_FILE_SIZE )); then
    note "skip (size ${size}B > ${MAX_FILE_SIZE}B): $f"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi
  case $f in
    *.zst|*.zstd)
      if [[ $COMPRESSED == 0 ]]; then note "skip (compressed, --no-compressed): $f"; SKIPPED=$((SKIPPED + 1)); return 0; fi
      command -v zstd >/dev/null 2>&1 || { note "skip (zstd not installed): $f"; SKIPPED=$((SKIPPED + 1)); return 0; }
      kind=zstd ;;
    *.gz)
      if [[ $COMPRESSED == 0 ]]; then note "skip (compressed, --no-compressed): $f"; SKIPPED=$((SKIPPED + 1)); return 0; fi
      command -v gzip >/dev/null 2>&1 || { note "skip (gzip not installed): $f"; SKIPPED=$((SKIPPED + 1)); return 0; }
      kind=gzip ;;
    *)
      kind=file
      # Binary files without a known compression suffix are skipped.
      if ! grep -Iq . -- "$f" 2>/dev/null; then
        note "skip (binary): $f"
        SKIPPED=$((SKIPPED + 1))
        return 0
      fi ;;
  esac
  SCANNED_FILES=$((SCANNED_FILES + 1))
  scan_source "$f" "$kind" "$f"
}

STDIN_DATA=''
scan_stdin() {
  STDIN_DATA=$(head -c "$MAX_FILE_SIZE" 2>/dev/null) || die "cannot read stdin"
  SCANNED_FILES=$((SCANNED_FILES + 1))
  scan_source '(stdin)' stdin ''
}

# ── path expansion ───────────────────────────────────────────────────────────
path_excluded() { # path
  local p=$1 g
  for g in "${EXCLUDES[@]}"; do
    # bash glob match on the full path (no extglob)
    # shellcheck disable=SC2053
    [[ $p == $g ]] && return 0
  done
  return 1
}

expand_dir() { # dir
  local dir=$1 f
  while IFS= read -r -d '' f; do
    path_excluded "$f" && continue
    printf '%s\0' "$f"
  done < <(find "$dir" \
    \( -type d \( -name .git -o -name node_modules -o -name .cache \) -prune \) -o \
    -type f -print0 2>/dev/null)
}

declare -a FILES=()
DEFAULT_TARGETS_USED=0

if (( ${#PATHS[@]} == 0 )); then
  DEFAULT_TARGETS_USED=1
  for d in "$HOME/dsh/logs" "${DSH_HOME:-$HOME/.dsh-personal}/logs"; do
    [[ -d $d ]] && PATHS+=("$d")
  done
  [[ ${#PATHS[@]} -gt 0 ]] || die "no default log directories found; pass PATH explicitly"
fi

stdin_mode=0
for p in "${PATHS[@]}"; do
  case $p in
    -) stdin_mode=1 ;;
    *)
      if [[ -f $p ]]; then
        path_excluded "$p" || FILES+=("$p")
      elif [[ -d $p ]]; then
        while IFS= read -r -d '' f; do FILES+=("$f"); done < <(expand_dir "$p")
      else
        die "path does not exist: $p"
      fi ;;
  esac
done

for f in "${FILES[@]}"; do scan_file "$f"; done
if (( stdin_mode )); then scan_stdin; fi

# ── output (sorted by file, then line) ───────────────────────────────────────
declare -a SORTED=()
if (( ${#FINDINGS_RAW[@]} > 0 )); then
  mapfile -t SORTED < <(printf '%s\n' "${FINDINGS_RAW[@]}" | sort -t$'\t' -k1,1 -k2,2n)
fi

if (( JSON )); then
  json_escape() {
    local s=$1
    s=${s//\\/\\\\}; s=${s//\"/\\\"}
    s=${s//$'\n'/\\n}; s=${s//$'\r'/\\r}; s=${s//$'\t'/\\t}
    printf '%s' "$s"
  }
  printf '{"schema_version":1,"scanned_files":%d,"skipped":%d,"findings":%d,"results":[' \
    "$SCANNED_FILES" "$SKIPPED" "$FINDINGS"
  i=0
  for rec in "${SORTED[@]}"; do
    IFS=$'\t' read -r rfile rline rtype rmatch <<<"$rec"
    (( i > 0 )) && printf ','
    printf '{"file":"%s","line":%s,"type":"%s","match":"%s"}' \
      "$(json_escape "$rfile")" "$rline" "$(json_escape "$rtype")" "$(json_escape "$rmatch")"
    i=$((i + 1))
  done
  printf ']}\n'
else
  if (( FINDINGS > 0 )); then
    for rec in "${SORTED[@]}"; do
      IFS=$'\t' read -r rfile rline rtype rmatch <<<"$rec"
      printf '%s:%s: [%s] %s\n' "$rfile" "$rline" "$rtype" "$rmatch"
    done
    printf 'SUMMARY: %d finding(s) across %d scanned file(s); values redacted\n' "$FINDINGS" "$SCANNED_FILES"
  elif (( QUIET_OK == 0 )); then
    printf 'SUMMARY: no credential-shaped strings in %d scanned file(s)\n' "$SCANNED_FILES"
  fi
fi

(( FINDINGS > 0 )) && exit 1
exit 0
