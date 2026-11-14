# Admission trial — `@xmanrui/dsh-im@5.10.0` on DSH 0.2.2-rc.1

> **Document status: HISTORICAL ADMISSION EVIDENCE (M0.5, DSH 0.2.2-rc.1; HOLD on #547).** Outcomes are recorded in [plugin-ledger.md](plugin-ledger.md).

**Task:** the gating question for the personal-agent channel. The human's maturity rule (D14) selects the
mature `@xmanrui/dsh-im@5.10.0` over the 1★ `dsh-switchboard`, but the package declares
`dsh.compatibility.dsh: "0.2.1-rc.2"` and `dshReleases` lists only `0.2.0-rc.2` / `0.2.1-rc.2` — it does
**not** declare our host's `0.2.2-rc.1`. Does it actually run?

**Verdict: COMPATIBLE for install / compose / boot — no exemption needed — but NOT CERTIFIED by the
maintainer for 0.2.2-rc.1, with open upstream bugs on the exact Telegram path we need.**
Structural admission passes on every gate the host enforces; the declared-version mismatch is a soft
maintainer claim that nothing locally enforces, so there is also **no safety net** if the API surface
drifted. Adopt only behind a live Telegram smoke test (see §7); otherwise use the M1 fallback (own minimal
bridge).

- Date: 2026-11-10 (AEST), DSH **0.2.2-rc.1**, Node **24.22.1**, pnpm 12.9.1, Linux x86_64.
- Host: `DSH_HOME=/home/josh/.dsh`, profile **`scout-im`** (created from the shipped `web` template),
  port **7013** on `127.0.0.1`. No bot token configured; composition/boot only. No host service touched.
- Everything below was run; nothing is inferred from a README unless marked as a claim.

---

## 1. TL;DR for the decision

| Question | Answer | Evidence |
|---|---|---|
| Does the host loader refuse it for DSH 0.2.2-rc.1? | **No** — it installs, composes and boots clean | §2–§4 |
| Is the `dsh.compatibility.dsh: 0.2.1-rc.2` declaration enforced anywhere locally? | **No** — the CLI preflight, shipped plugin market and `dshmarket` all evaluate `engines.dsh` / `@deepseek-ai/dsh*` peers, never `dsh.compatibility` | §3.2 |
| Do we need a version exemption? | **No** — `engines.dsh` is absent and `peerDependencies` is `null`, so the gate has nothing to reject. The exemption command exists but was **not** needed and was **not** run | §3.3 |
| Does the plugin's code bind to `@deepseek-ai` host packages whose version could mismatch? | **No package imports at runtime** — the host bundle is self-contained; the client bundle only `require`s `react`/`react-dom` through the host module loader | §5 |
| Did the plugin's settings UI / client bundle load? | **Yes** — `@xmanrui/dsh-im/client.js` is in the served client-module roster and was fetched **HTTP 200, 1,865,756 B** from the booted host | §4.3 |
| Does the maintainer declare 0.2.2-rc.1 support? | **No** — npm latest is still 5.10.0 (2026-11-03) declaring 0.2.1-rc.2; `main` still declares 0.2.1-rc.2; no release/changelog note for 0.2.2 | §6.1 |
| Are there upstream reports on 0.2.2-rc.1? | **Yes, four**, incl. an open Telegram final-answer delivery bug reproduced on 0.2.2-rc.1 + 5.10.0 | §6.2 |

---

## 2. Profile + install (exact commands and results)

```sh
export DSH_HOME=/home/josh/.dsh
D=/home/josh/dsh/node/bin/dsh

# 1) create scout-im from the shipped web template (dump-config initializes and exits; no boot, no port)
$D --profile scout-im --from-default-profile web --dump-config > /dev/null
#    exit 0, 139 ms; creates ~/.dsh/profiles/scout-im/{package.json,cordis.yml,cordis.patch.yml,pnpm-workspace.yaml}
#    bundles: ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]

# 2) attempt the pinned install
$D plugin --profile scout-im add @xmanrui/dsh-im@5.10.0
#    exit 0 — NO compatibility refusal, NO exemption prompt
```

Install output (`.cache/admission-dsh-im/install-5.10.0.log`, verbatim):

```
Progress: resolved 0, reused 1, downloaded 0, added 0
Downloading @xmanrui/dsh-im@5.10.0: 0.00 B/10.71 MB
Downloading @img/sharp-libvips-linux-x64@1.3.4: 0.00 B/8.21 MB
Downloading @img/sharp-libvips-linux-x64@1.3.4: 2.83 MB/8.21 MB
Packages are hard linked from the content-addressable store to the virtual store.
Packages: +121
Progress: resolved 121, reused 19, downloaded 105, added 121, done

dependencies:
+ @xmanrui/dsh-im 5.10.0

Done in 3.2s using pnpm v12.9.1
```

| Fact | Value |
|---|---|
| Wall time (CLI, incl. preflight + pnpm) | **4,078 ms** (pnpm reports 3.2 s) |
| Packages added | **121** (pnpm `Packages: +121`) — not "10 deps": 10 runtime + 2 optional direct, then transitive |
| Profile `node_modules` | **83 MB**, 114 hoisted entries |
| Package tarball | 10.71 MB, unpacked **28,741,489 B**, 505 files |
| sha512 (matches npm `dist.integrity`) | `sha512-gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==` |
| Profile manifest after install | `"@xmanrui/dsh-im": "5.10.0"`; bundle appended to `dsh.profile.bundles` → `["…dsh-base","…dsh-web-app","@xmanrui/dsh-im"]` |
| `pnpm-lock.yaml` | 1,332 lines, sha256 `d242238bc1c4985e64bddca8ab72bf9d46cb1d074ee3aeb1b4f768306fd41a7f` |
| Build scripts | **none ran** — `requiresBuild: true` count in lockfile = **0**; package.json has only `build`/`test`/`check` (no `preinstall`/`install`/`postinstall`/`prepare`) |
| `.plugin-manager/logs/operation-e56vjd/pnpm.log` | 0 B (no operation error) |

**Surprise vs the M0.5 brief:** the brief said "10 deps". The package also carries two
**optionalDependencies** that do install on this host: `sharp@0.35.5` (native libvips, pulled
`@img/sharp-libvips-linux-x64@1.3.4` 8.21 MB) and `@tencent-qqmail/agently-cli@1.0.18` (per-platform native
CLI binaries for darwin/linux/win32). Effective install is **121 packages**, not 10. Direct runtime deps and
their ranges: `qrcode@1.5.4`, `undici@7.30.1`, `imapflow@^2.0.5`→2.11.0, `mailparser@^3.9.43`→3.14.2,
`nodemailer@^10.1.4`→10.4.0, `@matrix-org/olm@3.2.15`, `dingtalk-stream@2.1.4`,
`@wecom/aibot-node-sdk@1.0.7`, `@tencent-connect/qqbot-nodejs@1.0.4`,
`@tencent-connect/qqbot-connector@1.2.0`. The three caret ranges are pinned only by the lockfile — a fresh
`pnpm add` on another day resolves different versions (re-admission note, §7).

---

## 3. The admission gate: what is actually enforced, and why it passed

### 3.1 What `dsh plugin add` checks

`dsh plugin` is not a raw pnpm passthrough for DSH-owned logic: `lib/plugin-*.js` → `runPlugin` →
`runPluginCommand` → `runProfilePnpm`, which runs a **preflight** over every named spec
(`@deepseek-ai/dsh-plugin-manager` `lib/index.js`, `runProfilePnpm`):

```js
const issue = evaluatePluginCompatibility(manifest, exemptions);
if (issue !== void 0 && !issue.exempted) { preflight.push(pluginCompatibilityWarning(issue)); … }
if (preflight.length > 0) return await rejected(preflight, "nothing was installed");
```

`evaluatePluginCompatibility` (`@deepseek-ai/dsh-app-boot` `lib/index.js`) resolves requirements as:
**own `engines.dsh` decides alone** (peers ignored), otherwise **every `@deepseek-ai/dsh` /
`@deepseek-ai/dsh-*` peer** must satisfy the runtime, evaluated with
`semver.satisfies(runtime, range, { includePrerelease: true })`. The boot path
(`loadProfile` → `evaluatePluginCompatibility`) applies the same rule, and the shipped plugin market's
`compatibilityOf()` evaluates `engines.dsh` only. `dsh.compatibility` / `dshReleases` are **market
metadata** — no host package in the 0.2.2-rc.1 install reads them (grep for `dshReleases` in
`/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/**` → no hits).

### 3.2 Why this package passes

`@xmanrui/dsh-im@5.10.0` manifest (live npm + installed copy agree):

```json
"engines": { "node": ">=22.19" },
"peerDependencies": null,
"dsh": { "compatibility": { "dsh": "0.2.1-rc.2",
                            "dshReleases": { "0.2.0-rc.2": "compatible", "0.2.1-rc.2": "compatible" },
                            "profiles": ["web"] } }
```

No `engines.dsh`, no `@deepseek-ai/*` peers → `unmetRequirements()` returns `{}` →
`evaluatePluginCompatibility` returns `undefined` → **nothing to exempt, nothing to warn about**. Node
`>=22.19` is satisfied (24.22.1). This is deliberate: issue [#542](https://github.com/xmanrui/dsh-im/issues/542)
(closed) is an older `dsh-im@1.0.5` refused by DSH 0.2.2-rc.1 because it still declared
`@deepseek-ai/dsh-agent|dsh-session|dsh-llm ^0.1.0-rc.6` peers; the 5.x line dropped host peers entirely and
replaced them with the soft `dsh.compatibility` claim. **The consequence for us: the loader can no longer
tell us whether this plugin is safe on our DSH version — the declaration is informational only.**

### 3.3 The documented exemption mechanism (found, not needed, not run)

Had the gate fired, the exact-version exemption path in 0.2.2-rc.1 is:

```sh
# grant (exact package@version + exact runtime; --accept-risk is mandatory)
dsh plugin --profile scout-im allow-version @xmanrui/dsh-im@5.10.0 --dsh-version 0.2.2-rc.1 --accept-risk
# list / revoke
dsh plugin --profile scout-im version-exemptions
dsh plugin --profile scout-im revoke-version @xmanrui/dsh-im@5.10.0 --dsh-version 0.2.2-rc.1
```

Implemented in `lib/plugin-*.js` (`versionCommand`) → `setProfileVersionExemption()`, which writes the
profile-local **`<profile>/compatibility.json`** (`{"<name>@<exact-version>": ["<exact-dsh-version>"]}`, mode
0600). The plugin-manager service (Web UI plugin manager) offers the same grant; the agent-facing
`plugin_manager` tool exposes `set_version_exemption`. **Not used here — granting an exemption we do not need
would be an unnecessary, misleading risk acknowledgement.**

---

## 4. Composition and boot

### 4.1 Composed tree (no boot)

```sh
$D --profile scout-im --dump-config   # exit 0, 136 ms
```

The plugin's own bundle patch is one row (`node_modules/@xmanrui/dsh-im/cordis.patch.yml`):

```yaml
- insert:
    - id: xmanrui-dsh-im
      name: '@xmanrui/dsh-im'
```

and the composed dump ends with exactly that row, no config block (all behaviour is settings/credential
driven, not `cordis.patch.yml` driven):

```yaml
# == @xmanrui/dsh-im
- id: xmanrui-dsh-im
  name: '@xmanrui/dsh-im'
```

No duplicate loader ids, no `insert` row hand-written (compliant with AGENTS.md).

### 4.2 Boot (bounded, `127.0.0.1:7013`, no token, no bot configured)

```sh
DSH_HOME=/home/josh/.dsh $D --profile scout-im --host 127.0.0.1 --port 7013 --no-open
```

Run five times; killed with SIGTERM to my own process group after the probes. Every run:

| Run | Time to listening | Unauthenticated `/` | Errors in output |
|---|---|---|---|
| 1 | 4,567 ms | 401 | none |
| 2 | 4,415 ms | 401 | none |
| 3 | 4,342 ms | 401 | none |
| 4 | 4,357 ms | 401 | none |
| 5 | 4,446 ms | 401 | none |

Boot output (launch token redacted; it is a local, per-process token, never printed or stored):

```
dsh web: http://127.0.0.1:7013/?token=<REDACTED>
[llm-deepseek-api-key] model listing from https://api.deepseek.com/models loaded 2 model(s), skipped 0 row(s)
```

No `error`, `warn`, `incompatible`, `refused` or `deprecated` lines. Host half applied cleanly (a throwing
`apply()` fails startup), and the plugin's client half composed into the live graph (§4.3).

Unauthenticated HTTP surface (all expect 401 — loopback still requires the launch cookie):

```
GET /                        -> 401
GET /api/health              -> 401
GET /api/client-modules      -> 401
GET /api/settings            -> 401
GET /api/profile             -> 401
GET /api/plugin-manager/plugins -> 401
```

**Egress during boot (observed with `ss -tnp` on the process):** exactly one established TCP connection,
`192.168.1.100:60090 → 3.173.21.63:443` (= `api.deepseek.com`, the host's model listing). **No**
`api.telegram.org`, no Feishu/WeCom/QQ/Slack/Discord/WhatsApp/Matrix endpoint, no vendor relay — no channel
poller starts without a configured bot.

**Host-home writes at boot:** the plugin created `~/.dsh/integrations/dsh-im/` containing
`group-history.sqlite` (49,152 B, 0600) and a `group-files/` directory. This is plugin state under
`DSH_HOME`, not under the workspace or `~/.hermes`.

### 4.3 Settings UI / client bundle — served

The launch token was exchanged for the signed cookie (303 → `Set-Cookie`), then:

- `GET /` → **200**, 40,467 B.
- The served page's client-module roster contains
  `@xmanrui/dsh-im/client.js` (one of 74 served modules).
- Fetching the advertised module URL (`/plugins/??@xmanrui/dsh-im/client.js&rev=c43acae905a5`) →
  **HTTP 200, 1,865,756 B**, body begins
  `window.__ModuleLoader__.load({ id: "@xmanrui/dsh-im", factory: (require) => { … } })`, and contains the
  settings surface strings (`IM bots`, 277 × `settings`).
- The two declared `dsh.client.inject` ids that are not real top-level host packages
  (`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-ui-slots`) caused **no boot or roster
  error** — the inject list is declarative metadata, and the client bundle never `require`s them.

Saved evidence (repo, no secrets): `.cache/admission-dsh-im/{install-5.10.0.log,scout-im-composed-dump.yml,
served-index.html,served-dsh-im-client.js,probe-7013.json,probe-7013-bundle.json,boot-*.log}` — all launch
tokens redacted; verified no `token=<20+ chars>` pattern remains.

---

## 5. Peer / compatibility risk — concrete

| Surface | Coupling to `@deepseek-ai` host packages | Risk on 0.2.2-rc.1 |
|---|---|---|
| Host bundle `lib/index.js` (10,153,711 B, self-contained) | **None at runtime.** Only `node:module`, `node:path`, `node:url`; everything else bundled, local `require` via `createRequire`. The only `@deepseek-ai/*` strings in the file are inside its inlined `package.json` (devDependencies + `dsh.client.inject` metadata). | No module-resolution/version risk. Coupling is the **Cordis service API** it calls through `ctx`: session/workspace controllers via the Typert gateway, session events (`turn/end`, `assistant/message`), settings, credential store, `agent-presets`, `ctx.provide('dshIm')`. Behavioural drift is possible and is exactly what upstream issues §6.2 report. |
| Client bundle `lib/client.js` (1.87 MB) | `window.__ModuleLoader__.load({id, factory})`; `require("react")`, `require("react-dom")` only (49 + 4 sites). No `require("@deepseek-ai/…")`. Declares `dsh.client.inject` of 5 host client modules. | No import mismatch. Uses generic slots (`sidebar.panellist`, `main`, `plugins.detail.actions`) with feature detection — its own docs state older hosts keep the Settings entry and missing slots only remove the extra entry. |
| `engines` / peers | `engines.node >=22.19` only; `peerDependencies: null` | Satisfied (Node 24.22.1). Nothing for semver prerelease rules to evaluate — the `includePrerelease: true` behaviour in `dsh-app-boot` is moot here. |
| Declared `dsh.compatibility` | `dsh: 0.2.1-rc.2`; `dshReleases` = 0.2.0-rc.2 / 0.2.1-rc.2; `profiles: ["web"]` | **Not enforced** by CLI, loader, shipped market or `dshmarket`. It is a maintainer claim about what was tested. Our host is newer (0.2.2-rc.1) and is not listed. |

**Bottom line on risk:** the "incompatible version" risk is not a loader/peer failure — it is *unverified
API drift* between 0.2.1-rc.2 and 0.2.2-rc.1 plus the maintainer's silence about 0.2.2. Boot success is
evidence that mounting, services and the client graph still line up; it is **not** evidence that Telegram
message delivery works, and upstream says it does not (§6.2).

---

## 6. Upstream: does the maintainer support 0.2.2?

### 6.1 Published state (npm + GitHub API, 2026-11-10)

- npm: 131 versions, `dist-tags.latest = 5.10.0`, published **2026-11-03T16:53Z**. Every recent version
  (5.6.0 → 5.10.0) declares the **identical** `dsh.compatibility.dsh: "0.2.1-rc.2"`; nothing newer exists.
- GitHub `xmanrui/dsh-im`: 3,437★, MIT, not archived, `pushed_at 2026-11-07T05:03Z` (4 days after the
  release), 125 open issues. `main`'s `package.json` **still** declares 0.2.1-rc.2 — no unreleased 0.2.2
  support. `CHANGELOG.md` has no 0.2.2 entry (grep for `0.2.2` → none); latest release tag is v5.10.0.
- Conclusion: **no maintainer note, changelog entry or release claims 0.2.2-rc.1 support.**

### 6.2 Open issues that name 0.2.2-rc.1 (the real risk)

| Issue | State | What it says |
|---|---|---|
| [#547](https://github.com/xmanrui/dsh-im/issues/547) Telegram: final answer not delivered — only a thinking trace and an empty message | **open** | Harness completes the turn (`turn/end {kind:"completed"}`, `assistant/message` text in the session log) but Telegram shows only `💭 …` + an empty message. **Reproduced on DSH 0.2.1-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1 with dsh-im 5.5.0 / 5.6.0 / 5.8.0 / 5.10.0**, no plugin error logged. This is the exact behaviour our approvals/notify path depends on. |
| [#538](https://github.com/xmanrui/dsh-im/issues/538) Saving bot settings restarts the runtime → `CHANNEL_DELIVERY_UNCERTAIN`, ~3 min silence, chat→session binding cleared | **open** | Environment line 1: **dsh-im 5.10.0 / DSH 0.2.2-rc.1**. In-flight reply reported "delivery unconfirmed" although the turn completed; `api.telegram.org` connection disappears and the bot cursor stalls ~3m20s. |
| [#554](https://github.com/xmanrui/dsh-im/issues/554) QQ bot session two-way sync broken after updating to 0.2.2-rc.1 | **open** | Worked on the previous DSH version, broke after the 0.2.2-rc.1 update (QQ only). |
| [#542](https://github.com/xmanrui/dsh-im/issues/542) dsh-im@1.0.5 incompatible with DSH 0.2.2-rc.1 | closed | The historical peer failure that motivated dropping host peers in 5.x (see §3.2). |

These are **user reports, not maintainer statements**, but they are the strongest available signal that
5.10.0 is being *run* on 0.2.2-rc.1 (so our structural result is consistent with the field) while the
Telegram delivery path has real regressions there.

---

## 7. What a human must accept before this goes into `personal`

1. **No compatibility safety net.** 5.10.0 declares 0.2.1-rc.2; our host is 0.2.2-rc.1; nothing in DSH will
   warn, block or degrade gracefully if the maintainer's API assumptions broke. We are accepting
   "tested-by-us-in-scout, not tested-by-maintainer" status.
2. **Telegram delivery is the open question, not boot.** Upstream [#547](https://github.com/xmanrui/dsh-im/issues/547)
   (open, reproduced on 0.2.2-rc.1 + 5.10.0) says the final answer can be silently dropped on Telegram. For
   a channel whose job is approvals and notifications, that is a functional blocker until proven otherwise.
   Required before `personal`: real bot token + allowlist in a scratch profile, one full approval
   round-trip, final-answer delivery on ≥3 turns, one settings save, one restart — on 0.2.2-rc.1.
3. **Supply chain:** 121 packages, 83 MB, 2 optional **native** dependency trees (`sharp` +
   `@img/sharp-libvips-linux-x64`; `@tencent-qqmail/agently-cli` platform binaries) on top of
   imapflow/mailparser/nodemailer/ws/axios/pino. Three direct deps use caret ranges — the lockfile pins
   them, so install from the committed lockfile and re-admit on every upgrade.
4. **State and secrets:** bot tokens go to the DSH credential store (good), but the plugin writes state
   under `DSH_HOME` (`~/.dsh/integrations/dsh-im/`, SQLite) and, when used, a default bot workspace
   `$DSH_HOME/im`. It also exposes 9+ channels (WhatsApp/WeChat/Matrix/email/iMessage…): only Telegram may
   be configured, with a private-chat allowlist, and the "AI Office Connector" public-cloud link must stay
   off.
5. **One poller per token** still applies; two bridges on one bot token break both.
6. **Same residual as any plugin (D13):** it runs in-process as `josh`; a compromised plugin reads
   everything the user can. Admission vetting and re-admission are the control.
7. **Do not grant a version exemption** — none is needed, and granting one would record a false
   acknowledgement and suppress future real warnings.
8. **Recommendation:** pin `5.10.0`; run the §7.2 live Telegram smoke test; if #547 reproduces, do **not**
   install it into `personal` — use the M1 fallback (own minimal Telegram bridge, ~150–250 LOC) and re-check
   after a 0.2.2-supporting release. The repo is active (pushed 4 days after release), so a fixed version is
   plausible.

---

## 8. Cleanup, what was left, rollback

- **Processes:** none left. Five bounded boots, each terminated via its own process group (SIGTERM, then
  SIGKILL); `ss -ltn | grep 7013` → free; `pgrep -af scout-im` → none.
- **Left for inspection (as instructed):** profile `~/.dsh/profiles/scout-im/` — `package.json`
  (dep + bundle selection), `pnpm-lock.yaml`, `cordis.patch.yml` (still `[]`), `node_modules` (83 MB), plus
  the plugin-created `~/.dsh/integrations/dsh-im/` state dir. Repo evidence under
  `.cache/admission-dsh-im/` (token-redacted).
- **Not touched:** `personal`/`~/.dsh-personal`, `dsh-personal.service`, `~/.hermes`, the Hindsight
  instance/banks, port 7002, the `web` profile, credentials, any bot token.
- **Rollback (not run):**
  ```sh
  DSH_HOME=/home/josh/.dsh /home/josh/dsh/node/bin/dsh plugin --profile scout-im remove @xmanrui/dsh-im
  rm -rf /home/josh/.dsh/profiles/scout-im /home/josh/.dsh/integrations/dsh-im
  ```
  (The remove drops the dependency and the `dsh.profile.bundles` entry; deleting the profile dir is the
  clean wipe.)

---

## 9. Ledger row proposal (for `plugin-ledger.md`, Lead to apply)

| Package | Version | sha512 | Scan | Trial | Verdict | Date | Rollback |
|---|---|---|---|---|---|---|---|
| `@xmanrui/dsh-im` | 5.10.0 | `sha512-gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==` | no install/build scripts (lockfile `requiresBuild` = 0); 121 pkgs incl. native `sharp`/`agently-cli` optional deps; host bundle self-contained, no `@deepseek-ai` runtime imports | scout-im trial: install 4.1 s, composes, boots 4.3–4.6 s clean on 0.2.2-rc.1, 401/200, client bundle served; **no exemption needed**; open upstream Telegram bugs on 0.2.2-rc.1 (#547/#538) | **ADOPT-WITH-CONDITIONS** (COMPATIBLE structurally, NOT CERTIFIED functionally; live Telegram smoke test must pass; pin 5.10.0) | 2026-11-10 | `dsh plugin --profile personal remove @xmanrui/dsh-im` |

## 10. Sources

- npm metadata/versions: `https://registry.npmjs.org/@xmanrui%2Fdsh-im` (131 versions, latest 5.10.0,
  published 2026-11-03T16:53Z); installed copy `~/.dsh/profiles/scout-im/node_modules/@xmanrui/dsh-im/package.json`.
- GitHub: [xmanrui/dsh-im](https://github.com/xmanrui/dsh-im) (3,437★, MIT, pushed 2026-11-07),
  [issues #547](https://github.com/xmanrui/dsh-im/issues/547), [#538](https://github.com/xmanrui/dsh-im/issues/538),
  [#554](https://github.com/xmanrui/dsh-im/issues/554), [#542](https://github.com/xmanrui/dsh-im/issues/542);
  `main` package.json + CHANGELOG.md via raw.githubusercontent.com (no 0.2.2 entry).
- Host gate code: `@deepseek-ai/dsh-app-boot/lib/index.js` (`evaluatePluginCompatibility`,
  `unmetRequirements`, `setProfileVersionExemption`, `PROFILE_COMPATIBILITY_FILENAME`),
  `@deepseek-ai/dsh-plugin-manager/lib/index.js` (`runProfilePnpm` preflight),
  `@deepseek-ai/dsh/lib/plugin-*.js` (`allow-version`/`version-exemptions`),
  `@deepseek-ai/dsh-plugin-market/lib/index.js` (`compatibilityOf`),
  `dshmarket@1.73.14/lib/compatibility.js` (peer preflight; no `dshReleases` use).
- Local evidence: `.cache/admission-dsh-im/` (install log, composed dump, probe JSON, served HTML/client
  bundle, redacted boot logs).
