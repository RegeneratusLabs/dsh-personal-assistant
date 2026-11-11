# UI data inventory — Status / Health panel

Scout pass for the UI/UX track. Deliverable for the **first slice** (read-only Status/Health): the copyable
client-plugin conventions from our two working bundles, the exact shape of every local data source the panel
will surface, the gaps between [`ui-handover.md`](ui-handover.md) and reality, and one recommended host route.

- **Collected:** 2026-11-11 ~12:20 AEST, read-only (`workspace-write` sandbox, no host changes, no service
  restarts, no installs, no commits).
- **Host state at capture:** `dsh-personal.service` active/running since 2026-11-11 07:44 AEST, MainPID set,
  `NRestarts=0`; Hindsight `:9177` healthy; no plugin changes pending; digest timer last ran 07:02, curator
  timer never fired yet (enabled 08:46, first run next 07:15).
- **Repo:** `/home/josh/projects/DSH-playground` (public). **Every example below is sanitized**: personal
  hostnames, user/uid, home paths, session ids, memory text, artifact hashes and observed IPs are replaced
  with `<...>` placeholders. `dsh-personal` (the bank name) is kept as required.

---

## 0. TL;DR

1. **Both working bundles are the same zero-build recipe**: a package with `dsh.bundle.patch` +
   `dsh.client` in `package.json`, a one-row `cordis.patch.yml`, an empty-or-route host half (`index.js`), and
   a `client.js` that calls `window.__ModuleLoader__.load({ id: '<pkg>', factory(require) {...} })`. No
   bundler, no dependencies, no build step.
2. **Client UI = `ctx.slots` + `ctx.locale` only**; host data = `ctx.connection.fetch.register` on the
   authenticated `/api` channel. Auth, Host/Origin fence and owner check run **before** the handler; a
   handler never authenticates anything itself.
3. **15 read-only sources** were verified in §B. Only four touch a subprocess (`check-alerts.sh`,
   `summarize-egress.sh`, `retention-report.sh`, `systemctl`); the rest are JSON files, a read-only SQLite DB,
   or the Hindsight REST API. Total cold latency of the recommended set is **~1.3 s** (dominated by
   `check-alerts.sh` at ~1.2 s); caches make refreshes ~10 ms. The Status slice uses 12 of them; the
   session-search DB and raw memory text are deferred to the Memory/Activity slices.
4. **The interface is already inconsistent in four places** the first panel must paper over: no digest JSON
   (only `.md`), `retention-report --json` has no schema version and a *string* `hindsight` field,
   `memories/list` is GET not POST, and backup manifests are one directory deeper than the handover says.
5. **The biggest architectural gap:** the panel is developed on the **coding host** (`~/.dsh`, `dsh-web.service`,
   `:7000`) but it reports on the **personal host** (`~/.dsh-personal`, `dsh-personal.service`, `:7002`).
   Host-control's `status` only describes the *serving* process. The new route needs an explicit
   **agent target** (`DSH_PERSONAL_HOME` or `~/.dsh-personal`) separate from `serving`, and must say which one
   each number came from.
6. **Recommended:** one route `GET /api/dsh-status/status`, server-side aggregate with per-source
   allSettled + timeouts + per-section TTL cache (single-flight), client refreshes once every 60 s while
   visible (pause on `document.hidden`, backoff on failure). Response shape in §D.

---

## A. Plugin conventions (exact, copyable)

### A.1 Bundle anatomy

| File | Role | Required? |
|---|---|---|
| `package.json` | `name`, `exports["./client"]`, `dsh.bundle.patch`, `dsh.client` | yes |
| `cordis.patch.yml` | inserts the **one Host Loader row** that owns the bundle | yes |
| `index.js` | Host half: `export const name`, `export const inject`, `export function apply(ctx)` | yes (may be empty `apply(){}`) |
| `client.js` | Browser half: `window.__ModuleLoader__.load(...)` | yes if the panel has UI |
| `icon.svg` | optional asset, exported as `./icon` | optional (profiles has one, host-control does not) |
| `README.md` | install/verify/rollback contract | yes by repo convention |

Minimum skeleton for the new Status bundle:

```text
plugins/dsh-status/
├── package.json          # @local/dsh-status, dsh.bundle + dsh.client
├── cordis.patch.yml      # - insert: [{ id: dsh-status, name: '@local/dsh-status' }]
├── index.js              # host half: GET /api/dsh-status/status
├── client.js             # sidebar.panellist + main panel
├── icon.svg              # optional; the sidebar glyph is drawn inline in client.js today
└── README.md
```

No `node_modules`, no `pnpm`, no bundler, no `lib/` build output. The host serves `exports["./client"]`
verbatim.

### A.2 `package.json` — exact shape

From [`plugins/dsh-profiles/package.json`](../plugins/dsh-profiles/package.json) (`host-control` is identical
except it has no `./icon` export and no `icon.svg`):

```json
{
  "name": "@local/dsh-status",
  "version": "0.1.0",
  "private": true,
  "description": "Read-only Status/Health panel for the personal DSH assistant.",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./package.json": "./package.json"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "README.md"],
  "dsh": {
    "manifestVersion": 1,
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-ui-sidebar",
        "@deepseek-ai/dsh-client-ui-layout"
      ]
    }
  }
}
```

Field rules confirmed in code/docs:

- `exports["./client"]` is what the client-module system serves. It scans **enabled Loader entries** for
  packages declaring `dsh.client` and serves that export; the half attaches to the row whose specifier is the
  **bare package name** (so the row `name:` must equal `package.json.name`).
- `dsh.client.platform` is `"web"` in both bundles (required for a browser half).
- `dsh.client.immediately: true` — both bundles set it; the panel should too (it is the always-visible
  sidebar/main entry).
- `dsh.client.inject` lists the **host client modules** whose slots/services the browser half uses.
  Profiles needs `dsh-client-ui-sidebar` + `dsh-client-ui-layout` (for `sidebar.panellist` + `main`);
  host-control needs only `dsh-client-ui-settings` (for `settings.section`). A Status bundle that contributes
  a sidebar entry **and** a main panel needs **both** sidebar and layout.
- `"type": "module"` + ESM in `index.js`; `client.js` is plain script (not ESM).
- `private: true`; local scope `@local/…`; version `0.1.0`.
- No `main` field needed (both rely on `exports`).

### A.3 `cordis.patch.yml` — exact shape

Both files are the same five lines:

```yaml
# Bundle patch for the Status panel: one Host row owns the bundle, and its
# `dsh.client` declaration loads the browser half.
- insert:
    - id: dsh-status
      name: '@local/dsh-status'
```

- `id` = Loader row id, unique in the profile (this is what the Plugins page toggles).
- `name` = the **exact** package name (must match `package.json.name`; client half attaches by that string).
- Install with `dsh plugin --profile <p> add <path>` — never hand-write `insert` rows (AGENTS.md P0).

### A.4 Host half conventions

Exports (from [`plugins/dsh-host-control/index.js`](../plugins/dsh-host-control/index.js)):

```js
export const name = 'dsh-host-control'        // row/inspection name
export const inject = ['connection']          // Cordis services the apply() needs
export async function apply(ctx) { /* effects only; no global state */ }
```

Profiles' host half proves the minimum: `export function apply() {}` — the row exists only so the bundle owns a
Loader row, which is what puts the client half in the boot graph.

**Route registration** (the exact pattern to copy):

```js
const dispose = await ctx.connection.fetch.register({
  path: '/api/dsh-status/status',      // absolute, below /api
  methods: ['GET'],                    // 'GET' | 'HEAD' | 'POST'
  requestBody: 'buffered',             // required: 'buffered' | 'streaming'
  fetch: handler,                      // (request: Request) => Promise<Response>
});
ctx.effect(() => () => { void dispose(); }, 'dsh-status: /api routes');
```

Confirmed from `@deepseek-ai/dsh-client-connection` (`lib/types/rpc.d.ts`):

- `path` is an **exact** path below `/api`; query parameters stay available on `request.url`.
- `methods` is an allowlist; other methods fall through to shared-channel dispatch and end as **404**.
- `requestBody` must be declared before the bridge reads any bytes. Use `'buffered'` for JSON.
- `register()` returns an **async disposer**; wrap it in `ctx.effect` (host-control does exactly this).
- Registering the same path twice **throws** (`connection: exact Fetch route … is already registered`), so one
  route per path, owned by exactly one row.
- Only **owner** Peers reach the handler. Non-owner → `403 "forbidden"`.

**Auth / error contract (measured):**

| Situation | Response |
|---|---|
| No signed cookie / expired | `401` `unauthorized` — returned **before** route matching (even unknown `/api` paths) |
| Host/Origin fence fails | `403` (DNS-rebinding / cross-site defence) |
| Authenticated but non-owner Peer | `403` `forbidden` |
| Wrong method on a registered route | `404` `not found` (falls through) |
| Unknown route after auth | `404` `not found` |
| Handler throws | bridge surfaces an error response (avoid — return a degraded body instead) |

**Response helpers** (copy verbatim; they set the headers the client expects):

```js
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function rejectJson(error, detail) {
  return new Response(JSON.stringify({ ok: false, error, detail }), {
    status: 409,   // host-control's choice; see pitfall A.7-7
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
```

**How the host half reads data** (only three mechanisms exist today):

1. `execFile` with a timeout, resolving `null` on any failure — never `exec`, never a shell string:

```js
function run(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 5000 }, (error, stdout) => resolve(error ? null : String(stdout)));
    } catch { resolve(null); }
  });
}
```

2. `readFileSync` / `readdirSync` inside `try/catch` (returns `null`/`false` on any problem).
3. `ctx.get('…')` services — no module imports of host packages:
   - `ctx.get('webServer')?.getOrigin()` → listener origin, e.g. `"http://127.0.0.1:7002"`.
   - `ctx.get('clientModules')?.clientPath(pkg)` → live browser bundle of a package, or null.
   - `ctx.get('loader')?.entries()` → Loader rows; `entry.fiber.state === 2` is `FiberState.ACTIVE`.
4. For the new route also: global `fetch` (Node 24) with `AbortSignal.timeout(...)` for the Hindsight REST
   calls.

**Host half must never**: register a model-facing tool (host-control deliberately registers none), accept a
target unit/path from the request (it derives the unit from `/proc/self/cgroup` and validates
`^[A-Za-z0-9_.@-]+\.service$`), or echo env values.

### A.5 Client half conventions

Entry (both bundles):

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-status',          // MUST equal package name
  factory(require) {
    const React = require('react'); // host-provided; react-dom also available
    const h = React.createElement;
    // … components/dictionaries …
    return { inject: ['slots', 'locale'], apply };   // returned object IS the Cordis plugin
  },
});
```

**Locale** — flat dictionary pair, namespace = package-ish string, every visible string through `t`:

```js
const NS = 'dsh-status';
const en = { panel: 'Status', title: 'Status / Health', refresh: 'Refresh', /* … */ };
const zh = { panel: '状态', title: '状态 / 健康', refresh: '刷新', /* … */ };

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-status: dictionaries');
  const t = ctx.locale.bind(NS);
  // …
}
```

Both bundles ship **both** `en` and `zh` with the same key set; keys are flat (no nesting). `t` is passed to
panels either through a slot `inject` factory (`inject: () => ({ t })`) or closed over in a `label` closure.

**Slots used (exact registration options measured):**

```js
// 1. Left-sidebar entry. The registered component is the ICON. Receives { size, active }.
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register(
    { name: 'sidebar.panellist', id: PANEL_ID, order: 5, locale: NS, label: () => t('panel') },
    StatusGlyph,
  ),
);

// 2. Central page. KEYED slot: `key` must equal the sidebar `id`.
ctx.slots.inject('main', () =>
  ctx.slots.register(
    { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t }) },
    StatusPanel,
  ),
);

// 3. Settings section (only if the panel also earns a settings page).
ctx.slots.inject('settings.section', () =>
  ctx.slots.register(
    { name: 'settings.section', id: 'dsh-status', order: 90, locale: NS,
      label: () => t('section'), inject: () => ({ t }) },
    StatusSection,
  ),
);
```

Slot facts confirmed in the shipped packages:

- `sidebar.panellist` is a **list**; owner renders each registered icon with props `{ size, active }`
  (`size` = 16 when the sidebar is wide, 18 when collapsed) and reads its label through the row.
- `main` is **keyed**: the sidebar `id` selects the `main` entry with the same `key`. Registering both from one
  `PANEL_ID` constant avoids the "selecting a missing main entry throws" failure mode.
- `settings.section` is a list of pages; its navigation icon needs a **separate**
  `ctx.slots.inject('settings.section.icon', …)` registration with the same `id` (both working plugins skip
  it, so host-control renders the default glyph even though it ships no `icon.svg`).
- `order` sorts ascending (lower first).
- Registering into an undeclared slot throws during activation; `ctx.slots.inject(slot, cb)` is the required
  wrapper (the callback re-runs if the owner remounts, and its effects are disposed with the owner).

**Panel routing / ids:** there is no router. `PANEL_ID` is both the sidebar `id` and the `main` `key`; two
plugins currently use `profiles` and (settings-only) `host-control`.

**State / loading / error / confirm (host-control is the reference implementation):**

```js
const [state, setState]     = React.useState(null);
const [error, setError]     = React.useState('');
const [loading, setLoading] = React.useState(true);
const [confirming, setConfirming] = React.useState(false);

const load = React.useCallback(async () => {
  setLoading(true); setError('');
  try { setState(await call(STATUS_PATH)); }
  catch (e) { setError(String(e?.message || e)); }
  finally { setLoading(false); }
}, []);
React.useEffect(() => { load(); }, [load]);
```

- Render precedence: `loading && !state` → loading hint; `error` → error line; then cards from the last good
  state (stale data stays visible; never blank the panel on a failed refresh).
- Confirmation lives **inline** (a red-bordered card with confirm/cancel), not a modal service.
- `call()` resolves the URL against `document.baseURI`, sends `credentials: 'same-origin'`, `cache: 'no-store'`,
  parses text→JSON defensively, and throws `Error('<status> <detail>')` on non-2xx.
- Empty state is an explicit string (`pendingNone`), not a hidden card.

**Styling approach:** plain inline style objects (`const S = {…}` per file), `font: 'inherit'`,
`color: 'inherit'`, and neutral `rgba(127,127,127,0.06–0.4)` surfaces/borders so light and dark both work.
Monospace stack `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. No CSS files,
no class names, no design-system imports. Status colours are hard-coded hex
(`#3fb27f` ok, `#d9534f` bad, `#c9a227` unknown).

> ⚠ This contradicts the handover's own rule ("colors/spacing/fonts come from `--dsw-*` alias tokens; don't
> hard-code hex"). The first panel should use `--dsw-*` tokens / the shipped primitives (focus ring etc.) and
> record the deviation from the two examples, not copy the hex.

**Icon usage:** the sidebar glyph is an inline `svg` component with `stroke="currentColor"`,
`aria-hidden="true"`, `viewBox="0 0 24 24"`. `icon.svg` exists as a package asset but is **not** what the
sidebar renders (duplication; see pitfalls).

**Cleanup / polling:** both bundles guard async completion with an `alive` flag and clear their timer in the
`useEffect` cleanup:

```js
React.useEffect(() => {
  let alive = true;
  const tick = async () => { /* … */ if (alive) setX(…); };
  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  return () => { alive = false; clearInterval(timer); };
}, []);
```

Profiles polls unconditionally every 15 s; host-control polls every 2 s **only while `restarting`**, up to 45
attempts. Neither pauses for `document.hidden` (the handover requires it) — the new panel must add that.

### A.6 Minimum skeleton for a new bundle

`index.js` (host half):

```js
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-status';
export const inject = ['connection'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function run(cmd, args, timeout = 5000) { /* execFile → string|null as in A.4 */ }

async function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function agentHome() {
  return process.env.DSH_PERSONAL_HOME
    ? path.resolve(process.env.DSH_PERSONAL_HOME)
    : path.join(os.homedir(), '.dsh-personal');
}

export async function apply(ctx) {
  const dispose = await ctx.connection.fetch.register({
    path: '/api/dsh-status/status',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => buildStatus(ctx),
  });
  ctx.effect(() => () => { void dispose(); }, 'dsh-status: /api routes');
}
```

`client.js` (browser half): as in §A.5 — `ModuleLoader.load` → `apply(ctx)` registering
`sidebar.panellist` + `main` from one `PANEL_ID`, with a single `useStatus()` hook that fetches
`api/dsh-status/status`, 60 s visible-only refresh, and per-card loading/empty/error states.

### A.7 Pitfalls observed in the existing code

1. **Glyph double-scale bug** — `ProfilesGlyph` sets `width/height = size` *and* applies
   `transform: scale(size/24)` ([`client.js:277-298`](../plugins/dsh-profiles/client.js#L277-L298)). At
   `size=18` the glyph draws at ~13.5 px instead of 18. Copy the geometry, not the transform; honour the
   `size`/`active` props (`stroke` width can stay 1.7 at 24-unit viewBox).
2. **Unconditional polling** — profiles probes every 15 s forever
   ([`client.js:27`](../plugins/dsh-profiles/client.js#L27),
   [`client.js:143-163`](../plugins/dsh-profiles/client.js#L143-L163)). Violates handover §5 "pause when the
   tab is hidden". Add `visibilitychange`.
3. **Hard-coded palette** instead of `--dsw-*` tokens (`#3fb27f`, `#d9534f`, `#c9a227`,
   `rgba(127,127,127,…)`), despite the handover's token rule. Use tokens + `--dsw-focus-ring-*`.
4. **Personal hostnames in public code** — profiles stores tailnet URLs and display strings in
   [`client.js:36-53`](../plugins/dsh-profiles/client.js#L36-L53). Pre-existing sanitization debt; a new panel
   must not add more (take host identity from the route, label it without hostnames).
5. **Sidebar `id` vs main `key`** — two different option names for one value. If they drift, selecting the
   row throws without changing the panel. Use one constant.
6. **Locale plumbing differs per slot** — sidebar takes a `label: () => t(...)` closure; `main` and
   `settings.section` need `inject: () => ({ t })`. Forgetting `inject` leaves the panel without `t`.
7. **Error status 409 is odd** — `rejectJson` uses `409 Conflict` for "unit unknown" / "restart unavailable".
   Copy the `{ok:false,error,detail}` **body** contract but consider `503` for "source unavailable"; whatever
   is chosen, the client must parse `detail || error`.
8. **`run()` hides all failure detail** and a hung `systemctl` costs up to 5 s **per call**; the
   `unitFromMainPid` fallback loops units **serially** ([`index.js:41-51`](../plugins/dsh-host-control/index.js#L41-L51),
   [`index.js:89-101`](../plugins/dsh-host-control/index.js#L89-L101)). The status route should run at most
   one pinned `systemctl show` and short timeouts (`1.5–2 s`), in parallel with the other sources.
9. **Client `call()` has no request abort** ([`client.js:197-217`](../plugins/dsh-host-control/client.js#L197-L217))
   — a hung route leaves the panel loading forever. Add `signal: AbortSignal.timeout(8000)`.
10. **Duplicate-route throw** — `register()` throws on a second registration of the same path (by design).
    Keep one owner row; never register the route from both halves or from a second plugin.
11. **Disposer ownership** — the `register()` disposer is a Promise; wrap it exactly as host-control does
    (`ctx.effect(() => () => { void dispose(); }, …)`), or a disable/reload leaves the route registered.
12. **No client-plugin test harness** in the repo. Verification is a Playwright script that needs a
    launch-token URL (`scripts/verify-host-control-ui.mjs`, `scripts/verify-profiles-ui.mjs`). Plan the new
    `scripts/verify-dsh-status-ui.mjs` the same way; pure aggregation helpers can get a plain `node --test`.
13. **`icon.svg` duplication** — profiles exports `./icon` but the sidebar renders an inline glyph; keep one
    source of truth. Settings pages get no icon unless a `settings.section.icon` registration exists.
14. **402/401 handling in the client** — unauthenticated `/api` requests return `401` **before** routing, so
    "route missing" and "session expired" are indistinguishable at the transport level until authenticated.
    After auth, a disabled/missing host half is `404`. Show different copy for 401 (reload/relogin) vs 404
    (bundle disabled or host half not installed).
15. **No config seam** — profiles keeps its profile list in `client.js` because "a client-only plugin cannot
    read a Loader row config without a Host Remote". The Status panel should take **all** configuration from
    its host route (target home, repo root, thresholds) instead of constants.

---

## B. Data source inventory

All sources below are **read-only** and safe for a read-only UI. "Safe" means no write path exists from the
source to host state; sensitivity is about what the UI must mask.

| # | Source id | Acquisition | Latency | Cadence / freshness | Safe | Sensitivity |
|---|---|---|---:|---|---|---|
| 1 | `systemd-unit` | `systemctl --user show …` (execFile) | ~0 ms | live | ✅ | low |
| 2 | `systemd-timers` | `systemctl [--user] list-timers --output=json` | ~2 ms | live | ✅ | low |
| 3 | `plugins-saved` | read `profile/package.json` + `node_modules/*/package.json` | ~2 ms | on disk | ✅ | low |
| 4 | `plugins-live` | in-process `ctx.get('clientModules')`/`ctx.get('loader')` | ~0 ms | live | ✅ | low |
| 5 | `alerts` | exec `scripts/telemetry/check-alerts.sh --json` | **~1.2 s** | 24 h window, generated per call | ✅ | medium (host/paths in detail strings) |
| 6 | `egress` | exec `scripts/egress/summarize-egress.sh summary --json` | ~0.5 s | 24 h window (rate-limited) | ✅ | medium (dst IPs, cgroup/user) |
| 7 | `retention` | exec `scripts/ops/retention-report.sh --json` | ~0.08 s | live (file stats) | ✅ | low |
| 8 | `hindsight-health` | `GET :9177/health` | ~10 ms | live | ✅ | none |
| 9 | `hindsight-stats` | `GET :9177/v1/default/banks/dsh-personal/stats` | ~10 ms | live | ✅ | low |
| 10 | `hindsight-usage` | `GET …/llm-requests/stats?period=7d` | ~10 ms | rolling 7 d | ✅ | low |
| 11 | `telemetry-files` | read `$HOME/.dsh-personal/telemetry/*.json` | ~1 ms | daily (07:00/07:15) | ✅ | low |
| 12 | `backups` | read `~/backups/dsh-personal/{daily,weekly}/*/manifest.json` | ~1 ms | on demand / daily | ✅ | **high** (hostname, user, paths, hashes) |
| 13 | `identity-soul` | `stat` `~/.dsh-personal/soul/SOUL.md` | <1 ms | on edit | ✅ | **high content**, metadata only |
| 14 | `notify-state` | in-process `process.env` (`NTFY_URL`, `DSH_HEARTBEAT`) | ~0 ms | live | ✅ | **high** (never echo values) |
| 15 | `session-search-db` | read-only SQLite (`node:sqlite` in Node 24) | ~5 ms | live | ✅ (defer) | **high** (personal text/cwd) |

Sources 3/4 = the pre-existing `/api/host-control/status` behaviour (`unit, origin, profile, home, pending,
failed, stale, liveCount, liveStateKnown`) — reuse it, do not duplicate the route.

### B.1 Unit / agent state (`systemctl`)

```
systemctl --user show -p ActiveState -p SubState -p MainPID -p ActiveEnterTimestamp -p NRestarts dsh-personal.service
```

Output is `Key=Value` lines; add `--timestamp=unix` for machine time: `ActiveEnterTimestamp=@1794347041`
(epoch **seconds**). `systemctl --user is-active dsh-personal.service` prints `active` and exits **0**;
an unknown/stopped unit prints `inactive` and exits **4**. Latency ~0 ms. The whole `show` call is safe and
cheap; run **one** call and parse the five keys.

Sanitized example (real values from this host):

```
ActiveState=active
SubState=running
MainPID=1264999
ActiveEnterTimestamp=@1794347041
NRestarts=0
```

- **Failure modes:** not under systemd → `systemctl` unavailable / unit empty (host-control's
  `/proc/self/cgroup` scan returns null → UI says "not under a systemd unit"); unit renamed → `is-active`
  exit 4; D-Bus unavailable → non-zero + stderr.
- **Sensitivity:** low. PID and unit name are local-only, but do not show `/proc` paths or the launch token.
- **Deriving the agent vs the serving host:** the route must pin the **agent unit**
  `dsh-personal.service`, not derive it from `process` (that is what host-control does for its restart).
  Serving facts come from `/proc/self/cgroup` (host-control pattern), agent facts from the pinned unit.

### B.2 Scheduled jobs (`list-timers`)

Root and user timers are both readable **without sudo** (verified). Use JSON:

```sh
systemctl --user list-timers 'dsh-*' --output=json --no-pager
systemctl      list-timers 'dsh-*' --output=json --no-pager
```

Sanitized example (systemd 255 — timestamps are **microseconds**; `left`/`passed` are durations in µs):

```json
[
  {"next":1794430824586083,"left":1794430824586083,"last":1794344538353980,
   "passed":2048806195538,"unit":"dsh-telemetry-digest.timer","activates":"dsh-telemetry-digest.service"},
  {"next":1794431726837131,"left":1794431726837131,"last":0,"passed":0,
   "unit":"dsh-memory-curate.timer","activates":"dsh-memory-curate.service"}
]
```

System-scope output on this host: `dsh-egress-keepalive.timer` (activates
`dsh-egress-keepalive.service`). `dsh-egress-dns.timer` exists in the repo (`scripts/egress/`) but is **not
installed/active** — do not render a missing timer as an error.

- **Failure modes:** old systemd without `--output=json` → fall back to the plain table; timer never fired →
  `last: 0` (render "not yet run", not "1970"); `dsh-memory-curate.timer` is exactly this case today.
- **Sensitivity:** low. Show unit name, next/last, activates; no script paths.
- **Panel mapping:** "Scheduled jobs" = the two user timers **plus** `dsh-egress-keepalive.timer` from the
  system scope. The handover only lists digest/curate; including keepalive makes egress staleness visible.

### B.3 Plugin inventory (saved vs live)

- **Saved:** `~/.dsh-personal/profiles/personal/package.json` (0600) →
  `{ name, private, dsh: { profile: { bundles: [ … ] } }, dependencies: { … } }`. Example bundle list (real,
  no personal data): `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@local/dsh-profiles`,
  `@deepseek-ai/dsh-experimental-session-search`, `@vectorize-io/hindsight-coding-agents`, `@local/dsh-soul`,
  `@local/dsh-push`, `@local/dsh-heartbeat`.
- Versions exist only in `node_modules/<pkg>/package.json` (walk the deps; ignore missing).
- **Live vs saved:** host-control's in-process comparison (`clientModules.clientPath(pkg)` null → pending;
  Loader row present but fiber not ACTIVE → failed) is the honest, cheap source; `scripts/ops/dsh-pending.py`
  does the same externally in ~0.17 s but **reads the process launch token from the journal** — do not shell
  it out from a UI route (sensitive, and redundant in-process).
- **Failure modes:** profile manifest unreadable (0600, different user) → `null` and a "not available" card.
- **Sensitivity:** package names/versions are fine. `.plugin-manager/logs/` may contain install paths — do not
  surface.

### B.4 Alerts — `check-alerts.sh --json`

Command used by the route (pin the flags; never trust defaults if the profile changes):

```sh
scripts/telemetry/check-alerts.sh --json --unit dsh-personal.service --scope user \
  --bank dsh-personal --lookback-hours 24 --backup-max-age-hours 48
```

Latency **~1.2 s** (it internally shells `systemctl`, `journalctl`, `summarize-egress.sh`, the Hindsight
`/health` call, backup manifests and the cost file). Exit: **0** no alerts, **1** ≥1 alert, **2** a check
could not run; the JSON still carries a top-level `exit_code`, so parse the body and ignore the process
status.

Sanitized example (real shape, values from this host):

```json
{
  "schema_version": 1,
  "generated_at": "2026-11-11T02:19:53Z",
  "unit": "dsh-personal.service",
  "scope": "user",
  "lookback_hours": 24,
  "alerts": 0,
  "warnings": 2,
  "errors": 0,
  "exit_code": 0,
  "checks": [
    {"id":"unit-state","status":"ok","title":"Unit state","detail":"ActiveState=active SubState=running (scope=user)"},
    {"id":"unit-restarts","status":"warn","title":"Restart burst","detail":"window=24h starts=6 failed-exits=0 restart-schedules=0 max-restart-counter=0 (multiple starts, below alert threshold)"},
    {"id":"hindsight-health","status":"ok","title":"Hindsight health","detail":"HTTP 200, status=healthy (bank target: dsh-personal; presence not asserted)"},
    {"id":"backup-age","status":"ok","title":"Backup freshness","detail":"newest manifest: daily/<id>/manifest.json age=4h (limit 48h); hindsight=exported"},
    {"id":"egress-deny","status":"ok","title":"Egress deny","detail":"no DSH-EGRESS-DENY lines in the last 24h"},
    {"id":"egress-observe","status":"ok","title":"Egress observe","detail":"all 1 observed destination(s) inside the expected set (source=summarize-egress.sh; expected: static lo/LAN/tailnet + allow hosts + <repo>/scripts/egress/expected-destinations.txt)"},
    {"id":"cost-spike","status":"warn","title":"Cost spike","detail":"only 1 baseline day(s) available (need >=3); today=212291 — spike check inactive"}
  ]
}
```

- Per-check `status` ∈ `ok | warn | alert | skip | error`. Counts: `alerts`, `warnings`, `errors`. **There is
  no `skipped` field in the JSON** (only the human summary line counts skips).
- **Details are human strings**, not structured fields — do not regex PID/uptime out of them. If the panel
  needs those, read §B.1 directly.
- **Failure modes:** Hindsight unreachable → `hindsight-health` becomes `alert` and `alerts:1` (this is
  deliberate: "memory capture/audit is blind"). The UI must show that as a **memory tile warning**, not
  "agent down". Missing repo script → the corresponding check degrades to `skip`/`warn`. Running the route
  as a different user → journal/Hindsight checks error.
- **Sensitivity:** the `detail` strings leak the repo path and the backup subpath; render as text, optionally
  strip absolute paths. Do not render raw `detail` into a tooltip with HTML.
- **Staleness trap:** `check-alerts` auto-prefers `artifacts/egress/egress-summary.json` if one exists; none
  exists today, but a stale artifact would silently make the egress check stale. If the panel also calls the
  summarizer itself, show that `generated_at`, and keep them independent.

### B.5 Egress — `summarize-egress.sh summary --json`

```sh
scripts/egress/summarize-egress.sh summary --json            # ~0.5 s with 1 destination
scripts/egress/summarize-egress.sh summary --json --no-ptr   # skips reverse DNS per destination
```

Exit: **0** clean, **2** unexpected destination(s) → ALERT, **3** degraded/no observation, **1** config error.
The JSON carries `status` and `exit_code`; parse the body.

Sanitized example:

```json
{
  "schema_version": "m0-egress-summary-v1",
  "generated_at": "2026-11-11T02:19:58Z",
  "status": "ok",
  "exit_code": 0,
  "window": {"since": "24 hours ago", "until": "now", "boot": false},
  "source": {"kind": "journal", "lines_matched": 52, "rate_limited": true, "log_prefix": "DSH-EGRESS "},
  "target": {"mode": "cgroup",
    "description": "cgroup user.slice/user-<uid>.slice/user@<uid>.service/app.slice/dsh-personal.service (level 5)",
    "cgroup_path": "user.slice/user-<uid>.slice/user@<uid>.service/app.slice/dsh-personal.service",
    "cgroup_level": 5, "service_user": "<user>"},
  "table": {"name": "inet dsh_egress", "present": false},
  "expected": {"file": "<repo>/scripts/egress/expected-destinations.txt",
    "hostnames": "api.deepseek.com opencode.ai api.telegram.org open.feishu.cn open.larksuite.com api.day.app ntfy.sh registry.npmjs.org",
    "hostname_count": 8, "resolved_ips": 38, "unresolved": ""},
  "counts": {"destinations": 1, "events": 52, "unexpected_destinations": 0, "denied_destinations": 0, "deny_events": 0},
  "destinations": [{"dst":"<observed-ip>","port":443,"proto":"tcp","events":52,
    "first_seen":"2026-11-10T17:05:35+10:00","last_seen":"2026-11-11T12:19:40+10:00",
    "first_seen_epoch":1794294335,"last_seen_epoch":1794363580,
    "owner":"","expected":true,"match":"host:api.deepseek.com","cdn":false,"source":"observe"}],
  "denied": [],
  "unexpected": [],
  "nft_counters": {"readable":false,
    "reason":"nft counters need root (CAP_NET_ADMIN): re-run with sudo for exact per-destination counts","sets":[]},
  "notes": [
    "kernel log lines are rate-limited: event counts are a lower bound",
    "loopback is excluded from observation by default (DSH_EGRESS_IGNORE_LOOPBACK=1)",
    "an unexpected destination is an ALERT (D13: no deny list; this is the compensating control)"
  ]
}
```

- **`table.present` is not "the nftables rule exists"** — it is `NFT_READABLE` (root/CAP_NET_ADMIN). It is
  `false` for this unprivileged run even though the observe rule is installed and working. Render it as
  "exact counters not readable as `<user>`", never as "observe rule missing".
- `status: "degraded"` when `lines_matched == 0` (no kernel lines in the window) — the agent may still be
  fine; show "observation inactive", not "no egress".
- **Failure modes:** `journalctl -k` unreadable (no `adm` group) → degraded; `nft` absent → counters note;
  `getent`/DNS failure → `unresolved` entries; nft log rate-limit (20/min burst 40) makes `events` a lower
  bound — never present counts as exact.
- **Sensitivity:** medium. Destination IPs and the service cgroup/user path are personal-ish; UI should show
  the **matched hostname** (`api.deepseek.com`) or `<ip>`, never the cgroup/user. No payloads/headers are ever
  logged (script guarantee).

### B.6 Retention — `retention-report.sh --json`

```sh
scripts/ops/retention-report.sh --json      # ~0.08 s, no args needed
```

Sanitized example (real values):

```json
{"sessions":{"files":16,"bytes":212092,"oldest_age_days":0},
 "backups":{"daily":3,"weekly":1,"bytes":10218065,"newest_age_days":0},
 "telemetry":{"files":5,"bytes":8021},
 "storages_bytes":121195,"logs_bytes":114460,
 "journal":"1.9G","hindsight":"docs=8 nodes=30 obs=10"}
```

- **Shape problems:** **no `schema_version`**; `hindsight` is a **string**, not an object; `journal` is a
  human string (`"1.9G"`); sizes are bytes; ages are integer **days** (floor, `-1` = absent).
- **Failure modes:** no DSH home → exit **2**, stderr `ERROR: no DSH home at <path>`, **no JSON**. Missing
  subdirs → zeros / `-1`. Hindsight down → `hindsight:"unreachable"`.
- **Sensitivity:** low (byte counts). Do not surface `~/.dsh/logs` or journal paths in copy.
- **Recommendation:** use it only for the retention card; take the bank counts from §B.9 (typed), not from
  this string.

### B.7 Telemetry files (`~/.dsh-personal/telemetry/`, dir 0700, files 0600)

Files present today (5):

| File | Shape | Freshness |
|---|---|---|
| `cost-today.json` | `{"schema_version":1,"unit":"tokens","entries":[{"date":"YYYY-MM-DD","value":N}, …]}` | rewritten on demand / by digest timer; today's entry is the last one |
| `token-usage-history.json` | **identical shape**, rolling 30 days | same write as `cost-today.json` (byte-identical today) |
| `curate-YYYY-MM-DD.json` | see example below | daily 07:15 |
| `digest-YYYY-MM-DD.md` | Markdown, **no JSON twin** | daily 07:00; pruned after 90 days |

`cost-today.json` sanitized example (real): `{"schema_version":1,"unit":"tokens","entries":[{"date":"2026-11-10","value":8978},{"date":"2026-11-11","value":212291}]}`.

`curate-2026-11-11.json` sanitized example (real, counts-only by design):

```json
{
  "schema_version": 1,
  "bank": "dsh-personal",
  "generated_at": "2026-11-10T22:46:24.637108+00:00",
  "before": {"total_nodes":30,"total_documents":8,"total_observations":10,
             "pending_consolidation":0,"failed_consolidation":0,
             "last_consolidated_at":"2026-11-10T22:37:41.035913+00:00"},
  "after":  {"total_nodes":30,"total_documents":8,"total_observations":10,
             "pending_consolidation":0,"failed_consolidation":0,
             "last_consolidated_at":"2026-11-10T22:37:41.035913+00:00"},
  "mental_models": {"total":0,"refreshed":0},
  "consolidation_wait_seconds": 0,
  "llm_usage_7d": {"requests":67,"tokens":335897,"period":"7d"}
}
```

`digest-YYYY-MM-DD.md` is Markdown with sections `## Alerts`, `## Egress`, `## Destinations observed` (table),
`## Notes / caveats`, `## Backups`, `## Hindsight usage (latest curator report)`, `## Hindsight bank`.
It is a **redacted human document**, generated by shelling the other scripts — do **not** parse it in the
route; aggregate the underlying JSON (this is the single biggest data-shape gap in the handover).

- **Failure modes:** file missing → "no digest yet" (timer may not have run); stale date → compare mtime and
  the `date`/`generated_at` fields; corrupt JSON → `null` + "not available".
- **Sensitivity:** low (counts only). Digest body contains timestamps and paths; render as text if ever shown.

### B.8 Backups (`~/backups/dsh-personal/`)

Layout (**one level deeper than the handover says**):

```text
~/backups/dsh-personal/
├── .backup.lock                     # 0-byte lock; ignore
├── daily/<id>/manifest.json         # <id> = YYYYMMDDTHHMMSSZ
├── weekly/<week>-<id>/manifest.json # e.g. 2026-W46-<id>
└── logs/
```

`find ~/backups/dsh-personal -name manifest.json` is the correct enumeration. Newest at capture:
`daily/<id>/manifest.json`, 4 h old (limit 48 h). Manifest schema (sanitized):

```json
{
  "schema_version": 1,
  "backup": {"id":"<id>","kind":"daily","started_at":"2026-11-10T21:43:49Z",
             "finished_at":"2026-11-10T21:43:52Z","hostname":"<host>"},
  "dsh": {"home":"<personal-home>","profile":"personal","version":"0.2.2-rc.1",
          "node_version":"v24.22.1","bin":"<dsh-bin>","unit":"dsh-personal.service",
          "unit_control":"recorded-only (this script never runs systemctl)"},
  "repo": {"dir":"<repo>","git_head":null,"git_head_note":"not a git repository"},
  "source": {"owner_uid":<uid>,"owner_gid":<gid>,"owner_user":"<user>","home_bytes":43339007},
  "artifacts": [{"path":"dsh-personal-<id>.tar.gz","sha256":"<sha256>","size_bytes":10158765},
                {"path":"hindsight/dsh-personal-export.json","sha256":"<sha256>","size_bytes":66}],
  "contents": {"included":{"profiles":{"files":1905,"bytes":40884116},"workspace":{"files":0,"bytes":0},
                           "storages":{"files":12,"bytes":144474},"sessions":{"files":16,"bytes":212011},
                           "cordis.patch.yml":{"files":1,"bytes":1286},".credentials.yaml":{"files":1,"bytes":375}},
               "excluded":["…"], "external_symlinks":[{"path":"…","target":"<repo>/plugins/<pkg>"}]},
  "hindsight": {"url":"http://127.0.0.1:9177","bank":"dsh-personal",
                "scope":"shared-existing-instance (M0-D13)","status":"exported",
                "artifact":"hindsight/dsh-personal-export.json","http_code":"200",
                "content_type":"application/json",
                "detail":"bank export via GET /v1/default/banks/{bank}/export (REST only, no DB contact)"},
  "retention": {"daily_keep":14,"weekly_keep":8,"prune_enabled":true},
  "timings": {"tar_and_stage_ms":1649,"hindsight_ms":35,"total_ms":2963},
  "secrets_check": {"status":"pass",
                    "detail":"no credential values or secret-shaped strings in filenames, manifest, SHA256SUMS, or log",
                    "credential_values_compared":4}
}
```

- **Backup age** is best computed from `backup.finished_at` (UTC) or the manifest mtime; `check-alerts` already
  reports it in hours (string detail). Do not trust `retention-report.backups.newest_age_days` (floor of file
  age, `0` means "<1 day").
- **Failure modes:** no backup dir → enumeration returns nothing ("no backups"); manifest from an older schema
  → fields missing (guard); partially written manifest → JSON parse error (skip that entry); `.backup.lock`
  present → a backup may be running (optional "in progress" hint).
- **Sensitivity: high.** `hostname`, `owner_user`, `owner_uid/gid`, `dsh.home`, `dsh.bin`, `repo.dir`,
  symlink `target`, `.credentials.yaml` inclusion and artifact hashes are all personal. Show only: `kind`,
  `id`, `finished_at`, size sum, `hindsight.status`, `secrets_check.status`. Never render paths/hashes/user.

### B.9 Hindsight REST (`127.0.0.1:9177`, loopback, no auth header)

| Endpoint | Shape | Notes |
|---|---|---|
| `GET /health` | `{"status":"healthy","database":"connected","db_acquire_ms":0.7,"db_pool_waiting":0,"db_pool_in_use":0,"db_pool_max":100,"db_pool_idle":5}` | 200 healthy; use `status` + `database` |
| `GET /v1/default/banks/dsh-personal/stats` | see below | canonical bank counts |
| `GET …/docs` (documents) | `{"items":[…],"total":8,"limit":2,"offset":0}` | items carry `text_length` but **not** text; still contains `session_id`/ref ids |
| `GET …/memories/list?limit=N` | `{"items":[…],"total":30,"limit":1,"offset":0}` | **GET** (POST → `405 {"detail":"Method Not Allowed"}`); items contain `text` = memory content |
| `GET …/audit-logs` | `{"bank_id":"dsh-personal","total":0,"limit":50,"offset":0,"items":[]}` | paginated, currently empty |
| `GET …/llm-requests/stats?period=7d` | buckets by day with statuses + token breakdown | `period` defaults to `7d` |
| `GET /v1/default/banks` | **all banks**, incl. Hermes-owned ones | **never call from the UI** (bank isolation) |

`stats` sanitized example (real):

```json
{"bank_id":"dsh-personal","total_nodes":30,"total_links":244,"total_documents":8,
 "nodes_by_fact_type":{"world":9,"experience":11,"observation":10},
 "links_by_link_type":{"entity":37,"semantic":99,"temporal":100,"caused_by":8},
 "links_by_fact_type":{},"links_breakdown":{},"pending_operations":0,"failed_operations":0,
 "operations_by_status":{"completed":31},
 "last_consolidated_at":"2026-11-10T22:37:41.035913+00:00",
 "last_memory_write_at":"2026-11-10T22:37:41.028960+00:00",
 "pending_consolidation":0,"failed_consolidation":0,"total_observations":10}
```

`llm-requests/stats` sanitized example:

```json
{"bank_id":"dsh-personal","period":"7d","trunc":"day",
 "start":"2026-11-04T02:26:05.475781+00:00",
 "buckets":[{"time":"2026-11-10T00:00:00+00:00",
   "statuses":{"error":6,"success":61},"total":67,
   "tokens":{"input":320601,"output":15296,"cached":131968,"thoughts":7753,"total":335897}}]}
```

`memories/list` item schema (keys only; **`text` is untrusted personal content — do not render in v1**):
`id, text, context, date, fact_type, document_id, mentioned_at, occurred_start, occurred_end, entities,
chunk_id, proof_count, tags, metadata{ref_id,source,harness,session_id}, consolidated_at,
consolidation_failed_at, state, invalidation_reason, invalidated_at, edited_at, updated_at, source_memory_ids`.

- **Failure modes:** connection refused → `curl` exit **7 / HTTP 000** (Node fetch throws); unknown bank →
  `404 {"detail":"Bank 'x' not found"}`; healthy DB but `status != healthy` → degraded memory tile; bank count
  0 → legitimate empty state.
- **Sensitivity:** the bank summary is low; `documents`/`memories` items contain personal content and ids.
  Status/Health should call only `/health`, `/stats`, `/llm-requests/stats`. The Memory browser (slice 2) may
  call `documents`/`memories/list` but must render `text` as plain text (no `innerHTML`) and mark provenance.
- **Isolation rule:** pin `dsh-personal` in a constant; never accept a bank name from the request/UI; never
  call `/v1/default/banks`.

### B.10 Identity (`~/.dsh-personal/soul/SOUL.md`)

`stat`: exists, 2262 bytes, 0600, mtime 2026-11-11 07:43. For Status/Health show **metadata only**
(`present`, bytes, modifiedAt). The content is persona/personal text and is untrusted for rendering; the
Identity editor is a later slice (write + restart semantics, handover §5).

### B.11 Push / heartbeat state (in-process only)

- `@local/dsh-push`: inert iff `NTFY_URL` unset/unparseable; reads `NTFY_URL`, `NTFY_TOKEN`,
  `NTFY_MIN_INTERVAL_MS` **from the environment only**.
- `@local/dsh-heartbeat`: enabled iff `DSH_HEARTBEAT=1` or row config `enabled: true`; default OFF.
- Neither bundle declares `dsh.client` and neither writes a status file. No unit drop-in currently sets the
  env (`20-hindsight.conf` is the only env drop-in besides PATH/DSH_HOME in the unit itself).
- A route **inside the personal process** can report booleans from `process.env` (never the values). A route
  on the coding host cannot see them → "unknown (different process)". This is why the panel must label facts
  with their source host.
- **Failure modes / sensitivity:** never echo `NTFY_URL` (it encodes a topic and can embed credentials);
  never echo `NTFY_TOKEN`; return `{configured:boolean}` only.

### B.12 Session search index (defer; for Activity/Memory slices)

`~/.dsh-personal/storages/session-search.db` (0600) is a **plain SQLite** DB (FTS5 schema, `user_version 8`,
`config.version 4`) and Node 24 ships `node:sqlite`, so a route can open it **read-only** with
`new DatabaseSync(path, { readOnly: true })` — no dependency, no native module.

Schema: `persisted_sessions(id, version, created_at, cwd, parent_session, seed_length, delegation_depth,
agent_preset, revision, generation)`, `persisted_docs(text, session_id, seq, type, time, surface,
codepoint_length)` + FTS shadow tables (`persisted_docs_content/_data/_docsize/_idx`), `persisted_docs_config`,
`search_state`.

**Current state at capture: 0 sessions, 0 docs** — the index is empty even though `~/.dsh-personal/sessions/`
holds 16 files (8 sessions × 2) and the projection cache holds 8 session JSONs. Do **not** use this DB as a
session-count source. `sessions/` and `storages/session_projcache/sessions/` are the reliable counts.
Sensitivity: high (`text`, `cwd` = personal content) — Activity must show only counts/timestamps and escape
all text.

### B.13 Session projection cache (read-only, optional)

`~/.dsh-personal/storages/session_projcache/sessions/session-<uuid>.json` — 8 files; each has
`{ record: { rows: { tokenUsage: … }, … } }`. This is what `token-cost.sh` sums for the cost meter; the panel
should read the resulting `cost-today.json`, not the cache.

### B.14 Existing `/api/host-control/status` (reuse, don't fork)

Response (sanitized) from [`plugins/dsh-host-control/index.js`](../plugins/dsh-host-control/index.js#L273-L289):

```json
{"ok":true,"self":"dsh-web.service","origin":"http://127.0.0.1:7000",
 "unit":{"unit":"dsh-web.service","active":true,"pid":12345,"since":"Wed 2026-11-11 07:44:01 AEST"},
 "profile":"web","home":"<dsh-home>",
 "pending":[],"failed":[],"stale":[],"liveCount":74,"liveStateKnown":true}
```

Caveat: `self`/`unit` describe the **serving** process. On the coding host this is `dsh-web.service`, not the
assistant. The Status panel needs its own route (or a `?target=agent` extension) for `dsh-personal.service`.

---

## C. Gaps and conflicts vs `ui-handover.md`

1. **"digest JSON/MD"** (handover §4) — there is **no digest JSON**; only `digest-YYYY-MM-DD.md`, a redacted
   Markdown document. Aggregate `check-alerts`/`summarize-egress`/`curate`/`cost` JSON instead of parsing it.
2. **`memories/list`** — GET, not POST (`POST` returns `405 {"detail":"Method Not Allowed"}`). Minor, but the
   handover's notation invites a POST.
3. **Backup manifests** — `~/backups/dsh-personal/*/manifest.json` (handover §4) matches nothing; the real
   layout is `daily/<id>/manifest.json` and `weekly/<week>-<id>/manifest.json`.
4. **"host-control status (unit, listener, profile, pending plugins)"** — on the coding host this reports the
   coding host (`dsh-web.service`, `~/.dsh`), **not** the assistant. There is no route today that reports
   `dsh-personal.service` from the coding host. The first panel needs a new aggregate route with an explicit
   agent target.
5. **Iteration host vs reported host** — handover §4/§9 says iterate on `:7000` while the product is "the
   personal host". Every source in §B is addressed via `~/.dsh-personal` / `dsh-personal.service` /
   `:9177`, so the route must not derive data paths from `process.env.DSH_HOME` (that is `~/.dsh` on the
   coding host). Use `DSH_PERSONAL_HOME || ~/.dsh-personal` like the scripts do.
6. **"no polling storms … pause when the tab is hidden"** (handover §5) — neither example plugin does this
   (profiles: 15 s forever; host-control: 2 s × 45 while restarting). Copy the pattern *and* add visibility
   pause + backoff.
7. **"Colors/spacing/fonts come from `--dsw-*` tokens; don't hard-code hex"** (handover §4) — both reference
   plugins hard-code hex colours and `rgba(127,127,127,…)` neutrals. The two documents contradict each other;
   the first panel should use tokens/primitives and note the deviation.
8. **`retention-report.sh --json` is not schema-stable** — no `schema_version`, string `hindsight`, string
   `journal`, floored day ages. Treat as display-only; take bank counts and freshness from typed sources.
9. **`check-alerts.sh --json`** — per-check `detail` is prose; no structured unit/uptime. Use `systemctl`
   directly for facts and the script only for the alert list.
10. **Hindsight-down semantics** — the handover/design says "fail open for memory", but `check-alerts` raises
    an **alert** when Hindsight is unreachable. UI copy must distinguish "memory capture blind" from "agent
    down"; the panel should not show a global red state for a memory-only failure.
11. **No DSH health endpoint** — `curl :7002/health` is `404`; `:7002/` is `401`. "Agent up" must be
    systemd + a loopback fetch made by the host route, not a browser fetch.
12. **No version surface** — DSH version is not provided as a Cordis service to a plain plugin. Options:
    `dsh --version` shell-out (~0.10 s, exact), resolve `realpath(process.argv[1])` → `../package.json`
    (works for the npm-style install, fragile otherwise), or read the newest backup manifest's
    `dsh.version` (stale by up to a day). Recommend: shell-out once, cache for the process lifetime, fall
    back to `unknown`.
13. **Egress `table.present:false`** is a privilege fact, not a missing rule — an easy wrong red badge.
14. **Root-scope timer missing from the handover's job list** — `dsh-egress-keepalive.timer` (system scope)
    is what keeps observation alive; only `dsh-telemetry-digest`/`dsh-memory-curate` are listed. Show all
    three, labelled by scope.
15. **Session-search index empty** — handover §5 says Activity reads "recent sessions (from session search)",
    but the DB currently holds 0 sessions/0 docs while `sessions/` has 8 sessions. Use filesystem counts for
    v1; revisit the search index for the Memory/Activity slices.
16. **Push/heartbeat state is not readable cross-process** — handover §5 lists "Settings: push (ntfy, inert),
    heartbeat toggle (OFF)" as if a status surface existed; there is no client half and no status file. v1 can
    show booleans only when the route runs inside the assistant process (i.e. once installed on `personal`).
17. **"Every visible string goes through `t`"** — fine, but note both bundles must ship `zh` too; the panel
    will be reviewed in both locales.
18. **"Never read files or credentials directly from the browser"** — held. But the flip side: the host route
    can read anything the user can read. It must be an explicit allowlist (pinned paths, pinned unit, pinned
    bank), never a path/unit/bank parameter.
19. **Hindsight `/v1/default/banks` lists Hermes banks** (Hermes-owned and unrelated bank names appear on the
    same instance) — the handover never mentions this trap. The route must pin `dsh-personal`; the UI must
    never render a bank picker. (Third-party bank names stay placeholders in this public repo.)
20. **No test harness for client plugins** — handover §8 asks for a reviewed panel; plan a Playwright verify
    script (`scripts/verify-dsh-status-ui.mjs`) + pure-helper unit tests, mirroring host-control.
21. **`dsh-profiles` leaks tailnet hostnames in public source** — pre-existing; the new plugin should take
    host identity from the route and show `127.0.0.1:7002`/`localhost` only.
22. **Panel id collision risk** — `main` is keyed; a duplicate `key` shadows another plugin's page. Use an
    unlikely id (`status` is fine but confirm no shipped panel uses it) and one constant.

---

## D. Recommended minimal host route for Status/Health

### D.1 Contract

- **One route**: `GET /api/dsh-status/status` in a new bundle `@local/dsh-status`
  (`plugins/dsh-status/`), registered exactly like host-control's status route:
  `{ path:'/api/dsh-status/status', methods:['GET'], requestBody:'buffered', fetch }`, disposed through
  `ctx.effect`.
- **No parameters** that select a unit, path, bank, or host. The unit (`dsh-personal.service`), bank
  (`dsh-personal`), DSH home (`DSH_PERSONAL_HOME || ~/.dsh-personal`), repo root and backup root are
  constants/env, never request input.
- **Read-only**: no writes, no model-facing tool, no restart, no delete. Every subprocess is one of the three
  approved scripts + `systemctl` (read), and `execFile` (no shell).
- **Auth** comes from the channel: 401/403 before the handler. The handler still returns a degraded body
  instead of throwing, so a single failed source never 500s the panel.

### D.2 Aggregation

```text
buildStatus(ctx):
  cacheKey = agentHome            # the panel only ever reports on one target
  if cache fresh (< TTL) return cached + { ageMs }
  if refresh in flight return joined promise + { stale:true }
  results = await Promise.allSettled([
    unit(dsh-personal.service),                     # §B.1  ~0 ms
    timers(user + system),                          # §B.2  ~2 ms
    plugins(ctx, agentHome),                        # §B.3  ~2 ms
    hindsight(),                                    # §B.9  ~30 ms (health+stats+usage)
    telemetryFiles(agentHome),                      # §B.7  ~1 ms
    backupNewest(backupRoot),                       # §B.8  ~1 ms
    alerts(),                                       # §B.4  ~1.2 s
    egress(),                                       # §B.5  ~0.5 s
    retention(),                                    # §B.6  ~0.08 s
    identityMeta(agentHome),                        # §B.10 ~1 ms
    notifyState(serving process env)                # §B.11 ~0 ms
  ])
  merge each into its own section with { ok, asOf, ms, error? }
  health.level = worst(alerts/backup/egress/hindsight/jobs)  # ok|warn|alert|degraded
  cache 15 s, single-flight
```

Per-source timeouts: `systemctl` 1.5 s, Hindsight fetch 2 s, each script 6 s (check-alerts itself is ~1.2 s;
give it headroom), overall budget 8 s. Run the two scripts **in parallel** (they are independent), and note
`check-alerts` already runs the egress summarizer internally — accept the duplicate work (~0.5 s) to keep the
authoritative alert list, or pass `--no-egress-observe` and merge the panel's own egress card (faster, one
fewer check row). Recommended: keep the duplicate for v1 (simpler, authoritative), revisit if latency matters.

### D.3 Suggested response shape (sanitized; real values where harmless)

```json
{
  "ok": true,
  "schemaVersion": 1,
  "generatedAt": "2026-11-11T02:19:53Z",
  "ageMs": 1240,
  "stale": false,
  "serving": {
    "unit": "dsh-web.service",
    "home": "<dsh-home>",
    "profile": "web",
    "origin": "http://127.0.0.1:7000",
    "active": true,
    "sameAsAgent": false
  },
  "agent": {
    "unit": "dsh-personal.service",
    "home": "<personal-home>",
    "profile": "personal",
    "homeExists": true,
    "active": true,
    "subState": "running",
    "pid": 1264999,
    "since": "2026-11-11T07:44:01+10:00",
    "uptimeSeconds": 20163,
    "restarts": 0,
    "version": "0.2.2-rc.1",
    "listener": "http://127.0.0.1:7002",
    "listenerReachable": true,
    "bundles": {"selected": 8, "installed": 6, "liveClientModules": 74},
    "pendingPlugins": [],
    "failedPlugins": []
  },
  "health": {
    "level": "warn",
    "alerts": {
      "count": 0, "warnings": 2, "errors": 0, "exitCode": 0, "asOf": "2026-11-11T02:19:53Z",
      "checks": [{"id": "unit-state", "status": "ok", "title": "Unit state", "detail": "…"}]
    },
    "backup": {"ok": true, "ageHours": 4, "limitHours": 48, "kind": "daily", "id": "<id>",
               "finishedAt": "2026-11-10T21:43:52Z", "hindsight": "exported", "secretsCheck": "pass"},
    "egress": {"status": "ok", "window": "24h", "destinations": 1, "events": 52,
               "unexpected": 0, "denied": 0, "countersReadable": false,
               "top": [{"host": "api.deepseek.com", "events": 52, "lastSeen": "2026-11-11T12:19:40+10:00"}]},
    "cost": {"unit": "tokens", "today": 212291, "date": "2026-11-11",
             "history": [{"date": "2026-11-10", "value": 8978}], "spike": "inactive"},
    "jobs": [
      {"unit": "dsh-telemetry-digest.timer", "scope": "user", "next": "2026-11-12T07:00:24+10:00",
       "last": "2026-11-11T07:02:18+10:00"},
      {"unit": "dsh-memory-curate.timer", "scope": "user", "next": "2026-11-12T07:15:26+10:00", "last": null},
      {"unit": "dsh-egress-keepalive.timer", "scope": "system", "next": "…", "last": "…"}
    ],
    "curator": {"reportDate": "2026-11-11", "generatedAt": "2026-11-10T22:46:24Z",
                "nodes": 30, "documents": 8, "observations": 10,
                "pendingConsolidation": 0, "failedConsolidation": 0,
                "lastConsolidatedAt": "2026-11-10T22:37:41.035913+00:00",
                "llmUsage7d": {"requests": 67, "tokens": 335897}}
  },
  "memory": {
    "ok": true,
    "reachable": true,
    "health": "healthy",
    "bank": "dsh-personal",
    "stats": {"nodes": 30, "documents": 8, "observations": 10, "links": 244,
              "pendingOperations": 0, "failedOperations": 0,
              "lastWriteAt": "2026-11-10T22:37:41.028960+00:00",
              "lastConsolidatedAt": "2026-11-10T22:37:41.035913+00:00"},
    "llmUsage7d": {"requests": 67, "tokens": 335897, "errors": 6, "success": 61}
  },
  "retention": {"sessionsFiles": 16, "sessionsBytes": 212092, "backupDaily": 3, "backupWeekly": 1,
                "backupBytes": 10218065, "telemetryFiles": 5, "telemetryBytes": 8021,
                "storagesBytes": 121195, "logsBytes": 114460, "journal": "1.9G"},
  "identity": {"soulPresent": true, "soulBytes": 2262, "soulModifiedAt": "2026-11-11T07:43:00+10:00"},
  "notifications": {"push": {"known": true, "inert": true}, "heartbeat": {"known": true, "enabled": false}},
  "sources": [
    {"id": "systemd-unit", "ok": true, "ms": 1},
    {"id": "systemd-timers", "ok": true, "ms": 3},
    {"id": "alerts", "ok": true, "ms": 1190},
    {"id": "egress", "ok": true, "ms": 470},
    {"id": "retention", "ok": true, "ms": 80},
    {"id": "hindsight", "ok": true, "ms": 12},
    {"id": "telemetry-files", "ok": true, "ms": 1},
    {"id": "backup", "ok": true, "ms": 1},
    {"id": "identity", "ok": true, "ms": 0}
  ],
  "degraded": []
}
```

Section mapping (source → UI card): `agent` → agent state/uptime/version; `health.alerts` → alerts card;
`health.backup` → backup card; `health.egress` → egress card; `health.cost` → token/cost card;
`health.jobs` → scheduled jobs; `health.curator` + `memory.stats` → memory bank card; `retention` → storage
card; `identity` → identity card; `notifications` → push/heartbeat chips; `sources`+`degraded` → footer
freshness strip ("all sources fresh" / "2 sources unavailable").

### D.4 Caching / refresh (no polling storms)

Server side:

| Section | TTL | Rationale |
|---|---:|---|
| `agent`, `serving` | 5 s | live unit state, cheap |
| `health.alerts` | 30 s | expensive (1.2 s) and the checks themselves are 24 h windows |
| `health.egress` | 60 s | journal scan; event counts rate-limited anyway |
| `health.backup` | 300 s | changes once a day |
| `health.cost`, `health.curator` | 60 s | files change daily / on demand |
| `health.jobs` | 15 s | next/last timestamps |
| `memory` | 10 s | REST is ~10 ms; near-live is cheap |
| `retention` | 300 s | file-size stats |
| `identity`, `notifications` | 60 s | metadata only |

Implementation: a module-level `Map` cache + per-key `{ value, asOf, expiresAt, inflight }`. If a refresh is
already running, return the joined promise (single-flight); if the request arrives after TTL, rebuild but
serve the **last good value** with `stale:true` if the rebuild exceeds a 3 s grace. Never let a slow source
block the response: `Promise.allSettled` + per-source timeout, merged into `sources`.

Client side:

- One fetch per refresh, from a single `useStatus()` hook; no per-card requests.
- Refresh on mount, on manual **Refresh**, and every **60 s** while `document.visibilityState === 'visible'`;
  on `visibilitychange → visible`, refresh once immediately (if older than 15 s).
- Exponential backoff on failure: 60 s → 120 s → 300 s (cap), reset on success; keep the last good state
  visible and show "last updated <relative>" + the error line.
- `AbortSignal.timeout(8000)` on the fetch; `credentials:'same-origin'`, `cache:'no-store'`; resolve URL with
  `new URL('api/dsh-status/status', document.baseURI)` (mount-safe).
- Show freshness honestly: relative time + absolute title; a "stale" badge when `stale:true` or
  `ageMs > 2×TTL`.

### D.5 Degradation matrix (what the UI does when a source is absent)

| Failure | Route behaviour | UI |
|---|---|---|
| DSH home missing / not readable | `agent.homeExists:false`, other sections still returned | "assistant home not found" card; hide panels that depend on it |
| `systemctl` absent (non-systemd run) | `agent.known:false` | "not under a systemd unit" note; no red state |
| Unit stopped | `agent.active:false` | amber "stopped", uptime null |
| `check-alerts` missing/timeout | `health.alerts.ok:false, error:'…'` | "alerts unavailable" card; other cards unaffected |
| Hindsight down (fetch throws) | `memory.reachable:false` | "memory capture blind" on the memory card only |
| Hindsight bank missing | `memory.ok:false, error:"Bank 'dsh-personal' not found"` | "bank not initialised" |
| Egress degraded (`status:'degraded'`) | `egress.status:'degraded'` | "observation inactive" chip, not a red alert |
| Backup dir empty | `health.backup.ok:false, ageHours:null` | "no backups found" |
| Telemetry file missing | section `ok:false, error:'missing'` | empty-state copy ("no digest yet") |
| Route itself missing / bundle disabled | client gets 404 (after auth) | "Status host half not installed — enable the bundle" |
| Not authenticated | client gets 401 | "session expired — reload / re-unlock" |

### D.6 Security rules for the route

1. **Allowlist only**: pinned unit, pinned bank, pinned script paths, `~/.dsh-personal/**` and
   `~/backups/dsh-personal/**` and `:9177` only. No request parameter ever becomes a path, unit, bank or URL.
2. **Never read/serve**: `.credentials.yaml`, `NTFY_TOKEN`/`NTFY_URL` values, launch tokens, `/proc/*/environ`,
   session text, memory `text`, digest body with paths, `.plugin-manager` contents, `~/.hermes/**`.
3. **No `GET /v1/default/banks`**, no Hindsight bank picker (Hermes banks exist on the same instance).
4. **Render untrusted text as text**: any string from a data file/script detail goes through React text nodes;
   never `innerHTML`, never a tooltip with raw HTML; memory/session content is data, never instructions.
5. **Redact at the route**: drop `hostname`, `owner_user`, `bin`, `repo.dir`, symlink targets and sha256 from
   the backup payload; drop cgroup/user from egress; keep only the fields in §D.3.
6. **`cache-control: no-store`** on the response (freshness is in the body); the route is owner-only by
   construction, so no CSRF surface beyond the existing fence.
7. **Fail closed on write paths**: the route has none. Any future write (memory delete, restart, heartbeat
   toggle) gets its own route + explicit confirmation + the existing policy (`forget.sh`, host-control
   restart) — do not add a write verb to this route.

### D.7 Deliberately out of scope for v1 (and why)

- **Currency cost** — no price table exists; tokens only (`unit:"tokens"`). Add later with a documented rate.
- **Exact egress bytes** — require root; show events + "counters not readable".
- **Offsite/encrypted backup status** — `dsh-offsite-bundle.sh` records nothing locally; would need its own
  state file (a write) before the UI can show it.
- **"What changed" event stream** — no event log exists; v1 shows timestamps (digest generatedAt, unit since,
  last memory write, last consolidation) side by side; a real change feed needs a new local sink.
- **Approval history / recent activity** — requires session data + the search index (currently empty); later
  slice.
- **Push/heartbeat cross-process state** — booleans only when the route runs inside the assistant process;
  on the coding host render "unknown (different process)".
- **Hindsight uptime** — only `/health` exists; no uptime field. Show `last_memory_write_at` instead.

---

## Appendix — capture commands (read-only, repeatable)

```sh
cd /home/josh/projects/DSH-playground
scripts/telemetry/check-alerts.sh --json                          # 1.2 s, exit 0/1/2
scripts/egress/summarize-egress.sh summary --json                 # 0.5 s, exit 0/2/3
scripts/ops/retention-report.sh --json                            # 0.08 s
ls -la ~/.dsh-personal/telemetry/ && cat ~/.dsh-personal/telemetry/{cost-today,curate-YYYY-MM-DD}.json
find ~/backups/dsh-personal -name manifest.json -printf '%T@ %p\n' | sort -n | tail -1
curl -s http://127.0.0.1:9177/health
curl -s http://127.0.0.1:9177/v1/default/banks/dsh-personal/stats
curl -s 'http://127.0.0.1:9177/v1/default/banks/dsh-personal/llm-requests/stats?period=7d'
systemctl --user show -p ActiveState -p SubState -p MainPID -p ActiveEnterTimestamp -p NRestarts \
  --timestamp=unix dsh-personal.service
systemctl --user list-timers 'dsh-*' --output=json --no-pager
systemctl         list-timers 'dsh-*' --output=json --no-pager
scripts/ops/dsh-pending.py dsh-personal.service                   # 0.17 s, read-only, exit 0/1/2
```

All commands were run under the harness's read-only sandbox; no host state, files, timers or services were
modified. Before publishing, this file was scanned locally for the capture's personal identifiers (hostnames,
private IPs, session ids, the recall canary, third-party bank/user names and token-shaped strings); the scan
returned no hits. The pattern list itself is kept out of the public copy.
