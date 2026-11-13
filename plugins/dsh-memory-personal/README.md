# @local/dsh-memory-personal

Personal-agent memory for the DeepSeek Harness: a **bounded curated profile block** plus
`memory_remember` / `memory_recall` / `memory_forget` tools over the **Hindsight REST API**.

It replaces `@vectorize-io/hindsight-coding-agents` on the `personal` profile. The Hindsight server
stays; only the client changes.

## Why

The coding-agent integration is built for repositories: banks keyed by git project, git-history
ingest, "knowledge pages" about a codebase, commit rationale — and a ~12 KB tool-usage manual injected
on the first prompt that then rides in **every** request. Measured on this host on a non-coding
question:

| | coding-agent plugin | this plugin |
|---|---|---|
| prompt injection | 12,066 chars ≈ **3,175 tokens**, ~75 % of it a tool manual | ~40 tokens empty, ~1,300 tokens at budget |
| tools | 8 (`hindsight_*`, page-oriented) | 3 (remember / recall / forget) |
| per-step cost | fixed, every request | only what the profile holds |
| assumes a repo | yes | no |

## The three tiers it belongs to

1. **Always-on, bounded** — this plugin: a curated `profile.json` (two tracks, hard character
   budgets) rendered as one static prompt section. Cache-safe: the text changes only when the model
   edits it.
2. **Unbounded, on demand** — `@deepseek-ai/dsh-experimental-session-search` (FTS5 over all sessions,
   no LLM calls). Already installed on `personal`.
3. **Semantic, on demand** — Hindsight, reached here as ordinary tools. No injection, no manual.

## Install

```bash
dsh plugin --profile personal add /path/to/plugins/dsh-memory-personal
```

or, for a local checkout, add `@local/dsh-memory-personal` to the profile's `dsh.profile.bundles`.

## Configuration

Override the row in the profile's `cordis.patch.yml`:

```yaml
- id: dsh-memory-personal
  config:
    apiUrl: http://127.0.0.1:9177   # default
    bankId: dsh-personal            # default — never Hermes' `josh` bank
    profilePath: ~/.dsh-personal/memory/profile.json
    userBudget: 2200                # chars, "about the user" track
    agentBudget: 4000               # chars, "notes to self" track
    recallMaxTokens: 800
    timeoutMs: 4000
    inject: true                    # false = tools only, no prompt block
```

Env fallbacks: `HINDSIGHT_API_URL`, `HINDSIGHT_BANK`, `DSH_MEMORY_PROFILE`.

## Storage

`$DSH_HOME/memory/profile.json`, 0600, atomic write (tmp + rename):

```json
{
  "user": ["Based on the Sunshine Coast, QLD.", "Runs a small farm; prefers suppliers < 1 h away."],
  "agent": ["Soft rock phosphate: NTS at Yandina is the manufacturer; TGRM Gympie stocks 25 kg bags."]
}
```

Budgets are enforced **before** a write. An overflow returns the current entries and the exact number
of characters to free, so the model has to consolidate in one batch instead of silently truncating
(the Hermes mechanism — limits force curation).

## Tools

| Tool | Does | Notes |
|---|---|---|
| `memory_remember(text, target)` | `user` / `agent` → curated block + Hindsight; `fact` → Hindsight only | budget-checked; retain is fire-and-forget |
| `memory_recall(query)` | Hindsight semantic recall, top 8 with dates and scores | fails soft: a dead server explains itself, never blocks a turn |
| `memory_forget(text, target)` | removes a curated entry by distinctive prefix | Hindsight keeps history; this only unclutters the prompt block |

## Design rules

- **Fail-open.** Hindsight unreachable → recall returns an explanatory message; boot is unaffected.
- **No deps.** Node builtins + global `fetch`, so the bundle resolves from any profile.
- **No LLM calls of its own.** Every token spent is the profile block plus three schemas.
- **Cache-safe.** One static section, no per-turn churn.
- **Writes only under `$DSH_HOME/memory`.**

## Rollback

Remove the bundle from the profile (or disable the row) and restart. The profile file and the
Hindsight bank are untouched, so re-installing resumes where it left off.

## Tests

- `node --input-type=module -e "…"` unit checks for `readProfile` / `writeProfile` / `renderProfile`
  (no test runner needed).
- Integration: run a session that states a preference, then a second one that asks about it — the
  first should call `memory_remember`, the second should answer from the block without a tool call.
