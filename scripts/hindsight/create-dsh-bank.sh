#!/usr/bin/env bash
# create-dsh-bank.sh — create/verify the personal agent's Hindsight bank (D13: shared instance).
#
# M0 scope: create bank `dsh-personal` on the existing Hindsight instance (default
# http://127.0.0.1:9177), verify it exists with zero facts, and prove the export endpoint works.
# It never touches the Hermes banks (`josh`, `hermes-bank-3`, `hermes-bank-2`) and never talks to Postgres.
#
# Usage:
#   scripts/hindsight/create-dsh-bank.sh [--base-url URL] [--bank-id NAME] [--dry-run] [--verify-export]
# Exit: 0 ok, 1 API error, 2 guard/usage error.
set -euo pipefail

BASE_URL="http://127.0.0.1:9177"
BANK_ID="dsh-personal"
DRY_RUN=0
VERIFY_EXPORT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:?}"; shift 2 ;;
    --bank-id) BANK_ID="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --verify-export) VERIFY_EXPORT=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Guard: never operate on Hermes banks, whatever the arguments say.
case "$BANK_ID" in
  josh|hermes-bank-3|hermes-bank-2|hermes|default)
    echo "REFUSED: '$BANK_ID' is a Hermes/reserved bank; the personal agent must use 'dsh-personal'." >&2
    exit 2 ;;
esac
if [[ -z "$BANK_ID" || "$BANK_ID" == */* ]]; then
  echo "REFUSED: invalid bank id '$BANK_ID'" >&2
  exit 2
fi

api() { # api METHOD PATH [JSON]
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -m 10 -X "$method" -H 'Content-Type: application/json' -d "$body" "${BASE_URL}${path}"
  else
    curl -fsS -m 10 -X "$method" "${BASE_URL}${path}"
  fi
}

echo "Hindsight: ${BASE_URL}  bank: ${BANK_ID}"

# 1) Confirm the instance answers and list existing banks (read-only).
if ! banks="$(api GET /v1/default/banks)"; then
  echo "ERROR: cannot reach Hindsight at ${BASE_URL} (fail-soft: M0 bank block skipped)." >&2
  exit 1
fi
echo "existing banks: $(printf '%s' "$banks" | python3 -c 'import json,sys; print(", ".join(b["bank_id"] for b in json.load(sys.stdin).get("banks",[])))' 2>/dev/null || echo '<unparsed>')"

exists="$(printf '%s' "$banks" | python3 -c 'import json,sys; b=sys.argv[1]; print("yes" if any(x["bank_id"]==b for x in json.load(sys.stdin).get("banks",[])) else "no")' "$BANK_ID" 2>/dev/null || echo no)"

if [[ "$exists" == "yes" ]]; then
  echo "bank already exists: ${BANK_ID}"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: would PUT /v1/default/banks/${BANK_ID}"
  else
    echo "creating bank ${BANK_ID} ..."
    # PUT /v1/default/banks/{bank_id} creates the bank. Name is a display label only.
    api PUT "/v1/default/banks/${BANK_ID}" "{\"name\":\"DSH personal agent\"}" >/dev/null
    echo "created bank ${BANK_ID}"
  fi
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY-RUN: skipping verification"
  exit 0
fi

# 2) Verify it exists, with stats (0 facts is correct for a fresh bank).
echo "== stats =="
api GET "/v1/default/banks/${BANK_ID}/stats" | python3 -m json.tool 2>/dev/null | head -20 || {
  echo "ERROR: bank ${BANK_ID} not readable after creation" >&2; exit 1; }

# 3) Prove the bank is addressable only by its own id: the other (Hermes) banks are listed,
#    but this script never reads or writes them. Record their ids for the build log.
echo "== bank inventory (read-only, no content read) =="
printf '%s' "$banks" | python3 -c '
import json,sys
for b in json.load(sys.stdin).get("banks",[]):
    print(f"  {b[\"bank_id\"]:16s} facts={b.get(\"fact_count\",\"?\")}")' 2>/dev/null || true

# 4) Optional: verify the export endpoint works (used by the backup script).
if [[ "$VERIFY_EXPORT" -eq 1 ]]; then
  echo "== export probe =="
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  code="$(curl -sS -m 30 -o "$tmp" -w '%{http_code}' "${BASE_URL}/v1/default/banks/${BANK_ID}/export" || true)"
  size="$(wc -c <"$tmp" | tr -d ' ')"
  echo "  GET /v1/default/banks/${BANK_ID}/export -> HTTP ${code}, ${size} bytes, sha256 $(sha256sum "$tmp" | cut -d' ' -f1)"
  [[ "$code" == "200" ]] || { echo "ERROR: export failed" >&2; exit 1; }
fi

echo "OK: bank ${BANK_ID} ready on ${BASE_URL}"
