#!/usr/bin/env bash
# Create the barebones "personal" DSH host: isolated DSH_HOME, personal profile
# (from the shipped web template bundles), model route, dsh-profiles panel, and a
# systemd user unit on port 7002. Idempotent: safe to re-run.
set -euo pipefail

HOME_DIR="$HOME/.dsh-personal"
PROFILE="$HOME_DIR/profiles/personal"
PLUGIN="/home/josh/projects/DSH-playground/plugins/dsh-profiles"
PORT="7002"  # local loopback port; 7001 is taken by the dsh-relogin helper
TAILNET_HOST="homelab.taildace6c.ts.net"
TAILNET_PORT="8454"  # public HTTPS port mapped by `tailscale serve`
DSH_BIN="$HOME/dsh/node/bin/dsh"
UNIT="$HOME/.config/systemd/user/dsh-personal.service"

echo "== home: $HOME_DIR"
mkdir -p "$PROFILE" "$HOME/.config/systemd/user" "$HOME/dsh/logs"
chmod 700 "$HOME_DIR"

if [ ! -f "$HOME_DIR/.credentials.yaml" ]; then
  cp "$HOME/.dsh/.credentials.yaml" "$HOME_DIR/.credentials.yaml"
  chmod 600 "$HOME_DIR/.credentials.yaml"
  echo "copied credentials"
fi

if [ ! -f "$HOME_DIR/cordis.patch.yml" ]; then
  cp "$HOME/.dsh/cordis.patch.yml" "$HOME_DIR/cordis.patch.yml"
  echo "copied home patch"
fi

if [ ! -f "$PROFILE/package.json" ]; then
  cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-personal",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ]
    }
  }
}
JSON
  echo "wrote profile package.json"
fi

if [ ! -f "$PROFILE/cordis.patch.yml" ]; then
  cat > "$PROFILE/cordis.patch.yml" <<'YAML'
# Personal profile patch layer. Applied after the shipped bundles; the home-level
# patch ($DSH_HOME/cordis.patch.yml) applies after this file.
#
# Model route: same OpenCode Go flat-rate subscription as the coding profile.
# Credential ref lives in $DSH_HOME/.credentials.yaml (copied from the coding home).
- id: llm-pi-ai
  config:
    providers:
      opencode-go:
        apiKeyEnv: OPENCODE_GO_API_KEY
        reasoning: high
- id: agent-default-model
  config:
    provider: opencode-go
    model: deepseek-v4.1-flash
    reasoningEffort: max

# Keep the browser login to this host for a year instead of the 30-day default.
# A patch replaces a row's config wholesale, so the trustedHosts entry from the
# base layer must be restated here.
- id: connection
  config:
    trustedHosts: !!js ctx.webStartup.trustedHosts
    cookieMaxAgeDays: 365
YAML
  echo "wrote profile cordis.patch.yml"
fi

# First-use workspace: Linux xdg-user-dir falls back to $HOME without an enabled
# Documents dir, so the Web client cannot create its default workspace. Point the
# controller at a directory inside this home instead (keeps ~/ clean).
mkdir -p "$HOME_DIR/workspace"
if ! grep -q 'id: workspace-controller' "$PROFILE/cordis.patch.yml" 2>/dev/null; then
  cat >> "$PROFILE/cordis.patch.yml" <<YAML

# Default first-use workspace (documentsDirectory/deepseek-harness) since this
# host has no enabled XDG Documents directory.
- id: workspace-controller
  config:
    documentsDirectory: $HOME_DIR/workspace
YAML
  echo "added workspace-controller documentsDirectory"
fi

echo "== install dsh-profiles panel into personal profile"
DSH_HOME="$HOME_DIR" "$DSH_BIN" plugin --profile personal add "$PLUGIN"

echo "== verify composed row"
DSH_HOME="$HOME_DIR" "$DSH_BIN" --profile personal --dump-config 2>/dev/null \
  | grep -n 'dsh-profiles' | head -5 || echo "WARN: dsh-profiles row not found in dump"

echo "== write systemd unit"
cat > "$UNIT" <<'UNIT'
[Unit]
Description=DeepSeek Harness — Personal profile (port 7002)
Documentation=https://github.com/deepseek-ai/dsh
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=PATH=%h/dsh/node/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=DSH_HOME=%h/.dsh-personal
WorkingDirectory=%h
ExecStart=%h/dsh/node/bin/dsh --profile personal --host 127.0.0.1 --port 7002 --no-open \
  --trusted-host homelab.taildace6c.ts.net --trusted-host homelab \
  --public-url https://homelab.taildace6c.ts.net:8454/
Restart=on-failure
RestartSec=5
StandardOutput=append:%h/dsh/logs/personal.log
StandardError=append:%h/dsh/logs/personal.log

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable dsh-personal.service
systemctl --user daemon-reload
systemctl --user restart dsh-personal.service
sleep 3

echo "== publish on tailnet ($TAILNET_HOST:$TAILNET_PORT -> 127.0.0.1:$PORT)"
if ! tailscale serve status 2>/dev/null | grep -q ":$TAILNET_PORT "; then
  tailscale serve --bg --https="$TAILNET_PORT" "http://127.0.0.1:$PORT"
fi

echo "== service status"
systemctl --user --no-pager status dsh-personal.service --lines=0 | head -12 || true

echo "== startup log (token line redacted preview)"
tail -n 25 "$HOME/dsh/logs/personal.log" 2>/dev/null | sed -E 's/(token=)[A-Za-z0-9_-]+/\1<redacted>/' || true

echo "== HTTP checks (401 expected before auth; poll until the listener is up)"
for u in "http://127.0.0.1:$PORT/" "https://$TAILNET_HOST:$TAILNET_PORT/"; do
  code=000
  for _ in $(seq 1 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$u" || true)
    [ "$code" != "000" ] && [ "$code" != "502" ] && break
    sleep 1
  done
  echo "$u -> HTTP $code"
done
