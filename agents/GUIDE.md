# Build guide — a personal assistant on DSH (generic)

English | [中文](GUIDE.zh.md)

This is the executable companion to [`README.md`](README.md): the phases, the gates and the commands your
DSH agent should follow when building **your** assistant. It is deliberately host-agnostic; the reference
build (this repo) applies it to one homelab host, and `research/` explains each decision in depth.

Read the safety rules in [`README.md`](README.md) first. The agent must run a **read-only recon** before any
change and **ask you before every host-level change**.

## Parameters used below

```sh
export REPO="$(pwd)"                          # this clone
export DSH="$HOME/dsh/node/bin/dsh"            # your DSH CLI (adapt)
export DSH_HOME="$HOME/.dsh-personal"          # assistant home (adapt)
export PROFILE="personal"                      # profile name
export HOST="127.0.0.1"
export PORT="7002"
export UNIT="dsh-personal.service"             # systemd --user unit
export HS_URL="http://127.0.0.1:9177"          # Hindsight, if used
export BANK="dsh-personal"                     # memory bank — yours only
```

## Phase 0 — recon (read-only)

- DSH version and CLI path: `"$DSH" --version`.
- Existing homes/profiles: `ls -d "$HOME"/.dsh*`; `"$DSH" --profile "$PROFILE" --dump-config` (read-only).
- Existing service: `systemctl --user cat "$UNIT"` and `systemctl --user status "$UNIT"`.
- Network: `ss -ltn`, `ip -brief addr`, whether a VPN/tailnet/proxy fronts the UI.
- Memory: is a Hindsight server already running (`curl -s "$HS_URL/health"`)? Whose is it? **Never reuse
  another user's bank.** Prefer your own instance; a dedicated bank is the minimum.
- Data/space: `du -sh "$DSH_HOME"`, backup destination and free space.
- Gate: you have the facts and can name the risks; no files changed.

## Phase M0 — security & telemetry baseline

Decide the isolation level with your human and write the decision down:

- **Pragmatic (single-user):** the service runs as the human user; accepted risk: a compromised plugin owns
  that user's data. Mitigate with admission vetting, approvals and a small plugin surface. This is what the
  reference deployment does; see `research/personal-agent-security.md` §7–§8.
- **Isolated (stronger):** a dedicated Unix user or rootless container with only the profile/workspace
  mounted, and (ideally) an egress deny list. More setup; do it when the assistant will run untrusted plugins
  or be shared.

Then, in order (each is a host change → ask first):

1. **Harden the unit.** Add a drop-in with `NoNewPrivileges=yes`, `UMask=0077`, `PrivateTmp=yes`,
   `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=<DSH_HOME>`, `RestrictAddressFamilies`,
   `RestrictSUIDSGID=yes`, `LockPersonality=yes`, `SystemCallFilter=@system-service`, and send logs to
   journald (`StandardOutput=journal`). **Verify what a user unit actually applies** with
   `systemctl --user show "$UNIT" -p ...` — mount-namespace directives may be ignored. Reference:
   `scripts/hardening/`, `research/m0-host-hardening.md`.
2. **Disable DSH's unnecessary egress.** Patch the assistant profile to set
   `session-log-deepseek.enabled=false`, `plugin-package-inventory-deepseek.enabled=false` and
   `session-telemetry-otel.mode=DISABLED` (verify the row ids with `--dump-config` for your DSH version).
   Pre-flight with `--patch <file> --dump-config`, restart, confirm the composed rows. Reference:
   `scripts/telemetry/patch-telemetry.yml`, `research/m0-telemetry.md`.
3. **Observe egress** (no deny list unless you chose isolation). systemd's `IPAddressDeny/Allow` may not be
   compiled in (`systemd --version` w/o `+BPF_FRAMEWORK`); use nftables to log new outbound connections from
   the unit's cgroup and alert on unexpected destinations. Reference: `scripts/egress/`.
4. **Local telemetry sinks.** journald retention cap, a digest timer, an alert checker, token/cost meter,
   Hindsight usage. Reference: `scripts/telemetry/`; adapt paths.
5. **Backups + restore drill.** Back up profile + workspace (+ memory export) with 0600/0700 and retention;
   run a restore drill into a scratch home on another port and prove the host boots. Reference:
   `scripts/backup/`.
6. **Secrets.** Credential store 0600 owned by the service user; no secrets in the unit environment, logs,
   prompts or telemetry; redact before capture.

**M0 exit:** unit hardened and verified, telemetry egress off, egress observed, local sinks collecting,
restore drill passed, residuals recorded. Gate: do not install community plugins before this.

## Phase M0.5 — plugin admission (mature-only)

For every candidate plugin:

1. **Maturity check** (measured, not vibes): GitHub stars, npm downloads/month, license, publisher,
   maintenance recency, declared DSH compatibility. Prefer first-party, then vendor-official, then
   established community. Do not adopt 0–3★ single-author packages for core surfaces; write the small glue
   yourself instead.
2. **Pin exact version**, record npm `dist.integrity` (sha512), and scan the tarball: install/prepare
   scripts, native binaries, `child_process`/`eval`, hard-coded network domains, credential access, deps.
3. **Dependencies:** audit; no install scripts; no `latest`; no auto-update.
4. **Scratch trial** in a throwaway profile: boot it, exercise the one behaviour that matters, watch egress
   with strace or your observe rule.
5. **Ledger row:** version, sha512, scan result, trial result, verdict, rollback command. **Human sign-off**
   before it enters your live profile.

Reference: `research/admission-scans.md`, `research/admission-trials.md`, `research/plugin-ledger.md`.

## Phase M1 — install the stack

Install in this order, one row at a time, resting between installs:

1. **Session recall** — official `@deepseek-ai/dsh-experimental-session-search@<exact>`; pin the index
   explicitly (`path` + `openAt`; a patch replaces the row config wholesale, so restate both).
2. **Long-term memory** — vendor Hindsight plugin pinned to **self-hosted**, with your
   `HINDSIGHT_CONFIG` file (0600): `serverMode`, `apiUrl`, `bankId`, `dynamicBankId:false`, and
   autoSeed/autoUpdate/gitIngest off. A Cordis profile `config:` block does **nothing** for this plugin;
   the config lives in the file. Reference: `plugins`, `research/m1-install-verification.md`.
3. **Identity** — a small loader that injects your `SOUL.md` at persona order 0 (`interpolate:false`,
   size-capped, missing file = no-op). Reference: `plugins/dsh-soul/`, and write **your own** persona in
   `soul/SOUL.md` (the reference persona is an example, not a product).
4. **Push / proactivity (optional)** — the tiny ntfy notifier (inert until you set a topic) and the quiet
   heartbeat (default OFF). Reference: `plugins/dsh-push/`, `plugins/dsh-heartbeat/`.
5. **Enable nothing model-facing by default.** No shell automations, no plugin-manager tools in unattended
   sessions, no channel until you have a real need.

**M1 acceptance:** cross-session/restart recall; recall within budget; fail-open when memory is down; bank
isolation; session search finds an old conversation; no unexpected egress; no secrets in logs. Reference:
`research/m1-acceptance.md`.

## Phase M2 — hygiene & policy

- **Memory curator:** a scheduled pass that refreshes mental models and consolidates; a counts-only report.
  Reference: `scripts/memory/curate.sh`.
- **Retention/erasure policy:** define what lives where, how long, what prunes it, and what "forget" means
  for your memory engine (document delete vs derived observations vs full clear). Reference:
  `research/m2-retention-policy.md`, `scripts/memory/forget.sh`.
- **Encrypted off-host backups:** encrypt the backup unit before it leaves the host. Reference:
  `scripts/backup/dsh-offsite-bundle.sh`.
- **Per-surface autonomy policy:** who may do what, with which tools, unattended. Reference:
  `research/m2-autonomy-policy.md`.

## Adapting the reference scripts

The scripts are working examples. Before running, replace reference paths:

```sh
grep -rn '/home/josh' "$REPO"/scripts "$REPO"/plugins | head -50
```

Specifically: `/home/josh/projects/DSH-playground` → your clone, `/home/josh/.dsh-personal` → `$DSH_HOME`,
`dsh-personal.service` → `$UNIT`. Unit files in `scripts/*/units/` and the `ExecStart=` paths need the same.

## Do not

- Fork DSH or write a new agent loop to get a UI or a feature that a seam already provides.
- Install 0–3★ single-author plugins on core surfaces; write the small piece instead.
- Enable `danger-full-access` as a default or widen the sandbox to make an install work.
- Hand-write `insert` rows for bundle plugins; use `dsh plugin --profile <p> add`.
- Point memory at another user's bank/instance; touch another application's data.
- Run two pollers for one channel token; expose a channel without an allowlist.
- Store credentials in the repo, env files you commit, logs or telemetry.
- Claim a phase done without its acceptance tests passing.
