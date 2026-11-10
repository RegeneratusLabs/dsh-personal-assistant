# dsh-profiles — profile switcher panel (design A)

A zero-build client plugin for the DeepSeek Harness Web GUI that adds a **Profiles** entry to the left
sidebar. The page renders one card per independent DSH host (its own `$DSH_HOME`, profile and port),
probes liveness, and opens the chosen host in a new tab.

This is the "multi-host dashboard" design: each profile stays a separate DSH process, so sessions,
schedule tasks, memory and credentials stay siloed. The panel is only a launcher — it never proxies
traffic — and DSH's browser cookie is bound to hostname + port, so every host keeps its own login.

Current cards (Tailscale authorities — the panel is meant to be opened over the tailnet):

| Profile | URL | Local listener |
|---|---|---|
| Coding | `https://homelab.taildace6c.ts.net/` | `127.0.0.1:7000` |
| Personal | `https://homelab.taildace6c.ts.net:8454/` | `127.0.0.1:7002` |

## Install

```sh
# coding home
dsh plugin --profile web add /home/josh/projects/DSH-playground/plugins/dsh-profiles
# personal home (separate DSH_HOME)
DSH_HOME=~/.dsh-personal dsh plugin --profile personal add /home/josh/projects/DSH-playground/plugins/dsh-profiles
```

The bundle row mounts the host half; `dsh.client` loads the browser half. Reload the Web UI once after
install (or restart the host) so the client module joins the boot graph.

## Configure the profiles

v0.1.0 keeps the list in `client.js` (`PROFILES`), because a client-only plugin cannot read a Loader row
config without a Host Remote. Edit the array, reload the page; add a Host Remote + Settings card in v0.2
to make it editable without touching code.

```js
const PROFILES = [
  { id: 'coding',   name: 'Coding',   url: 'https://homelab.taildace6c.ts.net/',      accent: '#4f8cff', description: '…' },
  { id: 'personal', name: 'Personal', url: 'https://homelab.taildace6c.ts.net:8454/', accent: '#3fb27f', description: '…' },
];
```

`url` must be the browser authority you actually open: DSH mints its session cookie for the
hostname + port that received the launch-token exchange. Behind Tailscale Serve the listener still binds
`127.0.0.1`; Serve owns the TLS leg and forwards the browser-facing `Host`, which is why each host is
launched with `--trusted-host homelab.taildace6c.ts.net`.

## First visit / auth

A host shows a DSH unlock page until the browser has exchanged that process's launch token once. The
`dsh web:` line printed at startup (also appended to the service log) carries the tokenized URL:

```sh
grep -o 'https://homelab.taildace6c.ts.net:8454/?token=[A-Za-z0-9_-]*' ~/dsh/logs/personal.log | tail -1
```

Open it once; DSH writes a signed cookie for that authority + port (365 days on both hosts here). After
that, the panel's **Open** button works normally from the tailnet. The token rotates on every restart, but
the cookie survives restarts.

## Tailnet setup this depends on

```sh
tailscale serve --bg --https=8454 http://127.0.0.1:7002   # personal
tailscale serve status
# 443  -> 127.0.0.1:7000   (coding, pre-existing)
# /relogin -> 127.0.0.1:7001 (pre-existing re-auth helper for coding)
# 8454 -> 127.0.0.1:7002   (personal)
```

The personal host is started with `--public-url https://homelab.taildace6c.ts.net:8454/` so its printed
startup URL is the tailnet one and the agent's runtime context shows the tailnet address. Loopback access
(`http://127.0.0.1:7002/`) still works for debugging.

## Files

| File | Role |
|---|---|
| `package.json` | `dsh.bundle.patch` + `dsh.client` declarations, `./client` export |
| `index.js` | Host half — empty `apply()`; exists so the bundle owns a Loader row |
| `client.js` | Browser half — sidebar entry, main page, liveness probes |
| `cordis.patch.yml` | Bundle patch that inserts the Host row |
| `icon.svg` | Sidebar/plugin-list glyph |

## Removing

```sh
DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove @local/dsh-profiles
dsh plugin --profile web remove @local/dsh-profiles
```

or toggle it off on the Plugins page. The plugin owns no durable state.
