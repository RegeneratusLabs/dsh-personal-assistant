# Official DSH Documentation Site — Map for Building a Personal Agent

**Purpose.** Map every English page of the published DSH documentation site
(<https://deepseek-harness.github.io/deepseek-harness/>) against the job of building a
*personal AI agent* on DSH 0.2.2-rc.1 — a profile/bundle that behaves like a personal
assistant: persona, skills, scheduling/autonomy, memory, approvals, custom tools and UI.
This is an index with judgement, not a substitute for the pages it points at.

**Method.**

1. Enumerated the English section of the site index saved at
   `/home/josh/projects/DSH-playground/.cache/llms.txt` (lines 105–201): **95 pages**.
2. Fetched each page's raw Markdown (`page URL − trailing slash + .md`) with `curl`.
   All 95 returned **HTTP 200**; the complete set was read (no page was skipped as
   unreachable). Four of them are generated catalogs and account for 0.8 MB of the
   2.3 MB total.
3. Read HIGH pages in full or via heading-prose-interface digests; skimmed MEDIUM pages
   (purpose paragraph, all section headings, key type/config names); for LOW pages only
   recorded what they enumerate.
4. Relevance rubric:
   - **HIGH** — directly needed to compose a personal-assistant profile: persona/system
     prompt, skills, presets/profiles/bundles, tools, subagents/teams, workflows,
     schedules/goals, approvals/permissions, memory/MCP, settings UI, Web-client UI,
     headless/SDK/ACP.
   - **MEDIUM** — supporting: sessions and persistence, storage, credentials,
     workspaces, HTTP server, model streaming, compaction, background jobs.
   - **LOW** — generated catalogs (config/tool/persistence), generated graphs marked
     "do not edit", Cordis core API references, and repo-contributor checklists.
5. Gap claims were checked against the fetched corpus (full-text greps for `persona`,
   `preset`, `memory`, `heartbeat`, `proactive`, `channel`, IM vendor names) and against
   the site's own subsystem-overview table, which references 20 subsystem pages that the
   site does not publish.

**Tallies.** 95 pages: **31 HIGH, 33 MEDIUM, 31 LOW.** Area split: Guide 9, Develop 18,
Concepts 6, Generated reference 4, Cordis API 6, Cookbook 5, Subsystems 47.

---

## Full inventory

| Page | Area | Relevance | What it gives you | URL |
|---|---|---|---|---|
| [Use the Web UI](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart.md) | Guide | HIGH | Shortest path to a working agent: Settings → Models (API key), choose a workspace (composer stays disabled until one is picked), then send a task; notes the Web UI asks before approval-gated operations. | https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart.md |
| [Configure models](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers.md) | Guide | HIGH | Model routes and the config surface a personal agent inherits: shipped provider ids (`anthropic`, `openai`, `moonshotai`, `zai`), custom provider id/base URL/protocol, keys stored as credential *references* in `$DSH_HOME/.credentials.yaml`, and per-model overrides (`compat`, `reasoningEfforts`, `input`, `modelOverrides`) written to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. | https://deepseek-harness.github.io/deepseek-harness/en/guide/providers.md |
| [Network proxy](https://deepseek-harness.github.io/deepseek-harness/en/guide/network-proxy.md) | Guide | LOW | `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`/`ALL_PROXY` handling at launch; SOCKS unsupported, loopback always direct, model-written code and telemetry stay direct. Deployment plumbing, not agent behaviour. | https://deepseek-harness.github.io/deepseek-harness/en/guide/network-proxy.md |
| [Public deployments](https://deepseek-harness.github.io/deepseek-harness/en/guide/public-deployments.md) | Guide | MEDIUM | How to expose the personal agent outside loopback: `--public-url`, `--trusted-host`, `--tls-cert`/`--tls-key`, proxy obligations (preserve `Host`, strip mount prefix, forward upgrades, rewrite cookie scope). It is a single-user launcher whose printed URL carries a process credential. | https://deepseek-harness.github.io/deepseek-harness/en/guide/public-deployments.md |
| [Python](https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk.md) | Guide | HIGH | Headless embedding: the SDK launches `dsh --profile sdk-minimal` lazily and the profile + ordered `patches` tuple *is* the application config; bundles installed with `dsh plugin`; `sdk-minimal` is a complete tree over an empty root (no `dsh-base`), so tools are opt-in. | https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk.md |
| [GitHub review sessions](https://deepseek-harness.github.io/deepseek-harness/en/guide/github-review.md) | Guide | MEDIUM | The only documented *inbound external trigger*: an opt-in overlay mounts a second `WebServer` with a signed `POST /github`, and rules create a titled root Session (`standard` preset + `read-only` permission preset) under a Workspace. Pattern to copy for any "event → new Session" channel; response is `202` and delivery state is not stored. | https://deepseek-harness.github.io/deepseek-harness/en/guide/github-review.md |
| [Session reminders](https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md) | Guide | HIGH | The reminder product surface: `schedule_create`/`list`/`update`/`delete`, an Automation tasks page that manages tasks across Sessions without activating them, daily/interval/one-shot editing, and delivery that restores the original Session. `standard`/`cordis`/`ptc` presets declare the tools + time context; `minimal` declares neither. | https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md |
| [Memory MCP](https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md) | Guide | HIGH | How a personal agent gets memory today: three default-off MCP reference configurations (Memorix, MCP Reference Memory, Engram) via `@deepseek-ai/dsh-mcp-client`, tools exposed as `mcp__<serverName>__<tool>`; DSH scrubs credential-looking and `DSH_*` vars from stdio children; **no memory server ships**; optional shared model instruction is additive to the persona. | https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md |
| [Plugin markets](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market.md) | Guide | MEDIUM | Distribution path for a personal-agent bundle: enable the experimental "Custom plugin markets" bundle to get a Discover tab and `plugin_market` tool, index JSON format (128 MiB cap, `engines.dsh` compatibility, `LocalizedText`), and the reference index generator. | https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market.md |
| [Your first Harness plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/index.md) | Develop | HIGH | The plugin contract: a TypeScript module exporting `apply(ctx)`; loaded through a `cordis.yml` overlay (`--patch`) with absolute paths; every registration is an effect cleaned up on unload; `inject` declares required services; function/object/class forms. | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/index.md |
| [Build a tool](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool.md) | Develop | MEDIUM | Minimal `defineTool` walkthrough: schema, `execute`, registration on `ctx.tools`, and calling it from a session. | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool.md |
| [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config.md) | Develop | HIGH | Every personal-agent knob should be a `Config` field: export a `Config` type plus same-named Schemastery schema, defaults on fields, fail loud at load, HMR replaces the instance; "anything two deployments may set differently must be a config field". | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config.md |
| [Package and install](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.md) | Develop | HIGH | The two manifests a personal agent ships as: a **bundle** (`dsh.bundle` → patch file) and a **profile** (`dsh.profile.bundles` order + user `cordis.patch.yml`); `dsh plugin --profile <name> add`; load order = bundle patches → profile patch → `$DSH_HOME/cordis.patch.yml`; `prepare` script for git installs. This is the delivery form of "a personal assistant". | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.md |
| [Plugin lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/index.md) | Develop | MEDIUM | Fiber state machine, dependency-driven loading, dispose semantics, HMR — what happens to a persona/tool plugin when config changes under a live session. | https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/index.md |
| [Services and dependencies](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service.md) | Develop | MEDIUM | `inject`-declared services, provide/consume, service isolation; the mechanism a personal-agent plugin uses to reach `agents`, `tools`, `llm`. | https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service.md |
| [Event system](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/events.md) | Develop | HIGH | Dispatch modes `emit`/`bail`/`serial`/`waterfall`, typed `Events` via declaration merging, "a waterfall listener must call `next()`", and the warning that `turn/*`, `step/*`, `tool/call`, `tool/result`, `compaction/*` are *session events* observed via `session/event`. This is how hooks, permission gates and observers are written. | https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/events.md |
| [Capability layering](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/index.md) | Develop | MEDIUM | The three-role design rule (Service Definition / Provider / Consumer in separate packages) with a bash worked example — how to make a personal-agent capability replaceable. | https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/index.md |
| [LLM adapter](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/llm-adapter.md) | Develop | MEDIUM | Implement `LlmAdapter.stream()`: provider-neutral request → provider call → `StreamChunk`s; `GenerateOptions`; register one adapter per route; error handling. | https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/llm-adapter.md |
| [Persistent Harness plugins](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis.md) | Develop | HIGH | The agent configuring itself: Creator mode + `plugin_manager install_bundle` writes a configuration-only bundle (the example adds `@deepseek-ai/dsh-mcp-client`) and HMR applies it to the running profile — the documented path for "add a memory server / new tool" from a prompt. | https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis.md |
| [Cordis tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/index.md) | Develop | MEDIUM | Keyless, 7-chapter Cordis course built outside the harness (setup, plugin shapes, TypeScript notes); the on-ramp if the personal agent needs hand-written plugins. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/index.md |
| [1. Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/01-first-plugin.md) | Develop | LOW | `apply`/`ctx`, composing an app in YAML, running it, the other two plugin shapes. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/01-first-plugin.md |
| [2. Lifecycle and effects](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/02-lifecycle-and-effects.md) | Develop | LOW | Effects as reversible registrations; fiber state machine; `ctx.effect()` disposers for timers/connections. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/02-lifecycle-and-effects.md |
| [3. Services](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services.md) | Develop | LOW | Provide a service, consume with `inject`, optional dependencies, naming. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/03-services.md |
| [4. Events](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/04-events.md) | Develop | LOW | Declare/emit/listen, dispatch modes, waterfall transform-or-short-circuit. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/04-events.md |
| [5. Configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/05-config.md) | Develop | MEDIUM | Config block per YAML entry, schema-before-`apply`, fail loud, `Volatile` fields, computed values — the same pattern every personal-agent plugin needs. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/05-config.md |
| [6. Composition and HMR](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/06-composition-and-hmr.md) | Develop | LOW | Entry metadata beyond name/config, hot replacement, diagnosing a plugin that never loads. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/06-composition-and-hmr.md |
| [7. Into the harness](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/07-into-the-harness.md) | Develop | MEDIUM | Registers a model-callable tool through the real `ctx.tools` pipeline and observes `tool/result` — bridge from Cordis drills to an actual agent capability. | https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/07-into-the-harness.md |
| [Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md) | Concepts | HIGH | The whole-product map: **profiles** (`web`, `headless`, `sdk`, `sdk-minimal`, `acp`, `dsh --profile <name>`) vs **bundles** (`dsh.profile` / `dsh.bundle` in `package.json`); turn = zero-or-more steps; three event domains (session / agent / capability); seams; "where new behavior goes"; one paragraph on experimental `ctx.agentTeams`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md |
| [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer.md) | Concepts | MEDIUM | Five ideas, dispatch modes, waterfall semantics, loader configuration, practical rules. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer.md |
| [Capability services](https://deepseek-harness.github.io/deepseek-harness/en/reference/capability-seams.md) | Concepts | LOW | Generated graph (marked do-not-edit) of every `ctx` service with owning declaration package, implementations and consumers. Consult to find *which package* owns a seam, not for guidance. | https://deepseek-harness.github.io/deepseek-harness/en/reference/capability-seams.md |
| [Agent lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/reference/agent-lifecycle.md) | Concepts | LOW | Generated sequence diagrams for turn/step lifecycle; visual companion to Architecture's turn flow. | https://deepseek-harness.github.io/deepseek-harness/en/reference/agent-lifecycle.md |
| [Tool execution](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-execution-pipeline.md) | Concepts | LOW | Generated graph of the guarded tool pipeline: `tools/pre-execute` waterfall → `ctx.approval` → monotonic guards → `tools/execute` → `tools/post-execute` → UI rendering. | https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-execution-pipeline.md |
| [API Gateway](https://deepseek-harness.github.io/deepseek-harness/en/reference/api-gateway.md) | Concepts | MEDIUM | How a Host service becomes callable from the browser: `@Remote`/`@RemoteScope`, Typert descriptor generation, `/api` carrier, generation modes. Needed to expose personal-agent state to a custom UI. | https://deepseek-harness.github.io/deepseek-harness/en/reference/api-gateway.md |
| [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md) | Generated reference | LOW | 156 generated package sections of `Config` interfaces. **Do not read end-to-end**; the personal-agent-relevant sections are `dsh-persona` (`prefix`/`suffix`/`complete`/`includeRuntimeContext`), `dsh-system-prompt` (`personaPrefix`/`personaSuffix`/`includeHarnessIdentity`/`toolOrder`), `dsh-agent-preset` + `dsh-agent-preset-registry` (`default`/`selectedDefault`), `dsh-mcp-client` (stdio / streamable-http server config), `dsh-tool-schedule`, `dsh-settings`. This catalog is currently the *only* place the persona config keys are written down. | https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md |
| [Tool schemas](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog.md) | Generated reference | LOW | Generated from booted plugins: a **Tool Package Map** (model-visible tool name → package → required seams) then exact `parameters` JSON Schemas. Fastest way to see the shipped tool surface (`schedule_*`, `create_goal`, `ask_user_question`, `present`, `skill`, `session_search`, `subagent_*`, `workflow`, `job_*`, `plugin_manager`, MCP resources, experimental `agent_team`). | https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog.md |
| [Persistence events](https://deepseek-harness.github.io/deepseek-harness/en/reference/persistence-catalog.md) | Generated reference | LOW | Generated fingerprints/version map of every durable session-event type (373 KB, 715 headings). Consult when writing replay/format-sensitive plugins; never as a guide. | https://deepseek-harness.github.io/deepseek-harness/en/reference/persistence-catalog.md |
| [Experimental persistence](https://deepseek-harness.github.io/deepseek-harness/en/reference/experimental-persistence-catalog.md) | Generated reference | LOW | Generated list of experimental persistence record types (1.6 KB). | https://deepseek-harness.github.io/deepseek-harness/en/reference/experimental-persistence-catalog.md |
| [Context](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context.md) | Cordis API | LOW | Cordis `Context` static members and service-store mixins. Framework internals. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context.md |
| [Events](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/events.md) | Cordis API | LOW | `EventOptions`, `DispatchMode` and listener signature internals. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/events.md |
| [Fiber](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/fiber.md) | Cordis API | LOW | Fiber class, `Effect`, `Disposable`, `EffectMeta`, error types. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/fiber.md |
| [Plugin Registry](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/registry.md) | Cordis API | LOW | `Plugin` and `Inject` shapes accepted by the loader. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/registry.md |
| [Service](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/service.md) | Cordis API | LOW | `Service` base class statics and lifecycle. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/service.md |
| [Inherited surface](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/inherited.md) | Cordis API | LOW | Inherited `ctx` members and events contributed by core, loader, HMR and timer plugins. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/inherited.md |
| [Adding a package](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-package.md) | Cookbook | LOW | Repository-contributor checklist for a new `@deepseek-ai/dsh-*` package (groups, root configs, README sections, display metadata, verification). Only relevant if contributing upstream rather than building a profile. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-package.md |
| [Adding a tool](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-tool.md) | Cookbook | HIGH | The tool-authoring contract a personal-agent capability must satisfy: `defineTool` arg validation, canonical JSON `output.schema`, `run_in_background` through `ctx.jobs`, policy via `tools/pre-execute`/`ctx.tools.guard()` instead of baking policy into the tool, PTC reachability, and `presentCall`/`presentResult`/`presentationMeta` for cards. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-tool.md |
| [Adding an LLM adapter](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-an-llm-adapter.md) | Cookbook | MEDIUM | Registration is effect-based, one adapter per provider route (duplicates throw), all-or-nothing multi-route; protocol obligations verified against two implementations. Needed only for a gateway DSH doesn't ship. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-an-llm-adapter.md |
| [Adding a settings page](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card.md) | Cookbook | HIGH | The configuration UI for a personal agent: declare `Volatile<T>` live fields, `role('secret')` keeps values out of form responses, cross-field `.check()`, `plugins.detail.actions`/`badge`/`section` contributions, and the browser half served via `dsh.client`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card.md |
| [Extension patterns](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/extension-cookbook.md) | Cookbook | HIGH | The four extension shapes with snippets — tool plugin, **hook plugin (permission-gate example** returning a decision from `tools/pre-execute`), UI plugin (`session/event` + `agent/assistant-stream`, driving input through `agent.followup()`/`steer()`), and **external protocol driver** (ACPs a wire peer to `ctx.agents`) — plus a feature→mechanism map. Best single page for "what can I add without patching the loop". | https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/extension-cookbook.md |
| [Subsystems](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/index.md) | Subsystems | MEDIUM | One-row-per-subsystem ownership table (67 rows). Use as the navigation map; it is also the evidence that 20 linked subsystem pages are not published on the site (see Gaps). | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/index.md |
| [Core](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core.md) | Subsystems | HIGH | The spine and the agent-creation API: `ctx.agentLoop.createAgent`/`resume`, the `Agent` handle (delivery, cancellation, `agent/pre-step` interception decisions), `CreateAgentOptions`, branded ids, and `ctx.agentPresets` — a registry of **YAML-declared presets** with `register(PresetDefinition)`, `mount`, `inspectCompositions`, `readDocument`, `composedPreset`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core.md |
| [Scopes](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/scope.md) | Subsystems | LOW | Scope identity/carrier vocabulary behind per-agent registry layers (a preset's registrations live in its own scope). | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/scope.md |
| [Sessions](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session.md) | Subsystems | MEDIUM | The append-only `SessionEvent` log as source of truth, `SessionEventMap`, `deriveMessages()`, live-session fork, `TurnEndReason`, plugin-contributed log-only events. Anything that must survive a reload goes here. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session.md |
| [Session query](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query.md) | Subsystems | MEDIUM | Search/read/trace over the session corpus: provider-independent filters, full-text pages, lineage, bounded event reads — the substrate for `session_search`/`session_trace`, i.e. recall over a user's past conversations. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query.md |
| [Session references](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-reference.md) | Subsystems | MEDIUM | Structured cross-session and file references prepared into messages (`SessionReferenceInput`/`Candidate`), with a stable error taxonomy. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-reference.md |
| [Session titles](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-title.md) | Subsystems | LOW | Durable latest-wins title state plus the optional async title provider. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-title.md |
| [Session projections](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-projection.md) | Subsystems | LOW | `ProjectionDefinition` units that fold committed events into one client-visible state with a consistent cut and change feed — how a custom UI reads domain state cheaply. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-projection.md |
| [Session persistence](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence.md) | Subsystems | MEDIUM | Durability seam: `SessionHandle`, the `session/flush` checkpoint, crash recovery that preserves an interrupted turn, `SessionHeader`, `CreateSessionOptions` seeding, format-refusal rules. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence.md |
| [Spill storage](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/spill.md) | Subsystems | LOW | `saveText` → opaque `SpillLocator` for oversized tool output the model can cite instead of inline. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/spill.md |
| [SessionTelemetryBackend](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-telemetry.md) | Subsystems | LOW | Canonical-event capture, sharing disclosure, `session-telemetry/record` redact waterfall. Relevant only if the personal agent reports usage. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-telemetry.md |
| [LLM streaming](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/llm-streaming.md) | Subsystems | MEDIUM | Message/`ContentBlock` model, raw `StreamChunk` protocol, compact assistant streams, adapter contract, `LlmFailure`, retry policy, `TokenUsage`, official DeepSeek request extensions. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/llm-streaming.md |
| [Token metering](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/token-meter.md) | Subsystems | LOW | `TokenMeasurement` replay snapshot for request pressure and positional pricing. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/token-meter.md |
| [System prompts](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md) | Subsystems | HIGH | Where a persona actually lives: `AssembleContext`, `PromptSection` with `name`/`order`/`text`/`interpolate`, the exported `PERSONA_PREFIX_SECTION` (`deployment:persona-prefix`) and `PERSONA_SUFFIX_SECTION` (`deployment:persona-suffix`), `PromptContext` runtime snapshots, and the `system-prompt/assemble` waterfall whose return value is authoritative. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md |
| [Compaction](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/compaction.md) | Subsystems | MEDIUM | Log-only `compaction/start|summary|end` bracket, image offload, tool-result pruning — what keeps a long-lived personal conversation inside the context window without falsifying the log. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/compaction.md |
| [Tools](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools.md) | Subsystems | HIGH | Full `ToolDefinition` fields, the unified JSON-value schema DSL, `ToolRestriction` per-scope live filtering (the right way to give one preset a smaller toolset), extensible execute waterfalls plus monotonic guards, and the tool-presentation UI vocabulary. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools.md |
| [Bash execution](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/shell.md) | Subsystems | MEDIUM | `ctx.shell` seam: `ShellExecRequest` vs resolved `Spec`, `ShellRunResult`, managed `DSH_*` env namespace, sandbox info, background `ShellProcess`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/shell.md |
| [Subprocesses](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subprocess.md) | Subsystems | LOW | Fully explicit spawn spec, offset-based output readers, exit-fact outcomes, managed env vocabulary. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subprocess.md |
| [PTY sessions](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/terminal.md) | Subsystems | LOW | Persistent terminal ids, backend/session contract, send readiness, bounded retained output. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/terminal.md |
| [Background jobs](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs.md) | Subsystems | MEDIUM | `ctx.jobs` runtime: branded `JobId`s, `running|stopping|completed|killed|failed`, producer contract, output ring, consumer views (`job_*` tools) — long-running personal-agent work that outlives a step. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs.md |
| [Filesystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/filesystem.md) | Subsystems | MEDIUM | `ctx.fs` atomic text operations, write/edit guards, the optional observation policy (read-before-edit), `FsErrorCode`, "no timeouts on file IO". | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/filesystem.md |
| [LSP navigation](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/lsp.md) | Subsystems | LOW | Four closed semantic queries on `ctx.lsp`. Developer-assistant feature, not personal-assistant core. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/lsp.md |
| [PTC runtime](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/ptc-runtime.md) | Subsystems | LOW | Execution seam behind `run_code`: program + host-function bindings, captured output, failure taxonomy. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/ptc-runtime.md |
| [Web access](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web.md) | Subsystems | MEDIUM | `ctx.web` deliberately one service with two operations (search + fetch), shared provider-selection/abort/error policy, fetch network policy — the research capability an assistant is expected to have. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web.md |
| [Skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md) | Subsystems | HIGH | The reusable-behaviour unit: `ctx.skills` layered provider registry; local discovery roots and rank (project root = nearest ancestor with `.git`, DSH home, agents home, `customSkillDirs`, optional `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR`); kebab-case names; `<name>/SKILL.md` bundles or flat `<name>.md`; `modelInvocable`/`userInvocable` policy pairs; the `<available_skills>` session catalog (name + description only, bodies loaded on demand); model-facing `skill({name})` tool. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md |
| [Workflows](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workflow.md) | Subsystems | HIGH | A model-written JavaScript orchestration script that starts subagents: `agent()`, `pipeline()`, `parallel()`, `phase()`/`log()` hooks, `WorkflowMeta.phases` as progress vocabulary, `WorkflowResult.stopReason` closed union, observe-only `workflow/*` events and durable `tool-workflow/*` chat nodes. The lever for multi-step personal tasks. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workflow.md |
| [Subagents](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md) | Subsystems | HIGH | Unified activation API over local conversations and external executions: `SubagentCapabilities`, start requests, **spawn can select an independent `agentPreset`** (omission/fork inherit the parent's composition), `sendMessage`/interrupt, durable `listChildren`/`listDescendants`, `SubagentResult`, and the `SubagentProvider` contract (Codex/Claude Code/ACP/DSH SDK each contribute one execution handle). | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md |
| [Approvals](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval.md) | Subsystems | HIGH | `ctx.approval` one-shot seam: `ApprovalRequest` (agent + tool + `callId`, deliberately no args), closed fail-closed `ApprovalOutcome` (`allowed-once`), per-session `ApprovalPolicy` `ask`/`never`, log-only `approval/asked`/`decided` audit. The safety primitive that makes an autonomous personal agent tolerable. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval.md |
| [Permission presets](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/permission-presets.md) | Subsystems | HIGH | The single user-facing safety dial: a preset bundles a sandbox mode + approval policy; shipped table `workspace-write` (= workspace-write + ask) and `danger-full-access` (= danger-full-access + never); `auto` and `custom` reserved/derived; switching writes `permission/preset` (log-only) plus knob setters; requires a confining shell executor. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/permission-presets.md |
| [Sandboxing](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox.md) | Subsystems | HIGH | `SandboxMode` (`read-only`/`workspace-write`/`danger-full-access`, filesystem effects only), reported `SandboxEnforcement` (`full`/`partial`), per-call `SandboxExecutionPolicy` rooted at the session's immutable cwd, fail-closed `SANDBOX_UNAVAILABLE`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox.md |
| [Plan mode](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/plan.md) | Subsystems | MEDIUM | Logged per-agent collaboration state: `plan/mode` event, deployment-owned `plan:policy` prompt section at order 50, stable `exit_plan_mode` tool, `/plan` command; plan approval flows through user-questions. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/plan.md |
| [User interaction](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/user-questions.md) | Subsystems | HIGH | `ctx.userQuestions` seam for "ask the human": question items/options/intents, single- vs multi-select answers with free-form `custom`, **timed questions** that let the agent continue and stay answerable later (`pending: true`, `attachWait`), and late replies appended as `user-question-reply` user messages. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/user-questions.md |
| [Human commands](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands.md) | Subsystems | HIGH | `ctx.commands` registry: plugin-authored `CommandDefinition` (`definitionId`/`name`/`description`/`input`/`recordInput`/`handler`), discovered and executed directly by adapters without creating a model message, with `CommandResult` and an optional `sourceEventSeq` link. The right place for `/journal`, `/mood`-style personal commands. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands.md |
| [Goals](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md) | Subsystems | HIGH | **Same-session** goals: `GoalRef` revision CAS, `GoalPhase`, `GoalBlockReason` codes, `maxGoalRounds`, every mutation a durable `goal/change`, round attribution on admitted user turns, activation edges for live status; `create_goal`/`update_goal` require direct-human root authority. This is the "keep working across rounds" primitive. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md |
| [Scheduled reminders](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md) | Subsystems | HIGH | Host-wide schedule: durable `schedule` storage domain bound to the original `sessionId`; mutually exclusive selectors `after_seconds`, absolute `at`, bounded `every_seconds` (≥60 s, elapsed time), `daily`/`weekly` wall-clock with explicit IANA zone, five-field `cron` (no `L`/`W`/`#`, no macros); tools `schedule_create|list|delete|update`; due tasks cold-restore the Session and queue a followup; `catalog()`/`history()` read without activating anything. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md |
| [HTTP server](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server.md) | Subsystems | MEDIUM | `ctx.webServer` named-route registry (exact → longest prefix → fallback), TLS config, index taps. The seam for adding an inbound route of your own (webhook/companion app) next to `/api`. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server.md |
| [Web Client architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-client.md) | Subsystems | HIGH | The browser side is itself a Cordis app: modules → API Gateway → Client models → UI adapters → Conversation/Slots → React; `window.__DSH_BOOT__`, generation-based reconnect. Read before adding any personal-agent UI. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-client.md |
| [Client modules](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules.md) | Subsystems | HIGH | How a UI plugin ships: declare `dsh.client` (`platform: 'web'`, optional `inject`/`immediately`) and export `./client`; the Host composes a `WebBootGraph`, serves `/plugins/??<pkg>/client.js&rev=`, and injects rows into the page index; HMR revisions are mtime/size based. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules.md |
| [Client slots](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots.md) | Subsystems | HIGH | Typed React composition: `SlotMap` declaration merging (cardinality, scope, owner props), priority/election rules, framework standard props (`useSession`, `useProjection`, `useResource`, `t`), `ctx.slots.register`/`inject`, and the shipped conversation hierarchy. Where a personal-agent chat chrome, panels and composer actions attach. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots.md |
| [Client resources](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-resources.md) | Subsystems | MEDIUM | `dsh-resource://<type>/…` addresses, provider registration, `useResource` states, pins/release — how custom UI data sources stay consistent with the page. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-resources.md |
| [Right Sidebar](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sidebar-right.md) | Subsystems | MEDIUM | Per-session docking surface: resource vs page addresses, tab-type registration and ranked claiming, `ctx.sidebarRight` navigation, document renderers, Workspace Files; layout state is memory-only ("Not built" list). | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sidebar-right.md |
| [Conversation assembly](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/conversation.md) | Subsystems | MEDIUM | Target-neutral assembly from a `SessionEventLikeEntry` window (durable events + transient assistant chunks) into Chat view nodes; Definition/typed payload/group rules — the path to a custom conversation renderer. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/conversation.md |
| [Typert](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/typert.md) | Subsystems | LOW | Remote invocation descriptors, lookup/context declarations, registry and Host Gateway plumbing under the API Gateway. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/typert.md |
| [Storage](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage.md) | Subsystems | MEDIUM | Durable non-session state: `ctx.storage` hub, backend `kv` facet, `defineDomain(spec)` with zod schemas + versions, routed `ctx.storageDomain`, `domain/changed` after durability — where personal preferences, rosters, contact lists belong. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage.md |
| [Workspaces](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workspace.md) | Subsystems | MEDIUM | `Workspace` entity (canonical path, title, ordered `sessionIds`), `ctx.workspaceRegistry`, default-workspace init, session pinning, archive admission asking what is still running. The "place" a personal agent works in. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workspace.md |
| [User settings](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/settings.md) | Subsystems | HIGH | Volatile `Config` fields projected into per-entry forms with resolved/inherited/override values and an optimistic revision; `update`/`replace`/`mutate` validate the complete Config and refuse stale revisions; every remote read uses `redactSecrets` so `role('secret')` never rides a response. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/settings.md |
| [User credentials](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/credentials.md) | Subsystems | MEDIUM | `CredentialRef` (env-name reference, never a value), per-operation `resolve` (hot update), UI-safe `describe`, provider source layers, `ctx.authorization` flows and `credentials/*` change events. Where a personal agent's third-party logins live. | https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/credentials.md |

---

## Start here for a personal agent

An ordered path that ends with a runnable personal-assistant profile. Steps 1–6 establish
the shape; 7–11 add assistant behaviour; 12–15 are UI and distribution.

1. [Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md) — know what a profile and a bundle are before writing anything.
2. [Use the Web UI](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart.md) — get a model key and a workspace; confirm the baseline agent works.
3. [Configure models](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers.md) — decide the model route; note the `cordis.patch.yml` override path and credential references.
4. [Your first Harness plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/index.md) → [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config.md) — `apply(ctx)`, `Config` + schema; the unit of everything you will add.
5. [Package and install](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.md) — turn that into a bundle and a profile you boot with `dsh --profile <name>`; learn the three-layer load order now, not later.
6. [System prompts](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md) plus the `dsh-persona` and `dsh-system-prompt` sections of [Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md) — write the persona as `deployment:persona-prefix`/`suffix` (or `personaPrefix`/`personaSuffix`), decide `includeHarnessIdentity`, `complete`, `includeRuntimeContext`.
7. [Skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md) — encode recurring personal procedures as `SKILL.md` bundles; set `modelInvocable`/`userInvocable` per skill.
8. [Permission presets](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/permission-presets.md) → [Approvals](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval.md) → [Sandboxing](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox.md) — choose the safety dial and understand fail-closed behaviour before granting autonomy.
9. [Scheduled reminders](https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md) then [the schedule subsystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md) — make it remind you; learn the selector set and the ≥60 s fixed-rate floor.
10. [Goals](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md) — multi-round persistence for one objective, with `maxGoalRounds` and blocked-reason codes.
11. [User interaction](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/user-questions.md) and [Human commands](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands.md) — how the agent asks, waits, and how you add `/`-commands.
12. [Tools](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools.md) + [Adding a tool](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-tool.md) + [Extension patterns](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/extension-cookbook.md) — add the one or two capabilities no shipped tool covers.
13. [Subagents](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md) and [Workflows](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workflow.md) — delegate and orchestrate; per-child `agentPreset` is how a delegate gets a different persona.
14. [Memory MCP](https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md) + `dsh-mcp-client` in [the config catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md) — the only supported memory route today; [Persistent Harness plugins](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis.md) shows the agent adding it to its own profile.
15. [Web Client architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-client.md) → [Client modules](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules.md) → [Client slots](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots.md), with [User settings](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/settings.md) + [Adding a settings page](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card.md) — give the agent its own face and configuration screen.
16. [Plugin markets](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market.md) and [Python](https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk.md) — distribute it, or embed it headlessly. [Subsystems](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/index.md) is the map when you need something not listed here.

---

## Per-area narrative

### Guide — the product surface (9 pages)

The guide area is thin and operational: it tells you how to start the shipped Web profile
([quickstart](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart.md)),
configure model routes
([providers](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers.md)), and
then documents exactly three extension-to-the-outside-world stories: reminders
([schedule](https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md)), a
third-party memory server
([mcp-memory](https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md)),
and GitHub pull-request webhooks
([github-review](https://deepseek-harness.github.io/deepseek-harness/en/guide/github-review.md)).
Two more pages cover deployment
([public-deployments](https://deepseek-harness.github.io/deepseek-harness/en/guide/public-deployments.md),
[network-proxy](https://deepseek-harness.github.io/deepseek-harness/en/guide/network-proxy.md)),
and two cover distribution/embedding
([plugin-market](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market.md),
[Python SDK](https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk.md)).
Signal for a personal agent: the guide assumes **one human at one browser**, and the only
push-like behaviour is the schedule service delivering a follow-up into a Session's inbox.
Nothing here introduces a chat channel, a notification transport, or a multi-user identity.

### Develop — authoring plugins, bundles and profiles (18 pages)

This is where the personal agent actually gets built, because a "personal assistant" on DSH is
a composition, not a config flag. The four basics pages give the contract
([plugin = `apply(ctx)`](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/index.md),
[`Config` + schema](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config.md),
[a tool](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool.md)) and,
critically, the
[packaging model](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.md):
a **bundle** is an npm package whose `dsh.bundle` points at a patch file, a **profile** is a
directory under `$DSH_HOME/profiles/<name>` whose `dsh.profile.bundles` orders those patches,
and the effective tree is bundles → profile patch → home patch. That is the literal shape of
"my personal assistant": one bundle with persona/skills/tools rows, one profile that stacks
it on `dsh-base`. The framework pages
([lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/index.md),
[services](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service.md),
[events](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/events.md))
supply the wiring vocabulary — `inject`, `ctx.on`, and the four dispatch modes, where
`waterfall` with a mandatory `next()` is the hook/permission-gate mechanism.
[practice/index](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/index.md)
is the design rule (three roles per capability) and
[practice/llm-adapter](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/llm-adapter.md)
covers non-shipped model gateways.
[dynamic-cordis](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis.md)
is quietly the most personal-agent-flavoured page on the site: Creator mode lets the agent
write and install a configuration-only bundle into its own profile, with HMR applying it live.
The Cordis tutorial (8 pages) is a separate, keyless course; chapters 5 (config) and 7 (tool
registration) are the ones that carry over — the rest is framework drilling.

### Reference concepts — how the machine thinks (6 pages)

[Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md) is
the one page to read before designing: it defines profiles and bundles, the shipped profile
names (`web`, `headless`, `sdk`, `sdk-minimal`, `acp`), the turn/step distinction, the three
event domains (durable session events, live `agent/*`, capability policy events), the
capability-seam pattern (definition/provider/consumer), and an explicit "where new behavior
goes" map. [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer.md)
compresses the framework to five ideas. The
[API Gateway](https://deepseek-harness.github.io/deepseek-harness/en/reference/api-gateway.md)
explains how a Host service becomes a typed client call (`@Remote`, generated descriptors) —
required before exposing personal-agent state in the UI.
[Capability services](https://deepseek-harness.github.io/deepseek-harness/en/reference/capability-seams.md),
[Agent lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/reference/agent-lifecycle.md)
and [Tool execution](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-execution-pipeline.md)
are generated graphs carrying "do not edit" banners: use them to look up *which package owns a
seam* or *where policy runs*, never as guidance.

### Reference — subsystems (47 pages)

The subsystem reference is the real specification, and it is unusually complete for a
0.2.x product: 47 published pages, each ending in a generated Cordis API section listing the
exact `ctx.*` service and `*/*` events with signatures. For personal-agent work they cluster:

- **Persona and prompt** —
  [system-prompt](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md):
  named sections with an explicit order, `deployment:persona-prefix`/`-suffix` slots, strict
  `{{var}}` interpolation, cache-safe `PromptContext` snapshots, and an authoritative
  `system-prompt/assemble` waterfall for experts.
- **Behaviour units** —
  [skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md)
  (files on disk, discovered by rank, loaded on demand through a `skill({name})` tool),
  [commands](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands.md)
  (invoked without a model turn),
  [plan](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/plan.md).
- **Autonomy** —
  [schedule](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md)
  (six timing selectors, host-wide, cold-restores the Session),
  [goal](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md)
  (same-session multi-round objectives), plus
  [jobs](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs.md)
  for work that outlives a step.
- **Delegation** —
  [subagent](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md)
  and [workflow](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workflow.md);
  the two are complements (one child vs a model-written script over many children).
- **Safety** —
  [permission-presets](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/permission-presets.md),
  [approval](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval.md),
  [sandbox](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox.md),
  [user-questions](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/user-questions.md).
  The design is consistently fail-closed and treats approval as an audited one-shot.
- **Capability surface** —
  [tools](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools.md),
  [skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md),
  [web](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web.md),
  [filesystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/filesystem.md),
  [shell](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/shell.md),
  [lsp](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/lsp.md),
  [terminal](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/terminal.md).
- **State and continuity** —
  [session](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session.md),
  [persistence](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence.md),
  [session-query](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query.md),
  [compaction](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/compaction.md),
  [storage](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage.md),
  [workspace](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workspace.md),
  [settings](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/settings.md),
  [credentials](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/credentials.md).
- **Presentation** —
  [web-client](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-client.md),
  [client-modules](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules.md),
  [slots](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots.md),
  [client-resources](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-resources.md),
  [sidebar-right](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sidebar-right.md),
  [conversation](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/conversation.md),
  [web-server](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-server.md).

Two practical notes: (a) every page's "Cordis API" region is generated from source, so
signatures are trustworthy but prose above it is the part written for humans; (b) reading
order matters less than the overview table in
[Subsystems](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/index.md),
which states in one line what each page owns.

### Generated catalogs and Cordis API (10 pages)

Four catalogs and six Cordis API pages are exempt from narrative reading.
[Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md)
(156 package sections) and
[Tool schemas](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog.md)
(booted tool schemas + package map) are lookup tables — but the config catalog is not fully
disposable: its `dsh-persona`, `dsh-system-prompt`, `dsh-agent-preset`,
`dsh-agent-preset-registry`, `dsh-mcp-client` and `dsh-tool-schedule` sections are the only
written record of several keys that personal-agent work needs.
[Persistence events](https://deepseek-harness.github.io/deepseek-harness/en/reference/persistence-catalog.md)
and [experimental persistence](https://deepseek-harness.github.io/deepseek-harness/en/reference/experimental-persistence-catalog.md)
are replay/format reference. The six
[Cordis API](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context.md)
pages are framework internals; consult only when a plugin needs a `Context`/`Fiber` member
that the primer does not explain.

---

## Gaps in the official docs

Each gap below was checked against the 95 fetched pages, not assumed.

1. **No outbound notification or IM channel.** There is no page, and no `ctx` seam, for
   sending anything *out* of DSH. Delivery is always "append to a Session": the schedule
   service queues a follow-up into the original Session
   ([schedule](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md)),
   the `present` tool records a delivery for the calling Session (tool catalog), and the Web
   UI is the only reader. Full-text search across the corpus finds no Slack, Telegram,
   WhatsApp, email, SMS, push or "instant messaging" material. Practical consequence: a
   personal assistant that should reach you on your phone needs a new transport plugin, and
   the closest pattern is the inbound-only
   [GitHub webhook guide](https://deepseek-harness.github.io/deepseek-harness/en/guide/github-review.md).
2. **No first-party memory.** Memory is three third-party MCP rows behind
   `@deepseek-ai/dsh-mcp-client`
   ([mcp-memory](https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md)),
   and the guide itself says no memory server ships, DSH does not choose a model/embedding
   provider, and the reference server has no embeddings, summarisation, conflict resolution or
   forgetting policy. There is no `ctx.memory` service, no memory domain in
   [storage](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage.md),
   and no page on what to remember, when, or how to forget. Closest first-party recall is
   search over past sessions
   ([session-query](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query.md)).
3. **Persona and agent presets are barely documented as authoring units.** The word
   "persona" appears on only 5 of 95 pages; the actual keys (`prefix`, `suffix`, `complete`,
   `includeRuntimeContext`, `personaPrefix`, `personaSuffix`, `includeHarnessIdentity`,
   `toolOrder`) exist only inside the generated
   [config catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md),
   while [system-prompt](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md)
   documents the *section names* but not how to compose a persona plugin. For presets, there
   is no page at all: `ctx.agentPresets` ("registry of YAML-declared presets",
   `PresetDefinition`, `mount`, `readDocument`) appears only in the generated Cordis API of
   [core](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/core.md),
   `dsh-agent-preset` only in the catalog, and pages such as
   [skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md)
   or [subagent](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md)
   assume presets exist without explaining how to author one. The example presets
   (`standard`, `cordis`, `ptc`, `minimal`) are named but never defined.
4. **No proactive/heartbeat behaviour.** "Proactive" has zero hits. Autonomy is limited to
   (a) human-created reminders and (b) same-session goals whose tool authority requires a
   direct human
   ([goal](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md)).
   Nothing describes an agent waking itself, polling, or deciding to act on a schedule it set,
   and no page describes a long-running background daemon beyond
   [jobs](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs.md)
   (per-turn producers) and the host-wide schedule timer.
5. **Twenty referenced subsystem pages are not published.** The overview table in
   [Subsystems](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/index.md)
   links 67 subsystem docs; 47 exist on the site and 20 link only to GitHub blobs —
   `mcp.md`, `agent-team.md`, `webhook.md`, `extensions.md`, `deliverables.md`, `todo.md`,
   `working-directory.md`, `attachment.md`, `browser-use.md`, `computer-use.md`,
   `voice-input.md`, `translation.md`, `ssh.md`, `feedback.md`, `boot.md`, `worktrees.md`,
   `office-to-pdf.md`, `claude-code-mods.md`, `otel.md`, `product-telemetry.md`. For a
   personal agent the consequential omissions are **MCP** (the subsystem behind memory),
   **webhook** (the rule engine behind the GitHub guide), **agent-team** (the experimental
   `ctx.agentTeams` roster/task board, otherwise mentioned in one Architecture paragraph) and
   **extensions** (versioned dynamic plugins).
6. **No multi-user or account model.** Credentials, settings, workspaces and sessions are all
   scoped to one Harness home and one user; the public-deployment guide's guidance for
   sharing is "share the printed URL only with intended users"
   ([public-deployments](https://deepseek-harness.github.io/deepseek-harness/en/guide/public-deployments.md)).
   There is no page defining users, per-person memory partitions, or per-channel identity —
   relevant if the "personal" agent is shared with a household or team.
7. **ACP and other protocol embeddings are named but not explained.** `acp` is listed as a
   shipped profile in [Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md),
   its `AcpConfig` sits in the [config catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md),
   and [Extension patterns](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/extension-cookbook.md)
   calls the ACP package an "automation-only worked example" — but there is no guide page for
   connecting an external client over ACP. Building your own chat transport means reverse-
   engineering the protocol driver shape from that cookbook snippet.
8. **Shipping skills inside a bundle is unspecified.** Local discovery roots, ranks and the
   optional `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR` and packaged-provider concept are
   documented
   ([skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md)),
   but no guide shows a bundle that ships its own skills, and `dsh-skill-badge`-style bundled
   providers are only referenced by path to the repo.
9. **No app-level branding/theming guidance.** UI extension is documented at component
   granularity (client modules, slots, sidebar types, settings cards), but nothing covers
   renaming the product, replacing the shell, custom themes, or the desktop wrapper's
   conventions; the desktop application itself is only a repo README link from
   [Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md).
10. **Line-count honesty about the docs themselves.** Four of the 95 pages (config, tool and
    both persistence catalogs) are generated output totalling ~0.8 MB, and three concept
    pages are generated graphs with "do not edit" banners. The hand-written surface for
    personal-agent building is therefore roughly 60 pages, and the highest-value seams
    (persona, presets, MCP client, schedule tools) are split between a generated catalog and
    a subsystem reference rather than described end-to-end anywhere.
