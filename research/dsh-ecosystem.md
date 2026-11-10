# DSH native ecosystem: what already exists for "personal assistant" use

> Lead's own research note. Companion to `dsh-audit.md` (shipped core), `hermes.md`, `openclaw.md`,
> `landscape.md`. Compiled 2026-11-09 from the community plugin catalog plus the local install.

## Method

- Source: the "Awesome DSH Plugin" market index, `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`
  (format 1, 4,872 plugin entries; the same catalog served at `awesome-dsh-plugin.com` and `dshmarket.com`).
  The host's `web` profile is already wired to a plugin-market index (`plugins/indexes` in
  `~/.dsh/profiles/web/cordis.patch.yml`) and has `dshmarket` installed, so this ecosystem is reachable
  from the GUI's Plugins → Discover tab and from the `plugin_market` agent tool.
- Local cross-check: `~/.dsh/profiles/web/package.json` (installed bundles) and the 330 shipped packages
  under the DSH install. Docs: <https://deepseek-harness.github.io/deepseek-harness/>.
- Counts below are keyword matches over plugin title + English description, **not** deduplicated judgments
  of quality. Treat "4,872" as marketplace noise; treat the named examples as existence proofs.

## The numbers

4,872 catalog entries. Category distribution (top): `ui` 922, `tools` 700, `session` 371, `workflow` 312,
`dev` 293, `model` 264, `usage` 247, `memory` 212, `theme` 160, `notify` 160, `remote` 155, `security` 133,
`browser` 122, `skill` 140, `voice` 74, `identity` 61, `market` 66, `fun` 148.

Keyword-matched subsets relevant to assistants:

| Capability | Matches | Notes |
|---|---|---|
| IM/channel bridges | ~130 | 14 Telegram, 44 QQ, 39 WeChat(+8 WeCom), 34 Feishu/Lark, 12 DingTalk, 11 Slack, 5 Discord, 9 Matrix, 11 OneBot, 1 WhatsApp, 1 iMessage |
| Memory | ~229 | third-largest thematic cluster after UI/tools |
| Proactivity (heartbeat/wake/monitor/schedule/digest) | ~277 | overlaps `notify`/`tools`/`workflow` |
| Notifications/push | ~148 | mostly turn-end toast/sound/Gotify/IM push |
| Voice (TTS/STT/dictation) | ~111 | incl. smart-speaker bridges |
| Remote/mobile/LAN/tailnet | ~577 | broad (includes generic remote dev, not just phone) |
| Persona/identity | 61 | category `identity` |

## What this means: the assistant stack already exists as plugins

The striking finding: every layer of the Hermes/OpenClaw architecture has multiple community plugins.
There is no single "personal assistant bundle"; users assemble one.

### 1. Chat channels (the OpenClaw/Hermes signature layer)

- `@goodandready/dsh-messenger-gateway` — Telegram bridge: bidirectional sessions, conversation steering,
  home-channel routing, TTS voice notes as Telegram audio.
- `@xmanrui/dsh-im` — one plugin, 9 channels via QR/bot credentials: Feishu, WeChat, DingTalk, WeCom, QQ,
  Slack, Telegram, Discord, WhatsApp.
- `dsh-im-channel` — unified Feishu/Telegram/DingTalk/Slack/Discord with persistent conversations and
  true streaming replies.
- `dsh-tg-bridge` — Telegram: one chat topic per project directory, voice/photo input, per-topic job
  queue, per-topic goals and task checklists.
- `dsh-switchboard` — Telegram + Feishu: one live progress message per turn, approvals/questions as
  buttons, files and voice.
- Platform-specific: `@addozhang/dsh-discord`, `dsh-slack`, `dsh-feishu-board` (pushes `ask_user_question`
  to Feishu DM and routes the quoted reply back to the exact session), `dsh-channel-qq`, `dsh-im-hub`,
  `dsh-connect`, `@michengai/dsh-im-connect`.
- Pattern: each chat ↔ resumable DSH Session, approvals surfaced as IM buttons, streaming/cards, per-chat
  workspace binding. That is exactly the OpenClaw "channel + session binding" model, rebuilt on the web
  host.

### 2. Memory

Multiple architectures are being explored in parallel:
- Markdown/index memory in the Claude Code style — `dsh-auto-memory` (typed files user/feedback/project/
  reference + `MEMORY.md` index injected into the system prompt).
- Layered/tiered memory — `dsh-memory-tiers` (six layers, L2 staging buffer → DL3 summaries),
  `dsh-memory-band`, `dsh-layers-hippocampus` (append-only event log + rebuildable tag index + day diaries).
- Project/ledger memory — `@yolk_vat-y/dsh-project-memory`, `dsh-ledger-memory`.
- Retrieval/consolidation research — `@a9i5k4/dsh-auto-memory` (zero-prompt recall at a fixed boundary,
  three-layer consolidation, "skill crystallization"), `dsh-memory-observer` (background observations and
  reflections injected as a system-prompt section), `feiyu-memory` (gate decides whether a turn is worth
  remembering), `dsh-memory-triage`.
- External stores — `dsh-butler-memory` (PostgreSQL + MCP memory tools + review panel).
- Built-in alternative: MCP memory servers, documented officially at
  <https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md>; plus the shipped
  `dsh-experimental-session-search` (agents search/read earlier sessions) and `dsh-session-reference`.
  So "memory" can be done three ways: plugin, MCP, or workspace files + skills.

### 3. Proactivity (the part that makes it feel alive)

- `@kanadego/dsh-heartbeat` — an agent that wakes on its own schedule (default hourly ±20%), browses
  configured interests, drops findings into a local pool.
- `dsh-monitor` — persistent background watchers that wake the agent on new messages or command-output
  deltas (Claude Code Monitor analogue).
- `dsh-tick` / `@opendsh/dsh-plugin-scheduled-tasks` — session-local and per-project scheduled prompts;
  the latter runs fresh headless sessions with cron/interval history.
- `dsh-automations` — lifecycle hooks (startup, session start/idle/end, user messages, tool results, cron).
- `dsh-rss-digest`, `dsh-intel-pulse`, `dsh-mishu` (GitHub-notification secretary every 15 min),
  `dsh-work-assistant` (WeChat task ledger with urgency ranking and scheduled reminders).
- Built-in: `dsh-schedule` delivers instructions to existing/new sessions on cron/RRULE and survives
  restarts (see `dsh-audit.md`). The community plugins add the "wake on external change" dimension.

### 4. Voice, mobile, identity

- Voice: `dsh-speak`, `@memef1f1y/dsh-plugin-tts`, `@goodandready/dsh-tts`, `dsh-chatvoice`
  (browser STT + read-aloud), `dsh-dictation-hotkey`, `dsh-xiaoai-bridge` (Xiaomi smart speaker →
  wake word → STT → DSH → TTS; a literal home assistant).
- Mobile/remote: `@feiyang666/dsh-mobile-remote` (installed here: QR pairing, phone image upload),
  `dsh-console-plugin` (QR or 6-digit pairing to drive the desktop instance from a phone),
  `@eternalloveone/dsh-palm` (scan-to-pair mobile surface, SSE sync, push notifications),
  `@creait/dsh-tailnet-gateway` (identity-gated Tailscale access while DSH stays on loopback).
- Identity: `dsh-aiyayi` (companion persona + persistent memory + presence heartbeat + idle updates),
  `dsh-soul-seed` (persona/mood/memory/per-person ledgers), `dsh-agent-persona` (persona scoped by
  workspace/session), `dsh-affect` (emotion state machine). Core ships `dsh-persona` (per-preset
  system-prompt persona row).

### 5. Integrations: the MCP route

Email, calendar, RSS, GitHub etc. are mostly MCP servers or tool plugins, e.g. `@eduwork/dsh-mail`
(IMAP read + SMTP send under DSH permissions), `dsh-calendar` (CalDAV, RRULE expansion), `dsh-rss`.
The shipped `dsh-mcp-client` + `dsh-mcp-resources` means any MCP server becomes assistant tooling with
one config row — no plugin needed. This is the DSH equivalent of OpenClaw/Hermes "skills + integrations".

## Honest gap analysis of the ecosystem

1. **Fragmentation / no integration bundle.** 130 channel plugins, 229 memory plugins, 277 proactivity
   plugins; no curated "personal assistant" composition with tested combinations. A bundle that pins one
   gateway + one memory + heartbeat + notify + persona + mobile and ships defaults would be the single
   highest-leverage ecosystem contribution.
2. **Quality varies wildly.** 4,872 entries include desktop pets, gacha calendars and AI-girlfriend
   personas. Popularity signals exist (dsh-recommend badges, market indexes) but verification is manual.
3. **Channel coverage skews Chinese IM** (QQ 44, WeChat 39, Feishu 34) over Western (Telegram 14,
   Discord 5, Slack 11, WhatsApp 1). Telegram is the best-supported "Hermes/OpenClaw-style" bridge.
4. **Memory plugins are mutually incompatible by default.** They compete for system-prompt injection and
   workspace files; running two is a foot-gun. Choose one architecture (files vs tiers vs external DB).
5. **Inbound-channel security is treated per-plugin.** Some gateways have pairing/permissions
   (`dsh-channel-qq`, `dsh-console-plugin`), but there is no host-level "trusted external channel" policy
   comparable to OpenClaw's pairing/DM policy. This is the biggest risk area for always-on use.
6. **WhatsApp/iMessage are thin** (one multi-channel plugin each) — same ToS/ban issues OpenClaw has.
7. **No "assistant inbox" abstraction.** Each gateway implements its own inbox/reply; there is no shared
   channel seam in core (`ctx.channels` doesn't exist in the shipped tree). A core seam would let one
   inbox/UI serve all channels.

## Bottom line

DSH does not need to become Hermes/OpenClaw by re-implementing them. The community has already built the
channel, memory, proactivity, voice, mobile and persona layers as plugins. What is missing is the
**integration + curation layer**: a tested assistant bundle, a channel/inbox seam, host-level trust policy
for external channels, and a memory-interop story. That reframes the build plan from "write a personal
assistant" to "assemble and harden one on DSH's plugin seam".

## Sources

- Plugin catalog: <https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json> (accessed 2026-11-09);
  human-facing list <https://awesome-dsh-plugin.com>
- DSH docs root: <https://deepseek-harness.github.io/deepseek-harness/>; memory MCP guide
  <https://deepseek-harness.github.io/deepseek-harness/en/guide/mcp-memory.md>; schedule guide
  <https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule.md>
- Local evidence: `~/.dsh/profiles/web/package.json`, `~/.dsh/profiles/web/cordis.patch.yml`,
  `~/.dsh/profiles/web/node_modules/@feiyang666/dsh-mobile-remote/README.md`,
  `~/.dsh/profiles/web/node_modules/dshmarket/README.md`, DSH install
  `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`.
- Individual plugin repos are linked above by name; catalog entries carry `repository.url`.
