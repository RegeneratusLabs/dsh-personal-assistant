# Memory + identity plugin scout — plug-and-play DSH components

**Scout:** memory-scout (task-3) · **Date:** 2026-11-10 · **Target host:** DSH `0.2.2-rc.1` (installed at `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh`, cordis `4.1.0`), profile `web`.
**Scope:** MEMORY and IDENTITY layers of the personal agent. Read-only recon: nothing installed, no profile touched.

---

## 0. TL;DR

**Recommended stack (3 plugins, all installable today):**

| # | Plugin | Layer | Install | Replaces planned code |
|---|---|---|---|---|
| 1 | `@vectorize-io/hindsight-coding-agents` | Long-term engine + auto-recall + retain + knowledge pages + tools, **called at the already-running Hindsight 0.10.3** | `dsh plugin --profile personal add @vectorize-io/hindsight-coding-agents` | `dsh-memory-hindsight` (~250–350 LOC) + recall injector |
| 2 | `dsh-memento` | `ctx.memory` **seam** + bounded notes tier + write-approval gate + audit + frozen snapshot (SQLite) | `dsh plugin --profile personal add dsh-memento` | `dsh-memory` seam (300–400 LOC) + `dsh-memory-notes` (150 LOC) |
| 3 | `dsh-soul-md` | Identity: persona cards (Markdown), workspace/session persona selection | `dsh plugin --profile personal add dsh-soul-md` | identity/soul loader (not yet in plan) |

Plus one official row, not a market plugin: `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` (see §6.1 — **do not install `@latest`**, it is the wrong line).

**Single best find:** `@vectorize-io/hindsight-coding-agents` — the official Hindsight integration ships a first-class DSH Cordis plugin (`dsh plugin ... add`) that natively implements the recall-injection policy our design calls "the adapter": per-workspace banks, `autoInject` on first prompt (once per session, cache-safe), automatic session write-back, git ingest, knowledge pages, and 6 `hindsight_*` tools. 115,887 downloads/month, MIT, 60,145-star repo pushed same day as audit. It turns ~600 LOC of planned `ctx.memory`+adapter work into a config file pointed at `127.0.0.1:9177`.

**Biggest remaining gap:** no plugin covers the **curator/digest schedule** (Hindsight has server-side consolidation and mental models, but nothing wires a DSH-scheduled consolidation job), and **no market plugin declares verified `0.2.2-rc.1` hosting for the two winners** — both need one smoke test in a scratch profile before they touch the personal profile.

---

## 1. Method (and what "verified" means here)

1. **Index filter** — `.cache/plugin-index.json` (format 1, 4,985 plugins) filtered with a local Node script: `metadata.category == memory` (219 hits) and `identity` (63 hits), plus keyword sweep over name+`description.en|zh` for `hindsight, mem0, openmemory, mcp memory, curator, session search, obsidian, knowledge graph, memory.md, soul.md, user profile, recall, forget, embedding, vector, dream, consolidat, decay, persona card`.
2. **Compatibility pass** — `.dsh-market/discovery-compatibility-v1.json` (`schema: dsh-market/discovery-compatibility-cache/v1`, **4,926 entries** under `entries`). `enginesDsh` / `peerDependencies` ranges evaluated against `0.2.2-rc.1` **with `includePrerelease: true`** (npm's default rule rejects `0.2.2-rc.1` against `>=0.2.1-rc.2 <0.3.0-0`; DSH's market cache intends it to pass — verified with the `semver` shipped in the DSH install). Cache is slightly stale: latest npm version was re-fetched for every shortlisted package.
3. **npm verification** — `registry.npmjs.org/<pkg>/latest` (+ full packument where dist-tags mattered): `version`, `engines`, `dsh` (bundle patch + `dsh.compatibility`), `peerDependencies`, `dist.unpackedSize`, `dist.fileCount`, `license`, `repository`, publish date from `time`. Downloads from `api.npmjs.org/downloads/point/last-month/<pkg>`.
4. **README review** — `cdn.jsdelivr.net/npm/<pkg>@<ver>/README.md`, 16 packages; jsDelivr failed for `@zilliz/memsearch-dsh` (502) → README read from `raw.githubusercontent.com/zilliztech/memsearch/main/plugins/dsh/README.md`.
5. **Local ground truth** — Hindsight `http://127.0.0.1:9177`: `/health`, `/version`, `/openapi.json`, `/mcp` (JSON-RPC `initialize`), `/v1/default/banks`. Profile state from `~/.dsh/profiles/web/{package.json,cordis.patch.yml}`; home patch layer `~/.dsh/cordis.patch.yml`.

**Evidence markers used below:** `[npm]` = registry fact, `[local]` = measured on this machine, `[README]` = vendor claim, `[index]` = marketplace text (untrusted). Marketplace/README claims are never treated as behavior.

---

## 2. Compatibility legend

| Mark | Meaning |
|---|---|
| **DECLARED** | package's own `engines.dsh` / `peerDependencies` **and** `dsh.compatibility.dshReleases` admit `0.2.2-rc.1` |
| **RANGE-OK** | `engines.dsh`/peers admit `0.2.2-rc.1`, but the vendor did not list it in `dshReleases` → runtime-unverified |
| **UNDECLARED** | no `engines.dsh` and no DSH peer ranges at all → no version gate, nothing to satisfy, nothing verified |
| **MISMATCH** | some `@deepseek-ai/*` peer range excludes `0.2.2-rc.1` / cordis `4.1.0` |
| **EXCLUDED** | `engines.dsh` explicitly cannot match `0.2.2-rc.1` → do not try |

Verdicts: **ADOPT** (install now) · **TRIAL** (scratch profile test first) · **BUILD-OURS** (gap nothing fills) · **REJECT** (why given).

---

## 3. Candidate table (15 verified candidates)

Sizes are `dist.unpackedSize`; activity is npm downloads last month (2026-10-10 → 2026-11-08) and publish date of the latest version.

| Name | Install spec | Category | What it does (per README, claims) | Compat | Activity / size | Risks | Verdict |
|---|---|---|---|---|---|---|---|
| **`@vectorize-io/hindsight-coding-agents`** | `dsh plugin --profile personal add @vectorize-io/hindsight-coding-agents` | memory | Official Hindsight integration for 20 agents incl. **DeepSeek Harness**. Native Cordis plugin (no MCP): per-workspace banks, session write-back, git-history ingest, 5 knowledge pages, `autoInject` on **first prompt only**, 6 `hindsight_*` tools | **UNDECLARED** (no engines/peers — nothing to gate on) | 115,887/mo; 0.8.6 2026-11-06; 17.2 MB / 67 files; 0 deps; MIT repo, 60,145★, pushed 2026-11-10 | 17 MB download (bundles 20 harness entrypoints; DSH entry `dist/dsh.js` = 746 KB); `npm` `license` field empty (repo LICENSE = MIT); no DSH version declaration; 9177 ≠ its default daemon port 9077 → must use `self-hosted` + `apiUrl`; writes into Hindsight banks (must not land in Hermes' `josh` bank) | **ADOPT** (smoke-test first) |
| **`dsh-memento`** | `dsh plugin --profile personal add dsh-memento` | memory | The intended `ctx.memory` **seam**: typed service + zero-dep SQLite provider (`node:sqlite`, `$DSH_HOME/dsh-memento/memory.db`, 0600), 2 tracks × 2 layers with hard char budgets (2000/4000 default), write-approval gate enforced **inside the service**, audit trail, frozen snapshot injected once per session, `memory` + `memory_recall` tools, `/memory` command, read-only MCP server, provider **conformance suite** + `ctx.memoryAdapters` registry | **RANGE-OK** (`>=0.2.2-0 <0.3.0`); README baseline re-verified on `0.2.1-alpha.2` | 7,717/mo; 0.5.30 2026-11-05; 731 KB / 46 files; 0 deps; Apache-2.0 | Own protocol is a *proposal* for an official seam; `retrieval.vector` is a fake hash embedding (README admits); verified on 0.2.1-alpha.2, not rc.1; one process per store | **ADOPT** (smoke-test first) |
| **`dsh-soul-md`** | `dsh plugin --profile personal add dsh-soul-md` | memory (tagged) / identity in substance | Persona cards (Markdown), workspace default + per-session selection, resolution order session → workspace → default → off; `soul_read`/`soul_update`; file memory `memory_read`/`memory_append`/`memory_rewrite`/`memory_search` with `core.md` + `topics/*.md`; memory can be disabled per card; no injection into subagents by default | **DECLARED** (`dsh.compatibility.dshReleases["0.2.2-rc.1"] = compatible`; engines list it explicitly) | 51,785/mo; 0.12.2 2026-11-08; 128 KB / 1 dep; Node ≥20.18 | Its file memory duplicates the notes tier → turn it off per card; client-side persona UI only | **ADOPT** (memory off) |
| **`dsh-hermes-memory`** | `dsh plugin --profile personal add dsh-hermes-memory` | memory | Faithful port of Hermes' `MEMORY.md`/`USER.md`: two banks (`memory` 2200 chars, `user` 1375 chars, `§`-separated), one `memory` tool (add/patch/replace/remove/batch), **frozen snapshot read once per session**, web panel, `memory_search/list/stats/debug`; **no extra LLM calls**, no external runtime | **RANGE-OK** (peers `dsh-tools >=0.1.0-rc.6 <0.3.0-0`); README baseline `0.2.2-alpha.2` | 1,182/mo; 1.2.0 2026-11-09; 141 KB / 12 files; 0 deps | Low adoption; single-writer only (no cross-process CAS); panel needs DSH owner-auth service (503 without it) | **TRIAL** (best minimal notes alternative) |
| **`dsh-auto-memory`** | `dsh plugin --profile personal add dsh-auto-memory` | memory | Claude-Code-style typed memory files (user/feedback/project/reference) with auto-injected `MEMORY.md` index, consolidation with `candidate` → user-`verified` lifecycle, recall funnel, runtime settings card, evaluation suite incl. LongMemEval-S | **RANGE-OK** (peers `dsh-* >=0.1.5-rc.2 <0.3.0`) | 11,606/mo; 1.5.0 2026-11-08; 342 KB / 8 files; 2 deps | **Second memory system writing memory** alongside Hindsight → duplicate/conflicting recall; self-described "no servers/embeddings" so long-term retrieval is keyword-level | **TRIAL** (alternative to #1+#2, not a companion) |
| **`dsh-plugin-memory`** | `dsh plugin --profile personal add dsh-plugin-memory` | memory | Portable markdown+git store ("LLM Wiki"), `SOUL.md` persona + boot block injected through runtime context at session start, per-file budget, `/memory on\|off`, digest/proactive recall, 3D memory graph UI, `dsh-memory doctor`, pack/unpack | **RANGE-OK** (`engines.dsh ^0.2.1-rc.5` → admits 0.2.2-rc.1; no `dshReleases`) | 35,663/mo; 0.18.4 2026-11-10; 520 KB | One-package "everything" = competes with Hindsight for the injection slot; 16 settings + UI surface; SOUL forging flow | **TRIAL** (single-package path; do not mix with #1) |
| **`dsh-engramory`** | `dsh plugin --profile personal add dsh-engramory@1.5.2` | memory | One fact per Markdown file; `MEMORY.md` index injected as a message, re-injected only when index changes; hard caps (200 lines / 25 KB) enforced before writes; compression warning; bundled memory skill; read-only sidebar page with link lint | **DECLARED** (`dshReleases["0.2.2-rc.1"] = compatible`) | 7,184/mo; 1.5.2 2026-11-06; 405 KB | Index re-injection mid-session is **not** stable-prefix friendly; validates against `dsh.compatibility.dshReleases`, unlisted versions unverified | **TRIAL** |
| **`dsh-memoir`** | `dsh plugin --profile personal add dsh-memoir@0.9.5` | memory | Local-first *project* memory: bounded Hot Memory injected into new sessions + BM25 on-demand recall of full history; JSON source of truth + generated `PROJECT_MEMORY.md`; no embedding/vector/cloud; zero bundled runtime deps | **RANGE-OK** (`... \|\| >=0.2.2-rc.1 <0.2.2`); README says adapted to DSH `0.2.2-rc.1`, Node ≥24.9 | 4,348/mo; 0.9.5 2026-11-06; 751 KB; Node `^22.19 \|\| >=24` | Project-scoped (not user/identity-scoped); no migration path on upgrade; overlaps notes tier | **TRIAL** |
| **`dsh-memory-tiers`** | `dsh plugin --profile personal add dsh-memory-tiers` | memory | Six-layer local memory (L1 turn log → L2 consolidation → DL1/DL2/DL3 stores → L3 long view), per-turn injection block, optional **replace conversation history with memory**, per-session work mode, persona insertion, star-map UI, `/memory` command | **UNDECLARED** (only `engines.node >= 20`) | 3,987/mo; 1.3.1 2026-11-05; 370 KB | Documented install route in README is `pnpm add link:` (not the plugin command); uses a model for staging/summarizing (extra LLM spend); replaces history → high blast radius | **TRIAL** |
| **`@zilliz/memsearch-dsh`** | `dsh plugin --profile personal add @zilliz/memsearch-dsh` | memory | Cross-agent shared `.memsearch/memory/` Markdown store (same store as Claude Code/Codex/OpenClaw/OpenCode plugins) + Milvus hybrid index; capture via headless summarize, pre-step **hint** (not injection), native recall skill, review dock panel | **UNDECLARED** (no engines.dsh) | 9,977/mo; 0.1.9 2026-11-10; 197 KB | **Hard prerequisites**: `uv tool install "memsearch[onnx]"`, Python 3 on PATH, Milvus index, headless-agent summaries (LLM cost per capture); hint-only injection | **REJECT** for this stack (keep in mind only if cross-agent sharing becomes a requirement) |
| **`dsh-mem0`** | `dsh plugin --profile personal add dsh-mem0` | memory | Mem0 long-term memory with three backends (Mem0 **Platform** cloud, self-hosted REST, local OSS Python sidecar); auto recall per turn + auto capture, editable profile summary, token budgets, weekly hygiene, 9 tools, settings/library UI | **RANGE-OK** (`engines.dsh >=0.2.1-rc.5 <0.3.0`, Node ≥22) | 654/mo; 0.3.1 2026-11-05; 2.4 MB; 0 deps | Duplicate engine next to Hindsight; Platform backend sends prompts/facts to a cloud service; needs API key or Python/Qdrant sidecar | **REJECT** (duplicate engine; optional A/B only) |
| **`@honcho-ai/dsh-honcho`** | `dsh plugin --profile personal add @honcho-ai/dsh-honcho` | memory | Plastic Labs Honcho: injects user profile + session summary + relevant conclusions at session start, uploads every turn to Honcho | **UNDECLARED** | 5,892/mo; 0.1.4 2026-10-27; 173 KB; 2 deps | Third-party **cloud SaaS** holding the personal profile; duplicate engine | **REJECT** (cloud dependency) |
| **`dsh-hindsight-gui`** | `dsh plugin --profile personal add dsh-hindsight-gui` | memory | Settings/status dashboard for Hindsight in the DSH sidebar: connection, models, embedding backend, bank settings, health checks, audit + per-bank redaction; explicitly **not** a memory engine; restart only for services it verified as its own | **UNDECLARED** (`manifestVersion: 1`, no peers) | 3,462/mo; 1.4.4 2026-11-08; 800 KB | Adds nothing functionally; may attempt to manage a daemon it does not own (server here is external) | **TRIAL** later (design D8: no custom UI until data exists) |
| **`dsh-agent-soul`** | `dsh plugin --profile personal add dsh-agent-soul` | memory | Persona (Markdown, project overlays global) + **decaying** memory card (clear→blurred→faded→forgotten) + intent/"things on her mind" + mood engine (7 emotions) + daily diary (public/private) + never-decaying notes; 8-tab settings; own `llm.stream` calls | **RANGE-OK but vendor says unverified**: `dsh.compatibility.note = "0.2.2-rc.1 仅声明 engines 放行，尚未实机验证"`; `verifiedOn 0.2.1-rc.5` | 5,810/mo; 0.9.13 (npm 0.9.16) 2026-11-09; 2.3 MB | Roleplay-soul feature set (mood/diary/personality drift) is far beyond a personal-assistant identity layer; own LLM calls; derived work under a non-standard plugin license (see THIRD-PARTY-NOTICES) | **TRIAL** (only if a "living character" is wanted) |
| **`dsh-longterm-memory`** | — (do not install) | memory | Obsidian-compatible Markdown vault + sidebar page + 4 tools + budgeted per-turn recall | **EXCLUDED**: `engines.dsh = ">=0.2.1-rc.3 <0.2.2"` — `0.2.2-rc.1` is outside | 0.1.8 2026-10-29; 894 KB | Hard version exclusion | **REJECT** |
| **`dsh-expmem`** | — (do not install) | memory | Small experimental memory plugin | **EXCLUDED**: `engines.dsh = "0.2.0-rc.2"` (exact pin) | 0.1.1 2026-10-12; 36 KB | Exact-pin on a dead rc | **REJECT** |

Also checked and excluded from the table: `dsh-memory-with-soul` (TRIAL/REJECT — pure Markdown+git and `SOUL.md` are nice, but **Python ≥3.10 is a hard dependency** for `core/memory.py`, README explicit), `dsh-layered-memory` (MISMATCH — `dsh-tools` peers stop at `0.2.1-rc.*`; 5.7 MB), `dsh-unified-agent-memory` (Python core + 2.4 MB; shared Obsidian vault), `dsh-soul-seed` (persona+mood+long-term memory+per-person ledgers; 963/mo, 0.13.20, UNDECLARED), `dsh-mem-weave` (memory+persona in one, 885/mo, UNDECLARED).

---

## 4. Deep dives on the top 8

### 4.1 `@vectorize-io/hindsight-coding-agents` 0.8.6 — the engine + injector

**Verified `[npm]`:** 0.8.6 published 2026-11-06; `dsh: {bundle:{patch:"./cordis.patch.yml"}}`; no `engines`, no `peerDependencies`, **0 dependencies**; 17,175,650 B unpacked / 67 files; repo `github.com/vectorize-io/hindsight` (MIT, 60,145★, pushed 2026-11-10); 115,887 downloads/mo.
**Verified `[local]`:** Hindsight API is live: `/version` → `{"api_version":"0.10.3","features":{"mcp":true,"worker":true,...}}`; `/health` → `{"status":"healthy","database":"connected"}`; `/mcp` speaks MCP `2025-06-18` (`serverInfo.name = hindsight-mcp-server`, version 0.10.3); banks = `josh` (58,310 facts), `hermes-bank-3` (29), `hermes-bank-2` (66).
**Install paths `[README]`:** `npx @vectorize-io/hindsight-coding-agents install dsh` (writes a Cordis row in `$DSH_HOME/cordis.patch.yml`) **or** the package-manager route, quoted verbatim for DSH: *"`dsh plugin --profile web add @vectorize-io/hindsight-coding-agents` works too: the package ships the profile patch layer"*. Prefer the package route: it stays inside the profile and is removable with `dsh plugin remove`.
**Config surface `[README]`:** one JSON file `~/.hindsight/coding-agent.json` (env fallbacks `HINDSIGHT_*`, `HINDSIGHT_CONFIG` relocates it). Keys that matter here:
- `serverMode: "self-hosted"` + `apiUrl: "http://127.0.0.1:9177"` → **reuse the running Hindsight**, no daemon, no `uv`, no new Postgres. (`daemon` mode would start `hindsight-embed` on **9077**, not our 9177 — wrong mode for us.)
- `bankIdTemplate: "coding-agent::{gitProject}"` (default) → one bank per repo; `bankId` pins one static bank. **Do not** pin `bankId: "josh"` — that is Hermes' bank (58k facts).
- `autoInject: "reflect" | "pages" | "recall" | "none"` — injection fires **once, on the session's first prompt**; `"pages"`/`"recall"` are retrieval-only with `injectTimeoutMs` (7,000 ms default). This is the cache-safe shape design D4 asks for (one dynamic block, not per-turn churn).
- `retainSessions: true` (session write-back per Stop), `retainExtractionMode: "concise"|"verbose"|"verbatim"|"chunks"` (token cost per turn), `gitIngest: "none"|"message"|"full"`, `recallOptions` (raw recall body override, e.g. `{"max_tokens": 4000}`), `pages` / `customPages`, `optInOnly` + `optInPaths` (fail-closed privacy switch), `harnesses.dsh.*` overrides.
**Tools `[README]`:** `hindsight_reflect`, `hindsight_search_knowledge_pages`, `hindsight_ingest_document`, `hindsight_capture_initiative`, `hindsight_sync_status`, `hindsight_diagnose` — close to the 3-tool surface the design wanted (`retain`/`recall`/`reflect`) but not identical: there is no explicit `retain`/`recall` tool (retain is automatic, recall rides `autoInject`/`reflect`).
**Costs/risks:** 17 MB unpacked is 20 bundled per-harness entrypoints (`dist/mcp-server.js` 1.26 MB, `dist/opencode2.js` 1.20 MB, `dist/index.js` 1.20 MB, **`dist/dsh.js` 746 KB**); extraction runs on the Hindsight server (already paid for by Hermes). No DSH `engines`/peer declaration at all → nothing proves 0.2.2-rc.1, and no `dsh.compatibility.dshReleases` map. npm `license` field empty (repo LICENSE MIT — flag for legal, not blocking).
**Verdict: ADOPT** — after a smoke test in a scratch profile: plugin loads, `hindsight_sync_status` reaches 9177, one bank `coding-agent::DSH-playground` is created, and the first-prompt block is present. Reversible with `dsh plugin remove`.

### 4.2 `dsh-memento` 0.5.30 — the `ctx.memory` seam and notes tier

**Verified `[npm]`:** 0.5.30, 2026-11-05; Apache-2.0; `engines.dsh` includes `>=0.2.2-0 <0.3.0`; peers `cordis ^4.0.3`, `dsh-tools`/`dsh-session`/`dsh-settings` ranges include the 0.2.2-0 line; 0 deps; 730,932 B / 46 files; `dsh.capabilities: ["network:egress","tools:register"]`; 7,717 downloads/mo; repo `github.com/PerryLink/dsh-memento` (Apache-2.0).
**What it is `[README]`:** "a capability seam, not another memory warehouse" — provides the service keys `memory`, `memoryAdapters`, `memoryEmbedding`, `memoryRetrieval`; local SQLite provider (`node:sqlite`, WAL, `0600`, `$DSH_HOME/dsh-memento/memory.db`); write paths forced through an approval waterfall **inside the service** (`writePolicy: ask|auto|off`, model-invisible); audit reconstructable from `approval/asked` + `approval/decided` + own table; frozen snapshot injected once per session at `snapshotOrder: -50` (after harness identity, before persona); hard per-track/per-layer budgets (user-global 2000, user-workspace 2000, agent-global 4000, agent-workspace 4000 chars — all tunable); `/memory list|query|add|remove|consolidate|proposals|budgets|audit|export|import|adapters`; read-only web panel; read-only stdio MCP server (`memory_search`, `memory_stats`); declares `network:none`, `subprocess:none`, `shell:none`, `python:none`, `credentials:none`.
**Why it matters for us:** it is exactly the planned `dsh-memory` seam + `dsh-memory-notes` tier, already implemented with a **provider conformance suite** (`node test/protocol-conformance/run.mjs --provider ./your-factory.mjs`) and a third-party **adapter registry** (`ctx.memoryAdapters.register/list/adapt/export`). If the official seam lands, this plugin's protocol is its stated rehearsal, with a documented migration path.
**Claims to treat carefully `[README]`:** verified baseline is `dsh-v0.2.1-alpha.2` (not rc.1); `retrieval.vector: true` uses a *fake hash embedding*; "one process, one store", last-writer-wins across processes; session `memory/*` event types are declared but not emitted (host cannot register out-of-repo event types yet).
**Verdict: ADOPT** (scratch-profile smoke test: service present, snapshot lands in `system/message`, a write goes through the approval gate, `/memory audit` renders).

### 4.3 `dsh-soul-md` 0.12.2 — identity without a memory engine

**Verified `[npm]`:** 0.12.2, 2026-11-08; `engines.dsh` lists `0.2.2-rc.1` explicitly; `dsh.compatibility = {dsh, node>=20.18, profiles:[web,desktop], dshReleases:{"0.2.2-rc.1":"compatible",...}}`; 1 dep; 128,457 B; 51,785 downloads/mo.
**What it does `[README]`:** persona cards in Markdown; per-session and per-workspace selection with resolution `session → workspace → default → none`; `soul_read`/`soul_update`; layered file memory `core.md` + `topics/*.md` with `memory_read`/`memory_append`/`memory_rewrite`/`memory_search` and compaction compensation; **memory can be disabled per card**; persona/memory not injected into subagents by default.
**Risk:** its file memory is a second notes store — disable it if `dsh-memento` owns notes; two persona UIs (its cards vs. DSH presets) must not both inject identity.
**Verdict: ADOPT** as the identity layer, memory off.

### 4.4 `dsh-hermes-memory` 1.2.0 — the minimal Hermes-shaped notes tier

**Verified `[npm]`:** 1.2.0, 2026-11-09; no `engines.dsh`; peers `cordis >=4.0 <5`, `dsh-tools >=0.1.0-rc.6 <0.3.0-0`, `schemastery >=3 <4` (admits `4.1.0` / `0.2.2-rc.1`); 0 deps; 140,930 B / 12 files; 1,182 downloads/mo.
**What it does `[README]`:** `memory` bank 2,200 chars + `user` bank 1,375 chars, entries `\n§\n`, Unicode-codepoint counting; a **frozen snapshot read once per session**; one `memory` tool with `add|patch|replace|remove|batch`; `memory_search/list/stats/debug`; web panel at sidebar footer (needs DSH owner-auth, 503 without it); **does not make extra LLM requests**; storage `~/.dsh/storages/hermes_memory.json` via storage-domain (v2 atomic single write; manual backup before upgrade).
**Why it matters:** it is the literal Hermes mechanism (the model the design cites), at 141 KB with zero deps and no LLM cost — the cheapest possible notes tier. Its weakness is adoption (1,182/mo) and single-writer semantics.
**Verdict: TRIAL** — pick this over `dsh-memento` **only if** we decide we do not want the `ctx.memory` seam and want the smallest possible footprint.

### 4.5 `dsh-auto-memory` 1.5.0 — the best self-contained alternative

**Verified `[npm]`:** 1.5.0, 2026-11-08; peers `cordis >=4.0.2 <5`, `dsh-llm/dsh-agent/dsh-tools/dsh-session/dsh-home-paths/dsh-atomic-write/dsh-system-prompt >=0.1.5-rc.2 <0.3.0` (admits 0.2.2-rc.1); 2 deps; 341,996 B / 8 files; 11,606 downloads/mo.
**What it does `[README]`:** typed memory files (user/feedback/project/reference) + `MEMORY.md` index auto-injected into the system prompt; consolidation products born `candidate` with verbatim evidence, user-only promotion to `verified`, disputed memories never re-injected, injection-pattern guard at the store choke point; runtime settings card (injection budget, value gate, eviction) applied next request; four evaluation layers + LongMemEval-S alignment with a published off-target score.
**Conflict:** it is a *whole* memory system (capture + consolidation + injection) — running it beside Hindsight means two systems deciding what the agent remembers, and two injected blocks. Choose it **instead of** the Hindsight engine only if we want a zero-infrastructure setup.
**Verdict: TRIAL** (alternative architecture, not a companion).

### 4.6 `dsh-plugin-memory` 0.18.4 — the one-package path

**Verified `[npm]`:** 0.18.4, 2026-11-10; `engines.dsh ^0.2.1-rc.5` (admits 0.2.2-rc.1 under prerelease rules); 0 deps; 520,139 B; 35,663 downloads/mo; MIT badge in README.
**What it does `[README]`:** Markdown+git "LLM Wiki" store, `SOUL.md` persona with a soul-forging flow, boot block (SOUL + MEMORY protocol + `index.md` + recent activity) **injected through runtime context at every session start** with per-file budgets, per-session switch (`/memory on|off`, chip, panel), `disabledWorkspaces`, digest nudge + proactive recall + weekly recap, 3D memory-graph UI, `dsh-memory doctor`, pack/unpack for machine moves.
**Risk:** the widest surface of any candidate (graph UI, proactive nudges, persona forging) and a second store that would compete with Hindsight's recall. No vector/hybrid retrieval.
**Verdict: TRIAL** — the single-package answer if we want notes + identity + UI from one vendor and drop the Hindsight adapter ambition.

### 4.7 `dsh-engramory` 1.5.2 — files-as-memory with hard caps

**Verified `[npm]`:** 1.5.2, 2026-11-06; `engines.dsh >=0.1.0-rc.7 <0.3.0-0`; `dsh.compatibility.dshReleases["0.2.2-rc.1"] = compatible`; `engines.node >=18`; 0 deps; 404,940 B; 7,184 downloads/mo.
**What it does `[README]`:** one fact per `.md`, `MEMORY.md` index (200 lines / 25 KB hard cap, over-cap writes refused *before* they land) injected as a message and **re-injected only when it changes**; bundled memory skill (what to save, when to clean); warns the agent to save memory before DSH compaction; read-only sidebar memory page with broken-link/uncatalogued-note health checks.
**Note:** re-injection mid-session breaks the "stable prefix" discipline the design asks for (the plugin deliberately refreshes after writes/compaction).
**Verdict: TRIAL** — best "files over databases" option; good fallback for the notes tier if `ctx.memory` is not wanted.

### 4.8 `dsh-memoir` 0.9.5 / `dsh-memory-tiers` 1.3.1 — project memory and tiered staging

`dsh-memoir` `[npm]`: 0.9.5, 2026-11-06; `engines.dsh` clause `>=0.2.2-rc.1 <0.2.2` **includes** `0.2.2-rc.1`; Node `^22.19 || >=24`; 0 deps; 751,178 B; 4,348 downloads/mo. README states it is adapted to DSH `0.2.2-rc.1`; bounded Hot Memory + BM25 recall; no embeddings; JSON + generated `PROJECT_MEMORY.md`; **project-scoped**, so it is not the user/identity tier.
`dsh-memory-tiers` `[npm]`: 1.3.1, 2026-11-05; **no DSH declarations at all**; 370,228 B; 3,987 downloads/mo. Six-layer staging with model-driven summarization, optional history replacement, star-map UI, `/memory` command — but its README documents `pnpm add "link:<dir>"` as the install route rather than the plugin command, and it spends model tokens on staging. **TRIAL** only.

---

## 5. Recommended stack (≤3) and why

**1. `@vectorize-io/hindsight-coding-agents` — long-term engine + recall injection + retain.**
Why it wins: the engine is already running and already populated (`josh` = 58,310 facts); the integration is official, MIT, DSH-native (Cordis plugin, native tools, no MCP hop), and implements the exact policy the design wanted to build: per-workspace banks, `autoInject` once on the first prompt with timeouts and fallback (`reflect → pages → recall`), automatic session write-back, git ingest, knowledge pages, `optInOnly` fail-closed privacy. It replaces the planned `dsh-memory-hindsight` adapter (`~250–350 LOC`) **and** the injection policy.
Config to write (`~/.hindsight/coding-agent.json`): `serverMode: "self-hosted"`, `apiUrl: "http://127.0.0.1:9177"`, `bankIdTemplate: "coding-agent::{gitProject}"`, `autoInject: "recall"` (retrieval-only, ~7 s budget) or `"reflect"` if synthesis quality matters more than latency, `retainSessions: true`, `retainExtractionMode: "concise"`, `gitIngest: "none"` for non-repo workspaces, `optInOnly: false` (personal machine) — never `bankId: "josh"`.

**2. `dsh-memento` — the `ctx.memory` seam + bounded notes tier.**
Why: it is the seam we planned to write, with budgets, an approval gate no model path can bypass, an audit trail, and a frozen once-per-session snapshot — 0 deps, local SQLite, `network:none`. Adopting it means our future providers/tools talk to `ctx.memory` instead of a bespoke service, and the notes tier stops being a 150-LOC side project. Tune budgets down from the 2000/4000-char defaults (e.g. 600/800) so the two injected blocks stay cheap; keep `writePolicy: "ask"` initially.
**Alternative if we reject the seam:** `dsh-hermes-memory` (TRIAL) — the literal Hermes `MEMORY.md`/`USER.md` port at 141 KB with no LLM calls.

**3. `dsh-soul-md` — identity.**
Why: the only top-tier candidate whose `dsh.compatibility` **explicitly** lists `0.2.2-rc.1` as compatible, whose memory can be switched off per card (so it does not fight tiers 1–2), and whose persona is plain Markdown with per-workspace defaults. Turn its file memory off; let `dsh-memento` own notes.

**Explicitly not in the stack:** any second memory *engine* (`dsh-mem0`, `@honcho-ai/dsh-honcho`, `dsh-auto-memory`, `dsh-plugin-memory`, `@zilliz/memsearch-dsh`) — one engine, one injector owner. `dsh-hindsight-gui` waits until the data exists (design D8).

**Official row (not counted in the 3):** `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1` — see §6.1.

### 5.1 Overlaps and conflicts to police

| Conflict | Detail | Rule |
|---|---|---|
| Two prompt injectors | `dsh-memento` injects a frozen snapshot at `snapshotOrder -50`; the Hindsight plugin injects once at first prompt; `dsh-soul-md` injects persona; `dsh-engramory`/`dsh-plugin-memory` re-inject on change | Adopt only the first three; keep the Hindsight block small (`recallOptions.max_tokens` ≈ 1500–2000) and memento budgets ≈ 600/800 chars. |
| Two writers | Hindsight retains whole sessions; memento writes only approval-gated notes; `dsh-auto-memory`/`dsh-plugin-memory` would be third and fourth writers | One engine (Hindsight), one notes store (memento). |
| Hermes' bank | `josh` already holds 58,310 facts and is Hermes' provider store | Use `bankIdTemplate: coding-agent::{gitProject}` (creates new banks). Never `bankId: "josh"`. Verify with `/v1/default/banks` after the smoke test. |
| Persona duplication | `dsh-soul-md` cards vs. DSH agent presets vs. `dsh-plugin-memory`'s `SOUL.md` | One identity source; preset = model/tools policy, soul-md = voice/persona files. |
| Port confusion | Hindsight plugin `daemon` mode starts `hindsight-embed` on **9077**; the running server is **9177** | Use `self-hosted` + `apiUrl`. Do not let `dsh-hindsight-gui` start a second server. |

---

## 6. Build-vs-buy delta against `research/personal-agent-design.md` §3

The plan budgeted ~1,000–1,100 LOC across six modules (`dsh-memory` 300–400, `dsh-memory-hindsight` 250–350, `dsh-memory-notes` 150, `dsh-memory-curator` 150, `dsh-memory-session-search` ~50, UI optional).

| Planned module | Plan LOC | Bought replacement | Residual work |
|---|---|---|---|
| `dsh-memory` — `ctx.memory` seam, policy, injection, tools, settings, fail-open | 300–400 | **`dsh-memento`** (service keys `memory`/`memoryAdapters`, budgets, approval gate, audit, snapshot, panel, `/memory`) | 0 LOC to get the seam; ~20–40 LOC only if we write a **Hindsight provider/adapter** against its documented provider factory + conformance suite instead of running the Hindsight plugin |
| `dsh-memory-hindsight` — REST client, retain/recall hooks, bank management | 250–350 | **`@vectorize-io/hindsight-coding-agents`** (retain/recall/inject/banks/pages/git) | ~0 LOC; config file only. Fallback: memento provider ~150–250 LOC against `POST /v1/default/banks/{bank}/memories/recall` + `/documents` (verified present in `/openapi.json`) |
| `dsh-memory-notes` — frozen USER/MEMORY, caps, forget, curation | 150 | **`dsh-memento`** budgets/layers + approval-gated writes | 0 LOC |
| `dsh-memory-curator` — consolidate / mental models / digest job | 150 | **Not covered.** Hindsight server has consolidation + mental models + directives (`/v1/default/banks/{bank}/mental-models`, `/directives` in `/openapi.json`) but no DSH-side schedule | **BUILD-OURS ~40–80 LOC**: a `dsh-schedule` row calling Hindsight `consolidate`/mental-model refresh + writing a digest note; or a Hindsight `mental-models/{id}/refresh` cron |
| `dsh-memory-session-search` — official FTS5 bundle | ~50 | **`@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`** (official, 10,651 B) | 0 LOC; one profile row |
| `dsh-memory-ui` (optional) | later | `dsh-memento` read-only panel (browse/search/audit/budget bars) + `dsh-hindsight-gui` later | 0 now |
| Identity / soul loading (not in plan budget) | — | **`dsh-soul-md`** | 0 LOC |

**Net:** ~1,000–1,100 LOC → **~40–80 LOC (curator wiring) + config**, with the caveat that the `ctx.memory` seam we inherit is `dsh-memento`'s *proposed* protocol, not an official DSH seam. If the official seam later matches it, the adapter work survives; if it diverges, the seam-adjacent code (not the engine) is what gets rewritten.

**Fail-open discipline (design D7):** Hindsight plugin treats an unreachable server as "no memory for a turn or two" and never blocks the turn (`[README]`); `dsh-memento` is local SQLite with `network:none` (a missing DB returns empty, not a crash). Both match the plan's fail-open requirement without extra code.

### 6.1 Version trap: official session search

`[npm]` `@deepseek-ai/dsh-experimental-session-search` dist-tags: `latest = 0.2.1-alpha.2` (published 2026-10-09, peer `cordis ~4.0.5-alpha.1`), **`next = 0.2.2-rc.1`** (2026-11-04, peer `cordis ~4.1.0` = the version shipped inside DSH 0.2.2-rc.1). Installing `@latest` on this host pulls an incompatible peer line; the correct install is:

```bash
dsh plugin --profile personal add @deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1
```

Downloads 1,408,930/mo, 10,651 B unpacked, `dsh.bundle.patch`. In the `web` profile it is **not currently installed** and no memory plugin is installed at all `[local: ~/.dsh/profiles/web/package.json]`.

---

## 7. Do-not-use list

| Package | Reason |
|---|---|
| `dsh-longterm-memory` | `engines.dsh ">=0.2.1-rc.3 <0.2.2"` — explicitly excludes `0.2.2-rc.1`. |
| `dsh-expmem` | `engines.dsh "0.2.0-rc.2"` exact pin — cannot host on this build. |
| `dsh-layered-memory` | Peer ranges (`dsh-tools`, `dsh-system-prompt`) stop at `0.2.1-rc.*`; 5.7 MB unpacked. |
| `dsh-memory-with-soul` | **Python ≥3.10 is a hard dependency** (`core/memory.py`); redundant with notes tier. |
| `dsh-mem0` | Duplicate memory engine; Mem0 Platform backend ships prompts/facts to a cloud service; needs key or Python/Qdrant sidecar. Optional A/B later only. |
| `@honcho-ai/dsh-honcho` | Third-party cloud SaaS holds the personal profile; duplicate engine. |
| `@zilliz/memsearch-dsh` | External `uv`-installed Python tool + Milvus + per-capture headless-agent summaries; hint-only injection (does not satisfy "recall injection"). |
| `dsh-hindsight-gui` (for now) | UI-only; can start/restart a service it owns — our Hindsight is external and shared with Hermes. |
| `dsh-agent-soul`, `dsh-soul-seed`, `dsh-mem-weave`, `dsh-persona-*` (for now) | Identity+memory+mood bundles: mood engines, diaries, non-standard derived licenses, and no verified `0.2.2-rc.1`. Revisit only if a "living character" identity is wanted. |
| Anything pinned to `bankId: "josh"` | That bank (58,310 facts) is Hermes' live store — cross-writing would poison it. |
| `dsh plugin add` on the `personal`/`web` profile without a smoke test | Both ADOPT winners have undeclared/unverified `0.2.2-rc.1` hosting; install into a scratch profile first. |

---

## 8. Open questions / biggest remaining gaps

1. **Curator scheduling is still ours.** No plugin provides a DSH-side scheduled consolidation/mental-model/digest job. Hindsight exposes the endpoints (`/v1/default/banks/{id}/mental-models/{mid}/refresh`, `/directives`, `/v1/default/banks` in `/openapi.json`); the `dsh-schedule` glue is missing (~40–80 LOC).
2. **`ctx.memory` is not official.** Only `dsh-memento` implements it (as a proposal, with adapters + conformance suite). If the host ships a different seam, the seam-adjacent code is the rewrite risk — the Hindsight engine plugin is unaffected because it does not use `ctx.memory`.
3. **Neither ADOPT winner is verified on `0.2.2-rc.1`:** the Hindsight plugin declares no DSH version at all; `dsh-memento`'s README baseline is `0.2.1-alpha.2`. One scratch-profile run each is mandatory before the personal profile.
4. **Token budget of two blocks is unmeasured.** Design D4 wants ≤1.5–2k tokens for dynamic memory; memento defaults (2000+2000+4000+4000 chars) would exceed that on their own. Tune before enabling both, and measure with the DSH token meter.
5. **Bank isolation must be proven, not assumed.** After install, assert via `curl /v1/default/banks` that a new `coding-agent::*` bank appeared and `josh` fact-count did not move.
6. **`hindsight_inject_document` vs `memory_retain`** — the plugin has no explicit `memory_recall` tool (recall rides injection/reflect). If the design insists on three explicit tools, that is a thin wrapper (`BUILD-OURS`, ~30 LOC) or a memento provider hook.

---

## 9. Sources

**Registry (facts):** `https://registry.npmjs.org/<pkg>/latest` for each package above; downloads `https://api.npmjs.org/downloads/point/last-month/<pkg>`; `@deepseek-ai/dsh-experimental-session-search` full packument for dist-tags/versions.
**Packages:** `@vectorize-io/hindsight-coding-agents` · `dsh-memento` · `dsh-soul-md` · `dsh-hermes-memory` · `dsh-auto-memory` · `dsh-plugin-memory` · `dsh-engramory` · `dsh-memoir` · `dsh-memory-tiers` · `dsh-mem0` · `dsh-hindsight-gui` · `@honcho-ai/dsh-honcho` · `@zilliz/memsearch-dsh` · `dsh-memory-with-soul` · `dsh-longterm-memory` · `dsh-expmem` · `dsh-layered-memory` · `dsh-agent-soul` · `dsh-soul-seed` · `dsh-unified-agent-memory` · `@deepseek-ai/dsh-experimental-session-search`.
**Local ground truth:** `http://127.0.0.1:9177/{health,version,openapi.json,mcp,v1/default/banks}`; `/home/josh/dsh/node/lib/node_modules/@deepseek-ai/dsh/package.json` (0.2.2-rc.1, cordis 4.1.0); `/home/josh/.dsh/profiles/web/{package.json,cordis.patch.yml}`; `/home/josh/.dsh/cordis.patch.yml`; `.cache/plugin-index.json`; `/home/josh/.dsh/profiles/web/.dsh-market/discovery-compatibility-v1.json`.
**Design input:** `research/personal-agent-design.md` §3 (memory tiers, `ctx.memory` seam, per-module LOC budget, D4/D7/D8), §9 open questions 1/4/6.

---

## 10. Lead's cross-checks (added after the main write-up)

### 10.1 Three-way engine call: `dsh-mem0` vs `dsh-tdai-memory` vs `@vectorize-io/hindsight-coding-agents`

| | `@vectorize-io/hindsight-coding-agents` 0.8.6 | `dsh-mem0` 0.3.1 | `dsh-tdai-memory` 0.4.7 |
|---|---|---|---|
| Auto-**recall injection** | **Yes** — `autoInject: reflect\|pages\|recall\|none`, fires once on the session's first prompt, with `injectTimeoutMs` (7 s) and reflect→pages→recall fallback `[README]` | Yes — per-turn, latest real user message drives a search injected as `<mem0-relevant-memories>`, non-blocking on timeout `[README]` | Yes — recall of relevant memories per current message + `tdai_memory_search`, `tdai_conversation_search` `[README]` |
| Auto-**capture** | Yes — session write-back every Stop (`retainSessions: true`), plus git-history ingest (off/message/full) `[README]` | Yes — user msgs + final assistant reply handed to Mem0 after each normal turn; heuristic filter skips greetings/short turns `[README]` | Yes — L0 raw conversation capture, then L1 extraction of facts/preferences/events, L2/L3 scenario + user profile `[README]` |
| Runtime needed | **None new** — self-hosted mode points at the already-running Hindsight (`apiUrl: http://127.0.0.1:9177`); extraction/embeddings run **inside the Hindsight server**, already configured for Hermes. No Python, no embedding endpoint on the DSH side, 0 npm deps `[npm][README][local]` | **One of:** Mem0 Platform API key (cloud) · self-hosted Mem0 REST URL · **local Python OSS sidecar** (Mem0 SDK + Qdrant + embedding model). 2.4 MB, 0 npm deps but heavy external prerequisites `[npm][README]` | Local dir `~/.memory-tencentdb/memory-tdai` **plus** heavy deps: `sqlite-vec`, `@tencentdb-agent-memory/tcvdb-text`, `@node-rs/jieba`, `@ai-sdk/openai` (extraction-model connection), `ai`, `undici`; peer `node-llama-cpp ^3.19.1` (native). 754 KB + native modules `[npm][README]` |
| DSH 0.2.2-rc.1 | **Undeclared** (no engines/peers; nothing proven) | RANGE-OK (`engines.dsh >=0.2.1-rc.5 <0.3.0`, Node ≥22) | **Declared** (`engines.dsh` lists `0.2.2-rc.1`; README says adapted from the OpenClaw plugin) `[npm]` |
| Adoption | 115,887 dl/mo, MIT repo 60,145★ `[npm]` | 654 dl/mo | 3,573 dl/mo, MIT `[npm]` |
| Data location / privacy | Your existing Hindsight Postgres (local) — must avoid bank `josh` | Mem0 Platform = cloud (prompts/facts leave the machine) or your own stack | `~/.memory-tencentdb/memory-tdai` (local) + extraction model calls |
| **Pick** | **`@vectorize-io/hindsight-coding-agents`** — only one that needs **zero new runtime** here, official DSH route, one cache-safe injection, best adoption. Smoke-test on 0.2.2-rc.1 first (no declaration exists). | Second: cleanest UX and true per-turn recall, but duplicate engine + cloud key or Python/Qdrant sidecar. | Third: only one with explicit `0.2.2-rc.1` support, but native deps + an extraction model make it the heaviest install; **unverified beyond README** (TRIAL, not deep-dived). |

### 10.2 Identity vs notes: `dsh-soul-md` vs `dsh-hermes-memory` vs `dsh-agent-persona`

| | `dsh-soul-md` 0.12.2 | `dsh-hermes-memory` 1.2.0 | `dsh-agent-persona` 0.2.2 |
|---|---|---|---|
| Role | **Identity** — persona cards (Markdown) + workspace/session selection + `soul_read`/`soul_update`; *also* offers file memory (`core.md` + `topics/*.md`) which can be disabled per card | **Notes tier** — Hermes `MEMORY.md`/`USER.md` dual bank (2,200 / 1,375 chars), frozen snapshot once per session, one `memory` tool, no extra LLM calls | **Identity scoping** — routes system-prompt personas by workspace path or session id (exact/prefix/contains/regex) + default persona |
| Compat | **DECLARED** `dshReleases["0.2.2-rc.1"] = compatible` | RANGE-OK (peers admit 0.2.2-rc.1; README baseline 0.2.2-alpha.2) | RANGE-OK on npm latest (`engines.dsh >=0.2.0-rc.2 <0.3.0`, peers same line); market cache flags a stale PEER-MISMATCH — trust npm, re-check at install |
| Size / adoption | 128 KB, 1 dep, 51,785 dl/mo | 141 KB, 0 deps, 1,182 dl/mo | small, low adoption |
| **Pick** | **Identity** (memory off) | **Notes tier** if we skip `dsh-memento` | Only if we need path/session-based persona routing on top of presets — redundant with DSH presets for one user; not in stack |

Note: `dsh-hermes-memory` and `dsh-memento` are competitors for the same notes slot. Keep **one**: `dsh-memento` when we want the `ctx.memory` seam + approval/audit (recommended); `dsh-hermes-memory` when we want the smallest possible footprint. Compared with `dsh-soul-md` for identity, `dsh-agent-persona` has no persona *store* (no files, no forging) — it is a router, so it cannot replace soul-md.

### 10.3 Memory UI candidates

| Plugin | What UI | Facts | Verdict |
|---|---|---|---|
| `dsh-memento` | Read-only web drawer: browse entries, search, budget bars, audit tail (floating 🧠 button, hideable) | ships inside the seam plugin — free | **Already in stack** |
| `dsh-hindsight-gui` 1.4.4 | Hindsight **settings/status dashboard** (connection, models, embedding backend, bank settings, health, audit + per-bank redaction) — explicitly "not a memory engine" | 800 KB, 3,462 dl/mo, UNDECLARED, may start/restart only services it owns | **TRIAL** later (D8: no UI until data exists) |
| `dsh-plugin-memory` 0.18.4 | Interactive **3D memory graph** (search-to-focus, reveal file, double-click opens note in sidebar) + health dashboard/doctor | 520 KB, 35,663 dl/mo | Only along with that plugin (TRIAL; not in stack) |
| `dsh-butler-memory` 0.1.5 | Web panel for reviewing memories **and candidates** (PostgreSQL-backed, MCP tools) | no `engines.dsh`; client peers pin older `dsh-client-*`; PostgreSQL required | **REJECT** (DB + old client peers) |
| `dsh-client-ui-obsidian-memory` 0.3.2 | Sidebar **vault browser** + 5 `obsidian_memory_*` tools over an Obsidian/Codex vault | 37 KB, 0 deps, no `engines.dsh`, peers `dsh-client-* >=0.1.0-rc.5` (unverified against 0.2.2 client API) | **TRIAL** (only if a vault-backed memory is chosen) |

**UI recommendation:** none now — `dsh-memento` already brings a read-only panel; add `dsh-hindsight-gui` later only if Hindsight configuration needs to move into the GUI.
