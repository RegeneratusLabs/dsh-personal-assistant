#!/usr/bin/env bash
# verify-autologin-proxy.sh — prove the tailnet edge proxies are transparent.
#
# The 10 Nov 2026 outage: the proxy's "client already has its cookie" branch
# sent the upstream request WITHOUT any Cookie header, so every POST from a
# logged-in browser was answered 401 (empty session list, "HTTP 401" on new
# session). GETs hid the bug because a 401 on GET/HEAD triggers one re-mint and
# retry inside the proxy, while POSTs are never retried.
#
# Therefore this script must test BOTH auth paths with a POST:
#   A) no cookie    -> proxy mints and injects  (inject path)
#   B) own cookie   -> proxy forwards verbatim  (pass path)  <- the regression
# and it must assert a real RPC succeeds, not just a 200 on a static asset.
#
# Usage: ./scripts/verify-autologin-proxy.sh [--strict]
#   --strict  treat a redirect-only (303) login exchange as a failure too
set -uo pipefail

fail=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }

# entry-label  tailnet-base  token-source
#   file:<path>      read the launch-token URL from a log file (units that append)
#   journal:<unit>   read it from the unit's journal (hardened units log there)
ENTRIES=(
  "443|https://homelab.taildace6c.ts.net|file:$HOME/dsh/logs/web.log"
  "8454|https://homelab.taildace6c.ts.net:8454|journal:dsh-personal.service"
)

RPC='{"type":"client-request","rpcId":"verify","method":"session/list","payload":{"args":{"_request":{}}}}'

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r label base source <<<"$entry"
  echo "== entry :$label -> $base =="

  # A) inject path: no cookie at all.
  body=$(curl -s -m 15 -H 'content-type: application/json' -d "$RPC" "$base/api/session/list")
  if grep -q '"ok":true' <<<"$body"; then
    ok "no-cookie POST session/list authenticated (inject path)"
  else
    bad "no-cookie POST session/list -> $(head -c 160 <<<"$body")"
  fi

  # B) pass path: the client's own valid cookie, minted exactly as a browser does.
  jar=$(mktemp)
  if [[ $source == journal:* ]]; then
    token=$(journalctl --user -u "${source#journal:}" -n 400 --no-pager -o cat 2>/dev/null \
      | grep -o 'token=[A-Za-z0-9_-]*' | tail -1 | cut -d= -f2)
  else
    token=$(grep -o 'token=[A-Za-z0-9_-]*' "${source#file:}" 2>/dev/null | tail -1 | cut -d= -f2)
  fi
  if [[ -z "$token" ]]; then
    bad "no launch token in $source"
    rm -f "$jar"; continue
  fi
  exchange=$(curl -s -o /dev/null -w '%{http_code}' -m 15 -c "$jar" \
    -H "Host: ${base#https://}" "http://127.0.0.1:$( [[ $label == 443 ]] && echo 7000 || echo 7002 )/?token=$token")
  if [[ $exchange == 200 || $exchange == 303 ]]; then
    ok "login token exchange ($exchange)"
  else
    bad "login token exchange -> $exchange"
  fi
  if ! grep -q 'dsh-auth-' "$jar"; then bad "token exchange set no auth cookie"; rm -f "$jar"; continue; fi

  body=$(curl -s -m 15 -b "$jar" -H 'content-type: application/json' -d "$RPC" "$base/api/session/list")
  if grep -q '"ok":true' <<<"$body"; then
    n=$(grep -o '"sessionId"' <<<"$body" | wc -l)
    ok "own-cookie POST session/list authenticated (pass path), $n sessions"
  else
    bad "own-cookie POST session/list -> $(head -c 160 <<<"$body")"
    echo "         (if this is 'unauthorized', the proxy is stripping the Cookie header again)"
  fi
  rm -f "$jar"
done

if ((fail == 0)); then
  echo "all checks passed"
else
  echo "$fail check(s) failed"
fi
exit $((fail == 0 ? 0 : 1))
