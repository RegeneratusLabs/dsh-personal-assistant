# dsh-host-control — restart this DSH from the browser

A zero-build local plugin for the DeepSeek Harness Web GUI. It closes the loop the Plugins page leaves
open: an install that reports **restart required** is only visible as a transient toast, and actually
restarting the Host used to need a shell.

It adds **Settings → Host control**:

- which systemd `--user` unit this process runs under, its state, PID, start time, listener and profile;
- **Waiting for a restart** — plugins that are installed and selected in `dsh.profile.bundles` but that
  the running process never composed (the saved selection on disk versus `ctx.clientModules.clientPath()`);
- **Restart DSH** — a confirmed restart of *this* unit only.

Why it exists, and the alternative shell path, are documented in
[`research/dsh-restart-runbook.md`](../../research/dsh-restart-runbook.md).

## Install

From the Web UI: **Plugins → Add plugin → `/home/josh/projects/DSH-playground/plugins/dsh-host-control`**,
or from the Host API (`plugin_manager` `install_bundle`). The install reports `restart-required`
(`package-moved`), so the first time needs one shell restart — after that the button is available:

```sh
/home/josh/projects/DSH-playground/scripts/ops/dsh-restart.sh dsh-web.service
```

## Contract

Both routes live on the shared authenticated `/api` channel (`ctx.connection.fetch`), so Connection's
Host/Origin fence and the signed browser cookie are enforced before either handler runs, and only owner
Peers reach them. Neither route is a model-facing tool: the agent cannot restart the Host by itself; a
human clicks the button.

| Route | Method | Behaviour |
|---|---|---|
| `/api/host-control/status` | `GET` | unit, listener, profile/home, `pending`, `stale`, `liveCount` |
| `/api/host-control/restart` | `POST` | restarts this process's own unit; **takes no parameters** |

The unit is derived from the running process (`/proc/self/cgroup`, with a `MainPID` scan of `dsh*.service`
as fallback) and validated against `^[A-Za-z0-9_.@-]+\.service$`. A request cannot name a different unit,
so the endpoint cannot restart other services.

The restart is handed to systemd as a separate transient unit:

```
systemd-run --user --collect --quiet --unit dsh-restart-<ts>-<pid> \
  /bin/sh -c 'sleep 1; exec systemctl --user restart <unit>'
```

That survives this process being killed by the restart, and the one-second delay lets the HTTP answer
reach the browser before the socket closes. The signed cookie survives the restart, so the page only
needs to reconnect — no new launch-token URL.

## Verify

```sh
# Host side, against a run and then a restart of the unit
curl -b "$JAR" http://127.0.0.1:7000/api/host-control/status | python3 -m json.tool

# UI end-to-end (settings section, confirmation, restart, reconnect); screenshots in artifacts/
node scripts/verify-host-control-ui.mjs "<token-url>" host-control
```

Developed and verified against a scratch Host home on `:7011` run as its own transient unit
(`dsh-ht-test.service`) so testing the restart never touched a live host.

## Notes

- The settings section re-reads status on mount, after a restart and on **Refresh**. The pending list is
  a live comparison, not a stored queue: DSH keeps no such queue, so there is nothing to "flush" other
  than the restart itself.
- Config-only edits (`cordis.patch.yml` rows) are hot-reloaded by HMR and are deliberately not listed.
- Host-only bundles (no `dsh.client` declaration) cannot be proven stale by that comparison and are not
  listed either.

## Rollback

Remove the bundle from the profile (`Plugins → Remove`, or `plugin_manager` `remove_bundle`) and restart.
Deleting the row leaves no other host state behind.
