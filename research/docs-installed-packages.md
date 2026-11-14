# Installed DSH package documentation map (0.2.2-rc.1)

> **Document status: REFERENCE SNAPSHOT (DSH 0.2.2-rc.1, 2026-11-10).** Package list and counts drift; verify against the installed tree.

Read-only survey of the English READMEs shipped inside the installed DeepSeek Harness package tree, focused on what matters for building a **personal AI agent** on DSH. Companion to the other `research/` notes; this file is the package-level documentation index.

- Installed package root: `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` (referred to below as `$PKG`). **330 packages**: 319 `@deepseek-ai/dsh-*` plus 11 third-party/vendor packages.
- Installed DSH version: `0.2.2-rc.1` (`dsh --version`).
- Source clone for repo-relative paths: `/home/josh/projects/DSH-playground/.cache/deepseek-harness` (sparse checkout, HEAD `fcc0ad4` "Merge pull request #7873 … release-dsh-0.2.2-rc.1"), used only to map package → repo directory; the installed tree remains the version authority.

## 1. Purpose and method

Goal: answer "which shipped READMEs document the seams needed to build a personal agent, what exactly do they say, and what does the documentation not cover?"

Method:

1. Enumerated all 330 package directories and their `package.json` name/version/description; measured every `README.md` (43,932 README lines total; 318/319 dsh packages have one). Only `dsh-web-frontend` has no `README.md` in the installed tree.
2. Mapped each package to its repo-relative directory by matching the `# @deepseek-ai/<name>` README heading in the sparse clone (354 of the clone's 446 READMEs map; the three app bundles and a few experimental packages do not, so those are cited by installed path).
3. Read in full (~5,000 lines) the agent-building packages: bundles (`dsh-base`, `dsh-web-app`, `dsh-headless`, `dsh-sdk-*`, `dsh-acp*`, `dsh-official-bundles`, `dsh-app-boot`), presets/prompt (`dsh-agent-preset*`, `dsh-persona`, `dsh-system-prompt`, `dsh-agent-instructions`), skills (`dsh-skill*`), delegation/autonomy (`dsh-subagent*`, `dsh-workflow*`, `dsh-goal*`, `dsh-schedule`, `dsh-experimental-agent-team`), sessions (`dsh-session*`), tools (`dsh-tools`, `dsh-tool-*`), policy (`dsh-user-approval`, `dsh-permission-presets`, `dsh-sandbox-policy`), models (`dsh-llm`, `dsh-agent-default-model`), MCP (`dsh-mcp-*`), SDK/ACP, and selected API/client packages.
4. Composed the effective configuration with the installed CLI: `DSH_HOME=/tmp/pkgmap/dshhome dsh --profile web --dump-default-config` (1,243 lines of composed Loader rows). The real `~/.dsh` is not writable from this session (the CLI wants to write `$DSH_HOME/profiles/web/cordis.yml`), so a scratch `DSH_HOME` was used. The shipped profile templates are installation data, so the dump equals the shipped `web` tree.
5. Read the live profile layout on this machine read-only: `~/.dsh/profiles/web/{package.json,cordis.yml,cordis.patch.yml}` and the home layer `~/.dsh/cordis.patch.yml`, to confirm how users actually extend a profile.
6. Cross-checked bundle patch files: `$PKG/dsh-base/cordis.patch.yml` (535 lines), `$PKG/dsh-web-app/cordis.patch.yml` (593) + `$PKG/dsh-web-app/presets/*.patch.yml`, `$PKG/dsh-headless/cordis.patch.yml` (46), `$PKG/dsh-sdk-app/cordis.patch.yml` (77), `$PKG/dsh-acp-app/cordis.patch.yml` (23).

Fact/inference discipline: quoted identifiers, config keys, service names and composition rows are facts read from READMEs/patches/dumps. Statements marked **(inference)** are my reasoning, not quoted documentation. `$PKG` absolute paths are given where a repo-relative path could not be confirmed.

## 2. Inventory at a glance

| Area (name-based grouping) | Packages | What it covers |
|---|---:|---|
| Client UI (Web browser plugins) | 68 | `dsh-client-*`: renderer/shell, chat/conversation, sidebar, settings pages, per-feature UI (`ui-schedule`, `ui-goal`, `ui-subagent`, `ui-agent-preset`, …) |
| Sessions, state, storage | 43 | `dsh-session*`, `dsh-storage*`, `dsh-spill*`, `dsh-compaction*`, `dsh-attachment*`, projections, query, titles, telemetry, workspace records |
| Experimental | 32 | `dsh-experimental-*`: agent team, auto review, ralph, forge, liveshare, voice/speech, session search, plugin market, worktree, inspector, translator |
| Host, platform, utilities | 30 | `dsh-host-*` (webserver, frontend-static, directory pickers), `dsh-util-*`, `dsh-typert-*`, process/network primitives |
| Agent core, prompt, context | 27 | `dsh-agent`, `dsh-agent-loop`, `dsh-tools`, `dsh-system-prompt`, `dsh-scope`, `dsh-session`, `dsh-commands`, `dsh-persona`, `dsh-agent-preset*`, `dsh-agent-instructions`, context providers, settings/credentials |
| Shell, FS, sandbox, interaction | 23 | `dsh-shell*`, `dsh-bash-*`, `dsh-pwsh-*`, `dsh-fs*`, `dsh-sandbox*`, `dsh-subprocess*`, `dsh-terminal*`, approval/permission presets/user questions/plan mode |
| Tools & execution | 23 | `dsh-tool-*` model-facing tools (7 delegation tools grouped below), executors (native/PTC), PTC runtimes, repeat-tool reminder |
| Bundles, profiles, boot, plugin management | 20 | `dsh-base`, `dsh-web-app`, `dsh-headless`, `dsh-sdk-app`, `dsh-sdk-minimal`, `dsh-acp-app`, `dsh-official-bundles`, `dsh-app-boot`, `dsh-cmdline`, HMR, plugin manager/market |
| Delegation & autonomy | 17 | `dsh-subagent*`, `dsh-tool-subagent*`, `dsh-workflow*`, `dsh-tool-workflow`, `dsh-goal*`, `dsh-schedule*`, `dsh-jobs*`, `dsh-tool-ralph` |
| API / Remote | 10 | `dsh-api-*`: gateway, session/workspace/job/settings/terminal controllers, remotes, access |
| LLM & providers | 9 | `dsh-llm`, `dsh-llm-deepseek*`, `dsh-llm-pi-ai`, `dsh-llm-retry`, DeepSeek account/API extensions |
| Product / assistant-adjacent | 4 | `dsh-action-cards`, `dsh-creation-recommendations`, `dsh-personalized-recommendations`, `dsh-office-to-pdf` |
| Skills | 4 | `dsh-skill`, `dsh-skill-filesystem`, `dsh-skill-badge`, `dsh-skill-office` (plus `dsh-tool-skill` counted under tools) |
| Web & network capabilities | 4 | `dsh-web`, `dsh-web-search-deepseek`, `dsh-web-deepseek-api`, `dsh-web-fetch-http` |
| SDK / ACP runtimes | 3 | `dsh-acp`, `dsh-sdk-jsonrpc-server`, `dsh-sdk-protocol` (the `sdk-app`/`sdk-minimal`/`acp-app` bundles sit in the bundle row) |
| MCP | 2 | `dsh-mcp-client`, `dsh-mcp-resources` |

Third-party packages installed alongside (11): `cordis`, `cordis-plugin-group`, `cordis-plugin-include`, `cordis-plugin-loader`, `cordis-plugin-timer`, `cosmokit`, `schemastery`, `libreoffice-kit`, `libreoffice-kit-wasm`, `node-addon-system`, `node-addon-system-linux-x64`. These are the Cordis plugin framework and native/runtime helpers; they have no DSH agent docs of their own beyond their package READMEs.

Per-package tree shape is uniform: `README.md` + `README.zh.md` + `README.i18n.yaml` + `locale/<lang>.json` + `lib/` + `package.json`; only `dsh-agent-preset`, `dsh-creation-recommendations` and `dsh-plugin-recommendations` ship a `skills/` directory. A few experimental bundles also ship a `docs/` directory (`DETAIL.md`, preview SVGs). Large reference docs the READMEs link to (`docs/subsystems/*.md`, `docs/config-catalog.md`, `docs/tool-catalog.md`, `.agents/notes/*`) are **not** part of the installed package tree; only the package READMEs are shipped.

## 3. Per-area documentation map

Notation in "Notable seams/config": `ctx.*` = Cordis service on the plugin context; config keys are the row `config:` fields the README documents.

### 3.1 Bundles, profiles, boot and plugin management

| Package (README) | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-official-bundles` (`packages/util/official-bundles/README.md`) | Installation-owned lists: `PROFILE_TEMPLATES`, `DEFAULT_PROFILE_BUNDLES`, `INSTALLATION_OWNED_PROFILE_TUPLES`, `RETIRED_BUNDLES`, `OPTIONAL_BUNDLES`, `ON_DEMAND_BUNDLES`, `PROTECTED_PLUGINS`, `HIDDEN_BUNDLES`, `EXTENSION_BUNDLES`, `EXPERIMENTAL_BUNDLES`, `OFFICIAL_ON_DEMAND_CATALOG` | Authoritative answer to "which bundles make up a shipped profile" | Data-only package; imports not wired through `cordis.yml`; lists compiled into the installation |
| `dsh-base` (`packages/bundle/base/README.md`) | Shared core bundle: one `insert` patch applied over the empty profile root; model access, full tool set, durable sessions, default permission policy; custom-profile `package.json` example with `dsh.profile.bundles: ["@deepseek-ai/dsh-base"]` | The substrate a personal profile builds on | Patch replaces whole `config`; later layers override by row id; platform gating via `!!js process.platform` |
| `dsh-web-app` (`packages/bundle/web-app/README.md`) | Browser GUI bundle: flags (`--host/--port/--tls-cert/--tls-key/--public-url/--trusted-host/--no-open`), settings, preset-per-session, patch semantics | The assistant's primary UI surface; shows how the agent plane moves behind presets | `cordis.patch.yml` + `presets/<id>.patch.yml`; `openBrowser`, `printUrl`, `surfaceContext`, `publicUrl`; `webStartup`, `connection` |
| `dsh-headless` (`packages/bundle/headless/README.md`) | One-shot CLI surface, stdin/positional task, `--json` NDJSON events, `--session-id` resume, permission presets, supervisor workflow | Scripted/automation surface for a personal agent | `task`, `sessionId`, `json`, `permissionMode`; credentials disabled by default |
| `dsh-sdk-app` (`packages/bundle/sdk-app/README.md`) | SDK application over `dsh-base`; stdio JSON-RPC owns stdout | Programmatic control of the assistant | `sdk-jsonrpc-server`, `sdkAppStartup` |
| `dsh-sdk-minimal` (`packages/bundle/sdk-minimal/README.md`) | Standalone minimal SDK profile: persistent shell, `read_image`, `working_directory`, automatic compaction, JSONL persistence, **complete tree excluding `dsh-base`** | Smallest embeddable agent runtime | `DSH_SYSTEM_PROMPT`, `DSH_CONTEXT_WINDOW`, `DEEPSEEK_API_KEY`; danger-full-access default |
| `dsh-acp-app` (`packages/bundle/acp-app/README.md`) | ACP automation application over `dsh-base` | Standard-protocol automation surface | `acp` row with `provider: deepseek-official`, `model: deepseek-v4-flash` |
| `dsh-app-boot` (`packages/boot/app-boot/README.md`) | Profile loading, bundle patch resolution, patch semantics, env layers, `--dump-config` / `--dump-config-schema`, compatibility checks, failure policy, `sanitizeProfile` | Explains exactly how a profile/bundle is assembled and how user patches override | `$DSH_HOME/profiles/<name>`, `dsh.profile.bundles`, `dsh.bundle.patch`, `$DSH_HOME/cordis.patch.yml`, `compatibility.json`, `skippedBundles` |
| `dsh-cmdline` (`packages/boot/cmdline/README.md`) | Immutable launcher→app command-line handoff (`ctx.cmdlineArgs`) | Entry-point plumbing | `cmdlineArgs` |
| `dsh-config-editor` (`packages/boot/config-editor/README.md`) | Persists plugin config through profile patches | How GUI edits land as patch rows | profile-backed writes |
| `dsh-plugin-manager` (`packages/boot/plugin-manager/README.md`) | Current-profile plugin/bundle management for CLI, Web, agent tools; protected packages, version compatibility/exemptions | How a user installs a personal bundle | `plugin_manager` tool, `dsh plugin --profile <name> add` |
| `dsh-hmr`, `dsh-plugin-detail`, `dsh-plugin-market`, `dsh-plugin-market-index`, `dsh-plugin-package-inventory-deepseek`, `dsh-plugin-recommendations`, `dsh-home-paths`, `dsh-launch-environment`, `dsh-package-manifest` | Hot reload; plugin detail rendering; plugin market indexes; inventory; home-path resolution; env provenance; manifest types | Extending/tuning a profile | see package READMEs |

### 3.2 Agent core, loop, prompt and context

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-agent` (`packages/core/agent/README.md`) | `ctx.agents` registry, `AgentHandle`, `create`/`resume`/`get`/`list`/`roots`, `followup`/`steer`/`inject`/`cancel`/`whenIdle`, per-agent scoped `agent.ctx`, model selection (`agent.model.current/select`), `agent/*` event vocabulary | The programmatic control surface for a personal assistant | `ctx.agents`, `AgentOptions` (`provider`,`model`,`reasoningEffort`,`maxTokens`,`setup`), `installModelSelection` |
| `dsh-agent-loop` (`packages/core/agent-loop/README.md`) | Default driver: turn/step cycle, inbox splice events, declarative `config.agents`, request header/adapter defaults, cancellation, persistence integration | Explains how “call model → tools → repeat” works and how to pre-start agents | `agents[].{id,provider,model,reasoningEffort,maxTokens,cwd,sessionId,resumeSessionId}`, `maxParallelToolCalls` (10) |
| `dsh-tools` (`packages/core/tools/README.md`) | Tool registry + execution pipeline: `defineTool`, schema DSL, conditional tools (`when`), executor selection, per-agent `restrict`, guards/policy events | Authoring new assistant tools | `ctx.tools.register/execute/guard/restrict/schemas`; events `tools/pre-execute`, `tools/execute`, `tools/post-execute`, `tools/result` |
| `dsh-system-prompt` (`packages/core/system-prompt/README.md`) | Prompt assembly registry: sections, variables, tool-schema providers, `toolOrder`, persona prefix/suffix, `complete` sections, runtime-context suppression | Where a custom persona/system prompt attaches | Config `includeHarnessIdentity`, `includeRuntimeContext`, `personaPrefix`, `personaSuffix`, `toolOrder`; `ctx.systemPrompt.section/variable/getSectionOrder/suppressRuntimeContext` |
| `dsh-session` (`packages/core/session/README.md`) | Event-sourced append-only log; surface events (`system/message`, `developer/message`, `user/message`, `assistant/message`, `tool/result`); `deriveMessages`, fork, flush, projections | Durable memory of everything the assistant says/sees | `ctx.sessions.create/get/list/fork/flush`, `surfaceOp: replace`, `registerMessageProjection` |
| `dsh-scope` (`packages/core/scope/README.md`) | Scoped-context registration primitive (scope tags, scope-filtered dispatch) | Mechanism behind per-preset isolation | `ctx` scope layers |
| `dsh-commands` (`packages/interaction/commands/README.md`) | Human `/command [input]` registry: no model message; attachments; agent-scoped shadowing; `builtin` identity entry | Assistant slash commands (`/schedule`, `/goal`, `/compact`, `/permission`, custom) | `ctx.commands.register({name,description,input,handler,definitionId,recordInput})`, `execute(agent,line,attachments,signal)` |
| `dsh-agent-preset` (`packages/preset/agent-preset/README.md`) | One preset declaration: `id` + `plugins` child list; ships `skills/` used by the `cordis` (Creator) preset | The declarative unit a personal agent is composed from | `config.id`, `config.plugins`, `name`, `description`, `order` |
| `dsh-agent-preset-registry` (`packages/preset/agent-preset-registry/README.md`) | Preset service: `default`, selection, revisions, activation auditing, `inspectCompositions()`, `presetForSession()`, editing via profile patch | Roster of available agent identities and the default | `ctx.agentPresets`, `default`, `selectedDefault`, `agent-preset-registry` settings namespace |
| `dsh-persona` (`packages/preset/persona/README.md`) | Per-agent persona row: `prefix`, `suffix`, `complete`, `includeRuntimeContext`; shadows deployment persona for that agent; template `{{…}}` variables | The single most direct way to give a personal agent its identity | `prefix` (required), `suffix`, `complete`, `includeRuntimeContext` |
| `dsh-agent-instructions` (`packages/context/agent-instructions/README.md`) | `AGENTS.md`/`CLAUDE.md` workspace instruction loader, user-global + project chains, byte budgets, refresh semantics | Personal “standing instructions” file | `maxBytes` (65536 in base), `maxSourceBytes`, `projectRootMarkers` (`['.git']`), `instructionFileCandidates`, `localInstructionFileCandidates` |
| `dsh-settings`, `dsh-credentials`, `dsh-credentials-local`, `dsh-authorization`, `dsh-agent-default-model`, `dsh-harness-dev-context`, `dsh-working-directory`, `dsh-time-context`, `dsh-tmux-context`, `dsh-file-reference*`, `dsh-command-compact/-feedback/-goal` | Settings/credential seams, default model, runtime context providers, working-directory state | Configuration and runtime facts that reach the model | `agent-default-model` config `provider`/`model`/`reasoningEffort`; `currentSelection()`/`saveSelection()` |

### 3.3 Skills

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-skill` (`packages/skill/skill/README.md`) | Skill provider registry: merged catalog, on-demand body load, invocation policy, scoped layers, `invalidate()`, `skills/change` | One catalog for personal skills from several sources | `ctx.skills`, `register`, `registerProvider`, `collectCacheMaxEntries` (128) |
| `dsh-skill-filesystem` (`packages/skill/skill-filesystem/README.md`) | **The SKILL.md authoring format** and local discovery roots/ranks, watching, frontmatter validation | How to write and install a personal skill | `SKILL.md` frontmatter `name`/`description`/`whenToUse`/`metadata`/`disable-model-invocation`/`user-invocable`; `providerName` (`filesystem`), `customSkillDirs`, `includeDefaultRoots`, `bundledSkillDir`, `watch` |
| `dsh-skill-badge` (`packages/experimental/skill-badge/README.md`) | Bundled “powered by dsh” badge skill | Example of a bundled provider skill | skill provider |
| `dsh-skill-office` (`packages/skill/skill-office/README.md`) | Seven Office skills (router + docx/pptx/xlsx/render/recalculate/export-pdf), progressive loading, `assetRoot`/`node`/`cli` | Ready-made document-workflow capability for an assistant | `assetRoot`, `node`, `cli`; requires `skill` + `tool-skill` |
| `dsh-tool-skill` (`packages/skill/tool-skill/README.md`, counted under tools) | Model-facing catalog + `skill` loader tool; `/name` user gesture; catalog replacement lifecycle | How the model discovers and loads skills | `catalogDescriptionMaxLength` (500) |

Skill roots and precedence (from `dsh-skill-filesystem` README) — direct facts:

| Rank | Source | Path |
|---:|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | bundled | `bundledSkillDir` / `$DSH_BUNDLED_SKILL_DIR` |

Format: a directory bundle `<name>/SKILL.md` or a flat `<name>.md` at the top level of a scanned root; nested `**/SKILL.md` is deliberately **not** discovered; `name` must be kebab-case and `description` is required.

### 3.4 Tools and execution

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-tool-fs` (`packages/fs/tool-fs/README.md`) | `read`/`write`/`edit` (+ optional `apply_patch`, `read_image`) over `ctx.fs` | Core file capabilities | config `read`/`write`/`edit`/`readImage`/`applyPatch` |
| `dsh-tool-fs-search` (`packages/fs/tool-fs-search/README.md`) | `glob`/`grep` backed by packaged ripgrep | Discovery | `sampleOverCapGlobResults` |
| `dsh-tool-bash` / `dsh-tool-pwsh` (`packages/shell/tool-bash/README.md`) | Shell tools with background jobs, sandbox escalation, approval retry | Actions in the world | sandbox-policy + approval integration |
| `dsh-tool-bash-persistent` / `-pwsh-persistent`, `dsh-terminal*`, `dsh-tool-terminal` | Persistent PTY/session shell tools | Long-lived personal assistant shell | `timeoutMs` (300000 in minimal preset) |
| `dsh-tool-web` (`packages/web/tool-web/README.md`) | `web_search`/`web_fetch` over `ctx.web` | Everyday assistant capability | `fetch`, `searchTimeoutMs`; providers `deepseek-official`/`http` |
| `dsh-tool-ask-user`, `dsh-tool-todo`, `dsh-tool-goal`, `dsh-tool-schedule`, `dsh-tool-jobs`, `dsh-tool-present`, `dsh-tool-subagent*`, `dsh-tool-workflow`, `dsh-tool-skill`, `dsh-tool-working-directory`, `dsh-tool-workspace-dependencies`, `dsh-tool-cordis`, `dsh-tool-str-replace-editor`, `dsh-tool-session-query` | Model-facing tools; each README documents schema/result and the service it wraps | The assistant's actual action surface | see each README |
| `dsh-tool-executor-native` / `-ptc` (`packages/core/tool-executor-*/README.md`) | Native tool calls vs PTC `run_code` program executor | Determines whether the model sees tools directly or via generated SDK | executor registration; PTC runtime |
| `dsh-ptc-runtime*`, `dsh-repeat-tool-reminder`, `dsh-tool-call-timeout-policy` | PTC execution seams, loop guard, per-call timeout wrapper | Robustness of long agent runs | policies/events |

### 3.5 Sessions, persistence, memory-adjacent state

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-session-persistence` (`packages/session/session-persistence/README.md`) | Durable storage seam: `create/open/stat/list/flush`, `SessionHandle`, single-writer, torn-tail rules, format refusal | Making the assistant's history durable | `ctx.sessionPersistence`; errors `SessionAlreadyOwnedError`, `SessionFormatUnsupportedError`, … |
| `dsh-session-persistence-jsonl` (`packages/session/session-persistence-jsonl/README.md`) | Shipped backend: one `.jsonl.zstd` log per session, lease | Default durable store | root `$DSH_HOME/sessions` |
| `dsh-session-query` (`packages/session-query/session-query/README.md`) | Unified history query: list/read/filter/trace, bounded event windows, literal text scan, search abstraction | “What did we talk about before?” surface | `ctx.sessionQuery`, filters, `SESSION_QUERY_*` errors |
| `dsh-session-query-sqlite` (`packages/session-query/session-query-sqlite/README.md`) | FTS5 backend; `path`, `openAt` (`never` in shipped base/Web) | Enables full-text memory search when switched on | `path`, `openAt` |
| `dsh-session-projection` (`packages/session/session-projection/README.md`) | Client read-model registry: `ProjectionDefinition`, `register`, `snapshot`, `checkpoint`, `SessionProjectionMap` | Live state (goal, todos, subagents) without replaying logs | `ctx.sessionProjections`, `stateVersion`, `wire.view` |
| `dsh-session-projection-cache`, `dsh-session-stats`, `dsh-session-turn-outline`, `dsh-session-title*`, `dsh-session-log-*`, `dsh-session-telemetry*`, `dsh-otel` | Projection cache, stats/outline projections, titles, DeepSeek log/title LLM plumbing, OTel upload | Session UX/observability | config per README |
| `dsh-attachment` + `dsh-attachment-local` (`packages/attachment/attachment/README.md`) | Durable immutable attachment seam + content-addressed local store | Images/files the assistant receives/sends | `$DSH_HOME/attachments/v1` (as cited by `dsh-sdk-minimal`) |
| `dsh-spill`, `dsh-spill-local`, `dsh-spill-policy` | Oversized tool-result spill storage with token-budget retention | Keeps long outputs recoverable | `maxInlineTokens: 12500` in base |
| `dsh-compaction`, `dsh-compaction-basic`, `-image-offload`, `-tool-result-pruner` | Compaction seam/policy: token-meter-driven LLM summarization, image offload, tool-result pruning | Long-running personal assistant context management | `thresholdChars: 8192`, `headChars: 4096`, `tailChars: 1024` |
| `dsh-token-meter`, `dsh-storage*`, `dsh-workspace*`, `dsh-message-feedback`, `dsh-message-quotes` | Token measurement, KV storage hub/domain, workspace records/change tracking, feedback/quotes | Supporting state planes | see READMEs |

### 3.6 Delegation and autonomy

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-subagent` (`packages/subagent/subagent/README.md`) | Delegation seam: named-provider registry, `startActivation`, local vs external children, capacity, depth, child presets, messaging, cold resume, settlement notices | Giving the assistant helpers | `ctx.subagents`, `maxActiveSubagents` (8), `maxDepth` (1), `agentPreset`, `ctx.agents`, `session-projection` |
| `dsh-subagent-spawn-in-process` / `-fork-in-process` (`packages/subagent/subagent-*/README.md`) | Fresh child vs parent-history-seeded child backends | Choosing helper context model | `providerName` `spawn`/`fork` |
| `dsh-tool-subagent` (`packages/subagent/tool-subagent/README.md`) | Model-facing delegation tool: managed activation, per-instance `toolName`, model selection/discovery, child preset allowlist, depth | What the model actually calls to delegate | `provider`, `toolName`, `modelSelection`, `modelDiscovery`, `agentOptions`, `agentPreset`, `allowedAgentPresets`, `maxDepth` |
| `dsh-tool-subagent-control` (`packages/subagent/tool-subagent-control/README.md`) | `send_message`, interrupt, list children | Team/multi-agent UX | control tools |
| `dsh-workflow` (`packages/workflow/workflow/README.md`) | Workflow capability: JS orchestration script hooks `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`; run/result vocabulary | Fan-out work for an assistant (research, audits, batch actions) | `ctx.workflowEngine.start({script,meta,args,parent,signal})`; `WorkflowError` |
| `dsh-workflow-ptc` (`packages/workflow/workflow-ptc/README.md`) | The engine: sandboxed Node PTC process, concurrency/limits, cancellation | Running workflows safely | `provider` (`spawn`), `maxConcurrentAgents`, `maxTotalAgents` (1000), `maxItemsPerCall` (4096), `syncTimeoutMs` (5000) |
| `dsh-tool-workflow` / `dsh-tool-ralph` | Model-facing workflow tool; opt-in fresh-agent Ralph loop | Model access to orchestration | tool schemas |
| `dsh-goal` (`packages/goal/goal/README.md`) | Persisted one-goal-per-session service: phases `active`/`paused`/`blocked`/`complete`, CAS revisions, projection, durable `goal/change` events | Long-running personal objective across turns/restarts | `ctx.goals.get/create/edit/pause/resume/complete/block/clear`, `defaultMaxGoalRounds` (256) |
| `dsh-goal-round-driver` (`packages/goal/goal-round-driver/README.md`) | Automatic continuation rounds while idle/armed/capacity | Unattended multi-turn progress | retained `<goal_round>` prompt; `round-limit` blocker |
| `dsh-tool-goal` / `dsh-command-goal` (`packages/goal/tool-goal/README.md`) | Goal tools and `/goal` command | Model/user control of goals | `get_goal`, `create_goal`, … |
| `dsh-schedule` (`packages/schedule/schedule/README.md`) | **Scheduling**: tasks with `timing.kind` `after`/`at`/`every`/`daily`/`weekly`/`cron`/`rrule`, targets `session`/`new_once`/`new`, storage format, delivery receipts, reminder framing | Reminders and recurring personal tasks — the closest thing to a personal-assistant scheduler | config `deliveryHistoryDays` (30), `deliveryHistoryRecords` (200), `newSessionIntervalSeconds` (60); `create/edit/list/catalog/view/history/run` |
| `dsh-tool-schedule` (`packages/schedule/tool-schedule/README.md`) | `schedule_create/list/view/edit` model tools | How the model manages reminders | tool schemas |
| `dsh-jobs` + `dsh-jobs-local` + `dsh-tool-jobs` | Background job registry (`ctx.jobs`) and `job_output/list/kill` tools | Long-running commands for an assistant | `ctx.jobs` |
| `dsh-experimental-agent-team` + `dsh-experimental-tool-agent-team` (`$PKG/dsh-experimental-agent-team/README.md`; repo `packages/team/agent-team`) | Named Lead/teammates, direct inbox messages, durable shared task board with CAS revisions and write-scope hints | Multi-agent personal assistant (this build session uses it) | `ctx.agentTeams`, `maxMembers` (16), `maxTasks` (256), `maxMessageBytes` (65536) |
| `dsh-experimental-agent-team-profile` (`$PKG/dsh-experimental-agent-team-profile/README.md`) | One bundle that enables Team domain + tools + Web UI, disables ordinary `subagent`/`subagent_fork` | Turning a profile into a Team profile | `dsh plugin --profile <name> add @deepseek-ai/dsh-experimental-agent-team-profile`; rows `agent-team`, `tool-agent-team`, `ui-agent-team` |

### 3.7 Shell, filesystem, sandbox, permissions, interaction

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-sandbox` / `dsh-sandbox-local` / `-windows-acl` (`packages/sandbox/*/README.md`) | Process sandbox seam; platform backends (bwrap, Windows restricted token) | Containment for personal-machine actions | `ctx.sandbox`; platform limits |
| `dsh-sandbox-policy` (`packages/sandbox/sandbox-policy/README.md`) | One per-call file-effect policy shared by bash/fs/terminal; per-session mode switch event; model context | The model's file-write envelope | `mode` (`read-only` default), `workspaceRoot`, `additionalWritableRoots`; `ctx.sandboxPolicy`; `sandbox:policy` context |
| `dsh-fs`, `dsh-fs-local`, `dsh-fs-sandbox`, `dsh-fs-observation-policy`, `dsh-fs-patch` | `ctx.fs` seam, local/sandboxed providers, read-before-edit policy, patch parser | File access used by tools and instruction loading | `ctx.fs`; `fs/observed` |
| `dsh-shell`, `dsh-shell-env`, `dsh-bash-local`, `dsh-bash-sandbox`, `dsh-pwsh-*`, `dsh-subprocess*`, `dsh-terminal*` | Execution seams and implementations; managed `DSH_*` env | Shell capability | `ctx.shell`, `ctx.subprocess` |
| `dsh-user-approval` (`packages/interaction/user-approval/README.md`) | One-shot approval seam: policy `ask`/`never`, answerers as `approval/request` waterfall listeners, fail-closed, audit events | Pausing before risky personal actions | `ctx.approval`, `policy` (`ask`), `request`, `setPolicy`, `approval:policy` context |
| `dsh-permission-presets` (`packages/interaction/permission-presets/README.md`) | Named permission modes bundling sandbox + approval; `/permission` command; settings namespace | User-facing “how much can the assistant do” control | `presets` table, `defaultPreset`; `ctx.permissionPresets`; `permission/preset` events |
| `dsh-user-questions` + `dsh-tool-ask-user` | Human question seam and `ask_user_question` tool | Clarification UX | `ctx.userQuestions` |
| `dsh-plan-mode` (`packages/plan/plan-mode/README.md`) | Logged per-agent plan mode + `exit_plan_mode` | Approval of plans | `section` guidance |

### 3.8 Models and providers

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-llm` (`packages/llm/llm/README.md`) | Provider-neutral streaming service: `ctx.llm.stream/listModels/prepareCall/listProviders`, adapter registry, model info, failure codes, image/file projection | Model seam; where a non-DeepSeek personal model plugs in | `provider`/`model`; codes `NO_ADAPTER`, `MISSING_CREDENTIAL`, `AUTH`, `RATE_LIMIT`, `CONTEXT_WINDOW_EXCEEDED` |
| `dsh-llm-deepseek` (`packages/llm/llm-deepseek/README.md`) | DeepSeek Messages adapter; `DEEPSEEK_API_KEY`; endpoint/wire format | Default model | `deepseek-official` / `deepseek-flash` (default in base and Web docs) |
| `dsh-llm-pi-ai` (`packages/llm/llm-pi-ai/README.md`) | Multi-provider pi-ai twin, dormant until `llm-pi-ai:` settings profiles supply routes | Adding other providers without code | settings section `llm-pi-ai` |
| `dsh-llm-retry` | Provider-routed retry policy at failed-step boundary | Resilience | retry policy |
| `dsh-deepseek-account*`, `dsh-deepseek-llm-api-extensions`, `dsh-llm-deepseek-api-key` | Account auth/PKCE, additive request fields, API-key auth | Credential setup | managed `$DSH_HOME/.credentials.yaml`, env |

### 3.9 MCP and web capabilities

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-mcp-client` (`packages/mcp/mcp-client/README.md`) | **MCP config guide**: one row per server, `serverName`, `transport` `stdio`/`streamable-http`, `command`/`args`/`env`/`cwd` or `url`/`headers`, timeouts, reconnect policy; tool naming `mcp__<serverName>__<rawName>`; server instructions join the system prompt | The main integration path for personal data/tools (memory servers, calendars via MCP, home automation, etc.) | `toolCallTimeoutMs` (60000), `maxInstructionBytes` (32768), `failOnStartupError`, `reconnect.{enabled,initialDelayMs,maxDelayMs,maxAttempts}` |
| `dsh-mcp-resources` (`packages/mcp/mcp-resources/README.md`) | Shared resource tools `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`; one mount per profile | Reading documents exposed by MCP servers | no config; server names from client entries |
| `dsh-web`, `dsh-web-search-deepseek`, `dsh-web-deepseek-api`, `dsh-web-fetch-http`, `dsh-tool-web` | `ctx.web` search/fetch seam and providers | Everyday research | base rows: `searchProvider: deepseek-official`, `fetchProvider: http`, `apiKeyEnv: DEEPSEEK_API_KEY` |

### 3.10 SDK, ACP, API and client seams

| Package | What the README documents | Agent-building relevance | Notable seams/config |
|---|---|---|---|
| `dsh-sdk-jsonrpc-server` (`packages/sdk/server/README.md`) | Stdio JSON-RPC serving plugin: `initialize`, `session/prompt`, `session/query`, `session/wait`, `session/resume`, native commands (`/compact`, `/permission`, `/plan`, `/goal`), user questions, shutdown; handshake identity `deepseek-harness-sdk-runtime` | Driving the assistant from another program | `maxTokensAsSuccess`; `sdkSessionActivation` |
| `dsh-sdk-protocol` | Wire protocol types shared with client SDKs | Client integration | protocol |
| `dsh-acp` (`packages/acp/acp/README.md`) | Automation-only ACP v1 server: sessions, model/effort config, MCP servers, prompts, cancellation, permissions; persistence across restarts | Standard-protocol automation | config `provider`, `model`, `sessionListPageSize` (100) |
| `dsh-api-gateway` (`packages/api/gateway/README.md`) | Typert Remote Host dispatcher + Client API endpoint | How the Web client reaches host services | `ctx.remote` |
| `dsh-api-*` (`packages/api/*/README.md`) | Session/workspace/job/settings/terminal controllers, remotes, remote access | Remote capabilities a custom client could expose | per-controller Remotes |
| `dsh-client-connection`, `-modules`, `-resources`, `-file-upload`, `-hmr`, `-locale`, `-shortcuts`, `-product-analytics` | Auth RPC transport, client module graph (`window.__DSH_BOOT__`), resource providers, upload, HMR, locale, shortcuts | Client embedding/shell | `ctx.remote`, boot graph |
| `dsh-client-ui-*` (68 packages) | Individual browser surfaces: chat/conversation, layout/sidebar, input triggers, tool renderer, settings pages, and feature UIs (schedule, goal, approval, agent-preset, subagent, skill, workflow-run, jobs, deliverables, model selection, permission presets) | Where a personal assistant's UI appears; preset selection UI is `dsh-client-ui-agent-preset` | `agentPresets/list`, `agentPresets/read`, settings namespace `agent-preset-registry` |
| `dsh-web-app`, `dsh-host-webserver`, `dsh-host-frontend-static`, `dsh-web-frontend` | Web bundle, route registration, SPA dist serving, built frontend entry | The GUI itself | `webStartup`, `webserver` |

### 3.11 Host/platform/utility

`dsh-host-directory-picker*`, `dsh-host-open-in-app`, `dsh-host-plugin-inventory`, `dsh-host-product-telemetry-otel`, `dsh-native-command`, `dsh-win32-process`, `dsh-http-proxy`, `dsh-atomic-write`, `dsh-lazy-require`, `dsh-output-retention`, `dsh-brand`, `dsh-deque`, `dsh-timeout`, `dsh-chunked-list`, `dsh-util-*`, `dsh-typert-*`, `dsh-cordis-*-runner`, `dsh-otel` — platform and utility layers; their READMEs are implementation/ops references rather than agent-authoring guides, except where they own a model-visible behavior.

### 3.12 Experimental packages

32 packages under `$PKG/dsh-experimental-*`. Most relevant to a personal agent: `dsh-experimental-agent-team` (multi-agent), `dsh-experimental-session-search` (search earlier sessions), `dsh-experimental-auto-review` (LLM-reviewed auto permission mode), `dsh-experimental-ralph-bundle`/`dsh-tool-ralph` (fresh-agent iteration), `dsh-experimental-voice-input-bundle`/`-speech-to-text*` (voice input), `dsh-experimental-forge*` (change requests), `dsh-experimental-liveshare*` (share a session), `dsh-experimental-plugin-market-bundle` (Discover tab), `dsh-experimental-terminal-bundle` (persistent terminals), `dsh-experimental-worktree`/`-tool-worktree`, `dsh-experimental-inspector*`/`-session-inspector`, `dsh-experimental-client-ui-*` companions. Each README states that the package is experimental with no stability promise.

## 4. Read these first (12)

1. `packages/bundle/base/README.md` — what every base-backed profile already has.
2. `packages/bundle/web-app/README.md` — Web surface; especially "Per-session agent setup" and the patch/preset split.
3. `packages/preset/agent-preset-registry/README.md` — the preset model and roster.
4. `packages/preset/agent-preset/README.md` — one preset declaration (`id` + `plugins`).
5. `packages/preset/persona/README.md` — per-agent identity row.
6. `packages/core/system-prompt/README.md` — prompt assembly, persona slots, `toolOrder`.
7. `packages/skill/skill-filesystem/README.md` — SKILL.md format + roots + ranks.
8. `packages/skill/tool-skill/README.md` — what the model sees of skills.
9. `packages/schedule/schedule/README.md` — reminders/recurrence (the assistant scheduler).
10. `packages/mcp/mcp-client/README.md` — MCP config.
11. `packages/subagent/subagent/README.md` + `packages/subagent/tool-subagent/README.md` — delegation and child presets.
12. `packages/boot/app-boot/README.md` — profile/bundle/patch composition mechanics.

Honorable mentions: `packages/goal/goal/README.md`, `packages/goal/goal-round-driver/README.md`, `packages/interaction/user-approval/README.md`, `packages/interaction/permission-presets/README.md`, `packages/interaction/commands/README.md`, `packages/core/agent/README.md`.

## 5. READMEs that are really authoring guides

| README | Format/config taught | Example in README |
|---|---|---|
| `packages/skill/skill-filesystem/README.md` | `SKILL.md`/`<name>.md` skill bundles, frontmatter keys, invocation policy, root precedence | Root/rank table; frontmatter rules |
| `packages/skill/tool-skill/README.md` | Catalog + `<skill_content>` rendering, `/name` gesture | Catalog and result templates |
| `packages/preset/agent-preset/README.md` + `registry` | Preset declaration YAML (`id`, `plugins`, `order`), default selection, editing via bundle patch | Minimal registry + preset YAML |
| `packages/preset/persona/README.md` | Persona row fields and shadowing rules | Persona YAML example |
| `packages/core/system-prompt/README.md` | Config keys + section/variable registration API | YAML + `ctx.systemPrompt.section({...})` |
| `packages/context/agent-instructions/README.md` | `AGENTS.md` discovery/budget config | `maxBytes: 65536` example |
| `packages/schedule/schedule/README.md` | Seven timing kinds incl. five-field Cron and bounded RRULE (`DTSTART` + `RRULE` lines), three targets | JSON task envelope, cron/rrule examples |
| `packages/mcp/mcp-client/README.md` | MCP server rows (stdio + streamable HTTP) | Two full YAML rows |
| `packages/subagent/tool-subagent/README.md` | Delegation tool options, child preset allowlist, model selection | Config field table |
| `packages/subagent/subagent/README.md` | Service composition and provider contract | Minimal YAML |
| `packages/workflow/workflow/README.md` | JS orchestration script body + hooks | `parallel([...])` script |
| `packages/interaction/commands/README.md` | Command registration and `/command input` grammar | `register({...})` sample |
| `packages/core/tools/README.md` | `defineTool` authoring, schema DSL, guards | `read_file` tool example |
| `packages/bundle/base/README.md` | Minimal custom-profile `package.json` | `dsh.profile.bundles` example |
| `packages/boot/app-boot/README.md` | Profile dirs, bundle patches, user `.env`/`cordis.patch.yml`, compatibility/exemptions | Examples + failure table |
| `packages/team/agent-team/README.md` | Team setup limits/roster/tasks | Smallest Team YAML |
| `packages/skill/skill-office/README.md` | Progressive skill routing and asset dirs | Flow diagram, config |
| `packages/core/agent-loop/README.md` | Declarative `config.agents` startup entries | `agents: [{id, provider, model, …}]` example |

## 6. How a personal-agent profile is composed

This section is grounded in `dsh-official-bundles`, `dsh-base`, `dsh-web-app`, `dsh-app-boot`, `dsh-agent-preset*`, `dsh-persona`, `dsh-system-prompt`, `dsh-skill-filesystem` READMEs plus the `--dump-default-config` output and the live profile files on this machine.

### 6.1 A profile is an ordered stack of bundle patch layers plus user patches

From `packages/boot/app-boot/README.md` ("Profiles"):

- A profile lives at `$DSH_HOME/profiles/<name>` and is described by its `package.json` `dsh.profile.bundles` list (ordered) plus the profile's own `cordis.patch.yml`.
- Each bundle declares `dsh.bundle.patch` — one patch file or an ordered list. `dsh-base` declares `"./cordis.patch.yml"`; `dsh-web-app` declares five files in this order: `./cordis.patch.yml`, then `./presets/standard.patch.yml`, `./presets/ptc.patch.yml`, `./presets/minimal.patch.yml`, `./presets/cordis.patch.yml`.
- The profile root `cordis.yml` is an empty entry list (`[]`); the tree is composed as patches. Application order: every bundle layer in `dsh.profile.bundles` order, then the profile's `cordis.patch.yml`, then the home-level `$DSH_HOME/cordis.patch.yml`, then any `--patch` overlays.
- Patch semantics: `- insert:` appends rows; `- id: <row>` replaces that row's **whole** `config` (no deep merge); `!!js` expressions are evaluated at boot; `disabled:` toggles rows. A patch naming a missing row warns; an empty/comments-only user patch file fails boot (use `[]` to disable the layer).
- Copy/replace a shipped template: `dsh --profile <name> --from-default-profile web`. Add a bundle: `dsh plugin --profile <name> add <package>`.

Evidence from this machine (`~/.dsh/profiles/web/`): `cordis.yml` contains `[]`; `package.json` lists `dsh.profile.bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", …]` followed by third-party/experimental bundles; `cordis.patch.yml` overrides rows by id (e.g. `connection`, `llm-pi-ai`, `agent-default-model`) and inserts third-party rows. The home layer `~/.dsh/cordis.patch.yml` documents itself as applying after every profile patch and lists the same wholesale-replacement caveat.

### 6.2 Shipped profile templates and their layers

Exact data from `@deepseek-ai/dsh-official-bundles` (`PROFILE_TEMPLATES` in `$PKG/dsh-official-bundles/lib/index.js`):

| Template | Ordered bundle layers |
|---|---|
| `web` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` |
| `headless` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless` |
| `acp` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-acp-app` |
| `sdk` | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-sdk-app` |
| `sdk-minimal` | `@deepseek-ai/dsh-sdk-minimal` (standalone; deliberately no `dsh-base`) |

Also exported: `DEFAULT_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base"]` (what `dsh plugin` initializes for an unknown name), `INSTALLATION_OWNED_PROFILE_TUPLES`, and `RETIRED_BUNDLES` (currently `@deepseek-ai/dsh-experimental-schedule-bundle`). Optional/on-demand/experimental bundle lists live in the same package; they are compiled into the installation, so a profile cannot extend those lists.

### 6.3 What `dsh-base` contributes process-wide

`$PKG/dsh-base/cordis.patch.yml` is one `insert` list. Rows a personal agent inherits without extra bundles (selected facts):

- Model/LLM: `llm`, `llm-retry`, `agent-default-model` (`provider: deepseek-official`, `model: deepseek-flash`), dormant `llm-pi-ai`, DeepSeek account/credentials/authorization.
- Sessions/state: `session`, `session-persistence-jsonl` (`root: $DSH_HOME/sessions`), `attachment-local`, `session-query-sqlite` (`path: ':memory:'`, `openAt: never`), projection/working-directory rows, `session-checkpoint-policy`, spill + compaction rows.
- Agent plane: `agent`, `agent-loop`, `system-prompt`, `tools`, `tool-executor-native`, `agent-instructions` (`maxBytes: 65536`), `skill` + `skill-filesystem` + `tool-skill`, `commands`, `plan-mode`, `goal` + `goal-round-driver` + `command-goal`, `subagent` + both in-process providers + both delegation tools, `workflow-ptc` + `tool-workflow`, `tool-bash`/`tool-pwsh`, `tool-fs`/`tool-fs-search`, `tool-jobs`, `tool-todo`, `tool-goal`, `tool-web`, `mcp-resources`, `present` is not in base (it is a preset row), `repeat-tool-reminder`.
- Policy: `sandbox-policy` (`mode: $DSH_PERMISSION_MODE ?? 'workspace-write'`, `workspaceRoot: process.cwd()`), `approval` (`policy: 'ask'`, `never` under danger-full-access), `permission` presets `read-only`/`workspace-write`/`danger-full-access`, sandboxed bash/fs providers (`fs-sandbox`, `bash-sandbox`/`pwsh-sandbox`).
- Web capability: `web` (`searchProvider: deepseek-official`, `fetchProvider: http`), `web-search-deepseek`, `web-deepseek-api`, `web-fetch-http`, `tool-web`.

### 6.4 `dsh-web-app` moves the agent plane behind presets

The web bundle is the key structural fact for a personal agent: it disables most base agent-plane rows and re-declares them inside per-preset declarations, so **what the assistant is (persona, tools, skills, delegation) is decided per session by a preset**, not globally by the bundle.

Rows the web overlay disables (from `$PKG/dsh-web-app/cordis.patch.yml`): `tool-plugin-manager`, `tool-bash`, `tool-pwsh`, `tool-jobs`, `tool-fs`, `tool-fs-search`, `skill-filesystem`, `tool-skill`, `command-goal`, `tool-goal`, `plan-mode`, `compaction-basic`, `command-compact`, `tool-result-pruner`, `tool-subagent-control`, `tool-subagent`, `tool-subagent-fork`, `workflow-ptc`, `tool-workflow`, `agent-instructions`, `tool-todo`, `tool-web`.

It then restates base values it owns (`system-prompt.personaPrefix` = `You are a coding agent powered by the {{model}} model.`, `session-query-sqlite` in-memory/never), inserts web host rows (webserver, web-runtime, connection, `modules` browser roster, `ui-*` pages, `schedule` service row, `ui-schedule`, `agent-preset-registry` with `default: standard`), and each `presets/<id>.patch.yml` inserts one `@deepseek-ai/dsh-agent-preset` declaration.

Shipped roster (from the four preset patch files): `standard` (order 1, default), `ptc` (order 2), `minimal` (order 3), `cordis` (order 4). Every preset except `minimal` composes, in its `plugins` list: a `persona` row (`prefix: You are a coding agent powered by the {{model}} model.`), `agent-instructions` (`maxBytes: 65536`), `time-context`, `tool-bash`/`tool-pwsh`, `tool-fs` (+`tool-fs-search`), `tool-jobs`, `tool-schedule`, `skill-filesystem` (+`tool-skill`), `command-goal` + `tool-goal`, a `planning` group (`plan-mode`), a `compaction` group (`compaction-basic`, `command-compact`, `tool-result-pruner` 8192/4096/1024), a `delegation` group (`tool-subagent-control`, `tool-subagent` spawn with `modelSelection`/`modelDiscovery`, `tool-subagent-fork`, `workflow-ptc`, `tool-workflow`), `tool-ask-user`, `tool-todo` (`allowParallelInProgress: true`), `tool-web` (`fetch: true`, `searchTimeoutMs: 60000`), `present`, and conditional plugin-manager/market tools.

`minimal` differs materially: persona `prefix: You are a helpful software engineer assistant.` with `complete: true` and `includeRuntimeContext: false`; `tool-fs` with `read: false`, `write: false`, `edit: false`, `readImage: true`; a persistent-shell group (`terminal`, `terminal-bash`, `tool-bash-persistent`, and pwsh twins, `timeoutMs: 300000`); compaction only; no agent-instructions, skills, scheduling, jobs, goals, subagents or web tools.

The `cordis` (Creator) preset adds the preset-authoring toolset and mounts the skills shipped in `@deepseek-ai/dsh-agent-preset` by appending that package's `skills/` directory to `skill-filesystem.customSkillDirs` via a `createRequire(...)` expression, plus `tool-cordis` and plugin manager/market tools.

Per-session selection: the Web README says "Each browser session selects a shipped preset (`standard` by default). The Agent presets settings page changes the default and edits preset child plugins; saves persist in `$DSH_HOME/profiles/web/cordis.patch.yml`." The registry README adds that a session log retains the preset id (`agent-preset/selected`), new sessions resolve the user's `selectedDefault` over the deployment `default`, and resume uses the current definition of the same id.

### 6.5 Persona: three layers, one slot

1. **Deployment persona** — `dsh-system-prompt` config `personaPrefix` / `personaSuffix`, rendered as sections `deployment:persona-prefix` (order 0) and `deployment:persona-suffix` (order 10200). The web bundle sets the prefix to a coding-agent sentence; the opt-in harness identity is `You are an AI agent powered by DeepSeek Harness.` (order −1000).
2. **Per-agent persona** — a `@deepseek-ai/dsh-persona` row mounted inside a preset's `plugins`. It registers the same section names with agent scope, so it **shadows** the deployment persona for that session. Fields: `prefix` (required), `suffix`, `complete`, `includeRuntimeContext`. Templates interpolate prompt variables (`{{model}}` is supplied by the loop); custom templates must not use a `{{cwd}}` variable (there is no built-in `{{cwd}}`; the working-directory service supplies directory context separately).
3. **Complete-prompt mode** — `complete: true` keeps only the rendered prefix as the system prompt and suppresses identity/suffix/tool-guidance/listener text. `includeRuntimeContext: false` suppresses optional runtime context; required context (e.g. current working directory) remains.

For a personal assistant, the shortest path is a preset with a `persona` row whose `prefix` is the assistant identity (or `complete: true` for total control), mounted in place of / alongside a shipped preset.

### 6.6 Skills attach through a filesystem provider inside the preset

`skill-filesystem` is mounted per preset by shipped presets, with `customSkillDirs` only in `cordis`. A personal skill therefore needs no patch: drop `<name>/SKILL.md` in a scanned root — `<project>/.dsh/skills`, `<project>/.agents/skills`, `$DSH_HOME/skills`, `~/.agents/skills` — and it appears in the session catalog (watched; frontmatter must be valid or the file is skipped with a warning). Adding a directory of personal skills elsewhere is a one-row patch: an `id:`-targeted override of `skill-filesystem` with `customSkillDirs: [...]` (restating every other key you want, since a patch replaces the whole config). `dsh-skill` merges providers; `dsh-tool-skill` renders the catalog and the `skill` tool and handles the user `/name` gesture.

### 6.7 Standing instructions attach as files, not config

`agent-instructions` (enabled in base and in every preset except `minimal`) loads `$DSH_HOME/AGENTS.md`, then `<agentsHome>/AGENTS.md` (default `~/.agents`), then the project chain from the project root (nearest ancestor with `.git`) down to the session cwd, with `AGENTS.local.md`/`CLAUDE.local.md` overlays. Budget: separate 65,536-byte caps for the user-global and project chains. Refresh is touch-driven: edits become visible after the next successful `read`/`write`/`edit` or on resume; shell `cd` does not trigger discovery.

### 6.8 Where a personal-assistant capability plugs in

| Need | Seam / row | How it attaches |
|---|---|---|
| Identity, tone, boundaries | `dsh-persona` row in a preset; or `system-prompt.personaPrefix/personaSuffix` | preset `plugins` (preferred) or profile patch by row id |
| Standing instructions | `AGENTS.md` chain (`dsh-agent-instructions`) | files only; config only tunes budgets/candidates |
| Reusable procedures | skills (`dsh-skill-filesystem` + `SKILL.md`) | files under scanned roots or `customSkillDirs` |
| Personal data/tools | `dsh-mcp-client` rows | profile patch `insert:` one row per server |
| Reminders / recurring tasks | `dsh-schedule` service + `tool-schedule` + `ui-schedule` | service row inserted by the web bundle; tool row lives in presets |
| Long-running objective | `dsh-goal` + `dsh-goal-round-driver` + `tool-goal`/`command-goal` | base rows; presets mount the tools |
| Helpers / parallel work | `dsh-subagent` + provider + `tool-subagent` (`agentPreset`, `maxDepth`, `modelSelection`) | preset `delegation` group |
| Scripted fan-out | `dsh-workflow-ptc` + `tool-workflow` | preset `delegation` group |
| Slash commands | `ctx.commands.register(...)` (`dsh-commands`) | plugin row; browsable in Web command UI |
| Permission posture | `dsh-permission-presets` + `dsh-user-approval` + `dsh-sandbox-policy` | base rows; user switches via `/permission` or settings |
| UI surface | Web bundle UI rows / new `dsh-client-ui-*` package | bundle layer; presets change only agent capabilities |
| Model choice | `dsh-agent-default-model`, `dsh-llm` adapters, `llm-pi-ai` settings | profile patch by row id / settings UI |

### 6.9 The composition, in one paragraph

A personal-agent profile is: `dsh-base` (model, sessions, tools, policy) → a surface bundle (normally `dsh-web-app`, which moves the agent plane into preset declarations) → zero or more extra bundles (personal/third-party, ordered after the surface) → the profile's `cordis.patch.yml` (row overrides/inserts such as MCP servers, model routes, `agent-default-model`, extra skill dirs) → `$DSH_HOME/cordis.patch.yml` (home-wide overrides) → `--patch` overlays. The agent's *identity and capability set* live in the selected **agent preset** (`dsh-agent-preset` row: `id` + `plugins`), and the user picks it per session; the assistant persona is a `dsh-persona` row inside that preset. Consequently, "build a personal assistant" = add or override a preset declaration (persona + tools + skills + schedule/goal/subagent rows) and add the data/integration rows via a profile patch, not write a new app. **(inference on the recommended recipe, from the facts above.)**

## 7. Assistant-adjacent shipped features

These implement end-user product behaviors rather than infrastructure:

- `dsh-schedule` + `tool-schedule` + `dsh-client-ui-schedule` — reminders, recurring tasks, an Automation tasks page, Run now, delivery receipts. The nearest shipped equivalent of a personal-assistant scheduler.
- `dsh-goal` + `dsh-goal-round-driver` + `tool-goal` + `command-goal` + `dsh-client-ui-goal` — one persisted long-running objective per session with unattended continuation rounds.
- `dsh-subagent*`, `dsh-workflow*`, `dsh-experimental-agent-team*` — delegation, orchestration, and a Lead/teammates/task-board collaboration model.
- `dsh-experimental-session-search` + `dsh-tool-session-query` — “search and read earlier sessions from the current workspace” (read-only, off by default, in-memory index).
- `dsh-session-reference` — `@[label](dsh-session:<base64url-id>)` mentions that inject a bounded untrusted snapshot of another session as context.
- `dsh-action-cards` + `dsh-creation-recommendations` + `dsh-personalized-recommendations` (+ client UI halves) — the model can propose one optional card below an answer; "Personalized pages" runs a background Creator subagent that authors and installs a new interface plugin into the profile, with Keep/Undo/Restore. Off by default.
- `dsh-skill-office`, `dsh-office-to-pdf`, `dsh-tool-present`, `dsh-deliverable-file-references`, `dsh-client-ui-deliverables` — document authoring/rendering and final-file delivery.
- `dsh-experimental-voice-input-bundle`, `dsh-experimental-speech-to-text*` — voice input.
- `dsh-message-feedback`, `dsh-session-log-export`, `dsh-session-title*`, `dsh-host-product-telemetry-otel` — feedback, export, titles, telemetry.

## 8. Gaps: what no shipped package documents for personal-assistant needs

1. **No assistant profile template or assistant persona.** Every shipped preset/system-prompt persona is a *coding* agent (`You are a coding agent powered by the {{model}} model.`; minimal: `You are a helpful software engineer assistant.`). `PROFILE_TEMPLATES` contains only `web`, `headless`, `acp`, `sdk`, `sdk-minimal` — no assistant bundle and no documented "replace the coding persona" recipe beyond authoring a preset.
2. **No long-term memory or personal knowledge store.** There is no memory service, vector store, embedding provider, or "facts about the user" package in the 319 `dsh-*` packages. The memory-adjacent pieces are: session logs (durable), `dsh-session-query` (search across sessions; FTS off by default with `openAt: never`), `dsh-experimental-session-search` (experimental, read-only, in-memory, off), `dsh-session-reference` (explicit snapshots, not automatic recall), and MCP servers (the MCP client README points at an external "memory MCP" guide that is not shipped in the package tree). Nothing documents consolidation, decay, dedupe, or user-profile learning.
3. **No channel/notification delivery.** Scheduled reminders can only be delivered into Sessions (`session`, `new_once`, `new` targets); the delivery is a user-role message inside DSH. No email/SMS/chat/push/calendar/OS-notification adapter exists in the installed tree, and the READMEs give no seam for out-of-band delivery. The Host must be running; after restart a recurring task sends only its latest missed occurrence; `new` targets are floored at 60 s (`newSessionIntervalSeconds`); delivery is at-least-once.
4. **No personal integrations.** No calendar, contacts, email, weather, home-automation, notes, or task-manager package. `dsh-tool-todo` is a session-scoped todo list rendered by the tool, not a durable personal task store. Everything personal-data-shaped arrives via MCP or a custom tool package.
5. **No permission memory / standing grants.** `dsh-user-approval` supports exactly `ask`/`never` and one-shot `allowed-once`; no `allow-always`, remembered rule, revocation, or grant store. A personal assistant cannot ask "remember this choice".
6. **No proactive trigger model.** Scheduling is the only timer; goals continue only while `armed` and only after a human-authorized resume following restart/fork; there is no wake-on-event (file change, incoming message, webhook). `dsh-hmr`/watchers are config-only, not agent triggers.
7. **No assistant-facing prompt editing/UI.** `dsh-system-prompt` states: "Deployment-authored prompt text is config/composition only … there is no end-user prompt-editing API." Persona changes require a preset row or profile patch. The Web "Agent presets" page is read-only for configuration (viewer opens declared YAML); authoring is guided through Creator mode.
8. **Skill format limits.** Discovery is one level deep (`<root>/<name>/SKILL.md` or `<root>/<name>.md`), `whenToUse` is not rendered, loaded bodies have no size cap, bodies are unversioned, and invalid skills disappear with only a warning (the model cannot distinguish absent from invalid). Project root is only the nearest `.git` ancestor.
9. **Instruction loading is not a watcher.** `AGENTS.md` changes are reconciled on the next first-party `read`/`write`/`edit`, resume, or pre-step restore — not continuously; `@path` imports and `.claude/rules/` are not interpreted; bash `cd` does not discover nested files.
10. **MCP gaps.** No MCP prompt templates, no resource subscriptions, no task-based execution extension, image is the only durable rich-result bridge, and startup/discovery timeouts are the SDK's 60 s (not configurable). Resources are on-demand only.
11. **Delegation/team limits.** Subagent `sendMessage()` needs an exact live sender and exact adjacency; no durable parent mailbox, no cross-process continuation, no replay of accepted-but-unlogged messages; external backends execute once. Agent Teams is one process, one shared checkout, flat roster, no automatic task-owner release, whole-view broadcasts, and explicitly experimental.
12. **Workflow limits.** Foreground collection only, no journaling/resume, no saved or nested workflows, no token-budget vocabulary, runs are holder-owned.
13. **Goal limits.** State but not scheduling; round count is not a resource budget; no independent evaluator; one goal per session; disarmed after session start; no abnormal auto-retry.
14. **No packaged subsystem docs.** READMEs repeatedly link to `docs/subsystems/*.md`, `docs/config-catalog.md`, `docs/tool-catalog.md`, and `.agents/notes/*`; none of those ship in the package tree, so the exhaustive field lists/service APIs are only reachable through `dsh --dump-config-schema` or the repo.
15. **Client extensibility is product-shaped.** The 68 client packages document their own surfaces, but no shipped README provides a "third-party client plugin / slot" authoring guide; the documented way for a user to get a new UI is Creator mode (`creation-recommendations`), which installs a generated plugin bundle into the profile (and is off by default, experimental, and needs a non-read-only session).

## 9. Appendix A — full package inventory by area (name-based partition of 319 `@deepseek-ai/dsh-*` packages)

**Bundles, profiles, boot, plugin management (20):** `base`, `web-app`, `headless`, `sdk-app`, `sdk-minimal`, `acp-app`, `official-bundles`, `app-boot`, `cmdline`, `launch-environment`, `package-manifest`, `home-paths`, `hmr`, `config-editor`, `plugin-manager`, `plugin-detail`, `plugin-market`, `plugin-market-index`, `plugin-package-inventory-deepseek`, `plugin-recommendations`.

**Agent core, prompt, context (27):** `agent`, `agent-loop`, `agent-default-model`, `agent-tool-presentation`, `agent-preset`, `agent-preset-registry`, `persona`, `system-prompt`, `scope`, `session`, `tools`, `commands`, `command-compact`, `command-feedback`, `command-goal`, `settings`, `authorization`, `credentials`, `credentials-local`, `working-directory`, `agent-instructions`, `time-context`, `tmux-context`, `harness-dev-context`, `file-reference`, `file-reference-local`, `anonymous-user-id`.

**Skills (4):** `skill`, `skill-filesystem`, `skill-badge`, `skill-office`.

**Tools & execution (23):** `tools` (also listed above), `tool-ask-user`, `tool-bash`, `tool-bash-persistent`, `tool-call-timeout-policy`, `tool-cordis`, `tool-executor-native`, `tool-executor-ptc`, `tool-fs`, `tool-fs-search`, `tool-present`, `tool-pwsh`, `tool-pwsh-persistent`, `tool-session-query`, `tool-skill`, `tool-str-replace-editor`, `tool-terminal`, `tool-todo`, `tool-web`, `tool-working-directory`, `tool-workspace-dependencies`, `repeat-tool-reminder`, `ptc-runtime`, `ptc-runtime-node`.

**Shell, filesystem, sandbox, interaction (23):** `shell`, `shell-env`, `bash-local`, `bash-sandbox`, `pwsh-local`, `pwsh-sandbox`, `fs`, `fs-local`, `fs-sandbox`, `fs-observation-policy`, `fs-patch`, `sandbox`, `sandbox-local`, `sandbox-policy`, `sandbox-windows-acl`, `subprocess`, `subprocess-local`, `terminal`, `terminal-bash`, `user-approval`, `permission-presets`, `user-questions`, `plan-mode`.

**Sessions, state, storage (43):** `session`, `session-checkpoint-policy`, `session-format`, `session-format-catalog`, `session-format-v0-to-v1`, `-v1-to-v2`, `-v2-to-v3`, `-v3-to-v4`, `session-log-deepseek`, `session-log-export`, `session-persistence`, `session-persistence-jsonl`, `session-projection`, `session-projection-cache`, `session-query`, `session-query-sqlite`, `session-reference`, `session-stats`, `session-telemetry`, `session-telemetry-otel`, `session-title`, `session-title-all-prompts-llm`, `session-title-first-prompt-llm`, `session-title-llm`, `session-turn-outline`, `storage`, `storage-domain`, `storage-json`, `spill`, `spill-local`, `spill-policy`, `compaction`, `compaction-basic`, `compaction-image-offload`, `compaction-tool-result-pruner`, `attachment`, `attachment-local`, `token-meter`, `message-feedback`, `message-quotes`, `workspace`, `workspace-changes`, `otel`, `deliverable-file-references`.

**Delegation & autonomy (17):** `subagent`, `subagent-spawn-in-process`, `subagent-fork-in-process`, `tool-subagent`, `tool-subagent-control`, `workflow`, `workflow-ptc`, `tool-workflow`, `goal`, `goal-round-driver`, `tool-goal`, `schedule`, `tool-schedule`, `jobs`, `jobs-local`, `tool-jobs`, `tool-ralph`.

**LLM & providers (9):** `llm`, `llm-deepseek`, `llm-deepseek-account`, `llm-deepseek-api-key`, `llm-pi-ai`, `llm-retry`, `deepseek-account`, `deepseek-account-platform`, `deepseek-llm-api-extensions`.

**Web & network (4):** `web`, `web-search-deepseek`, `web-deepseek-api`, `web-fetch-http`.

**MCP (2):** `mcp-client`, `mcp-resources`.

**SDK / ACP runtimes (3):** `acp`, `sdk-jsonrpc-server`, `sdk-protocol`.

**API / Remote (10):** `api-account-controller`, `api-gateway`, `api-job-controller`, `api-remote-access`, `api-remotes`, `api-session-controller`, `api-settings-controller`, `api-terminal-controller`, `api-workspace-controller`, `api-workspace-files`.

**Client UI (68):** `client-connection`, `client-file-upload`, `client-hmr`, `client-locale`, `client-modules`, `client-product-analytics`, `client-resources`, `client-shortcuts`, `client-ui-action-cards`, `client-ui-agent-preset`, `client-ui-approval`, `client-ui-attachment`, `client-ui-brand-official`, `client-ui-chat`, `client-ui-commands`, `client-ui-context-menu`, `client-ui-conversation`, `client-ui-cordis`, `client-ui-creation-recommendations`, `client-ui-deliverables`, `client-ui-directory-picker-browse`, `client-ui-directory-picker-native`, `client-ui-entry-customization`, `client-ui-file-actions`, `client-ui-file-drag`, `client-ui-goal`, `client-ui-input-trigger`, `client-ui-jobs`, `client-ui-layout`, `client-ui-message-feedback`, `client-ui-model-selection`, `client-ui-open-in-app`, `client-ui-permission-presets`, `client-ui-plan`, `client-ui-plugin-manager`, `client-ui-plugin-market`, `client-ui-plugin-recommendations`, `client-ui-reference`, `client-ui-renderer`, `client-ui-schedule`, `client-ui-secret-mask`, `client-ui-session`, `client-ui-settings`, `client-ui-settings-account`, `client-ui-settings-agent-loop`, `client-ui-settings-general`, `client-ui-settings-models`, `client-ui-settings-plugin-inventory`, `client-ui-settings-plugins`, `client-ui-settings-session-log`, `client-ui-settings-shell`, `client-ui-settings-subagent`, `client-ui-settings-web-search`, `client-ui-shortcuts`, `client-ui-sidebar`, `client-ui-sidebar-browser`, `client-ui-sidebar-documentpreview`, `client-ui-sidebar-files`, `client-ui-sidebar-right`, `client-ui-sidebar-terminal`, `client-ui-skill`, `client-ui-subagent`, `client-ui-theme`, `client-ui-tool`, `client-ui-trajectory`, `client-ui-user-questions`, `client-ui-workflow-run`, `client-ui-workspace`.

**Host, platform, utilities (30):** `host-directory-picker`, `-auto`, `-browse`, `-native`, `host-frontend-static`, `host-open-in-app`, `host-plugin-inventory`, `host-product-telemetry-otel`, `host-webserver`, `web-frontend`, `cordis-client-runner`, `cordis-host-runner`, `typert-loader`, `typert-protocol`, `typert-registry`, `util-code-language`, `util-crypto`, `util-time`, `util-values`, `util-workspace-path`, `atomic-write`, `brand`, `chunked-list`, `deque`, `http-proxy`, `lazy-require`, `native-command`, `output-retention`, `timeout`, `win32-process`.

**Product / assistant-adjacent (4):** `action-cards`, `creation-recommendations`, `personalized-recommendations`, `office-to-pdf`.

**Experimental (32):** `experimental-agent-team`, `experimental-agent-team-profile`, `experimental-api-speech-to-text`, `experimental-auto-review`, `experimental-badge-skill-bundle`, `experimental-client-ui-agent-team`, `experimental-client-ui-cot-translation`, `experimental-client-ui-forge`, `experimental-client-ui-stats`, `experimental-client-ui-voice-input`, `experimental-cot-translation-bundle`, `experimental-forge`, `experimental-forge-bundle`, `experimental-forge-github`, `experimental-forge-session`, `experimental-inspector`, `experimental-inspector-profile`, `experimental-liveshare`, `experimental-liveshare-protocol`, `experimental-plugin-market-bundle`, `experimental-ralph-bundle`, `experimental-session-inspector`, `experimental-session-search`, `experimental-session-titles-bundle`, `experimental-speech-to-text`, `experimental-speech-to-text-sensevoice`, `experimental-terminal-bundle`, `experimental-tool-agent-team`, `experimental-tool-worktree`, `experimental-translator`, `experimental-voice-input-bundle`, `experimental-worktree`.

Counts are a name-based partition of the 319 `dsh-*` packages made for navigation; a few packages legitimately belong to two areas (e.g. `tools`, `session`, `web-app`), which is why the narrative tables may mention a package in more than one place.

## 10. Appendix B — citation conventions and verification notes

- Repo-relative paths above are `packages/<area>/<name>/README.md` at clone HEAD `fcc0ad4` (release `0.2.2-rc.1`). Paths verified from the clone's directory tree; e.g. `dsh-persona` → `packages/preset/persona/README.md`, `dsh-skill-filesystem` → `packages/skill/skill-filesystem/README.md`, `dsh-app-boot` → `packages/boot/app-boot/README.md`.
- Where the clone's sparse checkout does not contain a mapping (the three app bundles and `dsh-api-session-controller`), cite the installed absolute path: `$PKG/dsh-<name>/README.md` with `$PKG=/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`. Confirmed repo paths for the app bundles are `packages/bundle/{acp-app,sdk-app,sdk-minimal}/README.md`; the Agent Teams packages map to `packages/team/agent-team/README.md` and `packages/team/tool-agent-team/README.md` (their installed README headings lack the `@deepseek-ai/` prefix that the mapping script matched).
- Composed configuration facts come from `dsh --profile web --dump-default-config` (scratch `DSH_HOME`) and the shipped patch files (`$PKG/dsh-base/cordis.patch.yml`, `$PKG/dsh-web-app/cordis.patch.yml`, `$PKG/dsh-web-app/presets/*.patch.yml`, `$PKG/dsh-headless/cordis.patch.yml`, `$PKG/dsh-sdk-app/cordis.patch.yml`, `$PKG/dsh-acp-app/cordis.patch.yml`). `--dump-config-schema` additionally emits a JSON Schema of composed entries (app-boot README).
- The installed tree, the `.cache/` clone, and the existing `research/` files were not modified. This document is the only file written by this task.
- Version caveat: README facts are for `0.2.2-rc.1`; the clone may contain README revisions newer than the installed packages, but all quoted behavior was read from the installed tree, and repo-relative paths were only used for citation.
