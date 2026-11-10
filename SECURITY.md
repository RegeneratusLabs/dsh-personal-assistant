# Security

This repository is a **public build log** for a personal-agent deployment on a single-user host. It contains
design notes, our own plugin code and operator scripts — **no credentials, no personal data, no captured
prompts** (raw captures and host state are gitignored).

## Reporting a vulnerability

Please report privately, not in a public issue:

- GitHub → **Security** tab → *Report a vulnerability* (preferred), or
- email **josh@regeneratus.com** with a minimal reproduction.

Please include the affected file/version and impact. We aim to acknowledge within 72 hours.

## Scope and threat model (short version)

The deployment is deliberately pragmatic (decision D13 in the docs): the DSH host runs as the human user on
a single-user homelab machine, telemetry is local-only and DSH's own upload paths are disabled, egress is
**observed and alerted** (not blocked), plugins are **pinned, scanned, ledgered and re-admitted on upgrade**,
and a tested backup/restore path exists. The accepted residual risk is that a compromised plugin has the
human user's privileges. See `research/personal-agent-security.md` §7–§8 for the full model and
`research/plugin-ledger.md` for every admission decision.

## Out of scope

- The third-party DSH packages and plugins mentioned in the research notes (report upstream).
- The homelab host itself (private network; not reachable from the internet).
- Local-only paths/ports mentioned in the docs are part of the build record, not endpoints.
