# M0 egress — observe + alert tooling, runbook and optional deny upgrade

**Status (2026-11-10):** repo artifacts delivered; **nothing applied to the host**.
`scripts/egress/` contains an apply-ready observe stack plus an optional (not-M0)
deny stack. Human-root commands below are the only host changes; every one has a
one-command rollback.

**Decision context — D13 (permanent):** M0 egress is **observe + alert only**, not a
24 h-then-deny trial. The human decided (2026-11-10) that the deny list is dropped;
the compensating control for "plugin could exfiltrate" is *detection*: log every new
outbound destination of the service, aggregate it, and alert when a destination is
outside a reviewed expected set. `IPAddressAllow/Deny` cannot be used at all on this
host (systemd 255 built `-BPF_FRAMEWORK`), so nftables observation is the only
kernel-level mechanism available.

Companion doc: telemetry wiring is specified in [`m0-telemetry.md`](m0-telemetry.md)
§7.2 and consumed by `scripts/telemetry/check-alerts.sh`.

---

## 1. What was verified on the host (2026-11-10, read-only)

All of these are checks I ran in the build session; no host state was changed.

| Fact | Evidence |
|---|---|
| nftables 1.0.9 present, supports `socket cgroupv2` | `nft --version` → `nftables v1.0.9 (Old Doc Yak #3)`; `libnftables.so.1` contains `cgroupv2 path fails`; `/lib/modules/6.8.0-146-generic/kernel/net/netfilter/nft_socket.ko.zst` and `nft_ct.ko.zst` exist (modules auto-load on rule load) |
| non-root cannot list or commit nft | `nft list ruleset` → `Operation not permitted (you must be root)` |
| `nft -c -f FILE` validates **grammar** without root, then stops at the kernel check | valid file → only `netlink: Error: cache initialization failed: Operation not permitted`; invalid file → `t.nft:2:9-11: Error: syntax error, unexpected !` (so the script `check` subcommand is a real grammar gate) |
| service cgroup exists and matches the unit | `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/dsh-personal.service/cgroup.procs` → main PID; `/proc/<pid>/status` `Uid: 1000` |
| service runs as `josh`, no `dsh` user yet | `getent passwd dsh` → nothing; `systemctl --user show dsh-personal.service -p MainPID` → active |
| systemd **removes** unit cgroups on stop | inactive user units (`hindsight-hermes-watchdog.service`, `fluidsynth.service`) have no cgroup directory under `app.slice`, while every active unit does — this is why a loaded cgroup-id rule goes stale after restart (§9 R1) |
| `journalctl -k` is readable as `josh` | `id` → groups include `adm`; `journalctl -k -n3` returned kernel lines |
| `dmesg` is root-only | `kernel.dmesg_restrict=1`; `dmesg` → `read kernel buffer failed: Operation not permitted` |
| **UFW is active** (recon had noted nftables.service inactive) | `systemctl is-active ufw` → `active`; `/etc/ufw/ufw.conf` `ENABLED=yes`; `/etc/default/ufw` input DROP / output ACCEPT; backend is iptables-nft. `nftables.service` is inactive and `/etc/nftables.conf` starts with `flush ruleset` |
| CDN-backed endpoints rotate | `getent ahosts api.deepseek.com` → `3.173.21.63` with canonical `d3bbv8sr76az5s.cloudfront.net`; `opencode.ai` → Cloudflare `172.66.173.149`, `104.20.32.17`, `2606:4700:10::6814:2011`; `registry.npmjs.org` → 12 v4 + 12 v6 Cloudflare addresses |
| `getent ahosts` returns v4-mapped v6 for v4-only names | `getent ahostsv6 api.deepseek.com` → `::ffff:3.173.21.63`; scripts filter `::ffff:` out of v6 sets |

### 1.1 Why `socket cgroupv2 level 5 "<path>"` is the right match

Checked against source, not folklore:

- nftables 1.0.9 grammar (`src/parser_bison.y`): `socket cgroupv2 level NUM` is the
  expression; the quoted path is a **`cgroupv2` data-type symbol** compared against it.
  `cgroupv2_type_parse` (`src/datatype.c`) does `stat("/sys/fs/cgroup/<path>")` and
  stores `st_ino` — i.e. **the path is resolved to a cgroup id when the ruleset loads**,
  and load fails with `cgroupv2 path fails: ...` if the path does not exist.
- kernel 6.8 (`net/netfilter/nft_socket.c`) evaluates the expression as
  `cgroup_ancestor(sock_cgroup_ptr(&sk->sk_cgrp_data), level)` and returns that
  ancestor's cgroup id; `include/linux/cgroup.h` documents `cgroup_ancestor()` as
  "ancestor of cgroup at specified level starting from root" (`cgrp->ancestors[level]`,
  root = 0). The man page's own example is `socket cgroupv2 level 1 "user.slice"`.
- Therefore the path `user.slice/user-1000.slice/user@1000.service/app.slice/dsh-personal.service`
  has 5 components and must be matched at **level 5**. `lib.sh` refuses to generate a
  rule when `DSH_EGRESS_CGROUP_LEVEL` disagrees with the path length, because a wrong
  pair silently never matches (the kernel returns NULL for level > cgrp->level).

Two consequences drive the runbook: the unit **must be running** when the table is
loaded, and the match is a snapshot of the cgroup id (restart ⇒ stale ⇒ reapply).

---

## 2. Design

```
                         host (all processes)
   ┌────────────────────────────────────────────────────────────────────┐
   │  table inet dsh_egress   [only this table is ever touched]         │
   │                                                                    │
   │  chain output  (type filter hook output priority 0; policy accept) │
   │    socket cgroupv2 level 5 "<dsh-personal.service cgroup>"         │
   │        jump dsh_egress_out          ← scoped: other host traffic   │
   │                                       never enters this chain      │
   │  chain dsh_egress_out                                              │
   │    oifname lo → return               (loopback: DNS stub etc.)     │
   │    ct state new → counter            (exact count of new conns)    │
   │    ct state new → limit 20/min burst 40 → log "DSH-EGRESS "        │
   │    meta nfproto ipv4 → update @seen_v4 { ip daddr counter }         │
   │    meta nfproto ipv6 → update @seen_v6 { ip6 daddr counter }        │
   │    (no verdict → base-chain policy accept, so nothing is blocked)  │
   └────────────────────────────────────────────────────────────────────┘
```

Design choices and why:

- **Dedicated table** `inet dsh_egress`. Never `flush ruleset`, never
  `/etc/nftables.conf` (it would wipe UFW), never an existing table. Rollback is
  `nft delete table inet dsh_egress` and can never affect anything else.
- **Scoped jump, not a host-wide chain.** The base chain matches only the service and
  jumps; packets from other processes are accepted by policy without being inspected.
  This is what makes an observe rule safe on a shared host (Hermes, browsers, etc.).
- **Log `ct state new`, not every packet.** One line per new connection keeps journald
  usable; retransmits and established packets would add noise without information.
  Rate limit `20/minute burst 40` bounds a burst; the unlimited `counter` and the
  per-destination `counter`s stay exact, so the log is documented as a lower bound.
- **Per-destination counters** use dynamic sets with a `counter` in the `update`
  expression (pattern taken from nftables' own regression suite:
  `tests/shell/testcases/sets/0059set_update_multistmt_0`, kernel ≥ 5.19 supports the
  multi-expression dynset). Elements expire after 24 h idle, so the set cannot grow
  unbounded; `size 65535` caps memory. Read them with
  `sudo nft list table inet dsh_egress`.
- **Loopback excluded** from logging/counting (`DSH_EGRESS_IGNORE_LOOPBACK=1`): the
  resolved stub (127.0.0.53), Hindsight on 127.0.0.1:9177 and the DSH web port are
  high-volume and say nothing about external egress. Loopback remains reachable —
  observe never drops.
- **Dual targeting.** `DSH_EGRESS_TARGET_MODE=cgroup` (default; today's `--user` unit)
  or `uid` (`meta skuid <uid>`, for a future dedicated service user). Everything in
  `lib.sh` is mode-agnostic. uid mode has no staleness and is the better long-term
  choice once `dsh-personal.service` runs as `dsh`; today uid 1000 is `josh` himself,
  so uid mode would inspect every josh process (Hermes included) — not acceptable for
  observation, and it is not used in M0.
- **`meta skuid` vs cgroup for the future:** on this host `meta skuid` in `output`
  matches the socket owner; a full host firewall (`nftables.service`) was *not* used
  because UFW already owns the input policy and `/etc/nftables.conf` would flush it.

### 2.1 Files

| file | purpose |
|---|---|
| `scripts/egress/observe.sh` | observe ruleset: `print` (dry run), `check` (nft -c), `apply`, `remove`, `status` |
| `scripts/egress/summarize-egress.sh` | journald → markdown report + `m0-egress-summary-v1` JSON; expected-destination verdicts; exit 0/2/3 |
| `scripts/egress/expected-destinations.txt` | reviewed expected destinations (hostnames + IP/CIDRs) |
| `scripts/egress/egress.conf` | shared defaults (target, prefixes, rates, paths, artifact dir) |
| `scripts/egress/lib.sh` | shared helpers (root refusal, nft resolution, target match, freshness, expected parsing) |
| `scripts/egress/allowlist.sh` | **OPTIONAL, not M0/D13**: deny ruleset + `npm-on`/`npm-off` |
| `scripts/egress/refresh-dns-sets.sh` | **OPTIONAL, not M0/D13**: atomic hostname set refresh |
| `scripts/egress/dsh-egress-dns.{service,timer}` | **text artifacts only**, 5-minute refresher timer for the optional deny stack |
| `scripts/egress/README.md` | operator-facing quickstart + footguns |

---

## 3. Phase 1 — observe (M0; human runs as root)

### 3.1 Dry run first (no root, no host change)

```bash
cd /home/josh/projects/DSH-playground
scripts/egress/observe.sh print                      # ruleset on stdout; review it
scripts/egress/observe.sh check                      # nft -c; non-root reports grammar-only
scripts/egress/observe.sh print --output /tmp/observe.nft
```

Expected: `print` shows the target line
`socket cgroupv2 level 5 "user.slice/user-1000.slice/user@1000.service/app.slice/dsh-personal.service"`,
`policy accept`, and no `drop` anywhere. `check` as a normal user prints the generated
file path, the `Operation not permitted` note, and exits 0 after confirming no syntax
errors were reported. Nothing is applied by either command.

### 3.2 Apply (the only M0 host change)

```bash
sudo scripts/egress/observe.sh apply
```

Preconditions enforced by the script: root; the target exists
(`/sys/fs/cgroup/<path>` is a directory — start `dsh-personal.service` first); the
level matches the path. The script deletes a pre-existing `table inet dsh_egress`
(only that table) and loads the generated file, then prints the loaded table.

Expected evidence:

```bash
sudo scripts/egress/observe.sh status
# [observe] target match is FRESH (cgroup ... level 5)
# table inet dsh_egress { set seen_v4 {...} ... chain output {...} chain dsh_egress_out {...} }
#   counter packets 0 bytes 0   ← new-connection counter
# ... socket cgroupv2 level 5 "user.slice/..." jump dsh_egress_out

sudo nft list table inet dsh_egress        # raw view (root)
journalctl -k -f | grep --line-buffered 'DSH-EGRESS '   # live lines appear as the agent calls out
```

`sudo scripts/egress/observe.sh apply --if-stale` is the restart-healing variant: it
does nothing when the loaded target match is fresh and reloads only when a restart
made it stale (keeps counters otherwise). It is safe to call from a root timer.

Useful sanity checks (the agent's model calls are frequent, so lines should appear
within minutes): `journalctl -k --since '5 min ago' | grep 'DSH-EGRESS '`.
Kernel log line shape (standard netfilter fields, `DST=`/`DPT=` are what the
summarizer and the telemetry checker parse):

```
kernel: DSH-EGRESS IN= OUT=eno1 SRC=192.168.1.100 DST=3.173.21.63 ... PROTO=TCP SPT=... DPT=443 ...
```

### 3.3 Observe for ~24 h

Leave the table loaded. Optional live check without polling alarm: a daily digest job
or `summarize-egress.sh` once at the end sufficed for the M0 gate; if you want to watch
while it runs, `scripts/telemetry/check-alerts.sh` prints an egress-observe result and
degrades to SKIP until lines exist.

### 3.4 Rollback (observe)

```bash
sudo scripts/egress/observe.sh remove      # or: sudo nft delete table inet dsh_egress
sudo nft list table inet dsh_egress        # expect: No such file or directory
```

Egress is simply unobserved again; no process, unit or network configuration changes.

---

## 4. Phase 2 — summarize and review

```bash
cd /home/josh/projects/DSH-playground
# markdown report, no root (journalctl -k works for group adm):
scripts/egress/summarize-egress.sh summary --since '24 hours ago'

# same, with exact nft per-destination counters:
sudo scripts/egress/summarize-egress.sh summary --since '24 hours ago'

# machine-readable artifact for the alert checker / digest:
scripts/egress/summarize-egress.sh summary --since '24 hours ago' --json --write-artifacts
#   → artifacts/egress/egress-summary.json and egress-summary.md
```

Output: a markdown table with `destination | port/proto | events | first seen | last
seen | owner (PTR) | expected`, plus totals, the unexpected-destination list, exact
nft counters (root) and caveats. `--tsv FILE` writes a flat table; `--json` emits the
`m0-egress-summary-v1` contract.

Exit codes: `0` clean · `2` unexpected destination (ALERT) · `3` observation inactive
(degraded: no log lines — table not loaded, target stale after restart, or log
unreadable) · `1` usage error. `--lenient` / `--allow-empty` exist for digest tolerance
only; the alert checker deliberately does not use them, so a degraded observation stays
visible as SKIP instead of clean.

Review procedure: every row is outbound traffic of the DSH personal service (the match
is the service cgroup; process attribution is by cgroup, owner attribution is by reverse
DNS + expected resolution). For each **unexpected** destination decide: expected data
path (document in §8 and add to `expected-destinations.txt`), CDN edge of an expected
hostname (owned by a CDN, see R2 — keep the alert but note the stale-set cause), or
unknown (treat as incident, §9 R8). Do not add entries just to silence alerts.

### 4.1 What "expected" means

`expected-destinations.txt` is the alert contract: hostname lines are resolved with
`getent ahosts` at summarisation time; IP/CIDR lines are matched literally. Initial
content and justification are in §8. The same file is auto-detected by
`scripts/telemetry/check-alerts.sh`, so there is one source of truth.

---

## 5. Alert wiring (D13's compensating control)

`summarize-egress.sh` is the sensor; `scripts/telemetry/check-alerts.sh` is the alert
policy (owned by the telemetry workstream, `research/m0-telemetry.md` §7.2). Consumer
contract, as implemented and agreed:

- Source order: `--egress-summary FILE` / `EGRESS_SUMMARY_JSON` →
  `artifacts/egress/egress-summary.json` → live
  `scripts/egress/summarize-egress.sh summary --json` (read-only) → raw
  `journalctl -k` `DSH-EGRESS ` `DST=`/`DPT=` fallback → SKIP if none.
- Semantics honoured: `destinations[].expected == true` passes; `cdn: true` is treated
  as WARN/review, not a hard alert; `denied[]` raises a separate egress-deny alert even
  when no raw deny lines exist; `expected.unresolved` is a degraded-config WARN;
  `status=degraded`/exit 3 becomes SKIP ("observation inactive"), never "clean".
- Default alert window 24 h. The checker is read-only.

Suggested cadence for the digest (M2 `dsh-schedule`, not part of M0): run
`summarize-egress.sh summary --write-artifacts` daily; alert on exit 2; alert on exit 3
for two consecutive days (observation must not silently stop); include the
unexpected-destination list in the digest body.

---

## 6. Phase 3 — OPTIONAL deny upgrade (NOT M0 / D13)

Kept apply-ready for a later explicitly-approved hardening step. Do not run this as
part of M0; if it is ever loaded, `summarize-egress.sh` reports `DSH-EGRESS-DENY` lines
as an alert because M0 must have none. Deny changes the risk model (fail-open risk,
CDN false denies, install breakage), which is exactly why D13 dropped it.

```bash
# review
scripts/egress/allowlist.sh print
scripts/egress/allowlist.sh check
# apply the deny table (same scoped-jump shape; deny lives inside the jumped chain)
sudo scripts/egress/allowlist.sh apply
# fill hostname sets from expected-destinations.txt (otherwise hostnames are denied)
sudo scripts/egress/refresh-dns-sets.sh apply
# temporary registry window only during an approved install
sudo scripts/egress/allowlist.sh npm-on --ttl 1h
sudo scripts/egress/allowlist.sh npm-off
# verify
sudo scripts/egress/allowlist.sh status
sudo scripts/egress/refresh-dns-sets.sh status
```

Timer (text artifacts shipped, never installed by this repo; 5-minute interval):

```bash
sudo install -m 0755 scripts/egress/{allowlist.sh,refresh-dns-sets.sh,lib.sh} \
     scripts/egress/{egress.conf,expected-destinations.txt} /usr/local/lib/dsh-egress/
sudo install -m 0644 scripts/egress/dsh-egress-dns.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-egress-dns.timer
journalctl -u dsh-egress-dns.service -n 20 --no-pager    # refresh log
```

Rollback, in this order:

```bash
sudo systemctl disable --now dsh-egress-dns.timer
sudo rm -f /etc/systemd/system/dsh-egress-dns.{service,timer}
sudo systemctl daemon-reload
sudo nft delete table inet dsh_egress
```

Deny-mode caveats: `ct state established` is accepted first, so a refreshed set never
kills a live flow; `npm-on` writes only the two npm sets and expires them at TTL;
`refresh-dns-sets.sh` is fail-safe (a failed lookup changes nothing) and atomic (one
netlink transaction); after any service restart the cgroup-id match is stale and the
deny list is silent — **fail-open** (R1) — so reapply or use uid mode.

---

## 7. Rollback matrix

| step | rollback | verify |
|---|---|---|
| observe table loaded | `sudo nft delete table inet dsh_egress` (or `sudo scripts/egress/observe.sh remove`) | `sudo nft list table inet dsh_egress` → "No such file or directory" |
| optional deny table | same delete command (`allowlist.sh remove`) | same |
| optional refresh timer | `sudo systemctl disable --now dsh-egress-dns.timer && sudo rm -f /etc/systemd/system/dsh-egress-dns.{service,timer} && sudo systemctl daemon-reload` | `systemctl list-timers | grep dsh-egress` → empty |
| npm window | `sudo scripts/egress/allowlist.sh npm-off` | `sudo nft list set inet dsh_egress npm_v4` → empty elements |
| artifacts | `rm -f artifacts/egress/egress-summary.{json,md}` | — |
| repo-only test debris | temp files are `mktemp` under `/tmp`, auto-removed by the scripts | — |

Never needed on this host (do not run): `flush ruleset`, `nft -f /etc/nftables.conf`,
`systemctl enable nftables` — they would remove UFW's rules.

---

## 8. Egress ledger — expected destinations

Every entry below is an approved data path. Adding a line to
`expected-destinations.txt` requires an entry here (destination, purpose, why it is
acceptable, date). `registry.npmjs.org` is expected only during approved installs.

| destination | purpose | notes | date |
|---|---|---|---|
| `127.0.0.0/8`, `::1/128` | loopback | resolved stub, local Hindsight/DSH web | 2026-11-10 |
| `192.168.1.0/24` | home LAN | `eno1`; local services | 2026-11-10 |
| `100.64.0.0/10`, `fd7a:115c:a1e0::/48` | tailnet | tailscale0; the service may reach tailnet peers | 2026-11-10 |
| `api.deepseek.com` | DeepSeek API | `/models` listing + server-side web search; CloudFront-backed | 2026-11-10 |
| `opencode.ai` | model provider | pi-ai `opencode-go` endpoint `/inference/go/openai/v1`; Cloudflare-backed | 2026-11-10 |
| `api.telegram.org` | channel | M1 `dsh-switchboard` bridge (not used yet) | 2026-11-10 |
| `open.feishu.cn`, `open.larksuite.com` | channel | optional second channel (not used yet) | 2026-11-10 |
| `api.day.app`, `ntfy.sh` | push | M1 `dsh-push-notify` (not used yet) | 2026-11-10 |
| `registry.npmjs.org` | npm registry | only during approved installs; no nft rule in M0 | 2026-11-10 |

Deliberately **not** expected (a line seen ⇒ alert): `dsh-otel-collector.deepseeksvc.com`
(DSH OTel must be disabled in M0), `huggingface.co` / `cdn-lfs.huggingface.co` (pre-seed
the Hindsight model cache instead), `github.com`/`*.githubusercontent.com` (not needed
unless a future reviewed git dependency install).

**Observed during 2026-11-10 session (not a 24 h sample):** the personal unit was
already logging repeated `https://api.deepseek.com/models` requests and
`opencode.ai/inference/go/openai/v1` calls (see `m0-baseline-recon.md` §2). The 24 h
ledger table itself is an output of `summarize-egress.sh` and must be pasted/committed
by the human after the observation window — it is **not** fabricated here.

---

## 9. Open risks / limits

| # | risk | impact | mitigation |
|---|---|---|---|
| R1 | **stale cgroup id after restart (fail-open)** — nft resolves the unit cgroup at load; systemd deletes unit cgroups on stop, so after a restart the rule matches nothing and observation silently stops (deny would silently stop filtering) | blind spot until noticed | `observe.sh status` reports STALE; `summarize` exits 3 when no lines; `sudo scripts/egress/observe.sh apply --if-stale` is designed for a 1-minute root timer: it no-ops when the match is fresh (counters preserved) and reloads only when stale; alternatives: `ExecStartPost=` reload once the service is a **system** unit, or `uid` mode with a dedicated user (no staleness) |
| R2 | **dynamic DNS / CDN rotation** — allow/expected IP lists are point-in-time; `api.deepseek.com` is CloudFront, `opencode.ai`/npm are Cloudflare, TTLs are short | a *new* connection to a just-rotated edge IP can look unexpected (observe: false alert; deny: transient block) | observe: alert stays but `cdn:true`/PTR lets the digest downgrade to review; deny: 5-minute refresh timer, shorten if needed, never widen the set to whole CDN ranges |
| R3 | **rate-limited logging** — 20/min burst 40 per rule | counts are a lower bound; a burst of distinct destinations may be under-reported | exact `ct state new` counter + per-destination counters (`seen_*`) are logged-free; raise limits only if a real burst is expected |
| R4 | **IPv6** — host has no global IPv6 on `eno1`; `getent` still returns AAAA for v6-enabled services | v6 attempts may fail anyway; the observe chain covers v6 but the ledger may mix families | keep `seen_v6`/`dns_v6`; treat v6 rows like v4 rows; tailnet v6 is allowed by design |
| R5 | **processes outside the cgroup** — child processes inherit the cgroup, but anything started via `systemd-run`, another unit, or the host shell is not filtered by this rule | the observation scope is "the DSH service", not "the DSH codebase" | that is the intended scope (the threat is the in-process agent/plugins); MCP children inherit the cgroup; note that a compromised plugin can also spawn a new unit only if it can talk to systemd/polkit |
| R6 | **Hindsight HF model download** — local Hindsight instance pulls `BAAI/bge-small-en-v1.5` + cross-encoder on first boot | unexpected HF egress; also a surprise 100 MB+ download | pre-seed the model cache from the existing josh cache (M0 block 5, decision M0-D2); do not add HF to expected list |
| R7 | **Tailscale serve is host-side** — the Web entry (`https://homelab.taildace6c.ts.net:8454/`) is terminated by tailscaled as root and proxied to 127.0.0.1:7002 | not visible as service egress; the service's replies are loopback | intentional; tailnet traffic is covered by the 100.64/fd7a rules only if the *service* initiates it |
| R8 | **unexpected destination = possible compromise** | exfiltration or a new plugin calling home | treat as incident (`personal-agent-security.md` §4 L4 kill switch): capture the report/artifact, stop the unit, review ledger + session logs, rotate credentials if unexplained |
| R9 | **alert noise / false positives** from CDN edges and `registry.npmjs.org` | alert fatigue → control ignored | `cdn:true` review path; npm line documented as install-only; digest shows owners not just IPs |
| R10 | **summarizer PTR lookups** can be slow/flaky for some IPs (3 s timeout each, cached per run) | report latency only | `--no-ptr` for fast runs; owner is a hint, `expected` verdict does not depend on PTR |
| R11 | **UFW / `nftables.service` footgun** — `/etc/nftables.conf` starts with `flush ruleset` | enabling it would wipe UFW rules | never enable/apply it on this host; this tooling only ever touches `table inet dsh_egress` |
| R12 | **human-run apply is manual for now** | observation not durable across reboots (table is not persistent — it is runtime state) | M0 acceptance is a covered observation window; for durability add a boot unit or `nft -f` at boot **after** the service cgroup exists (also R1), or accept re-apply; documented, not installed |

---

## 10. M0 acceptance checklist (egress)

- [ ] `scripts/egress/observe.sh print` reviewed; no `drop` in the observe ruleset
- [ ] `sudo scripts/egress/observe.sh apply` with `status` → target **FRESH**, table present
- [ ] `journalctl -k` shows `DSH-EGRESS ` lines for the service's model/API calls
- [ ] `sudo nft list table inet dsh_egress` shows the new-connection counter rising and `seen_v4`/`seen_v6` elements with per-destination counters
- [ ] 24 h window summarised (`summarize-egress.sh summary --since '24 hours ago'`), ledger table reviewed
- [ ] `summarize-egress.sh summary --json --write-artifacts` produces a valid artifact; `scripts/telemetry/check-alerts.sh` reports `egress-observe ok` (or a reviewed WARN for a CDN edge), not `skip`
- [ ] every unexpected destination resolved into §8 or escalated; no unexplained destinations remain
- [ ] rollback rehearsed: `sudo nft delete table inet dsh_egress` then `summarize-egress.sh` exits 3 (degraded) — proving the tooling notices a missing observation
- [ ] nothing from the optional deny stack (allowlist/timer) installed

### 10.1 Repo-only test evidence (2026-11-10, no host changes)

Commands run in the build session (josh, non-root; `sudo` is unavailable to the agent —
"no new privileges"):

```
bash -n scripts/egress/{lib.sh,observe.sh,summarize-egress.sh,allowlist.sh,refresh-dns-sets.sh}
  → all OK
scripts/egress/observe.sh print                 → complete observe ruleset on stdout (no drop, policy accept)
scripts/egress/observe.sh check                 → grammar validated; kernel check refused (non-root), nothing applied
scripts/egress/observe.sh apply                 → refused: needs root (exit 3)
scripts/egress/allowlist.sh print|check|apply   → ruleset rendered; check grammar-only; apply refused (exit 3)
scripts/egress/allowlist.sh npm-on --dry-run    → resolved registry.npmjs.org (12 v4 + 12 v6) and printed the batch, no nft
scripts/egress/refresh-dns-sets.sh print|print-units → resolved 8 hostnames (v4+v6), printed atomic batch + unit text
scripts/egress/summarize-egress.sh summary --file /tmp/egress-fixture.log
  → markdown table, ALERT for fixture 203.0.113.9:443 and 1.1.1.1:53, exit 2
  --json → valid `m0-egress-summary-v1` (python3 json.tool), status/counts/expected/unexpected correct
  --write-artifacts /tmp/egress-art --tsv → artifacts + TSV written
  empty fixture → DEGRADED, exit 3; --allow-empty → exit 0
  live journal (no DSH-EGRESS lines yet) → DEGRADED, exit 3, source=journal
```

Not run (and must be run by the human): any `nft` write (`apply`/`remove`), any
`systemctl` write, `nft -c -f` as root (full kernel validation), unit installation.
No table was created or deleted, no service was started/stopped, nothing was installed;
`nft list ruleset` remains inaccessible to the agent (`Operation not permitted`).

---

## 11. Next actions for the human

1. Approve the observe load (host change): run §3.1 then §3.2 with sudo.
2. After ~24 h run §4 and paste the ledger table into §8 (or a linked artifact).
3. Confirm `scripts/telemetry/check-alerts.sh` sees `egress-observe` results and add
   the egress check to the daily digest (M2).
4. Decide R1 durability (reapply after restart / timer / uid mode when a dedicated
   service user exists). Do **not** install the optional deny stack unless D13 is
   explicitly revisited.

## Applied — block 2 (2026-11-10 16:59–17:07 AEST)

- `sudo scripts/egress/observe.sh apply` installed `table inet dsh_egress` (policy accept, scoped `socket
  cgroupv2 level 5` jump at the `dsh-personal.service` cgroup, exact `ct state new` counter, rate-limited
  `DSH-EGRESS ` kernel log, `seen_v4/v6` per-destination sets 24 h TTL).
- **Verified end-to-end:** a synthetic connection attributed to the service cgroup (cgroup.procs) produced
  counter `packets 1`, one `DSH-EGRESS … DST=3.173.21.63:443` kernel line, and `seen_v4` element
  `3.173.21.63 counter packets 15`. `summarize-egress.sh summary --since '1 hour ago'` → **Status OK**, one
  destination, expected (host `api.deepseek.com`); `check-alerts.sh` → `egress-observe ok` (all observed
  destinations inside the expected set).
- **Staleness handled:** a unit restart recreates the cgroup and the loaded match goes stale (observed:
  `status` warned STALE, counters 0). Re-applied with `apply --if-stale`; installed
  `/etc/systemd/system/dsh-egress-keepalive.{service,timer}` (root, every 5 min, oneshot, no-op when fresh)
  so observation re-binds after restarts. Rollback: `sudo systemctl disable --now dsh-egress-keepalive.timer`
  + `rm /etc/systemd/system/dsh-egress-keepalive.*` + `sudo nft delete table inet dsh_egress`.
- **UFW correction:** UFW is active on this host (input DROP, output ACCEPT); the dedicated table coexists
  with it (no UFW/`/etc/nftables.conf` edits, no `flush ruleset`). No deny list (D13).
- Residual: kernel log lines are rate-limited (20/min burst 40) so they are a lower bound; exact counts are
  the nft counters; CDN rotation can produce transient `cdn:true` review warnings.
