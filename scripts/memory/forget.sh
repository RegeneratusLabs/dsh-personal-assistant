#!/usr/bin/env bash
# forget.sh — human-invoked deletion of a Hindsight memory document (bank dsh-personal only).
#
# The mature Hindsight plugin exposes no forget/delete tool (verified 2026-11-10: its 8 tools are
# bank/capture/knowledge/memories/memory/reflect/search/sync-status — no delete). This script is the
# deliberate, human-invoked counterpart; it is NOT exposed to the model, so "forget" stays an explicit
# human action rather than a tool a prompt injection could call.
#
# Usage:
#   scripts/memory/forget.sh --list
#   scripts/memory/forget.sh --match <text> --yes
#   scripts/memory/forget.sh --doc <document-id> --yes
#   scripts/memory/forget.sh --clear --yes          # whole bank (destructive)
#   [--bank dsh-personal] [--base-url http://127.0.0.1:9177]
#
# Semantics (Hindsight 0.10.3): document delete removes the SOURCE document, but derived
# observations/memory units can survive it, so recall may still surface the fact. The REST API has
# no per-memory delete; a true erasure is the whole-bank clear (`--clear`, destructive) plus the
# usual backup. That is why this script is human-invoked and never exposed as a model tool.
#
# Exit: 0 ok, 2 guard/usage error, 1 request failure.
set -euo pipefail

BASE_URL="http://127.0.0.1:9177"
BANK="dsh-personal"
LIST=0
DOC=""
MATCH=""
CLEAR=0
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:?}"; shift 2 ;;
    --bank) BANK="${2:?}"; shift 2 ;;
    --list) LIST=1; shift ;;
    --doc) DOC="${2:?}"; shift 2 ;;
    --match) MATCH="${2:?}"; shift 2 ;;
    --clear) CLEAR=1; shift ;;
    --yes) YES=1; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Guard: this script only ever deletes from the personal agent's own bank.
case "$BANK" in
  josh|hermes-bank-3|hermes-bank-2|hermes) echo "REFUSED: '$BANK' is a Hermes bank; only 'dsh-personal' may be forgotten." >&2; exit 2 ;;
esac
[[ "$BANK" == "dsh-personal" ]] || { echo "REFUSED: --bank must be dsh-personal" >&2; exit 2; }

api() { curl -fsS -m 10 "$@"; }

docs_json="$(api "${BASE_URL}/v1/default/banks/${BANK}/documents?limit=200")" || {
  echo "ERROR: cannot list documents on ${BASE_URL}" >&2; exit 1; }

mapfile -t rows < <(printf '%s' "$docs_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for it in d.get("items",[]):
    print("\t".join([str(it.get("id","")), str(it.get("created_at","")), str(it.get("memory_unit_count","")), str(it.get("text_length",""))]))
')

if [[ "$LIST" -eq 1 ]]; then
  printf '%-55s %-32s %6s %8s\n' "DOCUMENT ID" "CREATED" "UNITS" "BYTES"
  for row in "${rows[@]}"; do IFS=$'\t' read -r id created units bytes <<<"$row"; printf '%-55s %-32s %6s %8s\n' "$id" "$created" "$units" "$bytes"; done
  exit 0
fi

targets=()
if [[ -n "$DOC" ]]; then
  for row in "${rows[@]}"; do IFS=$'\t' read -r id _ _ _ <<<"$row"; [[ "$id" == "$DOC" ]] && targets+=("$id"); done
  [[ ${#targets[@]} -gt 0 ]] || { echo "ERROR: document '$DOC' not found in bank $BANK" >&2; exit 1; }
elif [[ "$CLEAR" -eq 1 ]]; then
  echo "DESTRUCTIVE: whole-bank clear of '${BANK}' (all memories, all derived observations)."
  echo "A backup is strongly recommended first: scripts/backup/dsh-backup.sh"
  [[ "$YES" -eq 1 ]] || { echo "(re-run with --yes to clear the bank)"; exit 0; }
  code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X DELETE "${BASE_URL}/v1/default/banks/${BANK}/memories")" || code=000
  echo "DELETE /memories -> HTTP ${code}"
  [[ "$code" == "200" || "$code" == "204" ]] || { echo "ERROR: clear failed" >&2; exit 1; }
  exit 0
elif [[ -n "$MATCH" ]]; then
  needle="$(printf '%s' "$MATCH" | tr '[:upper:]' '[:lower:]')"
  for row in "${rows[@]}"; do
    IFS=$'\t' read -r id _ _ _ <<<"$row"
    hay="$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
    [[ "$hay" == *"$needle"* ]] && targets+=("$id")
  done
  [[ ${#targets[@]} -gt 0 ]] || { echo "ERROR: no document id matches '$MATCH' in bank $BANK" >&2; exit 1; }
  [[ ${#targets[@]} -le 1 ]] || { echo "ERROR: '$MATCH' matches ${#targets[@]} documents; use --doc with one of:" >&2; printf '  %s\n' "${targets[@]}" >&2; exit 2; }
else
  echo "usage: forget.sh (--list | --doc ID --yes | --match TEXT --yes)" >&2; exit 2
fi

if [[ "$YES" -ne 1 ]]; then
  echo "would delete from bank ${BANK}:"; printf '  %s\n' "${targets[@]}"; echo "(re-run with --yes to delete)"; exit 0
fi

before="$(printf '%s' "$docs_json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("items",[])))')"
for id in "${targets[@]}"; do
  code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X DELETE "${BASE_URL}/v1/default/banks/${BANK}/documents/${id}")"
  echo "deleted ${id} -> HTTP ${code}"
  [[ "$code" == "200" || "$code" == "204" || "$code" == "404" ]] || { echo "ERROR: delete failed" >&2; exit 1; }
done
after_json="$(api "${BASE_URL}/v1/default/banks/${BANK}/documents?limit=200")"
after="$(printf '%s' "$after_json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("items",[])))')"
echo "documents: ${before} -> ${after} (bank ${BANK})"
