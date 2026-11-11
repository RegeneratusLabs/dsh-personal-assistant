#!/usr/bin/env bash
# Admission patch: owner-auth gate for dsh-guizang-design 0.1.4.
#
# Why: the plugin registers its own `/guizang-design` prefix on the DSH web
# server. DSH does not authenticate plugin routes; the plugin checks Origin on
# POST only, so its GET routes (gallery, examples, thumbnails, private works)
# and its POST routes answered anyone who could reach the port — including over
# the tailnet. `ctx.connection.requestRejection()` is the DSH seam that applies
# the Host/Origin fence and the owner cookie; this patch calls it before any
# route work and fails closed when the service is unavailable.
#
# Scope: the *installed* copy in a profile's node_modules. The package is
# hardlinked from the pnpm store, so the file is replaced (copy + mv) instead of
# edited in place. Re-apply after reinstall/upgrade; pinned to 0.1.4.
#
# Usage: scripts/ops/patch-guizang-auth.sh [profile-dir]
#   default profile dir: $DSH_PERSONAL_HOME/profiles/personal
set -euo pipefail

PROFILE_DIR="${1:-${DSH_PERSONAL_HOME:-$HOME/.dsh-personal}/profiles/personal}"
TARGET="$(readlink -f "$PROFILE_DIR/node_modules/dsh-guizang-design/lib/index.js" 2>/dev/null || true)"
if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
  echo "patch-guizang-auth: package not installed in $PROFILE_DIR" >&2
  exit 2
fi
VERSION="$(python3 -c "import json;print(json.load(open('$PROFILE_DIR/node_modules/dsh-guizang-design/package.json'))['version'])")"
if [ "$VERSION" != "0.1.4" ]; then
  echo "patch-guizang-auth: expected 0.1.4, found $VERSION — review the patch before applying" >&2
  exit 3
fi
if grep -q "Local admission patch" "$TARGET"; then
  echo "patch-guizang-auth: already applied ($TARGET)"
  exit 0
fi

TMP="$(mktemp "$TARGET.XXXXXX")"
python3 - "$TARGET" "$TMP" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()

old_inject = "export const inject = ['webServer', 'skills', 'tools']"
new_inject = "export const inject = ['webServer', 'skills', 'tools', 'connection']"
if old_inject not in text:
    raise SystemExit('inject line not found; refusing to patch')
text = text.replace(old_inject, new_inject)

old_handler = """      async handler(req, res) {
        const url = new URL(req.url || '/', 'http://x')"""
new_handler = """      async handler(req, res) {
        // Local admission patch (2026-11-11): DSH does not authenticate plugin
        // routes; gate every request through the connection owner check and
        // fail closed when the service is absent.
        const connection = ctx.get('connection')
        const rejection = typeof connection?.requestRejection === 'function'
          ? connection.requestRejection({ headers: req.headers })
          : 403
        if (rejection) {
          res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' })
          return res.end('unauthorized')
        }
        const url = new URL(req.url || '/', 'http://x')"""
if old_handler not in text:
    raise SystemExit('handler block not found; refusing to patch')
text = text.replace(old_handler, new_handler)

open(dst, 'w', encoding='utf-8').write(text)
PY
# `mv` replaces the directory entry, so the pnpm store's hardlinked copy stays intact.
mv "$TMP" "$TARGET"
chmod 664 "$TARGET"
echo "patch-guizang-auth: applied to $TARGET ($VERSION)"
