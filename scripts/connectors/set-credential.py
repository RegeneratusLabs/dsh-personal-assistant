#!/usr/bin/env python3
"""Store one secret in the DSH credential store without printing it.

The personal profile's store is YAML with a top-level `refs:` map. This helper
reads the value from a no-echo prompt (or stdin when not a TTY), inserts or
replaces the ref, writes atomically with mode 0600, and prints only the ref
name. It never logs the value.

Usage:
  python3 scripts/connectors/set-credential.py [REF] [--home DIR]

  REF           credential ref name (default GITHUB_PERSONAL_ACCESS_TOKEN)
  --home DIR    DSH home (default $DSH_HOME or ~/.dsh-personal)

After storing, the rc.2 MCP manager retries the server whose template
referenced the ref; no host restart is required. The Capabilities page should
turn the connector from `waiting-credentials` to `connected` within a few
seconds.
"""

import getpass
import json
import os
import sys
import tempfile

DEFAULT_REF = "GITHUB_PERSONAL_ACCESS_TOKEN"


def parse(argv):
    ref = DEFAULT_REF
    home = os.environ.get("DSH_HOME") or os.path.expanduser("~/.dsh-personal")
    args = list(argv)
    while args:
        arg = args.pop(0)
        if arg == "--home":
            home = args.pop(0)
        elif arg.startswith("--home="):
            home = arg.split("=", 1)[1]
        elif arg in ("-h", "--help"):
            print(__doc__)
            raise SystemExit(0)
        elif arg.startswith("-"):
            raise SystemExit(f"unknown option: {arg}")
        else:
            ref = arg
    if not ref.replace("_", "").isalnum():
        raise SystemExit("ref must be an environment-variable name")
    return ref, os.path.abspath(home)


def read_secret():
    if sys.stdin.isatty():
        value = getpass.getpass("secret (input hidden): ")
    else:
        value = sys.stdin.readline().rstrip("\n")
    if not value:
        raise SystemExit("empty secret; nothing stored")
    return value


def upsert(text, ref, value):
    lines = text.splitlines()
    rendered = f"  {ref}: {json.dumps(value)}"
    refs_at = None
    ref_at = None
    for index, line in enumerate(lines):
        if line.rstrip() == "refs:":
            refs_at = index
        elif line.startswith(f"  {ref}:"):
            ref_at = index
    if ref_at is not None:
        lines[ref_at] = rendered
    elif refs_at is not None:
        lines.insert(refs_at + 1, rendered)
    else:
        lines.extend(["refs:", rendered])
    return "\n".join(lines) + "\n"


def main():
    ref, home = parse(sys.argv[1:])
    path = os.path.join(home, ".credentials.yaml")
    if not os.path.exists(path):
        raise SystemExit(f"no credential store at {path}")
    value = read_secret()
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    updated = upsert(text, ref, value)
    directory = os.path.dirname(path)
    fd, temp = tempfile.mkstemp(dir=directory, prefix=".credentials.", suffix=".tmp")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(updated)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print(f"stored {ref} in {path} (0600); the MCP manager retries the connector automatically")


if __name__ == "__main__":
    main()
