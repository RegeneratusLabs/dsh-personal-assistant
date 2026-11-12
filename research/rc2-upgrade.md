# DSH 0.2.2-rc.2 upgrade — preflight and runbook (2026-11-12)

Upgrades both hosts (`dsh-web.service` :7000, `dsh-personal.service` :7002) from
**0.2.2-rc.1** to **0.2.2-rc.2**. rc.2 is the release that adds the pieces the connector work needs:
`${credential:REF}` templates in the MCP client, and the official MCP server manager
(`mcp-manager`) with runtime status/restart/probe. It also moves Agent Teams into core
(`agent-team`, `tool-agent-team`, `ui-agent-team`) and drops the old
`@deepseek-ai/dsh-experimental-agent-team-profile` bundle.

## Status

| Step | State |
|---|---|
| Preflight in an isolated temp runtime + copied homes | **PASS** (2026-11-12) |
| Scripts written and dry-run through a transient user unit | **PASS** |
| Live upgrade, attempt 1 | **rolled back cleanly** — a booting host briefly answers `404` before its auth routes register; the readiness probe accepted the first non-zero code and rolled back a good install. Fixed to wait for the exact `401` (120 s), with boot diagnostics captured on timeout and a profile-install reconciliation in rollback. |
| Live upgrade, retry | run via `scripts/ops/dsh-upgrade-rc2.sh` |
| Post-upgrade plugin re-admission | pending; see checklist below |

## Preflight evidence

- rc.2 installed into `/tmp/dsh-rc2-preflight/runtime` (`npm 11.19.0`, Node `24.22.1`).
- Both real profiles copied to temp homes (relative `link:` symlinks re-pointed at the repo; temp copies of
  `.credentials.yaml` 0600 and shredded after the trial).
- `--dump-config` clean for both profiles; the composed tree contains `mcp-manager`, `agent-team`,
  `tool-agent-team`, `ui-agent-team`; the personal `preset-standard` block was regenerated from the shipped
  rc.2 preset minus `persona` (adds `tool-office`, `skill-filesystem.customSkillDirs`,
  `tool-subagent-control.interrupt:false`).
- Both temp hosts booted on spare ports (7011/7012): `/` answered **401 in 7 s**, no error lines, and the
  served page listed the expected client modules (profiles/guizang/media-desk on personal; web-mobile,
  dshmarket, host-control, context, blender, ffmpeg on web).
- The old agent-team bundle row cannot resolve under rc.2; removing it boots clean. rc.2 core supplies the
  replacement surface.
- Dumps/logs (tokens redacted): `.cache/rc2-preflight/` (gitignored).

## What changes

| File | Change |
|---|---|
| `scripts/ops/update-rc2-profiles.mjs` | idempotent profile edit: drop the removed agent-team bundle, pin session-search to rc.2, regenerate the personal `preset-standard` block from the installed rc.2 preset, drop dead web patch rows (`dsh-status`, `guizang-design`, `media-desk`) |
| `scripts/ops/dsh-upgrade-rc2.sh` | detached upgrade: targeted backups + M0 backup, stop both units, `npm i -g @deepseek-ai/dsh@0.2.2-rc.2` (temp npm cache), profile update + `dsh plugin install`, `--dump-config` gates, restart both, report; auto-rollback on failure |
| `~/.dsh-personal/profiles/personal/{package.json,cordis.patch.yml}` | edited in place with `.bak-rc2-<ts>` backups |
| `~/.dsh/profiles/web/{package.json,cordis.patch.yml}` | edited in place with `.bak-rc2-<ts>` backups |

## Run

```sh
# dry-run (transient unit, no mutation)
systemd-run --user --collect --wait \
  --property=WorkingDirectory=/home/josh \
  /bin/bash /home/josh/projects/dsh-personal-assistant/scripts/ops/dsh-upgrade-rc2.sh --dry-run

# live (detached; stops dsh-web, so the Web session drops)
systemd-run --user --collect --unit=dsh-upgrade-rc2 \
  --property=WorkingDirectory=/home/josh \
  /bin/bash /home/josh/projects/dsh-personal-assistant/scripts/ops/dsh-upgrade-rc2.sh
```

Report: `/home/josh/dsh/logs/upgrade-rc2-<ts>.log` and
`/home/josh/backups/rc2-upgrade-<ts>/report.txt`.

## Rollback

The script auto-rolls back on any failure after mutation starts: reinstall
`@deepseek-ai/dsh@0.2.2-rc.1`, restore the backed-up profile/home files, restart both units. Manual:

```sh
systemctl --user stop dsh-personal.service dsh-web.service
/home/josh/dsh/node/bin/npm --cache /tmp/dsh-rollback-cache \
  install -g @deepseek-ai/dsh@0.2.2-rc.1 --no-audit --no-fund
# restore files from /home/josh/backups/rc2-upgrade-<ts>/ (same relative paths)
systemctl --user start dsh-personal.service dsh-web.service
```

## Post-upgrade checklist (must all pass)

1. Both units active; `/` → 401 on :7002 and :7000; `dsh-pending.py` clean; no error lines in the journal.
2. Personal: SOUL opener on a new session; Hindsight recall (bank `dsh-personal`); `session_search` finds an
   old session; guizang + media-desk auth gates (401/200); profiles panel; push inert; heartbeat off.
3. Coding: host-control status/restart; web-mobile; dshmarket; context; ffmpeg; blender; web-fetch-playwright;
   web-search; youtube; auto-review; inspector; plugin-market; forge; profiles.
4. Agent Teams: `ui-agent-team` serves; the old bundle row is gone; a teammate can be spawned.
5. Connectors: `mcp-manager` row composed; `ctx.mcpManager.list()` reachable; first connector installs.
6. Docs/ledger updated; CI secret scan clean; commit + push.
