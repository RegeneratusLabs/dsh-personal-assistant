# DSH v0.2.2-rc.1 — capability audit for personal-assistant use

_Audit date: 2026-11-09. Auditor: dsh-auditor (team task-4). Scope: the locally installed npm release of DeepSeek Harness, `@deepseek-ai/dsh@0.2.2-rc.1` (also the current `latest` on the npm registry), plus the user's live `web` profile. Question: if we wanted to turn DSH into a Hermes/OpenClaw-style personal assistant, what already exists, what can be added as a plugin with no core changes, and what needs upstream work?_

Shorthand used below:
`$DSH` = `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh`
`$PKG` = `$DSH/node_modules/@deepseek-ai` (330 packages: `$DSH/package.json` deps + transitive)
`$HOME` = `/home/josh/.dsh` (user Harness home; read-only for this audit)

## 0. Verdict (TL;DR)

- DSH is **not** an assistant out of the box; it is a **general agent harness with an unusually complete set of assistant primitives** — durable event-sourced sessions, host-wide durable scheduling, persisted goals with an autonomous round driver, skills, subagents/Agent Teams, MCP client, approvals + permission presets, voice input, background jobs, attachments, deliverables, a Web GUI, headless, SDK and ACP.
- The **three missing pillars** for "personal assistant" are: (1) a **chat-first channel** (no IM/messaging package ships at all), (2) **proactive notification/outbound delivery** (scheduled prompts land in a session inbox only; no desktop/mobile push, no TTS), and (3) **long-term memory** (session history is durable, but there is no memory store or memory tools; cross-session search is an optional, in-memory-index bundle).
- All three are **achievable as plugins with no core changes** — and the community has already proved it: `dsh-bao` (memory + assistant preset + daily digest + notifications) and `@starsharryzhu/dsh-assistant` (parent/worker + heartbeat + WeChat bridge) both exist and are built only on public seams.
- The **real upstream gaps** are narrower: single-owner Web auth (no multi-user identity), schedule delivery is at-least-once with no retry loop and requires the Host process to be running, goal continuation is process-local and deliberately disarmed after resume/restart (a human must re-arm), and there is no blessed hooks/webhook trigger bundle in the shipped profile lists (though the packages are published on npm).
- The plugin architecture is the leverage: profiles are ordered patch layers, bundles are patch files, presets are per-agent plugin lists, and **every capability is a Cordis service/event seam**. An "assistant" is a bundle + preset + a few tools, not a fork.
- Effort estimate for a credible personal-assistant layer on top of 0.2.2-rc.1: **~2–4 focused plugin efforts (S–M each) plus packaging/deployment work**, not a rewrite.

## 1. Method and limitations (what was inspected, what failed)

- Read `$DSH/README.md`, `$DSH/package.json`, all 330 package `package.json` descriptions, and the READMEs of ~50 assistant-relevant packages.
- Composed the real profile: `dsh --profile web --dump-config` **fails here with `EACCES`** because it writes `$HOME/profiles/web/cordis.yml` (sandbox). Documented workaround that worked: a scratch `DSH_HOME` under the workspace (`.audit-dsh-home/`), copying `profiles/web/package.json` + `cordis.patch.yml` and symlinking the profile's `node_modules` read-only. Result: **222 rows / 1370 lines** of composed Web config; default Web template is 1243 lines; headless 391, sdk 438, acp 383. All dump files were kept outside the repo in `/tmp` for cross-checking.
- Read `$HOME/profiles/web/{package.json,cordis.patch.yml}` and `$HOME/profiles/headless/{package.json,cordis.patch.yml}`. **Did not read** `$HOME/.credentials.yaml` or any secret; sessions/storages/attachments were inspected by structure/filenames only.
- Confirmed the Web GUI is live: `127.0.0.1:7000` listens on loopback; `/` and `/api/remote.mux` return `401` without the launch-token cookie (expected auth behavior).
- Public sources used for version/ecosystem checks: npm registry (`@deepseek-ai/dsh` latest = 0.2.2-rc.1), the GitHub repo (`deepseek-ai/deepseek-harness`, MIT, default branch `master`, 276,642 stars at 2026-11-09), `docs/architecture.md`, `docs/cordis-primer.md`, `docs/capability-seams.md`, and the community plugin catalog index (4,872 entries).
- Caveat: `master` docs are slightly ahead of the 0.2.2-rc.1 install (e.g. they document `browser-use`/`computer-use` seams and hook packages that are not in this npm tree). Where they diverge, the install is treated as source of truth and the divergence is flagged.

## 2. How the plugin architecture works (primer for the plan)

### 2.1 Profiles and layers

- A running `dsh` is a **Cordis plugin tree composed at boot from ordered layers**. A **profile** lives at `$DSH_HOME/profiles/<name>/`: `package.json` (out-of-tree plugin dependencies + `dsh.profile.bundles` ordered list) and `cordis.patch.yml` (the user's own patch layer) (`$DSH/README.md#profiles`).
- Layer order: each bundle's patch in `dsh.profile.bundles` order → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` (home) → `--patch` overlays. Later layers win; a patch replaces a row's **whole** `config` (never deep-merges) — this is the single most common plugin-install footgun, documented in the user's own patch comments (`$HOME/profiles/web/cordis.patch.yml`).
- Shipped profile templates: `web`, `headless`, `acp`, `sdk`, `sdk-minimal` (`$PKG/dsh-official-bundles/lib/index.js`, `PROFILE_TEMPLATES`). Other names are created with `dsh --from-default-profile <template>` or `dsh plugin --profile <name> add …`.
- `--dump-config` / `--dump-default-config` / `--dump-config-schema` print the composed tree without booting (`dsh --help`).

### 2.2 Bundles and patch rows

- A **bundle** is a package whose `package.json` has `dsh.bundle.patch` → one patch file (or ordered list), plus optional `dsh.bundle.platforms`, `engines.dsh`, `dsh.client`, icons/locales (`$PKG/dsh-package-manifest/README.md`).
- A patch file is a YAML list of loader rows: `- id: <row-id>  name: '<package>'  config: {...}  inject: [...]  disabled: true`; rows can also `insert:` new rows or `group:` nested rows. `!!js` expressions are evaluated against the plugin context (e.g. `trustedHosts: !!js ctx.webStartup.trustedHosts` in the user's Web patch; `docs/cordis-primer.md#loader-configuration`).
- A package without `dsh.bundle.patch` is only an installed dependency; enabling it means adding rows yourself.

### 2.3 Cordis plugins, services, events

- A plugin is a Cordis object/Service with `inject` (required services) and `apply(ctx)`; a context is a service repository (`ctx.tools`, `ctx.llm`, `ctx.sessions`, `ctx.schedule`, …). Communication is typed events with fixed dispatch modes (`emit`/`waterfall`/`parallel`/`serial`/`bail`); registrations are reversible effects via `ctx.effect()`/`ctx.on()` so unload/reload unwinds cleanly (`docs/cordis-primer.md`).
- There is **no privileged core to patch**: the model adapter, tool registry, session log and agent loop are all plugins (`docs/architecture.md`).
- Config schemas are declared per plugin (Schemastery) and surfaced as `--dump-config-schema`, the Settings UI, and the generated config catalog.
- Tools are registered with `defineTool` over `ctx.tools`; prompt text with `ctx.systemPrompt` sections/context; client UI with `dsh.client` + `window.__ModuleLoader__.load`, served by `dsh-client-modules`.

### 2.4 Presets = per-agent composition (key assistant lever)

- `dsh-agent-preset` declares an Agent's **child plugin list in YAML** (`config.plugins`), and `dsh-agent-preset-registry` keeps the roster (`default: standard`). Sessions select a preset; presets are patchable by row id (`preset-<id>`), and later rows can insert new presets (`$PKG/dsh-agent-preset/README.md`; dump rows `preset-standard`/`preset-ptc`/`preset-minimal`/`preset-cordis`).
- This is exactly how `dsh-bao` ships an "assistant" identity: a preset row with `dsh-persona` + an assistant tool list, plus a `dsh-bao` plugin (`github.com/milestone-17/dsh-bao`).
- Tools/rows are per-preset: `standard` mounts `tool-schedule`, `tool-goal`, `tool-skill`, `tool-jobs`, web tools, subagent/workflow, `ask_user`, `todo`, `present`; `minimal` mounts almost none; `cordis` (creator mode) adds `tool-cordis` + `tool-plugin-manager` (dump-web rows 661–1250).

### 2.5 Management, market, HMR

- **Plugin Manager** (`dsh-plugin-manager`) is shared by CLI (`dsh plugin --profile …`), Web Plugins page and the `plugin_manager` agent tool; it edits the profile's `package.json` bundle list and `cordis.patch.yml`, with a profile write lock; protected packages are read-only (`$PKG/dsh-plugin-manager/README.md`).
- **Plugin market**: format-1 JSON indexes configured in the `plugin-market` row; the user's profile points at `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin` plus `dshmarket`; the Discover UI installs bundles through the same plugin manager (`$PKG/dsh-plugin-market/README.md`, `$PKG/dsh-plugin-market-index/README.md`).
- **HMR**: `dsh-hmr` watches the profile manifest and patch files and reloads config-only changes live; packages that need code reload require a restart. Base enables config HMR; headless/SDK/ACP disable it (`$DSH/README.md`; `docs/architecture.md#profiles-and-bundles`).

### 2.6 Seams an assistant plugin can hook (from `docs/capability-seams.md` + installed services)

`ctx.schedule`, `ctx.goals`, `ctx.storageDomain` (typed durable KV), `ctx.skills`, `ctx.subagents`, `ctx.agentTeams`, `ctx.jobs`, `ctx.attachments`, `ctx.spillStore`, `ctx.web`, `ctx.mcpResources`, `ctx.approval`, `ctx.userQuestions`, `ctx.authorization`, `ctx.credentials`, `ctx.settings`, `ctx.sessionQuery`, `ctx.sessionProjections`, `ctx.agentPresets`, `ctx.tools`, `ctx.systemPrompt`, `ctx.sessions`/`ctx.sessionPersistence`, `ctx.agents`, `ctx.llm`, `ctx.actionCards`, `ctx.remoteAccess`, `ctx.connection`. This list is the plugin-authoring budget: most assistant features need only these.

## 3. Interaction model today

| Surface | How the user talks to DSH | Evidence / notes |
|---|---|---|
| **Web GUI (primary)** | `dsh web` / `dsh --profile web`; tokenized launch URL → signed cookie; workspaces + sessions in the sidebar; composer with attachments, `@file`/`@session` refs, voice dictation; right sidebar files/terminal/browser tabs/doc preview; Settings (models, permissions, plugins); Automation tasks page; Plugins page; goal bar, plan mode, jobs, subagent/Agent-Team panels, deliverables, action cards | `$PKG/dsh-web-app/README.md`; client packages `dsh-client-ui-*`; live at `127.0.0.1:7000` |
| **Headless** | `dsh --profile headless "task"` — one fresh persisted session, prints final answer, exits; `--json` NDJSON stream (`session/status/text/thinking/tool_call/tool_result/final`), `--session-id` to resume, `--permission-mode`, `--approval-policy ask\|never`, `--add-dir`; **no live approval channel**, no schedule row mounted | `$PKG/dsh-headless/README.md`; dump-headless has no `dsh-schedule`/`tool-schedule` |
| **SDK** | `dsh --profile sdk` — JSON-RPC 2.0 over stdio; TS + Python SDKs; sessions, prompts, tools, MCP servers, model/reasoning selection, `approvalRequests` for remote approvals | `$PKG/dsh-sdk-app/README.md`, `$PKG/dsh-sdk-protocol/README.md`, `docs/user/guide/python-sdk.md` |
| **ACP** | `dsh --profile acp` — Agent Client Protocol over stdio for automation clients (create/resume sessions, model + effort, MCP declarations, cancel/close); no DSH-specific UI | `$PKG/dsh-acp/README.md`, `agentclientprotocol.com` |
| **Desktop** | Electron app, downloadable from `deepseek.com/en/harness`; `desktop` is a reserved profile name; community plugins may require it (e.g. `@starsharryzhu/dsh-assistant` supports Desktop only) | `$DSH/README.md`; official site; **not installed on this host** |
| **TUI / IM** | **Absent.** No TUI bundle ships (README's `tui` is an "assuming installed" example; no `@deepseek-ai/dsh-tui` on npm). No messaging/IM package exists in the 330-package tree | `dsh --help` examples; npm registry lookup 2026-11-09; package-description scan |

**Remote access:** Web listens on loopback by default. `--host` accepts **one concrete local IP only** (wildcard `0.0.0.0` rejected), plus `--port`, `--tls-cert`/`--tls-key` (opt-in HTTPS, unmanaged cert), `--public-url` (advertised root behind a prefix-stripping proxy) and `--trusted-host` (Host/Origin fence allowlist). Auth is a per-process launch token exchanged for a signed, host-bound, `HttpOnly`/`SameSite=Strict` cookie; every RPC/WS requires it (`$PKG/dsh-web-app/README.md#public-deployments`, `$PKG/dsh-client-connection/README.md#browser-authentication-and-request-trust`). This host's patch sets `trustedHosts: !!js ctx.webStartup.trustedHosts` and `cookieMaxAgeDays: 365`, with a comment about the tailnet hostname — i.e. remote/tailnet access is already in use here via a proxy. There is no built-in Tailscale/ngrok integration and no multi-user login.

**Approvals:** `ctx.approval` is a fail-closed one-shot decision waterfall (`ask`/`never`); Web answers through the **composer takeover** UI (`dsh-client-ui-approval`), `ask_user_question` uses the same interaction path (`dsh-user-questions`), permission presets bundle sandbox + approval (`read-only` / `workspace-write` / `danger-full-access`), and the experimental `dsh-experimental-auto-review` (installed here) adds per-call LLM review for an `auto` mode. Headless/SDK/ACP have their own policies; there is **no out-of-band (phone/desktop) approval channel** except what a plugin adds.

**Persistence map (what survives where):**

| Data | Location | Notes |
|---|---|---|
| Sessions | `$HOME/sessions/<encoded-cwd>/<session-id>/session.v4.jsonl.zstd` + `session.lock` | event-sourced append-only log (`dsh-session`, `dsh-session-persistence-jsonl`); checkpoint policy before model requests/tool side effects; compaction + pruner plugins |
| Session index | `$HOME/storages/session_projcache/…`, `$HOME/storages/workspace.json` | JSON KV domains via `dsh-storage-json`/`dsh-storage-domain`; workspace registry |
| Attachments | `$HOME/attachments/v1/{objects,files,file-objects,tmp}` | content-addressed, durable (`dsh-attachment-local`) |
| Profiles/patches | `$HOME/profiles/<name>/` | bundles + user patch; plugin installs via pnpm |
| Credentials | `$HOME/.credentials.yaml` (not read) | `ctx.credentials` references from config; Settings writes refs |
| STT models | `$HOME/speech-to-text/sensevoice/models` | local SenseVoice ONNX, downloaded on first use |
| Search | `dsh-session-query-sqlite` FTS5 — but Web mounts it `path: ':memory:', openAt: never`; content search only via optional `dsh-experimental-session-search` bundle (5 read tools, lazy `:memory:` index) | dump-web rows 94–98; session-search `cordis.patch.yml` |

**Scheduled delivery semantics (critical for "assistant"):** `dsh-schedule` is Host-wide and durable; tasks deliver their prompt into a target Session's **inbox** (`this_session` / `new_once` / `new`), with receipts and history. Known limits from its README: **the Host must be running**, delivery is at-least-once (no retry loop), delivery floor 60 s, late occurrences collapse, and **new-session targets require a session-creation provider** — Web injects `sessionController`, SDK injects `sdkSessionActivation`; headless and ACP mount neither the service nor the tools (`$PKG/dsh-schedule/README.md#known-limitations-and-deferred-work`; dump rows). There is **no push notification** when a delivery lands — the user sees it in the GUI/session.

## 4. Capability inventory vs assistant needs

Status: **shipped** = mounted by a shipped profile; **optional/on-demand** = official package, profile must enable/install; **external** = community plugin; **missing** = nothing in the tree.

| Assistant need | What DSH 0.2.2-rc.1 has | Status | Evidence |
|---|---|---|---|
| Scheduling / cron / reminders | `dsh-schedule` (after/at/every/daily/weekly/cron/rrule, delivery targets, receipts) + `dsh-tool-schedule` (4 tools) + `dsh-client-ui-schedule` (Automation tasks page) | shipped (Web, SDK) | dump-web rows 481, 693; `$PKG/dsh-tool-schedule/README.md` |
| Goals / long-running objective | `dsh-goal` + `dsh-tool-goal` (get/create/update) + `dsh-command-goal` (`/goal`) + `dsh-goal-round-driver` (autonomous same-session rounds, 256 default cap) + GoalBar UI | shipped | `$PKG/dsh-goal/README.md`, `$PKG/dsh-goal-round-driver/README.md`; dump rows 222–224 |
| Long-term memory | **None.** Durable sessions, `AGENTS.md` user-global/project instruction chain (`$DSH_HOME/AGENTS.md`, `~/.agents/AGENTS.md`), session refs, todo list — but no memory store/tools/injection | missing | `$PKG/dsh-agent-instructions/README.md`; description scan |
| Cross-session recall | `dsh-session-query` + SQLite FTS5 backend; optional `dsh-experimental-session-search` bundle gives 5 read-only search/read tools; Web default index is `openAt: never` | optional | `$PKG/dsh-experimental-session-search/README.md`; dump-web rows 94–98 |
| Sessions / durability | `dsh-session`, JSONL persistence, compaction (+image offload, result pruner), checkpoints, projections, titles, session stats/turn outline | shipped | `$DSH/package.json`; dump-web |
| Skills | `dsh-skill` registry + `dsh-skill-filesystem` (roots: project `.dsh/skills`, `.agents/skills`, custom, `$DSH_HOME/skills`, `~/.agents/skills`) + `dsh-tool-skill`; bundled `skill-office` (Word/PPT/Excel) | shipped | `$PKG/dsh-skill-filesystem/README.md`; dump-web rows 208–211 |
| Agent teams / subagents | `dsh-subagent` + spawn/fork providers + `dsh-tool-subagent`/`-control`; **experimental Agent Teams installed** (`dsh-experimental-agent-team` + 9 tools incl. shared task DAG, roster, peer messaging; Web UI) | shipped + experimental (enabled here) | `$PKG/dsh-experimental-agent-team*/README.md`; dump-web rows 1320–1324; this session itself exposes the 9 team tools |
| Orchestration | `dsh-workflow` + `dsh-tool-workflow` (JS fan-out script), PTC runtime; optional `ralph` bundle | shipped | `$PKG/dsh-workflow/README.md` |
| MCP | `dsh-mcp-client` (stdio + Streamable HTTP, tools named `mcp__<server>__<tool>`) + `dsh-mcp-resources` (3 resource tools); **no server configured by default**; DSH is MCP **client only** | shipped (empty) | `$PKG/dsh-mcp-client/README.md`, `$PKG/dsh-mcp-resources/README.md`; dump row 396 |
| Messaging / IM channels | **None official.** Community only: catalog keyword matches ≈17 Telegram, 48 WeChat, 59 QQ, 45 Feishu, 16 DingTalk, 13 Slack, 22 email, 6 Discord, 9 Matrix; e.g. `@starsharryzhu/im-robot` (WeChat) | external | plugin catalog index (4,872 entries, 2026-11-09); `$HOME/profiles/web/package.json` has no IM plugin |
| Phone / remote control | `@feiyang666/dsh-mobile-remote` **installed in the user's web profile** — LAN web remote control: QR, on/off listen-address toggle via HMR, password gate, telemetry; it is a **web remote, not an IM bridge** | external (installed) | `$HOME/profiles/web/node_modules/@feiyang666/dsh-mobile-remote/README.md`; dump row 1262 |
| Voice input (STT) | `dsh-experimental-voice-input-bundle` (service + local SenseVoice ONNX provider + authenticated Remote + browser mic) — **installed and enabled here**, `language: en` | shipped optional (enabled) | dump-web rows 1270–1280; `$PKG/dsh-experimental-voice-input-bundle/README.md` |
| Voice output (TTS) | **None.** Community TTS plugins exist in the catalog | missing | description scan; catalog |
| Approvals / permission presets | `dsh-user-approval` (ask/never, fail-closed waterfall), `dsh-permission-presets` (3 presets), Web approval composer, `ask_user_question`, experimental `auto-review`, SDK `approvalRequests` | shipped + experimental | dump-web rows 156–170; `$PKG/dsh-user-approval/README.md`, `$PKG/dsh-experimental-auto-review/README.md` |
| Remote access | Web `--host/--port/--tls-cert/--tls-key/--public-url/--trusted-host`; token+cookie auth; Host/Origin fence; configurable cookie age; experimental Liveshare for sharing sessions via a separate relay | shipped (+optional) | `$PKG/dsh-web-app/README.md`; `$PKG/dsh-client-connection/README.md`; `$PKG/dsh-experimental-liveshare/README.md` |
| Headless / scripting | `dsh-headless` bundle: one-shot task, JSON event stream, resume by session id, permission flags | shipped | `$PKG/dsh-headless/README.md` |
| SDK / ACP external clients | `dsh-sdk-app` + `dsh-sdk-protocol` + JSON-RPC server; `dsh-acp-app` + `dsh-acp` (Agent Client Protocol) | shipped | `$PKG/dsh-sdk-app/README.md`, `$PKG/dsh-acp/README.md` |
| Hooks / event triggers | Internal Cordis events + interception seams only. **No hooks bundle ships.** Published but unshipped: `@deepseek-ai/dsh-hook-protocol` 0.0.1-rc.1, `dsh-hooks-claude-code` 0.0.1-rc.5, `dsh-hooks-codex` 0.0.1-rc.1, `dsh-webhook` 0.1.2-alpha.2 (external event → new Workspace Session), `dsh-webhook-github` 0.1.2-alpha.2 | missing (published) | `$DSH/package.json` devDependencies list the webhook and hooks-bridge packages (not installed); npm registry 2026-11-09 |
| LLM provider routing | `ctx.llm` seam; `dsh-llm-deepseek` (Messages API), `dsh-llm-pi-ai` (pi-ai catalog routes), `dsh-llm-retry`, default model + per-session model picker, subagent model settings; this host routes to `opencode-go` via `llm-pi-ai` | shipped | dump-web rows 80–90, 439; `$HOME/profiles/web/cordis.patch.yml` |
| Attachments | `dsh-attachment` + local content-addressed store; image upload/normalization; browser file upload | shipped | dump row 92; `$PKG/dsh-attachment-local/README.md` |
| Web push / notifications | **None.** No service-worker push, no desktop notification package, no notification tool in the install (grep for `notify_user` finds nothing) | missing | description scan; `dsh-bao` implements its own Electron/Windows toast |
| Background jobs | `dsh-jobs-local` + `job_output/list/kill`; bash background jobs; optional persistent-terminal bundle (6 PTY tools) | shipped (+optional) | dump rows 59, 165; `$PKG/dsh-jobs-local/README.md` |
| Deliverables | `present` tool + Web deliverables/changed-files cards + workspace changes comparison | shipped | `$PKG/dsh-tool-present/README.md`; dump-web preset rows |
| Browser / computer use | External `dsh-pilot` (CDP browser control, installed here); official on-demand `@deepseek-ai/dsh-cua-bundle` 0.2.2-alpha.2 (macOS Computer Use, experimental, not installed) | external / on-demand | `$HOME/.../dsh-pilot/README.md`; `$PKG/dsh-official-bundles/lib/index.js` `ON_DEMAND_BUNDLES`; npm |
| Self-extension | `plugin_manager` agent tool, `tool-cordis` (runtime API inspection), optional creation-recommendations/action-cards, plugin market | shipped/optional | dump rows 1250–1258; `$PKG/dsh-tool-cordis/README.md` |

## 5. Gap analysis: shipped vs plugin-only vs upstream

| Personal-assistant dimension | Shipped today | Achievable as a plugin (no core change) | Needs upstream change |
|---|---|---|---|
| Chat-first channel (IM/Telegram/WhatsApp/WeChat) | — | **Yes** — in-process plugin creates/drives Sessions, sends attachments, reads replies; community proves it (`im-robot`, catalog) | Only if first-class multi-channel productization is wanted |
| Outbound notifications / push | — | **Yes** — Host plugin can call OS notifications (dsh-bao does) or ntfy/Telegram/webhook; schedule provides the timer | Native iOS/Android push needs an app + push service (product, not core) |
| Long-term memory | Session history only | **Yes** — `ctx.storageDomain` JSON store + `ctx.systemPrompt` runtime context injection + tools (dsh-bao pattern: `$DSH_HOME/bao/memory.json`, atomic writes, per-request injection) | — |
| Proactive heartbeat / "wake and act" | Goal round driver only (same session, human-authorized) | **Yes** — `ctx.schedule` + `cordis-plugin-timer` + a digest/heartbeat plugin; requires the Host process to stay up | Auto-rearming goals after restart is blocked by policy: continuation is process-local and disarmed after resume/restart until a human resumes (`dsh-goal` README) |
| Daily brief / status digest | Primitives only (schedule + sessionQuery + titles) | **Yes** — dsh-bao's 09:00 digest is the template | — |
| Reliable scheduled delivery | At-least-once, no retry loop, Host must run, 60 s floor | Partially (plugin-side retry/alerting) | Durable retry/backoff, missed-run policy, and delivery notification are core schedule semantics |
| Voice input | **Yes** (installed) | — | — |
| Voice output (TTS) | — | **Yes** — provider plugin + tool (catalog has TTS plugins) | — |
| Approvals for unattended runs | Presets + auto-review + SDK approvals; Web-only answerer | **Yes** — register an `approval/request` answerer + `userQuestions` answerer that forwards to phone/IM and blocks on the reply; seam is designed for composed answerers | — |
| Multi-user / per-person identity | Single owner + non-owner Peer roles (Liveshare) | Partially (plugin-level allowlists) | Real accounts/login, per-user sessions and data isolation are upstream |
| Mobile / multi-device | Web remote access + community mobile-remote/PWA plugins | **Yes** — PWA/mobile UI is a client plugin | Native app + push is product work |
| Integrations (calendar, email, home, notes) | MCP client ready, no servers | **Yes** — configure MCP servers or write provider plugins | — |
| Event-driven triggers (webhooks, inbound email, GitHub) | Packages published (`dsh-webhook`, `dsh-webhook-github`, hooks bridges) but not shipped/listed | **Yes** — install from npm + patch rows; or write a trigger plugin | Blessing a supported trigger/hooks bundle in `OPTIONAL_BUNDLES` would make it first-class |
| Cost / latency control | token meter, compaction, model routing, subagent model settings | **Yes** — per-task model policy plugin | — |
| Secrets | `ctx.credentials` + `ctx.authorization` flows | **Yes** — plugin registers OAuth flows | — |
| Observability | session log, OTel session telemetry, stats/trajectory UI | **Yes** — OTel exporter plugin | — |

## 6. Prior art in the DSH ecosystem (proof the seams work)

- **`dsh-bao`** (`github.com/milestone-17/dsh-bao`, MIT, v0.2.2): "TRAE-宝-style personal assistant" as **one bundle**. Long-term memory (`bao_remember/recall/forget`, `$DSH_HOME/bao/memory.json`, atomic write + write chain, injected as a **system-prompt runtime context** re-evaluated every request), a dedicated assistant **agent preset** (persona via `dsh-persona`), daily digest at a local time (reads the `schedule` catalog + `sessionTitle` rows, does not activate sessions), `bao_notify` (Electron notification → Windows toast → silent), `bao_status`, sidebar panel, loopback-fenced read-only `/bao/api` route. This is a working blueprint for the memory + digest + notify layer.
- **`@starsharryzhu/dsh-assistant`** (npm 0.2.2, GitHub `StarsHarryZhu/dsh-assistant`, MIT, Desktop-only ≥0.2.1-rc.5): parent/router agent + background worker subagents, per-worker model/effort, workspace confinement with parent-approved `request_write_access`, automatic compaction, records as plain files, schedule/reminders/`/ddl`, **hourly heartbeat**, quiet hours, daily brief, balance reminder, and **WeChat via `@starsharryzhu/im-robot`** (scan-to-bind, inbound images/files/voice/video, replies split into short messages). It demonstrates both the parent/worker preset pattern and an IM bridge on public APIs.
- **Catalog scale**: the community index used by the Web Discover page has **4,872 entries** (2026-11-09). Keyword-matched counts (approximate, descriptions only): ~319 memory-related, ~220 notification/push, ~148 voice/TTS/STT, ~132 cron/schedule/reminder, ~107 mobile/remote, ~17 Telegram, ~48 WeChat, ~59 QQ, ~45 Feishu. Whatever "assistant feature" we plan, someone has probably built a prototype — worth reusing patterns rather than core changes.
- **This host's installed externals** show the current bias: `dsh-pilot` (browser hands), `dsh-ffmpeg`, `@farmagent/dsh-web-search`, `dsh-web-fetch-playwright`, `dshmarket`, `@local/dsh-youtube`, `@feiyang666/dsh-mobile-remote` — agent capabilities and a phone remote, **not** an assistant layer.

## 7. Recommendation: highest-leverage things to build (S/M/L)

1. **Assistant channel gateway (start with Telegram) — M.** One plugin that maps a chat thread to a DSH Session: inbound text/voice/images → session prompt (attachments via `ctx.attachments`), outbound final messages + `present` files, pairing/allowlist, `/new`, `/status`, and approval prompts relayed as inline buttons answered through an `approval/request` answerer. Why: this is the single biggest experiential gap; the seams exist and `im-robot` proves WeChat feasibility. Telegram Bot API is the cheapest first channel (no ToS risk).
2. **Memory + proactive assistant layer — M.** Durable memory store on `ctx.storageDomain` (facts/preferences/decisions, dedupe + user-editable), injected as system-prompt runtime context, exposed as 3 tools; plus a **daily digest/heartbeat** that reads schedule + recent sessions and delivers via notification tool; wire to `ctx.schedule` for recurring runs. Why: without memory the assistant restarts every conversation; `dsh-bao` is a working template.
3. **Notification & remote-approval bridge — S/M.** A small bundle that registers (a) an OS/ntfy/IM notifier for "needs attention" events and (b) `ctx.approval` + `ctx.userQuestions` answerers that forward the request to the user's phone and block on the reply (fail-closed on timeout). Why: unattended scheduled runs are useless if approvals and questions only surface in a browser tab; this unlocks cron + auto-review safely.
4. **"Assistant" agent preset — S.** A `dsh-agent-preset` row (persona via `dsh-persona`, memory/schedule/notify/web/skill tools, todo/plan, no coding defaults) selectable at session creation, patch-only. Why: cheapest visible product change; `dsh-bao` shows the exact YAML shape and the failure modes (missing required row config breaks session creation).
5. **Always-on service packaging + event triggers — M.** Ship a systemd/launchd unit for `dsh --profile web` (or the SDK profile for a headless-ish daemon), health check, log rotation, and an inbound trigger path: either install the published `@deepseek-ai/dsh-webhook` 0.1.2-alpha.2 (+`dsh-webhook-github`) and register rules, or write a thin trigger plugin that turns external events into `schedule`-style session prompts. Why: Hermes/OpenClaw feel always-on; DSH already has the primitives but no packaging story.

Do **not** build: another cron engine (schedule is solid), another subagent system (spawn/fork/teams exist), or browser automation (pilot/CUA). Effort order if only two are funded: **1 then 2** (channel + memory), because together they change the product category; 3–5 are force multipliers.

## 8. Sources

Local (authoritative for this audit):
- `$DSH/README.md`, `$DSH/package.json`, `$DSH/lib/types/*.d.ts`, `dsh --help`
- `$PKG/dsh-{base,web-app,headless,sdk-app,acp-app,official-bundles}/README.md`
- `$PKG/dsh-{schedule,tool-schedule,goal,tool-goal,goal-round-driver,skill,skill-filesystem,tool-skill,mcp-client,mcp-resources,subagent,experimental-agent-team,experimental-tool-agent-team,experimental-voice-input-bundle,experimental-speech-to-text,user-approval,permission-presets,experimental-auto-review,attachment-local,jobs-local,tool-jobs,tool-present,experimental-session-search,session-query-sqlite,agent-preset,package-manifest,plugin-manager,plugin-market,plugin-market-index,tool-cordis}/README.md`
- `$HOME/profiles/web/{package.json,cordis.patch.yml}`, `$HOME/profiles/headless/{package.json,cordis.patch.yml}`
- Composed config dumps via scratch `DSH_HOME`: `/tmp/dump-web.txt` (222 rows), `/tmp/dump-default.txt`, `/tmp/dump-{headless,sdk,acp}.txt`

Public:
- DeepSeek Harness site — https://www.deepseek.com/en/harness/
- Repo — https://github.com/deepseek-ai/deepseek-harness (MIT, 276,642 stars, accessed 2026-11-09)
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md
- Agent Client Protocol — https://agentclientprotocol.com
- Community plugins: https://github.com/milestone-17/dsh-bao · https://github.com/StarsHarryZhu/dsh-assistant · https://www.npmjs.com/package/@starsharryzhu/im-robot · https://www.npmjs.com/package/@feiyang666/dsh-mobile-remote
- Plugin catalog index — https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json (4,872 entries); user's configured index https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- npm registry package metadata (versions checked 2026-11-09): `@deepseek-ai/dsh` 0.2.2-rc.1; `dsh-cua-bundle` 0.2.2-alpha.2; `dsh-subagent-codex` / `dsh-subagent-claude-code` 0.0.1-rc.1; `dsh-webhook` / `dsh-webhook-github` 0.1.2-alpha.2; `dsh-hook-protocol` 0.0.1-rc.1; `dsh-hooks-codex` 0.0.1-rc.1; `dsh-hooks-claude-code` 0.0.1-rc.5
