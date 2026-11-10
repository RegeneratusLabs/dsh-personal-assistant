#!/usr/bin/env python3
"""Show which plugins a running DSH host has *not* picked up yet.

Why this exists: DSH reports "restart required" only in the response to the
operation that caused it (a toast in the Web UI, `restartReason` on the
plugin_manager result). Nothing persists that list, and there is no "apply
pending" operation — a restart is the only flush. This script reconstructs the
list from outside:

  * the *saved* state is the profile manifest on disk
    ($DSH_HOME/profiles/<profile>/package.json: dependencies + dsh.profile.bundles)
  * the *live* state is the client-module graph the running Host serves to the
    browser — the same page the Web UI reads, fetched with the current process's
    local launch token from the host's log sink. Read-only, loopback only; the
    token is never printed.

A package that declares `dsh.client` and is in the saved bundle selection but
absent from the live graph is an install the running process never composed:
restart required. The inverse (live but no longer selected) is a removal that
only a restart will take effect.

Config-only edits (profile/home cordis.patch.yml rows) are hot-reloaded by HMR
and are deliberately not reported. Host-only bundles (no `dsh.client`) cannot be
proven stale this way; they are listed as hints when their files are newer than
the unit's current process.

Exit status: 0 = nothing pending, 1 = pending work found, 2 = could not inspect.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HOME = Path.home()
TOKEN_RE = re.compile(r"\?token=([A-Za-z0-9_-]+)")


def run(cmd: list[str]) -> str:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return p.stdout if p.returncode == 0 else ""


def sc(*args: str) -> str:
    return run(["systemctl", "--user", *args])


def prop(unit: str, name: str) -> str:
    return sc("show", "-p", name, "--value", unit).strip()


def dsh_units() -> list[str]:
    out = sc("list-units", "--type=service", "--all", "--no-legend", "--plain", "dsh*.service")
    units: list[str] = []
    for line in out.splitlines():
        fields = line.split()
        if not fields:
            continue
        unit = fields[0]
        if prop(unit, "ActiveState") != "active":
            continue
        if "--port" not in prop(unit, "ExecStart"):
            continue
        units.append(unit)
    return units


def parse_exec(exec_start: str) -> tuple[str | None, str, str | None]:
    port = re.search(r"--port (\d+)", exec_start)
    prof = re.search(r"--profile ([^ ;]+)", exec_start)
    pub = re.search(r"--public-url (\S+)", exec_start)
    # A --public-url host scopes the auth cookie, so the loopback read must claim
    # the same authority through the Host header.
    authority = None
    if pub:
        authority = urllib.parse.urlsplit(pub.group(1).rstrip(";")).netloc or None
    return (port.group(1) if port else None, prof.group(1) if prof else "web", authority)


def dsh_home(unit: str) -> Path:
    env = prop(unit, "Environment")
    m = re.search(r"DSH_HOME=(\S+)", env)
    return Path(m.group(1)) if m else HOME / ".dsh"


def log_candidates(unit: str, home: Path) -> list[Path]:
    """Log sinks for a unit: its StandardOutput append path plus the usual logs dirs."""
    paths: list[Path] = []
    frag = prop(unit, "FragmentPath")
    if frag and Path(frag).exists():
        for line in Path(frag).read_text(errors="replace").splitlines():
            m = re.match(r"\s*Standard(?:Output|Error)\s*=\s*append:(.+)", line)
            if m:
                p = Path(m.group(1).strip().replace("%h", str(HOME)))
                paths.append(p)
    for d in (HOME / "dsh" / "logs", home / "logs"):
        if d.is_dir():
            paths.extend(sorted(d.glob("*.log")))
    uniq: list[Path] = []
    for p in paths:
        if p.is_file() and p not in uniq:
            uniq.append(p)
    # Newest sink first: the current process's token is in the most recent one.
    uniq.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return uniq


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """The token exchange answers 303; we want its Set-Cookie, not the redirect."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_get(url: str, host_header: str | None = None, cookie: str | None = None):
    """One loopback GET. Returns (status, body_text, response headers)."""
    req = urllib.request.Request(url)
    if host_header:
        req.add_header("Host", host_header)
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with _OPENER.open(req, timeout=5) as resp:
            return resp.status, resp.read(2_000_000).decode("utf-8", "replace"), resp.headers
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(2_000_000).decode("utf-8", "replace"), exc.headers
    except (urllib.error.URLError, OSError):
        return 0, "", None


def fetch_live_graph(port: str, home: Path, unit: str, authority: str | None) -> tuple[str | None, int]:
    """Return (served HTML, live client module count) using the current launch token.

    The launch token is exchanged for the same signed cookie the browser gets; the
    cookie is bound to the Host authority (the --public-url host for the personal
    unit), so the loopback request carries that Host header, exactly like a browser
    behind tailscale serve would.
    """
    # journal sink first (newest launches are at the end), then file sinks.
    journal = run(["journalctl", "--user", "-u", unit, "-n", "400", "--no-pager", "-o", "cat"])
    tokens: list[str] = list(reversed(TOKEN_RE.findall(journal)))
    for path in log_candidates(unit, home):
        try:
            text = path.read_text(errors="replace")
        except OSError:
            continue
        # Later lines are later launches; try the newest first.
        tokens.extend(reversed(TOKEN_RE.findall(text)))
    seen: set[str] = set()
    tokens = [t for t in tokens if not (t in seen or seen.add(t))]
    if not tokens:
        return None, 0

    authority = authority or f"127.0.0.1:{port}"
    for token in tokens[:40]:
        status, _, headers = http_get(f"http://127.0.0.1:{port}/?token={token}", authority)
        if status not in (200, 301, 302, 303) or headers is None:
            continue
        cookie = "; ".join(
            c.split(";")[0].strip() for c in (headers.get_all("Set-Cookie") or [])
        ) or None
        status, html, _ = http_get(f"http://127.0.0.1:{port}/", authority, cookie)
        if status == 200 and "plugins/??" in html:
            return html, len(live_modules(html))
    return None, 0


def live_modules(html: str) -> set[str]:
    mods: set[str] = set()
    for combo in re.findall(r"plugins/\?\?([^\"&]+)", html):
        for part in combo.split(","):
            part = part.strip()
            if part.endswith("client.js"):
                mods.add(part)
    return mods


def package_meta(profile_dir: Path, name: str) -> dict | None:
    pj = profile_dir / "node_modules" / name / "package.json"
    if not pj.is_file():
        return None
    try:
        return json.loads(pj.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def inspect_unit(unit: str) -> tuple[list[str], list[str], list[str]]:
    port, profile, authority = parse_exec(prop(unit, "ExecStart"))
    home = dsh_home(unit)
    profile_dir = home / "profiles" / profile
    manifest_path = profile_dir / "package.json"

    print(f"\n=== {unit}  (profile {profile}, 127.0.0.1:{port or '?'}, home {home})")
    if not manifest_path.is_file():
        print("  ! no profile manifest at", manifest_path)
        return [], [], []

    manifest = json.loads(manifest_path.read_text())
    deps = manifest.get("dependencies") or {}
    bundles = ((manifest.get("dsh") or {}).get("profile") or {}).get("bundles") or []

    boot = prop(unit, "ActiveEnterTimestamp")
    boot_epoch = 0.0
    if boot:
        try:
            boot_epoch = subprocess.run(
                ["date", "-d", boot, "+%s"], capture_output=True, text=True
            ).stdout.strip()
            boot_epoch = float(boot_epoch or 0)
        except (ValueError, OSError):
            boot_epoch = 0.0
    print(f"  process up since {boot or '?'}  (install log: {profile_dir / '.plugin-manager'})")

    html, nlive = fetch_live_graph(port or "", home, unit, authority)
    pending: list[str] = []
    stale: list[str] = []
    hints: list[str] = []

    unknown = False
    if html is None:
        print("  ! could not read the live client graph (no usable launch token); "
              "reporting install-time hints only, client state unknown")
        mods: set[str] = set()
        unknown = True
    else:
        mods = live_modules(html)
        print(f"  live client modules: {nlive}")

    for name in sorted(deps):
        meta = package_meta(profile_dir, name)
        if not meta:
            continue
        dsh = meta.get("dsh") or {}
        selected = name in bundles
        if "client" not in dsh:
            if selected and boot_epoch:
                installed = (profile_dir / "node_modules" / name).stat().st_mtime
                if installed > boot_epoch:
                    hints.append(name)
            continue
        want = f"{name}/client.js"
        live = want in mods or any(m.startswith(want + "/") for m in mods)
        if unknown:
            continue
        if selected and not live:
            pending.append(name)
        elif live and not selected:
            stale.append(name)

    if pending:
        print("  PENDING (installed/selected, not composed by this process — restart required):")
        for name in pending:
            print("    -", name)
    if stale:
        print("  STALE (running, no longer selected — restart will unload):")
        for name in stale:
            print("    -", name)
    if hints:
        print("  hint (host-only bundle, files newer than this process — cannot be proven):")
        for name in hints:
            print("    -", name)
    if not (pending or stale) and not unknown:
        print("  OK — every selected client plugin is live")
    return pending, stale, hints


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("units", nargs="*", help="units to inspect (default: every active DSH web host unit)")
    args = ap.parse_args()

    units = args.units or dsh_units()
    if not units:
        print("no active DSH web host unit found", file=sys.stderr)
        return 2

    total_pending: list[str] = []
    failures = 0
    for unit in units:
        try:
            pending, stale, _ = inspect_unit(unit)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! {unit}: {exc}", file=sys.stderr)
            failures += 1
            continue
        total_pending.extend(pending)
        total_pending.extend(stale)

    print()
    if failures:
        return 2
    if total_pending:
        print(f"{len(total_pending)} plugin(s) waiting for a restart. Flush with: "
              f"{Path(__file__).with_name('dsh-restart.sh')} <unit>")
        return 1
    print("nothing pending")
    return 0


if __name__ == "__main__":
    sys.exit(main())
