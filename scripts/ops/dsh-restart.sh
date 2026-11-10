#!/usr/bin/env bash
# Restart a DSH systemd --user unit.
#
# Why this exists: DSH has no in-Web-UI restart control. The page is served by
# the very process that must restart, and the Host's "restart required" result
# has no companion "apply now" operation. So a plugin install that cannot be
# hot-applied is only cleared by a new process.
#
# The restart is handed to systemd as a *separate transient unit*. That matters
# when the caller runs inside the unit being restarted (agent bash tool, Web UI
# terminal tab): the caller dies with the old cgroup, but the restart job lives
# on. From a plain SSH shell the hand-off is harmless too.
#
# Rollback: none needed — restarting changes no file and no configuration.

set -euo pipefail

usage() {
  cat <<'EOF'
usage: dsh-restart.sh [--dry-run] [unit]

  unit        systemd --user unit to restart (default: dsh-web.service)
  --dry-run   print the plan, change nothing
  -h, --help  this text

Common units on this host
  dsh-web.service       coding host, 127.0.0.1:7000 (tailnet :443)
  dsh-personal.service  personal host, 127.0.0.1:7002 (tailnet :8454)

Notes
  * run as the user that owns the unit, not root
  * the signed Web auth cookie survives, so the open tab only needs
    Reconnect / reload — no new launch-token URL
  * in-flight turns are recorded as interrupted
EOF
}

dry=0
unit=""
while (($#)); do
  case "$1" in
    --dry-run|-n) dry=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) unit="$1" ;;
  esac
  shift
done
unit="${unit:-dsh-web.service}"

# A user unit restarted from a root shell would target the wrong manager.
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "refusing to run as root: this restarts a systemd --user unit; run as its owner" >&2
  exit 2
fi

if ! systemctl --user cat "$unit" >/dev/null 2>&1; then
  echo "no such systemd --user unit: $unit" >&2
  echo "known DSH units: $(systemctl --user list-unit-files 'dsh*.service' --no-legend 2>/dev/null | awk '{print $1}' | paste -sd' ')" >&2
  exit 2
fi

if ! systemctl --user is-active --quiet "$unit"; then
  echo "$unit is not active; start it with: systemctl --user start $unit" >&2
  exit 3
fi

es=$(systemctl --user show -p ExecStart --value "$unit")
old_pid=$(systemctl --user show -p MainPID --value "$unit")
old_since=$(systemctl --user show -p ActiveEnterTimestamp --value "$unit")
port=$(printf '%s' "$es" | grep -oE -- '--port [0-9]+' | awk '{print $2}' | head -1 || true)
profile=$(printf '%s' "$es" | grep -oE -- '--profile [^ ;]+' | awk '{print $2}' | head -1 || true)

# Is this shell a descendant of the unit about to be restarted?
in_unit=0
if grep -qF "/${unit}" /proc/self/cgroup 2>/dev/null; then
  in_unit=1
fi

echo "restart: $unit"
echo "  old pid : $old_pid (active since $old_since)"
echo "  listener: 127.0.0.1:${port:-<unknown>}${profile:+  profile: $profile}"
if (( in_unit )); then
  echo "  note    : this shell runs inside $unit and will die with the old process — expected"
fi

stamp=$(date +%s)
tag="dsh-restart-${stamp}-$$"

if (( dry )); then
  echo "dry-run: systemd-run --user --collect --unit $tag /bin/systemctl --user restart $unit"
  exit 0
fi

if command -v systemd-run >/dev/null 2>&1; then
  systemd-run --user --collect --quiet --unit "$tag" /bin/systemctl --user restart "$unit"
else
  echo "warning: systemd-run missing; falling back to a detached plain restart" >&2
  setsid systemctl --user restart "$unit" </dev/null >/dev/null 2>&1 &
fi

if (( in_unit )); then
  # The remaining checks cannot run: our own cgroup is about to be killed.
  echo "handed off as $tag; the old process tears down now (this shell included)"
  exit 0
fi

for _ in $(seq 1 120); do
  sleep 0.5
  new_pid=$(systemctl --user show -p MainPID --value "$unit" 2>/dev/null || true)
  if [[ -n ${new_pid:-} && $new_pid != 0 && $new_pid != "$old_pid" ]]; then
    break
  fi
done

if [[ -z ${new_pid:-} || $new_pid == 0 || $new_pid == "$old_pid" ]]; then
  echo "error: no new MainPID within 60 s — check: journalctl --user -u $unit -n 50" >&2
  exit 4
fi
echo "  new pid : $new_pid  state: $(systemctl --user is-active "$unit")"

if [[ -n ${port:-} ]]; then
  code=000
  for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:${port}/" 2>/dev/null || echo 000)
    [[ $code != 000 ]] && break
    sleep 0.5
  done
  case $code in
    000) echo "warning: 127.0.0.1:$port not answering yet" >&2; exit 5 ;;
    *)   echo "  http    : http://127.0.0.1:${port}/ -> $code (401 = up, waiting for the auth cookie)" ;;
  esac
fi

echo "done: reload the Web UI tab — the cookie survives, no new token needed"
