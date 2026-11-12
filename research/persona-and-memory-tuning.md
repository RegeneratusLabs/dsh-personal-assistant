# Prompt-opener override + memory recall tuning (2026-11-12)

Two host changes on the `personal` profile after the deployment persona was installed. Both were verified on a
live session.

**Privacy note.** This repo ships the generic starter persona at [`soul/SOUL.md`](../soul/SOUL.md). The live
deployment's actual persona text is private and deliberately not mirrored here; this document records the
mechanism only, not the content.

## 1 — The installed persona is the system prompt's opener

**Why.** The persona row rendered *after* two harness-default openers: the deployment harness identity
(`You are an AI agent powered by DeepSeek Harness.`, order −1000) and the `standard` preset's scope-only
`dsh-persona` row (`You are a coding agent powered by the {{model}} model.`, order 0), which shadows the global
`system-prompt.personaPrefix` for every web session. A "who are you" turn could therefore self-describe as a
coding agent before reading the deployment persona.

**Host edits** — `~/.dsh-personal/profiles/personal/cordis.patch.yml` (backup
`cordis.patch.yml.bak-persona-20261112T162054`):

```yaml
- id: system-prompt
  config:
    includeHarnessIdentity: false
    personaPrefix: ''
- id: preset-standard
  config:
    id: standard
    order: 1
    plugins:            # dsh 0.2.2-rc.1 standard list, verbatim, minus its `persona` row
```

The preset child list is a copy of `@deepseek-ai/dsh-web-app/presets/standard.patch.yml` (a user override
replaces the whole child list and never merges later upstream changes — re-copy it on a DSH upgrade). The
`persona` row had to go because it is scope-only: it shadows the global prefix inside the agent scope, so
blanking `system-prompt.personaPrefix` alone would not have changed a web session. The host-specific fragment is
intentionally not committed; the two rows above are the reproducible form.

**Verified live.** Restart PID 1613944 → 1648385, boot clean (0 warning/error lines), journal
`[dsh-soul] loaded SOUL persona … (1545 bytes, order 0)`. A new session's stored system prompt was 9,391 chars
and **starts** with `# Identity` (the deployment persona), with 0 occurrences of `You are a coding agent` and 0
of `You are an AI agent powered by DeepSeek Harness`. First turn answered in 6 s.

**Rollback.** Restore `cordis.patch.yml.bak-persona-20261112T162054` and restart the host.

## 2 — Hindsight: bounded recall instead of a failed-reflect stall

**Root cause is an upstream error state, not a DSH or plugin bug.** The plugin's `autoInject: "reflect"` asks the
Hindsight server for a cheap synthesis on the first prompt; the server's synthesis LLM call fails, and the plugin
falls back *by design* (docs: on timeout/5xx → knowledge-page search → raw observation recall). Evidence from
`~/.hindsight/coding-agents-logs/diag.jsonl`:

```json
{"event":"reflect_failed","ms":19043,"timeoutMs":20000,
 "error":"reflect 500 {\"detail\":\"Error code: 402 - Insufficient Balance (request_id: …)\"}"}
{"event":"reflect_fallback_pages","ms":24,"count":0}
{"event":"reflect_fallback_observations","ms":297,"count":10}
{"event":"inject_ok","chars":17701}
```

So the first turn waited ~19 s and then injected 17.7 KB of unsynthesized memory. The 402 comes from the
Hindsight instance's synthesis LLM (Hermes-profile config: `opencode.ai/zen/go/v1`, `deepseek-v4.1-flash`)
having no balance — a Hermes-side billing/config issue we deliberately did not touch. The knowledge-page tier is
dead until it is fixed (`pages: 0` on every session).

**Applied client config** — `~/.dsh-personal/hindsight/coding-agent.json` (backup
`coding-agent.json.bak-memory-20261112T162054`), read at boot via the `20-hindsight.conf` unit drop-in:

```json
{
  "autoInject": "recall",
  "injectTimeoutMs": 3000,
  "recallOptions": { "max_tokens": 800 }
}
```

`recall` is retrieval-only (no LLM), so the first prompt no longer waits on a synthesis that cannot answer, and
the recall payload is capped. Bank stays `dsh-personal`; retains stay on.

**Verified after.** New session: `inject_recall` 1,222 ms, 8 observations, 12,801 chars injected (5,172 recall +
7,486 fixed tool-guide/refresh), no `reflect_failed`; turn answered in 6 s.

**Rollback.** Restore `coding-agent.json.bak-memory-20261112T162054` and restart the host.

## Residuals

- The upstream 402 is Hermes-owned; the knowledge-page tier stays empty until that account is topped up.
- Also observed at the time: `hindsight-hermes.service` had been `failed` since 2026-10-12 (203/EXEC) while the
  API stayed healthy on `127.0.0.1:9177` via an out-of-unit uvx daemon — not touched.
- Re-copy the `standard` preset child list on any DSH upgrade; a stale copy silently drops upstream additions.
