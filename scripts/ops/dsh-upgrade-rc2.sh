#!/usr/bin/env bash
# dsh-upgrade-rc2.sh — upgrade both DSH hosts to 0.2.2-rc.2, with rollback.
#
# Run DETACHED through systemd-run, because this script stops dsh-web.service —
# the unit that serves the Web UI (and, during an agent turn, the caller's own
# process). A transient user unit survives that stop; a plain shell does not.
#
#   systemd-run --user --collect --unit=dsh-upgrade-rc2 \
#     --property=WorkingDirectory=/home/josh \
#     /bin/bash /home/josh/projects/dsh-personal-assistant/scripts/ops/dsh-upgrade-rc2.sh
#
# Sequence:
#   1. targeted profile/home backups + the M0 personal backup script
#   2. stop dsh-personal.service and dsh-web.service
#   3. npm install -g @deepseek-ai/dsh@0.2.2-rc.2 (temp npm cache; ~/.npm has
#      root-owned cache dirs on this host)
#   4. update both profiles (agent-team bundle row removed, personal preset
#      block regenerated from the installed rc.2 preset, web dead rows removed,
#      session-search pinned to rc.2) and install the personal profile deps
#   5. --dump-config both profiles; fail on any skipped bundle / missing row
#   6. start personal, wait for 401; start web, wait for 401; write a report
#   7. on any failure after mutation starts: reinstall rc.1, restore the
#      backups, restart both
#
# Rollback files are under /home/josh/backups/rc2-upgrade-<ts>/; the report and
# log are printed at the end. Nothing under ~/.hermes is touched.
#
# Usage:
#   bash dsh-upgrade-rc2.sh --dry-run   # print the plan, change nothing
#   bash dsh-upgrade-rc2.sh             # live upgrade (detach it!)

set -Eeuo pipefail
umask 077

# A transient systemd --user unit does not inherit the DSH units' PATH.
export PATH=/home/josh/dsh/node/bin:/home/josh/.local/bin:/usr/local/bin:/usr/bin:/bin

REPO=/home/josh/projects/dsh-personal-assistant
DSH_PREFIX=/home/josh/dsh/node
DSH_BIN=$DSH_PREFIX/bin/dsh
NPM=$DSH_PREFIX/bin/npm
PERSONAL_HOME=/home/josh/.dsh-personal
WEB_HOME=/home/josh/.dsh
TARGET=0.2.2-rc.2
FROM=0.2.2-rc.1
TS=$(date +%Y%m%dT%H%M%S)
LOG=/home/josh/dsh/logs/upgrade-rc2-$TS.log
BK=/home/josh/backups/rc2-upgrade-$TS
NPM_CACHE=/tmp/dsh-upgrade-npm-cache-$TS
DRY=0
STARTED=0
[[ ${1:-} == '--dry-run' ]] && DRY=1

say() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Files restored verbatim on rollback (the dirs below are copied too).
FILES=(
  "$PERSONAL_HOME/profiles/personal/package.json"
  "$PERSONAL_HOME/profiles/personal/pnpm-lock.yaml"
  "$PERSONAL_HOME/profiles/personal/pnpm-workspace.yaml"
  "$PERSONAL_HOME/profiles/personal/cordis.patch.yml"
  "$PERSONAL_HOME/profiles/personal/compatibility.json"
  "$PERSONAL_HOME/cordis.patch.yml"
  "$PERSONAL_HOME/.credentials.yaml"
  "$WEB_HOME/profiles/web/package.json"
  "$WEB_HOME/profiles/web/pnpm-lock.yaml"
  "$WEB_HOME/profiles/web/pnpm-workspace.yaml"
  "$WEB_HOME/profiles/web/cordis.patch.yml"
  "$WEB_HOME/profiles/web/compatibility.json"
  "$WEB_HOME/cordis.patch.yml"
  "$WEB_HOME/.credentials.yaml"
)
DIRS=(
  "$PERSONAL_HOME/soul"
  "$PERSONAL_HOME/hindsight"
)

backup_files() {
  local f rel d
  for f in "${FILES[@]}"; do
    [[ -e $f ]] || continue
    rel=${f#/}
    mkdir -p "$BK/$(dirname "$rel")"
    cp -a "$f" "$BK/$rel"
  done
  for d in "${DIRS[@]}"; do
    [[ -e $d ]] || continue
    cp -a "$d" "$BK/${d#/}"
  done
  "$NPM" ls -g --depth=0 >"$BK/npm-ls.txt" 2>&1 || true
  "$DSH_BIN" --version >"$BK/version-before.txt" 2>&1 || true
  systemctl --user show -p MainPID --value dsh-personal.service >"$BK/personal-pid.txt" 2>&1 || true
  systemctl --user show -p MainPID --value dsh-web.service >"$BK/web-pid.txt" 2>&1 || true
  say "backups written to $BK"
}

restore_files() {
  local f rel d
  [[ -d $BK ]] || { say 'no backup dir; nothing to restore'; return 0; }
  for f in "${FILES[@]}"; do
    rel=${f#/}
    [[ -e $BK/$rel ]] || continue
    mkdir -p "$(dirname "$f")"
    cp -a "$BK/$rel" "$f"
  done
  for d in "${DIRS[@]}"; do
    [[ -e $BK/${d#/} ]] || continue
    rm -rf "$d"
    cp -a "$BK/${d#/}" "$d"
  done
  say 'profile files restored'
}

wait_http() {
  local url=$1 i code
  for ((i = 0; i < 90; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null || true)
    if [[ -n $code && $code != '000' ]]; then
      printf '%s' "$code"
      return 0
    fi
    sleep 1
  done
  printf 'timeout'
  return 1
}

rollback() {
  set +e
  say 'ROLLBACK: reinstalling rc.1 and restoring the profile files'
  systemctl --user stop dsh-personal.service dsh-web.service
  restore_files
  "$NPM" --cache "$NPM_CACHE" install -g "@deepseek-ai/dsh@$FROM" --no-audit --no-fund
  "$DSH_BIN" --version
  systemctl --user start dsh-personal.service
  systemctl --user start dsh-web.service
  say "ROLLBACK done; personal=$(wait_http http://127.0.0.1:7002/) web=$(wait_http http://127.0.0.1:7000/)"
  say "ROLLBACK report: $LOG"
}

fail() {
  say "FAIL: $*"
  if [[ $STARTED == 1 ]]; then
    rollback
  else
    say 'nothing was mutated; no rollback needed'
  fi
  exit 1
}

preflight() {
  say "dsh rc.2 upgrade: target=$TARGET from=$FROM dry=$DRY"
  say "repo=$REPO log=$LOG backup=$BK"
  command -v node >/dev/null || fail 'node is not on PATH'
  command -v npm >/dev/null || fail 'npm is not on PATH'
  command -v curl >/dev/null || fail 'curl is not on PATH'
  [[ -x $DSH_BIN ]] || fail "missing $DSH_BIN"
  local current
  current=$("$DSH_BIN" --version 2>/dev/null || true)
  say "current dsh: ${current:-unknown}"
  [[ $current == "$FROM" ]] || fail "expected current $FROM, got ${current:-unknown}"
  systemctl --user is-active --quiet dsh-personal.service || fail 'dsh-personal.service is not active'
  systemctl --user is-active --quiet dsh-web.service || fail 'dsh-web.service is not active'
  [[ -f $PERSONAL_HOME/profiles/personal/package.json ]] || fail 'personal profile missing'
  [[ -f $WEB_HOME/profiles/web/package.json ]] || fail 'web profile missing'
  df -Pk /home | awk 'NR==2 { exit ($4 < 3000000) }' || fail 'less than 3 GB free on /home'
}

main() {
  preflight
  if [[ $DRY == 1 ]]; then
    say 'DRY RUN OK: would back up, stop both units, install rc.2, update profiles, dump-config, restart.'
    exit 0
  fi

  mkdir -p "$BK" /home/josh/dsh/logs
  chmod 700 "$BK"
  exec >>"$LOG" 2>&1
  say "started; log=$LOG"

  backup_files
  say 'running the M0 personal backup (fail-soft)'
  DSH_PERSONAL_HOME=$PERSONAL_HOME "$REPO/scripts/backup/dsh-backup.sh" --no-prune >>"$BK/full-backup.log" 2>&1 \
    || say 'WARN: dsh-backup.sh failed; targeted backups are intact'

  STARTED=1
  say 'stopping both hosts'
  systemctl --user stop dsh-personal.service dsh-web.service

  say "installing @deepseek-ai/dsh@$TARGET (npm cache $NPM_CACHE)"
  if ! "$NPM" --cache "$NPM_CACHE" install -g "@deepseek-ai/dsh@$TARGET" --no-audit --no-fund; then
    fail 'npm install failed'
  fi
  local installed
  installed=$("$DSH_BIN" --version 2>/dev/null || true)
  [[ $installed == "$TARGET" ]] || fail "dsh reports ${installed:-unknown} after install"
  say "installed dsh $installed"

  say 'updating both profiles for rc.2'
  if ! node "$REPO/scripts/ops/update-rc2-profiles.mjs" --version "$TARGET"; then
    fail 'profile update script failed'
  fi

  say 'installing personal profile dependencies (session-search rc.2)'
  if ! DSH_HOME=$PERSONAL_HOME "$DSH_BIN" plugin --profile personal install; then
    say 'WARN: personal profile install failed; host will boot with the existing node_modules'
  fi

  say 'validating composed trees with --dump-config'
  if ! DSH_HOME=$PERSONAL_HOME "$DSH_BIN" --profile personal --dump-config >"$BK/dump-personal.yml" 2>"$BK/dump-personal.err"; then
    fail 'personal --dump-config failed'
  fi
  if ! DSH_HOME=$WEB_HOME "$DSH_BIN" --profile web --dump-config >"$BK/dump-web.yml" 2>"$BK/dump-web.err"; then
    fail 'web --dump-config failed'
  fi
  if grep -Eq 'skipping profile bundle|patch: entry .* not found' "$BK/dump-personal.err" "$BK/dump-web.err"; then
    cat "$BK/dump-personal.err" "$BK/dump-web.err"
    fail 'composed tree has skipped bundles or unresolved patch rows'
  fi
  say 'dump-config clean'

  say 'starting dsh-personal.service'
  systemctl --user start dsh-personal.service
  local personal_code
  personal_code=$(wait_http http://127.0.0.1:7002/) || fail 'personal host did not answer'
  [[ $personal_code == '401' ]] || fail "personal host answered $personal_code, expected 401"
  say 'personal host up (401)'

  say 'starting dsh-web.service'
  systemctl --user start dsh-web.service
  local web_code
  web_code=$(wait_http http://127.0.0.1:7000/) || fail 'web host did not answer'
  [[ $web_code == '401' ]] || fail "web host answered $web_code, expected 401"
  say 'web host up (401)'

  {
    echo "upgrade: $FROM -> $TARGET"
    echo "finished: $(date -Is)"
    echo "dsh: $("$DSH_BIN" --version)"
    echo "personal: 401 verified"
    echo "web: 401 verified"
    echo "backup: $BK"
    echo "log: $LOG"
    echo '--- pending ---'
    python3 "$REPO/scripts/ops/dsh-pending.py" 2>&1 || true
    echo '--- dump-config warnings ---'
    cat "$BK/dump-personal.err" "$BK/dump-web.err"
  } >"$BK/report.txt"
  say 'UPGRADE OK'
  cat "$BK/report.txt"
}

main
