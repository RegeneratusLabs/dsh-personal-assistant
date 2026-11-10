# Admission static scans — M0.5 (task-4)

**Scope:** static analysis of the three pinned candidates that clear the D14 maturity gate. **No install, no
host change, no process started.** Trial results are separate artifacts (`admission-trials.md` for
session-search/Hindsight, `admission-dsh-im.md` for the channel). Verdicts here are "adopt after trial"
where the checklist requires a trial; nothing here authorises an install.

**Date:** 2026-11-10 · **Host:** DSH 0.2.2-rc.1, Node 24.22.1, Linux x64 · **Method:** npm registry metadata
(`npm view`), registry tarball download + sha512 verification against `dist.integrity`, `tar` extract under
`.cache/admission/`, regex scan of shipped code, source-vs-bundle checks, and dependency metadata + `npm
audit` on a `--package-lock-only --ignore-scripts` tree in `/tmp` (no package code executed). Evidence is
cached under `.cache/admission/` (checksums, scan transcripts, lockfiles, audit JSON) and is reproducible
with the commands in §6.

**Pins scanned:**

| Package | Version | Tarball bytes | Publish date | License in npm metadata | Declared deps |
|---|---|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | 0.2.2-rc.1 | 73,076 | 2026-11-04 | MIT | 2 (first-party, host-shipped) |
| `@vectorize-io/hindsight-coding-agents` | 0.8.6 | 4,076,780 | 2026-11-06 | **absent** (artifact has no LICENSE file) | **0** |
| `@xmanrui/dsh-im` | 5.10.0 | 10,719,695 | 2026-11-03 | MIT | 10 (`+2 optional` → native) |

**sha512 (from `dist.integrity`, independently recomputed from the downloaded tarballs — all MATCH):**

```
session-search  sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==
hindsight       sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==
dsh-im          sha512-gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==
```

sha256 of the cached tarballs: `.cache/admission/checksums.sha256`.

---

## 0. Verdict summary

| Package | Install scripts | Native binaries | `child_process` (shipped source) | `eval`/`new Function` | Hard-coded domains | Credentials / env | Verdict |
|---|---|---|---|---|---|---|---|
| session-search | none | none | none | none | `github.com` (docs only) | none | **ADOPT** (after trial; pin exact version) |
| hindsight | none | none in tarball | seed `node deepen.js`, `git`, `npx` self-update, daemon-only `cargo/uvx/which` | none in DSH entry (ajv codegen in unused `mcp-server.js`) | `api.hindsight.vectorize.io` **default**, `127.0.0.1` | `HINDSIGHT_*` env, config file outside DSH_HOME | **ADOPT-WITH-CONDITIONS** (self-hosted config mandatory) |
| dsh-im | none | **optional deps pull ELF `.node`/`.so`/Go binary** | ffmpeg (voice), macOS keychain/osascript, `dsh web` autostart, update CLI | none in source; bundle contains bundled-dep code | channel APIs + DashScope + npm registry | DSH credential store (`ctx.credentials`) only; `DSH_HOME` | **ADOPT-WITH-CONDITIONS** — gated on the 0.2.2-rc.1 trial; Telegram-only scope |

Aggregate rank of what a reviewer must actually read: **dsh-im 10 MB minified bundle + vendored Lark/Baileys
SDKs** (largest untraceable surface) > **hindsight external config + writes to `~/.agents/skills`** (behaviour
outside the DSH home) > session-search (trivially auditable).

---

## 1. `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`

**Provenance:** `@deepseek-ai` scope, repo `github.com/deepseek-ai/deepseek-harness`, MIT, 21 files /
204,727 B unpacked. peers `@deepseek-ai/cordis ~4.1.0` (matches host 0.2.2-rc.1).

**Composition — the tarball is a config stub, not an implementation:**
- `lib/index.js` is **11 bytes: `export {};`**. All code is in the two dependencies, both **already shipped
  inside the DSH 0.2.2-rc.1 installation** at the same version (`0.2.2-rc.1`, MIT):
  `@deepseek-ai/dsh-session-query-sqlite` + `@deepseek-ai/dsh-tool-session-query` (plus their host peers).
- `cordis.patch.yml:1-14` inserts one group `optional-session-search` with an isolated `sessionQuery`
  provider: sqlite with `path: ':memory:'`, `openAt: first-search`, plus the tool package. Enabled/disabled as
  one bundle; tools register in the **global tool layer** (README: visible in every preset including
  `minimal` — a model-surface decision, not a sandbox one).
- I scanned the two dependency packages at their installed path
  (`/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-query-sqlite`
  and `…dsh-tool-session-query`): **0** `child_process`/`eval`/URL/`process.env` sites; sqlite is the Node
  built-in `node:sqlite` (`dsh-session-query-sqlite/lib/*.js:50`), so **no native module**.

**Scan:** no install/prepare/postinstall scripts, no native binaries, no subprocess, no eval, no network
fetch, no env/credential access, no file writes, no `~`/home paths. Only URL in the tarball is
`https://github.com/...` inside README/docs. `scan-session-search.txt`.

**Contradictions / nits:**
- `package.json` `exports` advertises `./src/*` but `src/` is not shipped (dead export, harmless).
- npm `latest` for this package is `0.2.1-alpha.2` with the wrong cordis peer — **only** `@0.2.2-rc.1` is
  acceptable; the pin is load-bearing.
- README's "five experimental read-only global tools" is not verifiable from this tarball alone; tool
  semantics live in the host-shipped `dsh-tool-session-query`. Trial (task-5) should enumerate the five tool
  names and confirm read-only behaviour.

**Verdict: ADOPT** (low risk, first-party, pinned `0.2.2-rc.1`). Conditions: exact version only; trial
enumerates the tool surface; decide whether a globally-registered search tool on the `personal` profile is
wanted for channel-triggered sessions too.

---

## 2. `@vectorize-io/hindsight-coding-agents@0.8.6`

**Provenance:** vendor official (Vectorize), repo `github.com/vectorize-io/hindsight`, maintainers
nicoloboschi / dk09876 (vectorize.io) / benfrank241. **No `license` in npm metadata and no `LICENSE`/
`NOTICE` file in the tarball** — MIT only as a GitHub-repo claim; record that in the ledger. 67 files /
17,175,650 B unpacked (multi-harness bundle: 59 JS files under `dist/`, one entry per supported coding
agent; 16.97 MB of the 17.18 MB unpacked size). DSH loads exactly one
of them — `dist/dsh.js` (746 KB) — via `cordis.patch.yml:1-13`. **0 npm dependencies**, no install scripts.

**Configuration mechanism — the shortlist assumption is wrong.** `dist/dsh.js` has **no Cordis config
schema** (0 schemastery/`Schema` symbols) and its export is `apply(ctx)` only (`dist/dsh.js:19251`), so
**config placed on the profile patch row is silently ignored**. Config is read from (`loadConfig`,
`dist/dsh.js:1857`): env vars `HINDSIGHT_*` (`ENV_KEYS`, `:1762-1786`) and
`CONFIG_PATH = $HINDSIGHT_CONFIG || ~/.hindsight/coding-agent.json` (`:1529`, read at `:1858`). On this host
**no `~/.hindsight/coding-agent.json` exists yet** (only `daemon.lock`), so an install as-is would use
defaults below. M1 therefore needs a **host change**: write that 0600 config file (human-approved) or set
env in the unit; the profile patch cannot pin it.

**Defaults that matter (all verified in `dist/dsh.js`):**
- `serverMode` default `"cloud"` (`:1660`) → `apiUrl` default **`https://api.hindsight.vectorize.io`**
  (`:1668`). **Cloud egress on first use unless overridden.**
- `retainSessions: true` (`:1685`) — every session transcript is written back to the bank.
- `autoInject: "reflect"` (`:1698`, `AUTO_INJECT_MODES:1650`) — one reflect synthesis on the first prompt.
- `autoSeed: true` (`:1713`); `gitIngest: "message"` (`:1719`) → in a git workspace, session start spawns
  `node dist/deepen.js --repo <cwd> --gitlog-limit 300 --harness dsh` detached (`startBackgroundSeed`
  `:20-42`, reached from `buildSessionStartContext` via `seedIfCold` `:18841`) and runs `git` via
  `execFileSync` (`:16968`, `:17532`).
- `codebaseSurvey: true` (`:1715`) is **inert for DSH**: `resolveAgentBin` (`:17304`) has no `dsh` case →
  logs "no headless survey for this agent, skipping" (`:17438+`).
- `manageBankConfig: true` (`:1687`) — plugin writes bank config through the Hindsight API.
- Bank id: dynamic per git project unless `bankId` is set (`deriveBankId`, `:354-380`; template default
  `coding-agent::{gitProject}`). **Must set `bankId: "dsh-personal"`** (`dynamicBankId` then resolves false).
- `autoUpdate: true` (`:1733`). `maybeAutoUpdate` (`:2134`) runs `npm view` and would spawn
  `npx -y <pkg>@<latest> update` (`:2082`, `:2168`) — **but** it no-ops unless the package root equals the npx
  staging dir `~/.hindsight/coding-agents` (`:1979-1984`, `:2139-2143`); a DSH-profile install is not that
  path (and the dir does not exist), so it is inert. Still pin `autoUpdate: false`.
- `serverMode: "daemon"` is the only path that runs `cargo`/`uvx`/`which` (`:2195-2262`, gated by
  `ensureDaemon` `:2301`) and spawns a local daemon; not used with `self-hosted`.

**Filesystem writes outside the DSH home** (reviewer must accept or block):
- `~/.hindsight/coding-agents-logs/plugin.log`, `diag.jsonl`, `usage.jsonl` (log/diag code at
  `:20-120`; `HINDSIGHT_LOG_*`/`HINDSIGHT_DIAG_FILE` overrides).
- **On first session it copies an 83 KB skill to `~/.agents/skills/hindsight-coding-agent/SKILL.md`**
  (`SKILL_DIRS.dsh = ['.agents','skills']` `:18165`; `syncCompanionSkill` `:18221-18236`; called with
  `install: true` from `seedIfCold` `:18843`). That root is the shared agentskills root DSH reads → this is a
  **persistent global instruction injection into every session**, re-added on each cold start. Read
  `skill/SKILL.md` (83 KB, memory-tool usage guidance) before accepting: not malicious, but a durable prompt
  surface outside the DSH home (uninstall removes it; it returns whenever the plugin boots a cold session).
- `~/.hindsight/coding-agents/.update-check.json` only in the staged-npx case.

**`child_process`/network/eval inventory for the shipped tarball** (`scan-hindsight.txt`):
- 904 `child_process`-matching lines across all harness bundles, but the DSH entry uses: seed spawn (`:25`),
  git `execFileSync` (`:16968`, `:17532`), npx update (`:2168`), daemon-only `cargo/uvx/which`
  (`:2214-2262`) — all enumerated above. Windows-only `shell: true` joining exists in the hook bundles
  (`dist/index.js:2083` etc.), not on Linux/DSH.
- `new Function` exists only in `dist/mcp-server.js:2946` — bundled **ajv** schema codegen; that entry point is
  an MCP server for other harnesses (declared in `plugin.json` `mcpServers`), not loaded by the DSH bundle
  row. No eval in `dist/dsh.js`.
- Domains: `api.hindsight.vectorize.io` (default cloud), `127.0.0.1` (daemon), docs/`json-schema.org` etc.
  No telemetry/analytics endpoint.
- Credentials: `HINDSIGHT_API_LLM_API_KEY` / `apiToken` are read from env/config only for auth; error text
  names the config file but never prints values. No credential-store access, no `.ssh`/`.hermes` reads.
- Logs may contain the repo path and bank name; review `diag` fields if path leakage matters.

**Verdict: ADOPT-WITH-CONDITIONS.** Conditions (all mandatory before install):
1. Provision the external config **before** first boot — `~/.hindsight/coding-agent.json` (0600) with
   `serverMode:"self-hosted"`, `apiUrl:"http://127.0.0.1:9177"`, `bankId:"dsh-personal"`, `autoUpdate:false`,
   `autoSeed:false`, `codebaseSurvey:false`, `gitIngest:"none"`, `apiToken` unset, `optInOnly` left default;
   **verify no `api.hindsight.vectorize.io` contact** in the trial. (Or the equivalent
   `HINDSIGHT_*` env, but the file is cleaner and no secret is needed on self-hosted :9177 unless the bank
   has an auth key.)
2. Bank must be `dsh-personal` only; trial asserts Hermes banks `josh`/`hermes-bank-3`/`hermes-bank-2` unchanged.
3. Accept the two home-directory writes above, including the 83 KB skill in `~/.agents/skills/` (or delete
   it after each cold start and record that as a residual).
4. Accept per-turn transcript capture into the local Hindsight bank (data stays on `127.0.0.1`, but it is now
   long-term storage of personal conversations — retention/directive policy from the memory plan applies).
5. Re-scan/re-admit on every upgrade; record the missing LICENSE artifact fact in the ledger.
6. Trial (task-5) confirms: config resolution, bank isolation, no cloud fetch, seed/skill copy behaviour, boot.
7. Consider `autoInject:"none"` or `"pages"` for the first days to bound surprise LLM work inside Hindsight
   (`reflect` triggers server-side synthesis on first prompt of each session).

---

## 3. `@xmanrui/dsh-im@5.10.0`

**Provenance:** MIT, repo `github.com/xmanrui/dsh-im`, single maintainer `xmanrui`, 505 files /
28,741,489 B unpacked. Ships **both** hand-readable source (`src/` 281 files, 280 of them `.mjs`;
`plugin-src/` 190 files, 102 `.mjs` + `.js`) **and the
shipped artifacts**: `lib/index.js` **10,153,711 B (minified, 721 lines)**, `lib/client.js` 1,865,684 B
(26,295 lines). Root package has no install scripts; 0 native binaries inside the tarball.

**The bundle is much larger than the shipped source, and that matters.** `plugin-src/host/build.mjs` bundles
`plugin-src/host/index.mjs` with esbuild (`minify`, **`sourcemap: false`**) and marks only part of the SDKs
external. Two build-time devDependencies are **vendored into `lib/index.js`**:
- `@larksuiteoapi/node-sdk@1.73.0` — imported by `plugin-src/host/channels/feishu/production.mjs:7`, patched
  at build time by `plugin-src/host/lark-sdk-handshake-patch.mjs` (reviewed exact-match patch of its
  WebSocket lifecycle; `:155` names the SDK version). Its axios/ws code lands in the bundle.
- `@whiskeysockets/baileys@7.0.0-rc14` — imported by `src/channels/whatsapp/whatsapp-runtime.mjs:11`,
  and its default config is visible in the bundle (`web.whatsapp.com`, logger class `baileys`).
Consequence: the 10 MB artifact contains third-party SDK code that is **not in `dependencies`**, has no
source map, and cannot be diffed against the shipped `src/`; the bundle also contains optional dynamic
imports of `link-preview-js`, `jimp`, `sharp`, `audio-decode` (`lib/index.js:306,586`) inherited from the
vendored Baileys code (these optional peers are absent → the features fail soft). **Treat the minified
bundle as the authoritative artifact and hash-pin it; the `src/` tree is documentation, not provenance.**

**Native binaries arrive through `optionalDependencies`** (`package.json`: `sharp@0.35.5`,
`@tencent-qqmail/agently-cli@^1.0.18`). pnpm/npm install the platform-matching optional packages by default;
I downloaded and verified the linux-x64 ones:
- `@img/sharp-linux-x64@0.35.5` → `lib/sharp-linux-x64-0.35.5.node` (415 KB, ELF x86-64 shared object)
- `@img/sharp-libvips-linux-x64@1.3.4` → `lib/libvips-cpp.so.8.18.7` (18,699,288 B, ELF x86-64), license
  **LGPL-3.0-or-later** (dynamically linked, so usable, but it is the one non-permissive native in the tree)
- `@tencent-qqmail/agently-cli-linux-x64@1.0.18` → `bin/agently-cli` (9,261,218 B, **statically linked Go ELF
  executable**, Apache-2.0), spawned by the email channel's `agently-cli` transport.
None of these have install scripts (prebuilt), so **pnpm's build-script block does not cover them**. If the
channel is admitted, either accept and pin these exact artifacts (integrity in `.cache/admission/deps` /
`checksums.sha256`) or arrange a profile that does not install optional deps (host/config change).

**Compatibility (gating fact).** `package.json` `dsh.compatibility.dsh = "0.2.1-rc.2"`, `dshReleases` only
`0.2.0-rc.2` / `0.2.1-rc.2`; README:403 states the support baseline is DSH `0.2.1-rc.2` (Session format v4).
**It does not declare DSH 0.2.2-rc.1** — the market may refuse the install, and any exemption is a
compatibility risk that belongs to the task-6 trial, not to this scan. The static scan cannot lift that gate.

**Dangerous-primitive sites (readable source, per channel — none run unless that channel is configured):**
- Telegram voice: `src/channels/telegram/voice.mjs:11,170,192` — `spawn(bin, …)` where `bin` defaults to
  `process.env.DSH_IM_FFMPEG || 'ffmpeg'`. Voice is per-bot opt-in; Telegram text path does not need it.
- Feishu voice: `src/channels/feishu/voice.mjs:17,84,110` — ffmpeg spawn plus **ASR/TTS HTTP to
  `dashscope.aliyuncs.com`**; per-bot opt-in, default off (README:386).
- Feishu config (macOS): `src/channels/feishu/config.mjs:18` — `execFileSync('/usr/bin/security', …)` to read
  the macOS keychain; dead on this Linux host.
- iMessage (macOS): `src/channels/imessage/imessage-api.mjs:5,158,170` — reads
  `$HOME/Library/Messages/chat.db` via `/usr/bin/sqlite3` and drives `/usr/bin/osascript`. Not usable on this
  host; do not configure.
- Email: `src/channels/email/transports/agently-cli.mjs:19,93,184` — spawns the optional Go `agently-cli`
  binary for QQ Mail OAuth/transport.
- `src/channels/shared/harness-client.mjs:1169` — can spawn `dsh web --host … --port …` when
  `autostart` is enabled **and** an explicit `baseUrl` is given (`autostart` defaults false, `:1013,1066`).
  The normal in-process path uses the Host `apiProxy` instead, so this only matters in LAN/office mode.
- Update panel: `plugin-src/host/update-runtime.mjs:237-238,329` spawns `pnpm`/the DSH CLI
  (`add -w --save-exact @xmanrui/dsh-im@<ver> --registry=https://registry.npmjs.org`) through the Host
  `subprocess` service to update itself. It is exposed only as management RPC `update.status/check/install`
  (`plugin-src/host/update-rpc.mjs:4-5`), registered on `/api/dsh-im…` and relying on DSH browser
  authentication + Host/Origin trust (`management-rpc.mjs`; `rpcAuthority` default `"trusted-host"`,
  `plugin-src/host/rpc-authority.mjs:9`). Verify in the trial that the endpoint 401s unauthenticated; a
  browser-authenticated visitor can otherwise trigger a package update.
- No `eval`/`new Function` in the shipped source; `lib/client.js` has no `eval`/`innerHTML`; the two
  minified `new Function` hits in `lib/index.js` are bundled-dependency code (not exercised unless used).

**Network / env / credentials:**
- Domains in code are the channel APIs only: `api.telegram.org`, `open.feishu.cn`/`open.larksuite.com`/
  `accounts.*`, `qyapi.weixin.qq.com`/`work.weixin.qq.com`/`ilinkai.weixin.qq.com`/`novac2c.cdn.weixin.qq.com`,
  `oapi.dingtalk.com`/`api.dingtalk.com`, `api.slack.com`, `discord.com`, `matrix.to`, WhatsApp endpoints,
  `dashscope.aliyuncs.com` (voice only), `registry.npmjs.org` (update only), plus docs/mock hosts
  (`im.example.com`, `untrusted.invalid`, …). **No analytics/telemetry destination.**
- `process.env` reads: `DSH_HOME`, `HOME` (iMessage path only), `DSH_IM_*`, `FEISHU_*` (Feishu config path),
  `HARNESS_*`/`BRIDGE_*` in the standalone Feishu config. **No reads of `.credentials.yaml`, `~/.ssh`,
  `~/.hermes`, keychain (except the dead macOS Feishu path), or other plugins' secrets.**
- Secrets go through the Host credential service (`ctx.credentials.set/get/unset` — 51 sites); the browser
  receives redacted status only. Data lives under `<DSH_HOME>/integrations/dsh-im/` (channel state/config,
  `settings.json`, group-history SQLite via `node:sqlite`, staged inbound files).
- `bin/dsh-im.mjs` is an installer CLI that shells `dsh plugin add` (spawnSync `dsh`); it defaults to
  `github:xmanrui/dsh-im` when invoked as `npx dsh-im install` — the **pinned registry install path must be
  used instead**, never that CLI's default source.

**README claims checked against code:** (a) "secrets only to the local Host, protected credential storage,
status APIs do not return them" — consistent with the credential-store code; (b) "QR-created Feishu/QQ bots
allow all users by default" (README:131) — confirmed as a **default access posture**; for Telegram the
per-bot DM allowlist/security mode must be enabled; (c) compatibility baseline 0.2.1-rc.2 — consistent with
metadata, and the reason this is trial-gated; (d) sponsor/affiliate badges in the README are marketing, not
runtime.

**Verdict: ADOPT-WITH-CONDITIONS, gated on task-6.** Static scan finds no exfiltration, no credential
harvesting, no telemetry, no install scripts, no native code in the tarball, and a conventional
credential-store/RPC design. The residual risks are (i) the undeclared 0.2.2-rc.1 compatibility, (ii) the
10 MB minified bundle with vendored SDKs, (iii) optional native binaries, (iv) the self-update RPC. Conditions:
1. Only after task-6 reports COMPATIBLE **and** its boot/egress evidence is clean.
2. **Telegram only.** Do not configure Feishu/WeCom/Weixin/QQ/DingTalk/Slack/Discord/WhatsApp/Matrix/Email/
   iMessage/Office — each adds subprocesses, native code, or privacy surface.
3. Enable the Telegram DM allowlist / security mode; unknown sender denied (acceptance test).
4. No voice, no image pipeline: avoids ffmpeg + DashScope egress and the sharp/libvips natives may then be
   acceptable; decide explicitly whether the optional natives stay installed (pin their integrities if so) or
   exclude them.
5. Treat `lib/index.js` as the artifact under review; hash-pin it in the ledger and re-hash on upgrade.
6. One poller per bot token; keep channel sessions on the restricted tool surface; do not expose the update
   panel beyond trusted hosts.
7. Re-run `npm audit` and re-resolve the caret deps at install time; ledger the exact locked versions.

---

## 4. Dependency audit

### 4.1 dsh-im's direct dependencies (all pinned/ranged in `package.json`, metadata from `npm view`)

| Dep | Declared | Resolved at audit (2026-11-10) | License | Install scripts | Publisher / repo | Assessment |
|---|---|---|---|---|---|---|
| qrcode | 1.5.4 | 1.5.4 | MIT | prepublish only | soldair / node-qrcode | canonical, 13+ yr old |
| undici | 7.30.1 | 7.30.1 | MIT | prepare only | matteo.collina / nodejs/undici | Node HTTP client, canonical |
| imapflow | ^2.0.5 | 2.11.0 | MIT | prepare only | andris / postalsys/imapflow | canonical IMAP client |
| mailparser | ^3.9.43 | 3.14.2 | MIT | prepare only | andris / nodemailer/mailparser | canonical |
| nodemailer | ^10.1.4 | 10.4.1 | MIT-0 | prepare only | andris / nodemailer | canonical |
| @matrix-org/olm | 3.2.15 | 3.2.15 | Apache-2.0 | none | matrixdotorg / gitlab.matrix.org | official E2EE lib (WASM) |
| dingtalk-stream | 2.1.4 | 2.1.4 | MIT | none | dingtalk-open (official) | vendor SDK |
| @wecom/aibot-node-sdk | 1.0.7 | 1.0.7 | MIT | none | wecom-bot | vendor SDK |
| @tencent-connect/qqbot-nodejs | 1.0.4 | 1.0.4 | MIT | prepack only | Tencent official | vendor SDK |
| @tencent-connect/qqbot-connector | 1.2.0 | 1.2.0 | **UNLICENSED** | prepack only | Tencent official, no repo field | **flag: no license grant** |
| sharp (optional) | 0.35.5 | 0.35.5 | Apache-2.0 | none | lovell/sharp | native prebuilt |
| @tencent-qqmail/agently-cli (optional) | ^1.0.18 | 1.0.18 | Apache-2.0 | none | Tencent | native Go CLI |

Resolved tree from `npm install --package-lock-only --ignore-scripts` in `/tmp`:
**112 packages for `dependencies`, 151 including optionalDependencies**;
**`hasInstallScript: 0`** across the tree (so no install-time script execution, and pnpm's build-script block
is a no-op here); **`npm audit`: 0 vulnerabilities** (info/low/moderate/high/critical all 0) for both trees.
License mix of the full tree: MIT 94, Apache-2.0 22, LGPL-3.0-or-later 10 (+4 dual), ISC 9, BSD 6, MIT-0 2,
UNLICENSED 1, `(MIT OR EUPL-1.1+)` 1, no-license 1 — the LGPL entries are the `@img/sharp-libvips-*` optionals
and its `@img/colour` helper; nothing else is copyleft.
Evidence: `.cache/admission/deps/package-lock-*.json`, `deps/npm-audit-with-optional.json`.

Notes/risks: (a) three deps use caret ranges — the audit resolved today's latest; **record what pnpm
actually locks** at install and re-audit, because admission is per exact version; (b) `qqbot-connector` is
`UNLICENSED` and its transitive `qrcode-terminal@0.12.0` has no license field — it is a **hard** dependency
(QQ channel), not optional, so it will be installed even if QQ is never configured; accept (internal use)
or seek an alternative; (c) no lookalike/typosquat names — the scoped vendor namespaces match the same
publishers as the official SDKs.

### 4.2 The other two

- **session-search:** two first-party deps, exact-pinned to `0.2.2-rc.1` and already part of the running DSH
  installation; scanned clean (§1). No supply-chain delta beyond the DSH version itself.
- **hindsight:** **0 npm dependencies**; third-party code is vendored inside its per-harness bundles
  (e.g. smol-toml in `dist/dsh.js`, license block at end of the file; ajv/undici etc. in the unused
  `dist/mcp-server.js`). No dependency audit applies; the audit surface is the 17 MB bundle itself, pinned by
  sha512.

---

## 5. Surprises worth escalating

1. **Hindsight cannot be configured from the profile patch** (no config schema) — M1 must create
   `~/.hindsight/coding-agent.json` (or env), and the **default is the cloud endpoint**. The shortlist's
   "pin `serverMode`/`apiUrl` in the patch" plan does not work and would silently leave cloud defaults.
2. **Hindsight copies an 83 KB skill into `~/.agents/skills/`** on first cold start — a global instruction
   addition outside the DSH home that affects every session.
3. **Hindsight's `autoUpdate` defaults true** (inert for this install path, but pin it false), and its
   `autoSeed` spawns a git-history ingest on session start (disable for personal memory).
4. **dsh-im's 10 MB minified bundle vendors Lark/Baileys SDKs from devDependencies** without source maps;
   the shipped `src/` is not full provenance.
5. **dsh-im silently pulls native binaries** (`sharp` `.node` + 18.7 MB libvips `.so`; a 9.3 MB static Go
   `agently-cli`) through optionalDependencies — invisible to a tarball scan and not covered by build-script
   blocking. Either accept them explicitly or exclude optionals.
6. **dsh-im declares compatibility with 0.2.1-rc.2 only** — the install may be refused on this 0.2.2-rc.1
   host; the trial decides.
7. Both community artifacts ship **without install scripts** — the cheap win holds; every risk above is
   runtime behaviour, not build-time execution.

---

## 6. Reproduction / cached evidence

```sh
cd /home/josh/projects/DSH-playground/.cache/admission
# metadata + tarballs
npm view <pkg>@<ver> --json > meta-<pkg>.json
curl -sSL "$(npm view <pkg>@<ver> dist.tarball)" -o tgz/<pkg>.tgz
node -e 'verify sha512 of file vs dist.integrity'
tar -xzf tgz/<pkg>.tgz -C extracted/<pkg> --no-same-owner --no-same-permissions
./scan.sh extracted/<pkg>/package > scan-<pkg>.txt     # regex categories used above
# deps: no code executed
cd /tmp && mkdir dep-audit && cd dep-audit && (write package.json) &&
  npm install --package-lock-only --ignore-scripts --no-audit=false && npm audit --json
```

Cached here: `scan.sh`, `scan-*.txt`, `meta-*.json`, `deps/` (10 dep metadata + both lockfiles + audit JSON),
`tgz/` (3 pinned tarballs), `native/` (3 optional platform tarballs), `checksums.sha256`. `/tmp/dsh-im-dep-audit*`
are disposable and were not installed into any profile.

**Not verified here (belongs to the trials):** runtime install feasibility on 0.2.2-rc.1, market
compatibility/admission behaviour, actual egress at boot, config resolution, bank isolation, skill-copy and
seed behaviour, and the tool surfaces as the model sees them.

---

## 7. Ledger-ready rows (for `plugin-ledger.md`, owner to append)

| Package | Version | sha512 | Scan | Trial | Verdict |
|---|---|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | 0.2.2-rc.1 | `FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` | no scripts/native/subprocess/eval/network; stub tarball, code = host-shipped first-party deps; tool surface to trial | pending | **ADOPT** (pinned; trial tool enumeration) |
| `@vectorize-io/hindsight-coding-agents` | 0.8.6 | `3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` | no scripts/native; 0 deps; cloud default; external config only; spawns seed/git/npx; writes `~/.hindsight` logs + `~/.agents/skills` skill; no license in artifact | pending | **ADOPT-WITH-CONDITIONS** (self-hosted config mandatory; autoSeed/autoUpdate off; bank `dsh-personal`) |
| `@xmanrui/dsh-im` | 5.10.0 | `gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==` | no scripts/native in tarball; 10 deps + 2 optional (native) audited 0-vuln; vendored Lark/Baileys in 10 MB minified bundle; child_process only per-channel + self-update RPC; credential-store design; declared compat 0.2.1-rc.2 | pending | **ADOPT-WITH-CONDITIONS**, gated on 0.2.2-rc.1 trial; Telegram-only |
| `dsh-switchboard` | 0.5.22 | — | not re-scanned here | — | **REJECT by D14** (maturity: 1★ single author, no license on repo per prior scout) |

Rollback for all three is "do not install"; if installed, `dsh plugin --profile <p> remove <pkg>` and restore
the profile backup. None of the three was installed by this task.
