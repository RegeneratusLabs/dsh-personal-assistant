# M2 — per-surface autonomy policy (2026-11-11)

One place to answer "how much may the agent do on its own, on each surface?" The channel is deferred, but
the policy is written now so the surfaces that exist are explicit and the channel has a default to land on.

## Principles

1. **Fail closed for actions, fail open for memory.** A broken memory lookup must not stop a turn; an
   unanswerable approval must stop the action (`approval` policy `ask`).
2. **The more autonomous the surface, the narrower the tool surface.** Unattended triggers get read-only or
   `workspace-write` with deny rules, never plugin/credential management, never shell automation.
3. **Every autonomous action is attributable.** System-generated messages identify themselves
   (`source.kind: "heartbeat"` for the heartbeat loop) and never impersonate the human.
4. **No silent outbound messaging.** Approval gates on sending messages, spending, deleting, installing, and
   host/service changes stay even on trusted surfaces.

## Surfaces and defaults

| Surface | Autonomy | Tools | Approval | Notes |
|---|---|---|---|---|
| Web UI (owner browser) | act within `workspace-write` | full standard set | `ask` for destructive/consequential | the human is present; still ask |
| Heartbeat loop (`@local/dsh-heartbeat`) | **default OFF**; when enabled, one nudge per changed state, quiet hours 22–08, max 1/interval | none (no tools) | n/a (message only) | carries `source.kind:"heartbeat"`; live-nudge proven in tests, stays off until needed |
| Push (`@local/dsh-push`) | outbound notifications only, inert by default | none | n/a | no message bodies; dedupe + timeout |
| Scheduled jobs (systemd timers: digest, curator) | deterministic local work only | none (scripts) | n/a | digest/curate never call a model |
| Session recall / memory tools | read + retain; mutable only via explicit tool calls | memory tools | `ask` default | recall is untrusted data |
| Channel (Telegram — deferred) | **landing default if installed:** DM allowlist of one, text-only, approvals as buttons, unknown senders ignored, no guest rights | restricted set: no plugin/credential/shell/automation tools | `ask` for all outbound/actions; approvals surface to channel *and* Web | one poller per token; not installed (HOLD) |
| Automations | **not installed** (D14) | n/a | n/a | if ever added: `log`/`http` only, never `shell` |

## What "restricted tool surface" means (for the future channel session)

Remove/disable in channel-triggered sessions: `plugin_manager`, credential/settings tools, `shell`-style
automations, filesystem writes outside the workspace, and any tool that changes host/service config.
Approval-gated: outbound messages, deletions, spending, plugin installs, host changes.

## Enforcement today

- Permission presets live in the profile (`workspace-write` + `ask`; `danger-full-access` is never a default).
- `SOUL.md` carries the behavioural rules ("ask before consequential actions", untrusted content).
- The heartbeat plugin cannot call tools by construction; the push plugin has no tools.
- The channel, when it lands, must be admitted through the ledger and start from the row above.
