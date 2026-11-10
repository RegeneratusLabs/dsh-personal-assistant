# scripts/egress — DSH personal egress observation (M0) and optional deny upgrade

**Status: repo artifacts only. Nothing in this directory has been applied to the host.**
`nftables`, systemd units and journald are only *read* by these scripts unless the
human runs an `apply` subcommand with `sudo`.

## What M0 does (D13, permanent decision)

M0 egress = **observe + alert only**. There is **no deny list in M0** and there will
not be one: `IPAddressAllow/Deny` is unavailable on this host (systemd 255 built
`-BPF_FRAMEWORK`), so the compensating control is an nftables *observe* rule scoped
to the service, plus an alert when a destination is outside the expected set.

| file | role | root needed |
|---|---|---|
| `observe.sh` | builds/loads the observe ruleset (`table inet dsh_egress`): counter + rate-limited `DSH-EGRESS ` kernel log + per-destination counters | only for `apply`/`remove`/`status` |
| `summarize-egress.sh` | journald → aggregated report (markdown + JSON), expected-destination check, JSON artifact for the alert checker | no (nft counters only) |
| `expected-destinations.txt` | the expected/allowlisted destination set used for alerting (hostnames + IP/CIDRs) | no |
| `egress.conf` | shared defaults (target cgroup/uid, prefixes, rates, paths) | no |
| `lib.sh` | shared helpers sourced by the scripts (not executable on its own) | — |
| `allowlist.sh` | **OPTIONAL upgrade artifact — not used in M0/D13**: deny-by-default ruleset with LAN/tailnet/hostname sets and an `npm-on`/`npm-off` window | yes |
| `refresh-dns-sets.sh` | **OPTIONAL upgrade artifact**: resolves `expected-destinations.txt` hostnames and atomically replaces `dns_v4`/`dns_v6` | only for `apply`/`status` |
| `dsh-egress-dns.{service,timer}` | **text artifacts only, never installed by this repo**: 5-minute refresh timer for the optional deny upgrade | — |

The alert contract lives in `summarize-egress.sh --json`; `scripts/telemetry/check-alerts.sh`
consumes it (see `research/m0-telemetry.md` §7.2 and `research/m0-egress.md` §5).

## M0 runbook (human, root)

Step 0 — read the dry run; nothing is applied yet:

```bash
scripts/egress/observe.sh print                     # ruleset text on stdout
scripts/egress/observe.sh check                     # nft -c; non-root = grammar-only (see below)
scripts/egress/summarize-egress.sh summary --since '1 hour ago'   # expect exit 3 (degraded) before apply
```

Step 1 — load the observe ruleset (the only host change in M0 egress):

```bash
sudo scripts/egress/observe.sh apply
sudo scripts/egress/observe.sh status               # target FRESH + table listing + counters
```

`apply` refuses to run when the target cgroup does not exist, and it only touches
`table inet dsh_egress`. It does **not** flush the ruleset, does **not** touch UFW
and does **not** enable `nftables.service`.

Step 2 — observe for ~24 h, then report:

```bash
scripts/egress/summarize-egress.sh summary --since '24 hours ago'
sudo scripts/egress/summarize-egress.sh summary --since '24 hours ago'   # adds exact nft counters
scripts/egress/summarize-egress.sh summary --json --write-artifacts      # artifacts/egress/egress-summary.{json,md}
```

Step 3 — wire the alert and keep it running: `scripts/telemetry/check-alerts.sh`
(prefers `artifacts/egress/egress-summary.json`, else calls `summarize-egress.sh --json`
live). A daily digest can read the same artifact.

Step 4 — rollback (one command, any time): `sudo nft delete table inet dsh_egress`
(or `sudo scripts/egress/observe.sh remove`). Verify with `sudo nft list table inet dsh_egress`
→ "No such file or directory".

### What the report/exit codes mean

| exit | status | meaning |
|---:|---|---|
| 0 | `ok` | observation active, every observed destination is in `expected-destinations.txt` |
| 2 | `alert` | unexpected destination observed (or a `DSH-EGRESS-DENY` line exists, which must not happen in M0) |
| 3 | `degraded` | no `DSH-EGRESS ` kernel lines: ruleset not loaded, target match stale, or log unavailable |
| 1 | — | usage/config error |

`--lenient` forces 0 on alert, `--allow-empty` forces 0 on degraded (digest tolerance;
the alert checker deliberately does **not** pass them).

### Checking the target is fresh after a restart

`nft` resolves `socket cgroupv2 level 5 "<path>"` to a cgroup id when the ruleset is
loaded. systemd **destroys** a unit cgroup when the unit stops, so after any restart
of `dsh-personal.service` the loaded rule matches nothing and observation silently
stops (for the optional deny artifact this would be **fail-open** — nothing filtered).
`observe.sh status` / `summarize-egress.sh` (via the no-lines verdict) surface it;
re-run `apply` after a restart. Options: `sudo scripts/egress/observe.sh apply
--if-stale` is safe to call from a 1-minute root timer — it no-ops when the match is
fresh (counters preserved) and reloads only when stale; or switch to `uid` mode once
the service runs as a dedicated user (no staleness); or add an `ExecStartPost=` reload
when the service becomes a **system** unit.

## Non-root vs root

`nft -c -f` (the `check` subcommand) needs `CAP_NET_ADMIN` to finish its kernel
check. As a normal user it still parses the whole ruleset grammar and reports no
syntax errors, then stops with `Operation not permitted`; the scripts say so
explicitly and exit 0. Nothing is ever committed by `nft -c`.

`summarize-egress.sh` works without root: `journalctl -k` is readable because the
local user is in group `adm` on this host. Exact `nft` counters need root; the
report prints a note instead of failing. `dmesg` is **root-only** on this host
(`kernel.dmesg_restrict=1`) and is only a fallback.

## `expected-destinations.txt` (the alert contract)

One entry per line, `#` comments; hostnames are resolved with `getent ahosts` at run
time, IPs/CIDRs are matched literally. Add an entry only for a reviewed, explained
data path — record the justification in `research/m0-egress.md` §8 and never add a
destination just to silence an alert. `registry.npmjs.org` is listed because an
approved install legitimately reaches it; a stricter digest may filter that one line.

## Optional deny upgrade — NOT part of M0 / D13

Only if the human explicitly approves a deny list later. These commands are listed
for completeness; **do not run them as part of M0**.

```bash
scripts/egress/allowlist.sh print                  # review the deny ruleset
sudo scripts/egress/allowlist.sh apply             # load deny table
sudo scripts/egress/refresh-dns-sets.sh apply      # fill dns_v4/dns_v6 (otherwise hostnames are denied)
sudo scripts/egress/allowlist.sh npm-on --ttl 1h   # only during an approved install
sudo scripts/egress/allowlist.sh npm-off
# 5-minute refresher (text artifacts only; nothing auto-installs them):
#   install scripts/egress/*.{sh,conf,txt} to /usr/local/lib/dsh-egress/,
#   install dsh-egress-dns.{service,timer} to /etc/systemd/system/,
#   sudo systemctl daemon-reload && sudo systemctl enable --now dsh-egress-dns.timer
# rollback:
sudo systemctl disable --now dsh-egress-dns.timer && sudo rm -f /etc/systemd/system/dsh-egress-dns.{service,timer}
sudo nft delete table inet dsh_egress
```

Deny-mode warnings: cgroup-mode rules are **fail-open after a service restart**
(reapply), hostname sets are **point-in-time IP snapshots** (CDN edges rotate; keep
the 5-minute refresh, and if denies appear at CDN edges shorten it — do not widen
the allow set), and `UPS`/other host traffic is untouched (scope is the service only).

## Host notes / footguns (verified 2026-11-10)

- **UFW is active** (`active`/`enabled`, input DROP, output ACCEPT, iptables-nft
  backend) even though `nftables.service` is inactive. Our table is additive.
- `/etc/nftables.conf` starts with `flush ruleset`; **never** `nft -f` it or enable
  `nftables.service` on this host while UFW is in use — it would wipe UFW's rules.
- `sudo` is blocked inside the build agent's sandbox ("no new privileges"); every
  root command above is for the human's own terminal.
- Correct one-shot rollback for everything these scripts create:
  `sudo nft delete table inet dsh_egress`.
