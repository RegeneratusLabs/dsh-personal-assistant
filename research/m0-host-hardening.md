# M0 host hardening — `dsh-personal` systemd user unit (D13 pragmatic baseline)

Status: **prepared, not applied.** This block is a host change and needs the human's go-ahead
(`AGENTS.md`: ask before host service config changes).
Owner: Lead. Related: [`m0-baseline-recon.md`](m0-baseline-recon.md) ·
[`personal-agent-security.md`](personal-agent-security.md) §4/§7/§8 · [`build-progress.md`](build-progress.md).

## 1. What exists today

`~/.config/systemd/user/dsh-personal.service` is a plain `Type=simple` user unit:

- `ExecStart=~dsh/node/bin/dsh --profile personal --host 127.0.0.1 --port 7002 --no-open
  --trusted-host … --public-url https://homelab.taildace6c.ts.net:8454/`
- `Restart=on-failure`, `WorkingDirectory=%h`, `Environment=DSH_HOME=%h/.dsh-personal`
- `StandardOutput/Error=append:%h/dsh/logs/personal.log` (world-group-readable `-rw-rw-r--`)
- **No hardening directives.** `systemd-analyze security --user dsh-personal.service` → **9.8 UNSAFE**.

## 2. What this block changes

One drop-in file only — the main unit stays untouched, so rollback is `rm` + restart:

`~/.config/systemd/user/dsh-personal.service.d/10-hardening.conf`
([source](../scripts/hardening/10-hardening.conf)):

| Directive | Intent |
|---|---|
| `StandardOutput/Error=journal` | local telemetry sink; removes the 0664 append file |
| `NoNewPrivileges=yes` | no privilege gain (setuid/file caps) |
| `UMask=0077` | files the service creates are 0600/0700 by default |
| `PrivateTmp=yes` | private `/tmp`, `/var/tmp` |
| `ProtectSystem=strict` + `ReadWritePaths=%h/.dsh-personal` | read-only system tree; writes only to the DSH home |
| `ProtectHome=read-only` | home read-only except the profile carve-out |
| `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK` | no other socket families (AF_NETLINK kept for `getifaddrs`) |
| `RestrictSUIDSGID=yes`, `LockPersonality=yes` | tighter process surface |
| `SystemCallFilter=@system-service` + `SystemCallErrorNumber=EPERM` | standard service syscall set, EPERM not SIGSYS |

Deliberately **not** included: `MemoryDenyWriteExecute` (kills V8 JIT), `IPAddressDeny/Allow` (not built
into this systemd: `-BPF_FRAMEWORK`; egress is observe+alert per D13), and no `ReadWritePaths` for the build
repo (the personal agent's writable workspace is `%h/.dsh-personal/workspace`).

## 3. Probe first — do *user* units honour these? (no persistent change)

Mount-namespace directives (`ProtectSystem`, `ProtectHome`, `PrivateTmp`) can be ignored or limited by an
unprivileged user manager. Probe with a transient unit before touching the real service:

```sh
# 1) start a 20 s transient unit carrying the same properties
systemd-run --user --unit=m0-hardening-probe \
  -p NoNewPrivileges=yes -p UMask=0077 -p PrivateTmp=yes \
  -p ProtectSystem=strict -p ProtectHome=read-only \
  -p "ReadWritePaths=$HOME/.dsh-personal" \
  -p "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK" \
  -p RestrictSUIDSGID=yes -p LockPersonality=yes \
  -p SystemCallFilter=@system-service -p SystemCallErrorNumber=EPERM \
  -- sleep 20

# 2) read back what actually took effect
systemctl --user show m0-hardening-probe \
  -p NoNewPrivileges -p UMask -p PrivateTmp -p ProtectSystem -p ProtectHome \
  -p ReadWritePaths -p RestrictAddressFamilies -p RestrictSUIDSGID \
  -p LockPersonality -p SystemCallFilter

# 3) clean up
systemctl --user stop m0-hardening-probe 2>/dev/null || true
systemctl --user reset-failed m0-hardening-probe 2>/dev/null || true
```

Expected: the seccomp properties are reported verbatim. If a mount directive comes back empty/false, record
it in the build log and either accept the gap or drop that line from the drop-in (do not "fix" it by widening
the sandbox).

## 4. Apply (human, no root)

```sh
mkdir -p ~/.config/systemd/user/dsh-personal.service.d
cp /home/josh/projects/DSH-playground/scripts/hardening/10-hardening.conf \
   ~/.config/systemd/user/dsh-personal.service.d/10-hardening.conf
systemctl --user daemon-reload
systemctl --user restart dsh-personal.service
```

## 5. Verify (read-only)

```sh
scripts/hardening/verify-unit-hardening.sh            # per-directive table + exposure score
systemctl --user status dsh-personal.service --no-pager | head -8
journalctl --user -u dsh-personal --since -3min --no-pager | tail -20
# boot + trusted-host fence (401 = serving; the service is anonymous until the launch token is used):
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7002/
# outbound model call works from inside the sandbox (startup model listing):
journalctl --user -u dsh-personal --since -3min --no-pager | grep -c 'model listing' || true
```

Pass criteria:

1. `verify-unit-hardening.sh` exits 0 (or the diff table is explainable and recorded).
2. Unit is `active (running)`, `:7002` answers `401` unauthenticated.
3. Journal shows a successful `model listing … loaded N model(s)` — proves DNS/TLS/model egress still works
   under `RestrictAddressFamilies` + `SystemCallFilter`.
4. A real session through the Web UI works (agent turn + one `bash` tool call into
   `~/.dsh-personal/workspace`) — human smoke test, since the launch-token cookie lives in the browser.
5. `systemd-analyze security --user dsh-personal.service` overall exposure drops (record before 9.8 vs after).

If the unit fails to start: `journalctl --user -u dsh-personal -n 50`, fix or remove the drop-in and
`daemon-reload` + `restart` (rollback below).

## 6. Rollback

```sh
rm ~/.config/systemd/user/dsh-personal.service.d/10-hardening.conf
rmdir ~/.config/systemd/user/dsh-personal.service.d 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user restart dsh-personal.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7002/   # expect 401
```

The main unit file is never edited by this block; previous behaviour returns exactly.

## 8. Applied — result (2026-11-10 15:47–15:53 AEST)

**Done via the drop-in only** (main unit untouched; profile patch backed up to
`cordis.patch.yml.bak-m0-20261110-154703`):

- Probe first: a transient user unit carried all properties; readback showed the user manager **honours
  every directive**, including `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp`, and the
  expanded `@system-service` syscall list (contains `clone`, `clone3`, `io_uring_*`).
- `scripts/hardening/verify-unit-hardening.sh` → **all requested directives took effect**; `StandardOutput`
  is `journal`. `systemd-analyze security --user dsh-personal.service`: **9.8 UNSAFE → 7.0 MEDIUM**.
- Boot verified: `:7002` returns `401` (fence up); journal shows a successful
  `model listing … loaded 2 model(s)` (DNS/TLS/model egress works under `RestrictAddressFamilies` +
  `SystemCallFilter`); unit `active (running)`, no failed exits.
- `journalctl --user -u dsh-personal` is now the unit's sink; the old `~/dsh/logs/personal.log` is no
  longer written.

**Two findings from applying it:**

1. **`LogFilterPatterns=` is silently ineffective for `--user` units here.** A transient-unit test showed
   the property is stored but matching lines are still journaled, so it was removed rather than shipped as
   a false control. **Residual:** the Web app prints its launch URL with `?token=…` to stdout, so the
   *current process's* launch token appears in the user journal (mode 0640 `root:systemd-journal`; `josh` is
   in `adm`). Tokens are per-process — a pre-restart token returns `401`, the current one `303` — the journal
   is excluded from backups/telemetry exports, and the digest/alert layer must redact `token=` (the secret
   scanner already masks it). A system-unit/root log redaction can replace this later.
2. **Old file logs leak launch-token URLs** (`~/dsh/logs/personal.log` 3, `~/dsh/logs/web.log` 32; both mode
   `-rw-rw-r--`). They are stale after restart but world-readable on disk; cleanup (chmod 600 + optional
   truncate) is queued with the human because it touches files outside the workspace.


## 7. Known limits (recorded, accepted by D13)

- Running as the human user: hardening restricts what the *host* lets the service do, not what the *user*
  lets it read. A compromised plugin can still read `~/.ssh`, `~/.hermes`, browser data, credentials
  ([`personal-agent-security.md`](personal-agent-security.md) §7).
- Egress is observed (nftables) and alerted, not blocked.
- User units may ignore some directives; the verify script is the source of truth.
- journald growth: after switching the unit to journal, set a retention cap as part of the telemetry block
  (`journalctl --vacuum-size=1G` / `SystemMaxUse=` drop-in), otherwise the journal keeps growing.
- The DSH app's own `~/.dsh-personal/logs/startup-*.log` files (mode 600) still exist; they are not covered
  by the unit's stdout redirect and should be included in the log-retention/rotation work.
