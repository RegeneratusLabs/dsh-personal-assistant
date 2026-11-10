# M0 baseline recon — host + DSH personal (2026-11-10)

Read-only inspection before the first M0 change. All commands were non-mutating; no unit, user, file, or
network config was changed. Everything below is reproducible with the commands named in each section.

Purpose: ground the M0 checklist in [`build-progress.md`](build-progress.md) and
[`personal-agent-security.md`](personal-agent-security.md) §4 in what this host can actually do.

## 0. Verdict up front

| M0 checklist item | This host | Consequence |
|---|---|---|
| `systemd IPAddressDeny=any` + `IPAddressAllow=` | **Not supported.** systemd 255 is built `-BPF_FRAMEWORK` and the binary contains no `IPAddressAllow` string. | The allowlist must be enforced with **nftables** (installed, inactive) filtered by service UID, with kernel-logged denies. Replaces the systemd directive in the plan. |
| Dedicated Unix user / rootless container | No `dsh` user; service runs as `josh` (`uid 1000`, groups include `sudo`, `lxd`). `podman` not installed (apt candidate 4.9.3). Docker rootful is active but is not a rootless boundary. | Dedicated user `dsh` + a hardened **system** unit is the pragmatic path; rootless Podman remains the later high-assurance option. |
| Secrets isolated from human data | `~/.dsh-personal` is mode 700 owned `josh`; `.credentials.yaml` mode 600 but **readable by every process running as `josh`** (Hermes, any plugin, any shell). | Moving the service to `dsh` is the actual control; file modes alone do not isolate. |
| Hindsight separate `dsh-personal` bank | Daemon runs as `josh` via `uvx hindsight-api@0.10.3` on `127.0.0.1:9177`, backed by **Hermes's embedded Postgres** `~/.pg0/instances/hindsight-embed-hermes`. Banks: `josh` (58,310 facts), `hermes-bank-3`, `hermes-bank-2`. No `dsh-personal` bank exists. | A bank alone shares Hermes's DB and process. True isolation = second Hindsight instance under `dsh` on `127.0.0.1:9178` with its own embedded Postgres. |
| Local telemetry sinks | journald is persistent (`/var/log/journal`, 2.4 GB, no retention policy set); DSH writes its own log files; no token/cost meter or digest job yet. | Sinks exist; retention, digest, and alerting are to build. |
| Disable DSH telemetry egress | Rows present and default-on: `session-log-deepseek`, `plugin-package-inventory-deepseek`, `otel`, `session-telemetry-otel` (`mode: FEEDBACK_ONLY`, endpoint `https://dsh-otel-collector.deepseeksvc.com/v1/logs`). | Patch `enabled: false` on the two request-field plugins and `mode: DISABLED` on `session-telemetry-otel`. |
| Restore drill | No backup unit, no restore procedure; only ad-hoc copies under `~/.dsh/backups` and `~/backups/hindsight-2026-10-30`. ext4, no snapshots; 317 GB free. | Build backup + restore scripts, drill into a scratch `DSH_HOME` on an alternate port. |

**Security note (recorded honestly, no values in this repo):** during recon a redaction filter missed nested YAML, so credential-shaped values were briefly surfaced in the agent session's tool output and therefore in the session transcript that reaches the model provider. No credential values are written in this repository. Rotation was declined as an accepted risk (D12/D13); the durable mitigations are the 0600 credential store, no secrets in logs/prompts by policy, and a local-only telemetry baseline. If this host's credentials are ever suspected compromised, rotate all refs and rebuild from the pinned list rather than patching in place.

## 1. Host baseline

- Ubuntu 24.04.5 LTS, kernel 6.8.0-146, systemd 255.4-1ubuntu8.18, x86-64, hostname `homelab`.
- `josh` (uid 1000) groups: `josh adm cdrom sudo dip plugdev lxd`.
- `/home/josh/.config/systemd/user/dsh-personal.service`: `Type=simple`, runs
  `~dsh/node/bin/dsh --profile personal --host 127.0.0.1 --port 7002 --no-open --trusted-host …`,
  `Restart=on-failure`, `StandardOutput/Error=append:~/dsh/logs/personal.log`. **No hardening directives**
  (`NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`, `RestrictAddressFamilies`,
  `SystemCallFilter` all absent). Active 23 h, PID 1873631, ~291 MB RSS.
- DSH install: `/home/josh/dsh/node` (1.3 GB, josh-owned); Node 24.22.1; DSH 0.2.2-rc.1. Log dir
  `~/dsh/logs` is `drwxrwxr-x`, `personal.log` is `-rw-rw-r--` → **hardening item: 0600 or journald**.
- Network: `eno1 192.168.1.100/24`, `tailscale0 100.86.176.62/32` + `fd7a:115c:a1e0::c634:b03f`,
  `docker0` down. Tailscale serve exposes 443 and 8443–8454; personal is served at
  `https://homelab.taildace6c.ts.net:8454/` → `127.0.0.1:7002`. The Web host fence returns `401` without a
  cookie (good).
- Firewall tooling: `nftables 1.0.9` and `iptables 1.8.10` **are installed** (`/usr/sbin/nft`,
  `/usr/sbin/iptables`); they were merely absent from the agent's `PATH`. `nftables.service` is inactive —
  there is currently **no** host firewall policy for the service.
- `sudo` is blocked for the agent's sandboxed shell (`no new privileges` flag) → root changes must be run by
  the human in their own terminal. I will hand over exact commands + rollback for each.
- journald: persistent, 2.4 GB used, no `SystemMaxUse` policy.
- No LUKS/snapshot story on `/` (ext4); backups must be file-level.

## 2. DSH personal profile baseline

- `$DSH_HOME=/home/josh/.dsh-personal` (mode 700, josh). Credentials: `.credentials.yaml` mode 600 with
  refs `OPENCODE_GO_API_KEY`, `OPENCODE_GO_API_KEY_2`, `DEEPSEEK_API_KEY`, plus a `client-connection/browser-session`
  grant. `.anonymous-user-id` present (OTel resource identity) — removable/rotatable.
- Profile `personal` = bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`,
  `@local/dsh-profiles` (local link to `/home/josh/projects/DSH-playground/plugins/dsh-profiles`).
- Profile patch: model route `llm-pi-ai` → provider `opencode-go` (`apiKeyEnv: OPENCODE_GO_API_KEY`),
  model `deepseek-v4.1-flash`, reasoning `max`; `connection.cookieMaxAgeDays: 365`; workspace
  `/home/josh/.dsh-personal/workspace`.
- Model endpoint observed: `https://opencode.ai/inference/go/openai/v1` (pi-ai `opencode-go` provider);
  `api.deepseek.com` is also contacted for `/models` listing (the `llm-deepseek-api-key` row is mounted in
  base). Hindsight uses `https://opencode.ai/zen/go/v1` for extraction.
- Telemetry rows mounted with defaults (see §0). `DSH_TELEMETRY_DISABLED` and `DSH_TELEMETRY_MODE` are the
  process-level switches; a profile patch is the durable way.
- `dsh plugin --profile personal list` **fails** in the agent sandbox: the plugin manager writes
  `package.json.lock` in the profile dir, which is outside the workspace write scope. All profile mutations
  need a human-run command or a one-off approval.
- Egress observed at sample time (all host-wide, not attributed): `149.154.166.110:443` (Telegram,
  Hermes gateway), `104.16.248.249:443`, `9.9.9.9:443` (systemd-resolved upstream), plus loopback
  `:7000/:7002/:5432/:7006`. The personal service itself logs repeated `https://api.deepseek.com/models`
  listings. **A per-UID egress log is needed before the allowlist can be asserted** — that is M0 block 3.

## 3. Hindsight baseline

- `uvx hindsight-api@0.10.3 --idle-timeout 0 --port 9177` as `josh`; embedded Postgres
  `~/.pg0/instances/hindsight-embed-hermes/data` (port 5432), Hermes-managed.
- `/health` → healthy; `/v1/default/banks` → `josh` (58,310 facts), `hermes-bank-3` (29), `hermes-bank-2` (66);
  `/v1/default/banks/josh/stats` → 1.68 M links, 7,089 docs, 5,236 failed ops.
- LLM for retain/consolidate: `openai_compatible`, `base_url=https://opencode.ai/zen/go/v1`, key in
  `~/.hindsight/profiles/hermes.env` (mode 600). Also pulls `BAAI/bge-small-en-v1.5` + a cross-encoder on
  first boot → **HF Hub egress** unless the model cache is pre-seeded.
- Managed by `hindsight-hermes-watchdog.timer` (every 5 min). **Do not modify Hermes paths**; a new
  `dsh` instance is separate.
- Endpoints needed for M0/M1: `/v1/default/banks`, `/v1/default/banks/{id}/{export,import,stats,audit-logs,
  memories,reflect}`, `/llm-requests/stats`, `/mcp`.

## 4. Proposed M0 execution blocks (each needs your approval)

Block numbering follows the checklist; nothing here has run yet.

| # | Block | Root? | Main actions | Rollback |
|---|---|---|---|---|
| 0 | Recon (this file) | no | read-only inspection, record baseline | n/a |
| 1 | Repo artifacts | no | hardened system unit, nftables ruleset + egress refresh/observe scripts, backup/restore scripts, telemetry patch, runbook under `scripts/`, `research/` | `git checkout` |
| 2 | OS isolation | **yes** | `useradd --system --create-home dsh` (no sudo, no keys, nologin); copy DSH install to `/opt/dsh` root-owned read-only; `rsync` profile home to `/home/dsh/.dsh-personal` with `chown -R dsh:`; copy the local `dsh-profiles` bundle; install hardened system unit; verify on port 7003, then swap `personal` to 7002 and disable the user unit | stop unit, re-enable user unit, `rm -rf /home/dsh` (after backup) |
| 3 | Egress allowlist | **yes** | nftables `output` chain rule for `meta skuid dsh`: allow `lo`, LAN `192.168.1.0/24`, tailnet `100.64.0.0/10`/`fd7a::/48`, resolved sets for `api.deepseek.com`, `opencode.ai`, `api.telegram.org`, Feishu/Lark/push; deny + `log prefix "DSH-EGRESS-DENY "` otherwise; systemd timer refreshes DNS sets; explicit `egress-allow npm` on/off window for approved installs | `nft delete table inet dsh_egress`; disable timer |
| 4 | Secrets | **yes** (+ human reissue) | rotate the four refs leaked in recon; write `/home/dsh/.dsh-personal/.credentials.yaml` 0600 dsh; move Hindsight LLM key to a `dsh` env file 0600; keep secrets out of unit env; `0600` on all DSH logs or switch unit to journal | restore from pre-rotation backup |
| 5 | Hindsight separation | + yes | new `hindsight-api@0.10.3` instance as `dsh` on `127.0.0.1:9178`, own `~dsh/.pg0` DB; create bank `dsh-personal`; seed HF model cache from josh cache (no download); verify banks `josh`/`hermes-bank-3*` are unreachable from the `dsh` instance; pg_dump + bank export in backup script | stop new instance, delete its DB |
| 6 | Telemetry | no (profile) + yes (journald retention) | patch `session-log-deepseek.enabled=false`, `plugin-package-inventory-deepseek.enabled=false`, `session-telemetry-otel.mode=DISABLED`; unit logs to journald; egress log sink; token/cost per session from `ctx.tokenMeter`/session events; Hindsight `/llm-requests/stats` + audit; plugin ledger is the install sink; daily digest via shipped `dsh-schedule`; alert timer (egress deny, unit restart, Hindsight health, backup age, cost spike); 0600 redacted telemetry files | revert patch rows, restart |
| 7 | Restore drill | no | backup script → restore profile+workspace+Hindsight export into scratch `DSH_HOME` on port 7009; run acceptance: boot, session list, Hindsight bank recall, no Hermes facts; record evidence + timings | delete scratch dir |

Cutover detail: build and verify the hardened `dsh` unit on **port 7003** first; only when it passes
(boot, Web login via trusted host, model call, Hindsight recall, egress log clean) stop the old user unit
and restart hardened on 7002. Tailscale serve keeps pointing at 7002, so no tailnet change is needed.

## 5. Decisions needed before block 2

1. Isolation: dedicated `dsh` user + hardened system unit vs rootless Podman container vs both (later).
2. Hindsight: second instance/DB under `dsh` (:9178) vs new bank on the existing Hermes instance (:9177).
3. Egress: enforce now with nftables (deny + log) vs observe-only in M0 and enforce in M0.5.
4. Credential rotation: rotate the four recon-exposed refs now / after migration / not at all.
5. (Non-blocking) OTel: default is the checklist's "DISABLED + local journal/digest"; a local collector is
   not planned unless you ask for one.
