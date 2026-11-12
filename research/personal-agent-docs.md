# Documentation map: building a personal agent on DSH

**Question answered:** where is the documentation for building *our own* personal agent on DeepSeek
Harness (`@deepseek-ai/dsh` 0.2.2-rc.1), what does each corpus cover, and what should we read in what
order?

**Status (2026-11-10):** DSH 0.2.2-rc.1 is installed at `/home/josh/dsh/node/`; upstream repo HEAD is
also **0.2.2-rc.1** (`package.json` matches `dsh --version`), so the published docs, the repo READMEs,
and the installed package READMEs all describe the version we run. DSH is a developer preview —
re-check after upgrades.

Companion detail files:

- [`docs-official-site.md`](docs-official-site.md) — page-by-page map of the published docs site.
- [`docs-installed-packages.md`](docs-installed-packages.md) — package-by-package README map of the
  330 `@deepseek-ai/*` packages shipped with the install.

Prior context (not vendor docs): [`dsh-as-personal-assistant.md`](dsh-as-personal-assistant.md) (gap
analysis and build paths), [`dsh-audit.md`](dsh-audit.md) (what ships), [`dsh-ecosystem.md`](dsh-ecosystem.md)
(plugin market), [`personal-profile-setup.md`](personal-profile-setup.md) (our host runbook).

## 1. The five documentation corpora

| # | Corpus | Where | Size | Role |
|---|---|---|---|---|
| 1 | **Published docs site** (EN + ZH) | <https://deepseek-harness.github.io/deepseek-harness/> — index at [`llms.txt`](../.cache/llms.txt) | 95 English pages: 9 Guide, 18 Develop, 47 Subsystems, 6 Concepts, 6 Cordis API, 5 Cookbook, 4 generated catalogs | The teaching + reference layer. Raw markdown for any page = page URL + `.md` (e.g. `/en/reference/subsystems/skills.md`); site root is `/en/index.md`. **The site publishes 47 subsystem pages; its own overview links 67, so 20 pages exist only in the repo** — including exactly the assistant-relevant ones (`mcp.md`, `agent-team.md`, `webhook.md`, `extensions.md`, `voice-input.md`, `attachment.md`, `liveshare.md`) plus `deliverables`, `todo`, `working-directory`, `worktrees`, `browser-use`, `computer-use`, `claude-code-mods`, `office-to-pdf`, `ssh`, `feedback`, `forge`, `boot`, `otel`, `product-telemetry`, `translation`. Use the local mirror for those. |
| 2 | **Repo docs + package READMEs** (local mirror) | [`../.cache/deepseek-harness/`](../.cache/deepseek-harness/) — sparse clone of `deepseek-ai/deepseek-harness` @ `fcc0ad4` | 1,179 `.md` files, 36 MB: `docs/`, every `packages/*/*/README.md`, `apps/*/README.md`, shipped overlays | Same docs as the site **plus** material the site does not publish (upgrade guides, repo cookbooks, persistence records) and the per-package contracts. |
| 3 | **Installed package docs** | `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` | 330 packages (319 `dsh-*` + 11 vendored), each `README.md` + `README.zh.md` + `locale/` + some `skills/` | The authoritative contract for the exact version we run: config fields, `ctx.*` seams, limitations. **Only READMEs ship** — the linked `docs/subsystems/*`, config/tool catalogs and `.agents/notes/*` are *not* in the installed tree, which is why the local mirror matters. |
| 4 | **Shipped reference configurations** | [`apps/cli/config/examples/`](../.cache/deepseek-harness/apps/cli/config/examples/) | `team-mode.yml`, `ptc.yml`, `mcp-memory/{memorix,mcp-reference-memory,engram}.cordis.yml` | Default-off overlays that show real composition: `agent-team.defaultEnabled`, PTC executor swap, memory MCP wiring. Copy the row, patch your profile. |
| 5 | **Our own composition** | `~/.dsh/profiles/web/{package.json,cordis.patch.yml}`, `~/.dsh/cordis.patch.yml` | live | The ordered `dsh.profile.bundles` list and patch layers that *are* our agent. `dsh --profile web --dump-config` prints the composed tree. |

Convenience: the local mirror is a *sparse* clone — only docs/READMEs/overlays are checked out, so it
stays small. Refresh with:

```sh
cd /home/josh/projects/DSH-playground/.cache/deepseek-harness
git fetch --depth 1 origin && git checkout FETCH_HEAD   # re-fetch docs at new HEAD
# add more paths later: git sparse-checkout add config apps/cli/config
```

## 2. Read in this order for an agent-building session

Each row is "goal → start here → authoritative deeper reference". Site links are the readable version;
local paths work offline.

1. **Mental model of the harness.** [Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/index.md)
   (local: [`docs/architecture.md`](../.cache/deepseek-harness/docs/architecture.md)) — especially
   *Profiles and bundles*, *Capability seams*, and the **“Where new behavior goes”** table, which maps
   every new feature to its extension point. Then
   [Capability seams](https://deepseek-harness.github.io/deepseek-harness/en/reference/capability-seams.md)
   ([`docs/capability-seams.md`](../.cache/deepseek-harness/docs/capability-seams.md)).
2. **Run and configure the host.** [Use the Web UI](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart.md) →
   [Configure models](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers.md) →
   [Public deployments](https://deepseek-harness.github.io/deepseek-harness/en/guide/public-deployments.md)
   (reverse proxy, `--public-url`/`--trusted-host`, cookies — the tailnet setup we already use).
3. **Learn the composition model — the single most important structural fact.** A personal agent is a
   *profile*: ordered bundles + patches. In the **`web` profile the agent plane is not in the bundle at
   all**: `dsh-web-app` disables ~22 base rows (`tool-bash`/`tool-pwsh`, `tool-fs`(+search), `tool-jobs`,
   `skill-filesystem`, `tool-skill`, `command-goal`, `tool-goal`, `plan-mode`, `compaction-basic`,
   `command-compact`, `tool-result-pruner`, `tool-subagent`(+-control/-fork), `workflow-ptc`,
   `tool-workflow`, `agent-instructions`, `tool-todo`, `tool-web`) and **re-declares them inside four
   `@deepseek-ai/dsh-agent-preset` declarations** — `standard` (default), `ptc`, `minimal`, `cordis` —
   each inserted by a `presets/<id>.patch.yml` listed in the bundle's `dsh.bundle.patch`. So
   *building a personal agent = authoring/overriding a preset (persona row + plugin list + tools/skills/
   schedule/subagent rows) + adding profile-patch integration rows (MCP servers, model routes, extra
   skill dirs)* — not writing a new app. Read
   [`packages/bundle/web-app/README.md`](../.cache/deepseek-harness/packages/bundle/web-app/README.md),
   [`dsh` CLI README](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/apps/cli/README.md)
   (profiles/bundles/precedence), [app-boot](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/app-boot/README.md#profiles),
   [plugin manager](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md),
   [official bundles](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/util/official-bundles/README.md),
   and use `dsh --dump-config` / `--dump-config-schema`. Every patch replaces a row's **whole**
   `config`; rows are addressed by `id`.
4. **Give it an identity (persona).** Per-agent persona:
   [`packages/preset/persona/README.md`](../.cache/deepseek-harness/packages/preset/persona/README.md)
   (`prefix`, `suffix`, `complete`, `includeRuntimeContext`; mounted *inside a preset* only). Deployment-wide
   persona: [`packages/core/system-prompt/README.md#configure-the-prompt`](../.cache/deepseek-harness/packages/core/system-prompt/README.md)
   — `dsh-system-prompt` row config `personaPrefix` (order 0) / `personaSuffix` (order 10200), plus
   `includeHarnessIdentity` and `toolOrder`; custom persona templates must not contain an unregistered
   `{{cwd}}` (assembly fails). Semantics:
   [system prompts](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt.md).
5. **Define what the agent is made of (agent presets).**
   [`packages/preset/agent-preset/README.md`](../.cache/deepseek-harness/packages/preset/agent-preset/README.md)
   (`plugins:` child list = per-preset tools/skills/persona) and
   [`agent-preset-registry`](../.cache/deepseek-harness/packages/preset/agent-preset-registry/README.md)
   (`ctx.agentPresets`, `default`/`selectedDefault`, roster order, revision retention; GUI preset edits
   persist into `$DSH_HOME/profiles/web/cordis.patch.yml`). The preset is what the schedule/webhook/
   subagent APIs accept as `agentPreset`; `spawn` can select a preset independent of its parent. To add
   our own: insert a new `@deepseek-ai/dsh-agent-preset` row with our `id` + `plugins` list, and point the
   registry's `default` at it (or select it per session).
6. **Add capabilities: skills, instructions, tools.** Skills:
   [Skills subsystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills.md) +
   [`packages/skill/skill/README.md`](../.cache/deepseek-harness/packages/skill/skill/README.md) +
   [`skill-filesystem`](../.cache/deepseek-harness/packages/skill/skill-filesystem/README.md)
   (`SKILL.md` discovery/layers) + the shipped `agent-preset/skills/` examples (`agent-experience`,
   `cordis-plugin-development`). Instructions: `packages/context/agent-instructions/README.md`.
   Tools: [Tools subsystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools.md)
   and [Build a tool](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/tool.md).
7. **Make it proactive (schedule, goals, jobs, inbound triggers).**
   [Schedule reminders guide](https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md)
   (Host-owned reminders, RFC 5545 rules, delivery to a conversation or a fresh one per occurrence) +
   [schedule subsystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule.md) +
   [`packages/schedule/schedule/README.md`](../.cache/deepseek-harness/packages/schedule/schedule/README.md).
   Goals: [Goals subsystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/goal.md).
   Jobs: [Background jobs](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/jobs.md).
   Inbound automation: [GitHub review sessions](https://deepseek-harness.github.io/deepseek-harness/en/guide/github-review.md)
   and [`packages/experimental/webhook/README.md`](../.cache/deepseek-harness/packages/experimental/webhook/README.md)
   (`ctx.webhookRuntime`: trusted rule → new Session); the [`webhook` subsystem page](../.cache/deepseek-harness/docs/subsystems/webhook.md)
   is repo-only.
8. **Memory.** Official path is MCP:
   [Memory MCP guide](https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md) +
   the three overlays in [`apps/cli/config/examples/mcp-memory/`](../.cache/deepseek-harness/apps/cli/config/examples/mcp-memory/) +
   [MCP subsystem](../.cache/deepseek-harness/docs/subsystems/mcp.md) *(repo-only page — not on the site)* +
   [`packages/mcp/mcp-client/README.md`](../.cache/deepseek-harness/packages/mcp/mcp-client/README.md).
   Conversation history/recall: [Sessions](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session.md)
   and [session query](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query.md).
9. **Delegation and teamwork.** [Subagents](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent.md),
   [Agent Teams](../.cache/deepseek-harness/docs/subsystems/agent-team.md) *(repo-only page)*,
   [Workflows](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workflow.md);
   packages [`subagent`](../.cache/deepseek-harness/packages/subagent/subagent/README.md),
   [`team/agent-team`](../.cache/deepseek-harness/packages/team/agent-team/README.md),
   [`workflow`](../.cache/deepseek-harness/packages/workflow/workflow/README.md).
10. **Shape the experience (Web client).**
    [Web Client architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/web-client.md),
    [client modules](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/client-modules.md),
    [client slots](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots.md),
    [Conversation assembly](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/conversation.md),
    [Add a settings card](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-settings-card.md).
    Our own `plugins/dsh-profiles/` is a working example of a zero-build client plugin.
11. **Trust and safety.** [Approvals](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval.md),
    [Permission presets](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/permission-presets.md),
    [Sandboxing](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox.md),
    [User credentials](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/credentials.md),
    [User settings](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/settings.md).
12. **Expose it to other software.** [Python SDK](https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk.md),
    headless profile (`dsh headless "job"`), ACP stdio (`dsh --profile acp`),
    [`packages/bundle/headless`](../.cache/deepseek-harness/packages/bundle/headless/README.md),
    [`sdk-app`](../.cache/deepseek-harness/packages/bundle/sdk-app/README.md),
    [`sdk-minimal`](../.cache/deepseek-harness/packages/bundle/sdk-minimal/README.md).
13. **Build the missing pieces (plugin development).**
    [Your first Harness plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/index.md) →
    [plugin config](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config.md) →
    [package and install](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.md) →
    [plugin lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/index.md),
    [services](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service.md),
    [events](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/events.md) →
    [capability layering](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/index.md),
    [LLM adapter](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/llm-adapter.md),
    [persistent plugins](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis.md).
    If Cordis is new: the 8-part [Cordis tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/index.md).
    Then [extension cookbook](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/extension-cookbook.md)
    and [adding a package](https://deepseek-harness.github.io/deepseek-harness/en/reference/cookbook/adding-a-package.md).

## 3. Concern → document quick map

| Personal-agent concern | Closest documented mechanism | Primary docs |
|---|---|---|
| Personality / identity | per-preset persona row, deployment persona | persona README; system-prompt README + subsystem |
| Capability set per conversation type | agent preset (`plugins:` child list) | agent-preset + registry READMEs; `ui-agent-preset` |
| Procedural know-how | skills (`SKILL.md` dirs, host/repo/preset layers) | skills subsystem; skill + skill-filesystem READMEs |
| Standing instructions | agent instructions / prompt sections | system-prompt subsystem; `agent-instructions` README |
| Proactive prompts at times | Host schedule reminders (RFC 5545), manual Automation page | schedule guide + subsystem + package README |
| Long-running objectives | goals (`ctx.goals`, goal-round driver) | goal subsystem + `packages/goal/*` READMEs |
| Long-term memory | third-party memory MCP servers (default-off overlays) | mcp-memory guide; mcp subsystem; mcp-client README |
| Inbound events from other systems | `ctx.webhookRuntime` trusted rules → new Session | webhook README; github-review guide |
| Conversations/recall/audit | session log, session query, projections | session + session-query + persistence subsystems |
| Multi-agent delegation | subagent providers; agent teams task board; workflows | subagent, agent-team, workflow subsystems |
| UI surface / controls | Web client modules, slots, settings cards | web-client, client-modules, slots, cookbook/adding-a-settings-card |
| Trust / approvals | approval seam + permission presets + sandbox | approval, permission-presets, sandbox subsystems |
| Reach from outside | Python SDK / headless / ACP / webhooks | python-sdk guide; bundle READMEs |
| Custom / missing behavior | new plugin on a `ctx.*` seam | architecture “Where new behavior goes”; develop/* |

## 4. Gaps — what the documentation does *not* cover

These are confirmed against the doc tree, not assumptions; they match the prior gap analysis in
[`dsh-as-personal-assistant.md`](dsh-as-personal-assistant.md).

- **No user-facing guide for agent presets or personas.** Presets/personas appear only as package
  READMEs, passing mentions in guide pages (`standard`/`minimal` preset), and the Web preset picker.
  There is no tutorial for “compose an assistant preset”. Build path: preset + persona READMEs (step 4–5 above).
- **No IM channels and no outbound notifications.** Nothing documents Telegram/WhatsApp/email bridges.
  The schedule guide states plainly that delivery records “do not describe model execution results” and
  the mechanism “is not an execution history or an external notification channel.” Inbound is possible
  only through `ctx.webhookRuntime` rules (documented for GitHub only); outbound would be a new provider.
- **No proactive “heartbeat”.** The closest shipped mechanism is schedule reminders (Host-owned, per
  conversation). No doc describes an always-on wake/review loop; a heartbeat is a plugin to write on the
  schedule + goal seams.
- **No first-party long-term memory.** Memory is documented only as *interoperability examples* wiring
  third-party MCP servers (Memorix, MCP reference memory, Engram); the docs explicitly disclaim curation,
  embeddings, conflict resolution, and forgetting — those stay with the provider.
- **No channel-aware approvals.** The approval seam is documented with an answerer contract and Web/ACP
  surfaces; nothing documents approving from a phone/IM. Remote approval is integration work, not docs.
- **No personal-assistant bundle or preset.** `official-bundles` lists shipped/optional/on-demand bundles;
  none is an assistant bundle, and the four shipped presets (`standard`, `ptc`, `minimal`, `cordis`) are
  coding/general presets, not a personal-assistant persona (the marketplace has community ones — see
  [`dsh-ecosystem.md`](dsh-ecosystem.md)). Building ours means authoring a preset + bundle.
- **No soul.md / file-based persona.** Persona text is static config (global `dsh-system-prompt` row or a
  preset's `dsh-persona` row); the official README says there is “no end-user prompt-editing API”. A
  Hermes-style `SOUL.md` needs a loader plugin or a community one (§5).
- **No productivity integrations.** Nothing documents calendar, email, contacts, notes, or task-manager
  seams; those are MCP servers or new tools. Approval is one-shot only (`allowed-once`) — no remembered
  grants. No proactive/event-triggered runs beyond schedule reminders and inbound webhook rules.
- **No multi-user or account model.** Credentials, settings, workspaces, and sessions are scoped to one
  Harness home/user; there are no per-person memory partitions or per-channel identities.
- **ACP is named, not explained.** `acp` is a shipped profile and the config schema exists, but there is no
  guide for connecting an external client over ACP; same for shipping skills inside a bundle and for
  app-level branding/theming (desktop is only a repo README link).
- **Docs are contributor-shaped, and much of the reference surface is generated.** 4 of 95 pages are generated
  catalogs (~0.8 MB: config/tool/persistence) and 3 are “do not edit” graphs, so the hand-written surface
  for personal-agent building is ~60 pages; subsystem pages are reference contracts with generated Cordis
  API sections. Tutorials exist for plugin development, not for end-to-end assistant composition. Budget
  for reading READMEs, not just the site.

## 5. Soul.md (Hermes-style identity file): status and options

**Status: DSH has no `SOUL.md` concept.** A full-text search of the 330 installed packages and the
repo docs returns zero `soul` hits; identity is *config*, not a file. The official
[system-prompt README](../.cache/deepseek-harness/packages/core/system-prompt/README.md) states the
limitation plainly: “Deployment-authored prompt text is config/composition only … there is no end-user
prompt-editing API.”

**The mapping.** Hermes' `SOUL.md` is prompt slot #1; in DSH the same slot is
`deployment:persona-prefix` at **order 0**, configured as static strings:

| Mechanism | Where | Fields |
|---|---|---|
| Global deployment persona | `dsh-system-prompt` row config | `personaPrefix` (order 0), `personaSuffix` (order 10200), `includeHarnessIdentity`, `toolOrder` |
| Per-agent persona | `@deepseek-ai/dsh-persona` row **inside a preset** | `prefix` (required), `suffix`, `complete`, `includeRuntimeContext` |

`AGENTS.md` is *not* a soul: `dsh-agent-instructions` injects it as a user-role `<system-reminder>`
(“workspace instructions … do not override system, developer, or direct user instructions”), and the
community persona plugin's README makes the same point — instructions “arrive as a user message, and the
model is free to treat them as advice.”

**Ways to actually have a `SOUL.md`** (recommended first):

1. **Loader plugin in our profile (recommended).** Keep `soul/SOUL.md` in the repo as the single source of
   truth; a ~20-line plugin registers a system-prompt section (order 0, or shadow
   `deployment:persona-prefix` inside the preset scope) whose **text callback re-reads the file each
   assembly** — DSH section `text` may be a function receiving `{ scope, toolSet }`. Edits apply without a
   restart, and any preset can mount it.
2. **Inline in the preset (zero code).** Paste the soul prose as a YAML block scalar in the preset's
   `dsh-persona.prefix`. Same slot, but static: changing it means editing the profile patch
   (HMR or restart).
3. **Community plugins that already implement the pattern.**
   [`dsh-plugin-soul`](https://github.com/CC19990113/dsh-plugin-soul) — closest to Hermes: seeds
   `~/.dsh/soul/{IDENTITY,SOUL,USER,MEMORY,RULES}.md` + `journal/` + `DREAMS.md`, injects them every turn
   (~2.1k chars), writable through `soul_*` tools with git-versioned rollback and a Settings › 人格 tab.
   [`dsh-agent-persona`](https://github.com/Awoodwhale/dsh-agent-persona) — many personas as a
   system-prompt section (`agent-persona`, appended after or replacing the built-in identity), scoped by
   workspace path / session id, edited from the Web UI. `dsh_soul` is a chat-only companion
   (mood/affection/diary), not main-agent identity.
4. **`!!js` file read (possible, not recommended).** `!!js` config expressions run in an environment with
   `process` (docs show `process.cwd()`/`process.platform`), and this host's Node 24.22 has
   `process.getBuiltinModule`, so `prefix: !!js process.getBuiltinModule('node:fs').readFileSync('/abs/SOUL.md','utf8')`
   would work — but it is evaluated once at load (no live reload) and is undocumented for this use.

Existing template on this machine: `~/.hermes/SOUL.md` and a worked example at
another local agent's `distribution/SOUL.md` (a business-specific persona — structure is reusable;
it is a Hermes file, not a DSH one).

## 6. Sessions, workspaces and directories

**Does every session need a folder? Yes — a working directory; no — a registered workspace.**

- **Every session has an effective directory.** `SessionHeader.cwd` records the *original project*; the
  [`working-directory` service](../.cache/deepseek-harness/docs/subsystems/working-directory.md) projects the
  current value. Session creation may omit it; then `defaultDirectory` (config on `dsh-working-directory`)
  applies, defaulting to the **launch directory**. A session can `cd` mid-conversation (`working_directory`
  tool / `ctx.workingDirectory.set`) while the header keeps the original project and **sandbox writable
  roots stay anchored to it**.
- **A Workspace is optional GUI grouping, not the session's owner.** `ctx.workspaceRegistry` keeps
  canonical-path records in `$DSH_HOME/storages/workspace.json`; it is invisible to models. Sessions can be
  **Ungrouped** (workspace deleted, or created by automation). The Web composer requires a workspace, and
  the sidebar's New Session picker attaches the new session to it; schedule falls back to *Ungrouped* + the
  Host project directory when no workspace exists; the webhook runtime resolves **or creates** the Workspace
  from its `workspacePath` (directory must already exist).
- **DSH *does* auto-create one folder: the first-use default workspace.** `workspace.initializeDefault()`
  creates `<Documents>/deepseek-harness/default-workspace` (OS Documents via `xdg-user-dir`, or the
  `workspace-controller` config `documentsDirectory`), **creating missing parents**, then registers it as the
  default. It runs once, only when the registry is empty and no sessions exist; deleting the registration
  does not let it run again. On this machine the personal host has
  `documentsDirectory: /home/josh/.dsh-personal/workspace` → the folder
  `~/.dsh-personal/workspace/deepseek-harness/default-workspace`, recorded in
  `~/.dsh-personal/storages/workspace.json`. Linux without an enabled Documents dir must set
  `documentsDirectory` or use the folder picker (our setup script does exactly this).
- **Per-session storage folders also exist, but are internal:** `$DSH_HOME/sessions/<encoded-cwd>/session-<uuid>/`
  (log and sidecars). They are not user project folders.
- **There is no per-conversation project folder** (Hermes/OpenClaw-style workspace-per-chat). To get that
  behavior, a plugin would `mkdir` on session creation, then call `ctx.workspaceRegistry.create(existingDir)`
  and `attachSession` (the webhook runtime is the worked example); the simpler alternative is one persistent
  “home” workspace per agent and subfolders for projects.
- **Contrast with Hermes (checked locally):** Hermes conversations are rows in `state.db` plus flat
  `~/.hermes/sessions/*.jsonl` files — no per-session folder either; its working directory is config
  (`terminal.cwd: .`). The "auto-created folder" impression matches DSH's *default workspace*, not a
  per-session folder.

## 7. Practical tips

- **Prefer the repo READMEs over the site** when behavior matters: the site pages are generated from the
  same markdown, but package READMEs carry the exhaustive config tables, limitations, and “Model
  Experience” notes.
- **Generated catalogs are lookup, not reading:** [tool-catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog.md),
  [config-catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog.md),
  [persistence-catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/persistence-catalog.md)
  — search them for a key name.
- **Inspect the composed tree before patching it:** `dsh --profile web --dump-config` shows every row id
  you can target; `--dump-config-schema` gives JSON Schema for entries.
- **Repo-only material worth browsing in the mirror:** `docs/upgrade-guide/*` (what changed in each
  0.2.x step), `docs/cookbook/*` (13 pages, 8 more than the site), `docs/defensive-patterns/*`,
  `docs/glossary.md`, `docs/persistence-changes/*`, `docs/user/develop/practice/dynamic-cordis.md`.
- **Community docs** (lower trust, often ahead of official docs): plugin market at
  <https://dshbase.com/> and the [plugin indexes guide](https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market.md).
  Treat third-party plugin claims as unverified; the ecosystem note in this repo has the survey.
