# Personal-agent memory on Hindsight

**Date:** 2026-11-13 · **Status:** built + tested in an isolated profile; not yet installed on `personal`
· **Component:** [`plugins/dsh-memory-personal`](../plugins/dsh-memory-personal/) (`@local/dsh-memory-personal` 0.1.0)

## 1. The problem, measured

`@vectorize-io/hindsight-coding-agents@0.8.6` is the *coding-agent* integration for Hindsight. Its
assumptions are all repository assumptions: banks keyed by git project (`coding-agent::{gitProject}`),
git-history ingest, knowledge pages about a codebase, commit rationale, "past developer sessions".

The personal host does no coding, so none of that applies — but the plugin still injects its guide on
the first prompt, and that block then rides in every request. Measured from a real session transcript
(`session-bb9b6c05…`, 24 steps):

| Part of the injected block | ≈ tokens |
|---|---:|
| `<hindsight_knowledge>` — static tool manual ("call this when…", "FIRST STOP") | ~2,300 |
| `<hindsight_memory>` — the actual recalled memories (`max_tokens: 800` caps this) | ≤800 |
| `<hindsight_knowledge_refresh>` — more instructions | ~60 |
| **Total per step** | **3,175** |

Three quarters of the per-step cost is a manual for tools the task never used, and the knowledge-page
tier stays empty because synthesis returns 402 upstream. On a fertiliser-research question the model
called Hindsight once in 20 steps and it contributed nothing.

## 2. What the field converged on

Hermes / OpenClaw / Letta all landed on three tiers, not one memory system
([`hermes.md`](hermes.md) §Memory system):

1. **Always-on, tiny, curated.** Hermes: `MEMORY.md` 2,200 chars (≈800 tokens) + `USER.md` 1,375 chars
   (≈500 tokens), injected as a frozen snapshot at session start, `§`-delimited, hard character limits
   that force consolidation, agent-editable through a tool, injection-scanned.
2. **Unbounded, on demand.** SQLite FTS5 `session_search` over every session — no LLM calls.
3. **Optional semantic.** External providers behind a `MemoryProvider` interface, bounded by
   `recall_budget` and score caps. Hindsight is one of these, not the whole design.

Hermes' own instance shows what tier 3 looks like when it works: bank `josh`, 58,630 facts, behind a
bounded recall. The DSH host had 158 facts in `dsh-personal` — retention was fine; only the *surface*
was wrong.

## 3. What was built

`@local/dsh-memory-personal` — dependency-free Cordis plugin (node builtins + global `fetch`):

| Piece | Behaviour |
|---|---|
| **Tier 1** | `$DSH_HOME/memory/profile.json`, two tracks (`user`, `agent`), rendered as one static prompt section at `DEPLOYMENT_PERSONA_PREFIX + 1` |
| **Budgets** | 2,200 / 4,000 chars, enforced **before** a write; an overflow returns the current entries and the exact characters to free (the Hermes consolidation loop) |
| **Tools** | `memory_remember(text, target)`, `memory_recall(query)`, `memory_forget(text, target)` — 459 tokens of schema total |
| **Tier 3** | Hindsight REST: `POST /v1/default/banks/{bank}/memories` (retain, fire-and-forget) and `…/memories/recall` (semantic, top 8 with dates + scores) |
| **Failure mode** | fail-open: a dead server returns an explanatory tool result; boot is unaffected |

Deliberately **not** built: auto-retain per turn (the coding plugin's session write-back), knowledge
pages, git ingest, a `/memory` command surface, any LLM call of its own.

Storage is 0600, atomic write (tmp + rename), and only under `$DSH_HOME/memory`.

## 4. Test results (isolated profile)

Harness: a throwaway `$DSH_HOME` under `.tmp/`, same bundles as `personal` minus the web-only ones,
same model route (`opencode-go/deepseek-v4.1-flash`, reasoning `low`), same persona. Nothing on the
live host was written.

**Test 1 — write a preference, then use it.** Prompt: *"Remember that I'm based on the Sunshine Coast
and only want suppliers within an hour's drive. Then tell me what you remember about soft rock
phosphate suppliers."*

| | result |
|---|---|
| steps / wall | 5 / 51 s |
| tokens (in + cache + out) | 70,850 |
| tools called | `memory_remember` ×1, `memory_recall` ×3, `glob`, `read` |
| profile written | `user: ["User is based on the Sunshine Coast and only wants suppliers within an hour's drive."]` |
| Hindsight retain | verified — bank `dsh-personal` 158 → 160 nodes, fact tagged `user`, recall surfaces it |

**Test 2 — cross-session recall with no tool call.** New session, same prompt family: *"Where am I
based, and what rule do I have for picking suppliers? Answer from what you already know."*

| | result |
|---|---|
| steps / wall | **1 / 5.5 s** |
| tokens | **12,150** (12,072 in, 78 out) |
| tool calls | **0** |
| answer | "You're based on the **Sunshine Coast**, and your supplier rule is: only use suppliers **within an hour's drive**." |

That is the whole point of tier 1: a fact stated once is available in the next session at zero tool
cost, for ~1,300 tokens of prompt instead of 3,175 tokens of manual plus a tool round-trip.

**Prompt-block cost:** 317 chars (~85 tokens) when empty, ~1,300 tokens at both budgets.

## 5. Decisions

- **Keep the Hindsight server, replace the client.** The 158 facts live in Hindsight's Postgres, not in
  the plugin, so swapping clients loses nothing. The bank stays queryable via REST and `/mcp`.
- **Generic REST, not the MCP server, for this plugin.** MCP exposes `retain`/`recall`/`reflect` plus
  bank management; the plugin needs two calls and no extra process, so it speaks REST directly. The MCP
  route stays available for other agents.
- **Curated block over "recall everything".** Unbounded injection is what the coding plugin did; a
  bounded, inspectable file is what Hermes proved. The model can always call `memory_recall` for depth.
- **Rejected:** `autoInject: "none"` alone (stops the bleed but leaves 8 wrong-shaped tools and no
  tier 1); dropping Hindsight entirely (loses the 158 facts and semantic recall); a second memory
  engine (duplicate recall, per the M0.5 scout).

## 6. Host state

Nothing on `personal` changed. The plugin exists in the repo, is installed in the throwaway test
profile, and has no entry in `~/.dsh-personal` yet. Installing it is a separate, human-approved step:
add the bundle, disable the `hindsight` row, restart, verify.

Rollback for that future step: remove the bundle, re-enable `hindsight`, restart. `profile.json` and
the bank are untouched either way.

## 7. Next

- Install on `personal` after approval; re-run the two tests against the live host.
- Consider a `USER.md`/`MEMORY.md` export view (the file is already human-readable JSON).
- Decide whether the coding-agent plugin is removed entirely or kept with `autoInject: "none"` for its
  `hindsight_reflect` tool once synthesis works again.
