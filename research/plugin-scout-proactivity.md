# Plugin scout — proactivity / session / skill / security (task-5)

> **Document status: HISTORICAL MARKET SCOUT (2026-11-09).** D14 overrode most of these verdicts; see [plugin-ledger.md](plugin-ledger.md).

Scout: `proactivity-scout`. Snapshot 2026-11-10 ~14:25 Australia/Brisbane.
Host under test: DSH **0.2.2-rc.1** (verified `require('@deepseek-ai/dsh/package.json').version`), Node **v24.22.1**, pnpm 12.9.1, profile `web`.
Write scope: this file only. Nothing was installed; no profile was modified.

## 1. Method (and what "verified" means here)

1. **Index filter** — `.cache/plugin-index.json` (format 1, 4,985 packages; 23 categories). Pooled `metadata.category` ∈ {workflow 321, session 378, skill 141, security 136} plus name/keyword scans over `ui` 949 / `memory` 219 / `notify` 162 / `tools` 716 for: heartbeat/idle/presence, automation/trigger/hook/cron, digest/brief/daily/weekly/report, curator/skill-manager, workspace/session-folder/archive, approval/sandbox/trust, kanban/board/status/dashboard. ~1,500 raw keyword hits → de-duplicated to 24 names actually inspected.
2. **Compatibility** — `/home/josh/.dsh/profiles/web/.dsh-market/discovery-compatibility-v1.json` (`entries.<pkg>.facts.{version,enginesDsh,peerDependencies}`) + each package's own `engines.dsh` and `dsh` manifest from `https://registry.npmjs.org/<pkg>/latest`.
3. **Behavior** — README pulled from `https://cdn.jsdelivr.net/npm/<pkg>@<version>/README.md` (18 READMEs read: heartbeat, idle-watchdog, whale-waker, automations ×2, hooks ×2, monitor, scheduler, brief-sidebar, weekly-report, period-report, skill-doctor, skills-manager, autarchive, workspace-control, kanban, better-workspace, yolo, confirm-gate, trust-panel, taskboard).
4. **Signals** — npm `dist.unpackedSize` / `fileCount` / `dependencies` / `peerDependencies`, 30-day downloads via `https://api.npmjs.org/downloads/point/last-month/<pkg>`, publish date from the index snapshot.
5. **Trust rule** — README/marketplace text is treated as **claims**, not proof. Anything whose claimed behavior was not independently observable in my ~25 min is labelled **TRIAL**. GitHub API was not used (0 calls); no repo-level star/issue triage was done.

Caveats that matter for every row below:
- DSH gates plugins with semver `includePrerelease`, so `^0.2.1` / `>=0.2.0` do **not** match a `-rc.N` host; ranges must name the prerelease. All `OK` verdicts below were checked against **0.2.2-rc.1** semantics, not eyeballed.
- `engines.dsh` absent ⇒ compatibility only implied by `peerDependencies` (usually `@deepseek-ai/cordis`, `dsh-llm`, `dsh-tools`, `dsh-session`), which are stable-ish seams. I mark that **UNPINNED**, not compatible.
- Download counts are ecosystem-wide monthly pulls; the whole market is low-volume (median shortlist ≈ 1k/mo). Low count ≠ bad, but it does mean little field testing.

### Legend

| Tag | Meaning |
|---|---|
| **OK** | `engines.dsh` explicitly matches 0.2.2-rc.1 (or `dsh.compatibility.dshReleases` names 0.2.2-rc.1) |
| **UNPINNED** | no `engines.dsh`; only `peerDependencies` imply compatibility → install at own risk |
| **EDGE** | matches only because of prerelease range/upstream-tested line; needs a smoke test |
| **NO** | declared range excludes 0.2.2-rc.1 |
| **ADOPT** | recommend installing for the plan |
| **TRIAL** | plausible fit, but behavior unproven at our version / low signal → isolated test profile first |
| **BUILD-OURS** | plugin exists but is worse than what we already have / than ~1 day of our own code |
| **REJECT** | wrong fit, unsafe, or duplicate of native capability |

## 2. Candidate table (24 inspected, verdicts final)

`size` = npm unpacked KB; `dl30` = npm downloads last 30d (`—` = no stats); `pub` = latest publish (index snapshot).

| # | Package | Cat | Ver | fits 0.2.2-rc.1 | size / dl30 / pub | Replaces in our plan | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `dsh-plugin-heartbeat` | workflow | 0.8.0 | **EDGE** (`^0.2.1-rc.5` → satisfies, upstream only tested 0.2.1-rc.5 line) | 249 KB / 3340 / 2026-10-30 | **heartbeat (idle-session wake) — fully** | **ADOPT** |
| 2 | `dsh-automations` | tools | 0.2.1 | **OK** (`dsh.compatibility.dshReleases["0.2.2-rc.1"]="compatible"`) | 135 KB / 778 / 2026-11-07 | **event triggers / lifecycle hooks (deterministic actions)** | **ADOPT** |
| 3 | `dsh-period-report` | session | 0.2.1 | UNPINNED (peers dsh-tools, dsh-system-prompt) | 71 KB / 772 / 2026-08-16 | **daily/weekly digest + reminder scheduling + notifications** | **TRIAL** |
| 4 | `dsh-plugin-yolo` | workflow | 0.5.0 | UNPINNED (README: needs ≥0.1.5-rc.1) | 1032 KB / 1585 / 2026-09-10 | conversational commitments → cross-session plans/reminders/dashboard (**the whole proactivity+memory-UI thesis**) | **TRIAL** |
| 5 | `dsh-monitor` | tools | 0.1.1 | UNPINNED (peers dsh-agent, dsh-llm, dsh-tools) | 21 KB / 853 / 2026-08-13 | **event triggers, inbound side** (file inbox / command-delta → wake agent) | **ADOPT (small surface)** |
| 6 | `dsh-skill-doctor` | skill | 0.15.0 | **OK** (`>=0.2.0-rc.2`, node ≥24 ✓) | 818 KB / 2324 / 2026-11-08 | **skill curator diagnostics** (not curation) | **ADOPT** |
| 7 | `@michengai/dsh-skills-manager` | dev | 1.4.0 | **OK** (`>=0.2.0-rc.1 <0.3.0-0`; badge "支持至 0.2.2-rc.1") | 1702 KB / **155 917** / 2026-11-09 | **skill curator/manager UI** | **TRIAL→ likely ADOPT after one pass** |
| 8 | `dsh-session-kanban` | ui | 1.1.7 | **OK** (`>=0.2.1-rc.3 <0.3.0-0`) | 195 KB / — / 2026-11-06 | **agent/session status UI (board)** | **TRIAL** |
| 9 | `dsh-session-autarchive` | session | 0.1.7 | **OK** (`>=0.2.1-alpha.1`) | 115 KB / 1572 / 2026-11-08 | **session hygiene / auto-archive** | **ADOPT (low risk)** |
| 10 | `dsh-idle-watchdog` | workflow | 1.2.0 | **OK** (`>=0.1.1-rc.1`) | 231 KB / 754 / 2026-11-01 | heartbeat (nudges) + **inbound HTTP prompt API** | **TRIAL** |
| 11 | `dsh-whale-waker` | workflow | 0.6.0 | **OK** (`>=0.2.0 <0.4.0-0`) | 108 KB / 1159 / 2026-10-27 | scheduled "resident" wake-ups per workspace (heartbeat variant) | **TRIAL** |
| 12 | `dsh-hooks-lite` | workflow | 0.1.0 | **OK** (`>=0.2.1-rc.3 <0.3.0`) | 42 KB / 550 / 2026-11-01 | declarative `event → shell` hooks | **TRIAL** (dsh-automations covers it) |
| 13 | `@moon16u/dsh-hooks` | security | 2.1.1 | **OK** (`>=0.2.1-rc.2`) | 150 KB / 1181 / 2026-10-22 | approval-gated hook runner (security posture) | **TRIAL** |
| 14 | `dsh-weekly-report` | workflow | 0.1.8 | UNPINNED | 119 KB / 1039 / 2026-11-06 | digest **generator** (sessions + git, report-template driven; manual trigger) | **TRIAL** |
| 15 | `dsh-better-workspace` | ui | 0.41.0 | **OK** (`>=0.2.2-rc.1`) | 772 KB / 9451 / 2026-11-07 | workspace tree/grouping + add-workspace flow | **TRIAL** (only if workspace UX hurts) |
| 16 | `taskboard-workbench` | workflow | 0.3.2 | **OK** (`>=0.2.1-rc.3`) | 1580 KB / 1138 / 2026-11-06 | kanban/agent-team board (SQLite, dispatch) | **BUILD-OURS / REJECT** (native Agent Team exists) |
| 17 | `@linxin666/dsh-client-ui-skill-explorer` | skill | 0.4.16 | **OK** (`>=0.2.2-rc.1`) | 429 KB / 161 559 / 2026-11-07 | skill browser UI (browse/enable/create/trash) | **TRIAL** (alt to #7) |
| 18 | `dsh-workspace-control` | session | 0.8.5 | UNPINNED (no engines **and** no peers) | 276 KB / 3995 / 2026-11-09 | workspace rebuild/merge/rename/move + restart | **REJECT** (destructive, no compat declaration) |
| 19 | `@steelunion/dsh-confirm-gate` | security | 0.3.0 | UNPINNED (badge ≥0.2.0-rc.2; peers `@deepseek-ai/dsh`) | 108 KB / 378 / 2026-11-01 | approval/runaway-loop guard | **TRIAL** (safety net for autonomous L3) |
| 20 | `dsh-trust-panel` | security | 0.1.4 | UNPINNED | 330 KB / 1048 / 2026-11-05 | trust/security dashboard | **REJECT** (needs `dsh-trust-suite`: only 2 of the 9 channels are on npm) |
| 21 | `dsh-scheduler` | workflow | 2026.11.14 | **OK** (`>=0.1.1-rc.2`) | 490 KB / 2124 / 2026-11-08 | cron → prompt sessions | **REJECT** (native `schedule` task system already does this) |
| 22 | `@rs-dsh/dsh-automations` | workflow | 0.1.1 | **OK** (`>=0.2.1-rc.2 <0.3.0-0`) | 67 KB / 812 / 2026-10-31 | automations (smaller, YAML-config, no UI) | **TRIAL** (fallback if #2 breaks) |
| 23 | `@kanadego/dsh-heartbeat` | agi | 2.2.1 | UNPINNED | 1481 KB / **7909** / 2026-11-08 | self-scheduled researching agent w/ interest profile | **REJECT for plan** (different product: web-browsing persona, not session wake) |
| 24 | `dsh-recap` | session | 0.1.0 | UNPINNED | 6798 KB / 946 / 2026-10-02 | session recap/summary on idle | **REJECT** (6.8 MB for a `/recap`; digest covers it) |

Also scanned, not shortlisted (`REJECT` on fit, listed for the record): `dsh-kanban-flow`, `@alpacachen/dsh-kanban`, `dsh-automation-center` (0.1.0-alpha.8), `dsh-hooks`, `@creait/dsh-hookkit`, `dsh-plugin-hooks`, `dsh-skill-hub`, `dsh-skills-manager-plus`, `dsh-skill-toggles`, `dsh-skill-triage`, `@wsc…/dsh-skills-manager` variants (engines pin to 0.1.x/0.2.1 leaves), `dsh-noteboard`, `dsh-brief-sidebar` (hard peer `dsh-better-sidebar`, 0.2.0-line range in README vs `>=0.1.1-rc.2 <0.3.0` in manifest — inconsistent), `dsh-chat-digest` (group-chat specific), `dsh-session-recycler` (Windows), `dsh-plugin-folder-trust` (Windows-only), `dsh-workspace-rules` (CLAUDE.local.md editor), `dsh-plugin-no-workspace` (hides workspace UI — anti-goal), `dsh-automation-monitor` (read-only dashboard, but only useful once other schedulers exist).

## 3. Deep notes — top 8

### 3.1 `dsh-plugin-heartbeat` 0.8.0 — **ADOPT** (best find)

- **Registry**: `https://registry.npmjs.org/dsh-plugin-heartbeat/latest` — `engines.dsh: "^0.2.1-rc.5"`, node ≥18, **0 runtime dependencies**, 21 files / 249 KB, MIT. `dsh.bundle.patch: ./cordis.patch.yml`, `dsh.client.platform: web`. 3,340 dl30. Pub 2026-10-30, 0.8.0 = its 6th+ visible iteration (v0.5→v0.8 changelog in README).
- **What it actually is** (README, unverified at runtime): per-root-agent pulse loop `sensors → rhythm → gate → action`. Sensors read session projections `todos`, `agentTeam`, `goal`, `userQuestions`, `contextPressure`, **diff against last pulse**, aggregate an arousal score 0–8. Gate decides L0 silent / L1 report / L2 ask / L4 escalation, with quiet hours (default 23:00–08:00), dedupe window 90 min, daily budget 12, user-active suppression 120 s, per-session/per-workspace overrides. Delivery: idle agent → `followup` (new turn); busy agent → `next-turn` inbox with `replace` (never stacks); hard stop after 3 unanswered beats; hourly cap. L3 is an opt-in grant list (`[]` by default) that only rewrites instructions — explicitly *not* a sandbox.
- **Event-driven beats** — if the host exposes `sessionProjections.onChanged`, todo/agentTeam/goal/userQuestions changes trigger one extra pulse after a 2 s debounce, still gated. Falls back to pure timer. This is the piece our plan's "event triggers" would otherwise build.
- **Ops surface**: Settings → Heartbeat panel (state / next ETA / today's budget / last 5 pulses with reason / Beat now / Snooze / Pause / Resume / Reset), plugin-owned loopback routes `GET|POST /api/heartbeat/config`, `GET /api/heartbeat/status`, `POST /api/heartbeat/control`. Config in `$DSH_HOME/heartbeat.json` (schemastery-validated, hot-applied), state in `heartbeat-vitals.json`.
- **Multi-speaker arbitration (v0.7)**: claims `$DSH_HOME/proactive-cooldown.json` (atomic tmp+rename) with `{speaker:"heartbeat"|"memory", at}`; yields if another speaker spoke < 180 s ago. Real collision-avoidance for the "two proactive plugins talk over each other" problem we would otherwise hit with any second proactivity plugin.
- **Why ADOPT**: it is ~an 80–90 % match for our heartbeat component, including the parts that are expensive to get right (diffing projections instead of re-spamming the same todo list, backoff/hard-stop, dedupe, budget, quiet hours, inbox replace semantics, restart cooldown, vitals for "why didn't it speak"). Estimated saving vs building: **0.5–1.5 days**, plus the arbitration protocol for free.
- **Risks**: (a) `^0.2.1-rc.5` satisfies 0.2.2-rc.1 semver but README restricts support to "the official 0.2.1-rc.5 series" — 0.2.2-rc.1 is untested upstream ⇒ **smoke test required** (see checklist §5). (b) README's own install warning: **do not hand-write `- insert: {id: dsh-heartbeat}`** into the profile `cordis.patch.yml` — it collides with the bundle's automatic mount (`duplicate loader entry id`, a real incident; it also collides with the *memory* plugin's loader id). (c) Requires session format v4 (host ≥0.1.7 — we are fine) because it emits producer-owned kind `plugin:heartbeat`; v4 and v3 allowlists are mutually exclusive. (d) `todos` projection resets per turn — the beat sees last turn's todos, not a session-wide list; `agentTeam` projection only exists when the Agent Team package is enabled (ours **is**: `@deepseek-ai/dsh-experimental-agent-team-profile` is in our profile bundles).
- Install: `dsh plugin --profile web add dsh-plugin-heartbeat` then restart host. Then `Settings → Heartbeat` → set `baseIntervalSeconds`, keep `mode` conservative, `l3Allow: []`.

### 3.2 `dsh-automations` 0.2.1 — **ADOPT** (deterministic trigger layer)

- **Registry**: no `engines.dsh`, but `dsh.compatibility.dshReleases` explicitly lists **`"0.2.2-rc.1": "compatible"`** — the only candidate in this scout with an explicit 0.2.2-rc.1 statement. node ≥22, zero runtime deps, 19 files / 135 KB, MIT, 778 dl30, pub 2026-11-07. Note: index category is **`tools`**, not `workflow` (the Lead's category filter would miss it).
- **Triggers**: `startup`, `session-start` (with `source: any|startup|resume|clear|compact`), `session-idle` (`idleSeconds ≥30`), `session-end`, `user-message` (`any|first-of-session|first-of-day` + substring match, turn-deduped), `tool-after` (`tool` name or `*`, `when: always|success|error`), `daily` (`HH:MM` + `weekdays`), `interval` (1–1440 min), `manual`. Missed `daily` windows are re-run once (4 h window) after startup; `interval` timer state persists in `meta.json`.
- **Actions**: `shell` (non-interactive child, cwd, shell picker, timeout + process-tree kill, stdout/stderr tail + exit code, `DSH_AUTOMATION_*` env), `http` (url/method/headers/body/timeout — webhooks, liveness probes), `log` (no-op probe of "did the trigger fire"). Serialized execution queue (cap 200).
- **Model-facing tools**: `automation_list|save|run|remove|runs` + a system-prompt paragraph, so the agent can create rules from natural language ("every day at 08:30 ping X").
- **Storage**: `$DSH_HOME/storages/dsh-automations/{rules,runs,meta}.json`, atomic writes, `.broken-<ts>` quarantine.
- **Known limits it states**: **no "send prompt to agent" action** (by design — agent-facing schedules stay with the native `schedule` tool); `session-end` actions may not finish on process exit; hand-editing `rules.json` needs a host restart.
- **Why ADOPT**: it is exactly the "event triggers → deterministic action" glue in our plan (webhook out, liveness sweep, "on tool error run X", "on session start scaffold folder"), and it does **not** fight the native scheduler or the heartbeat (different action model: no LLM turn).
- **Risks**: shell actions run **as the current user with no sandbox** — README says treat `rules.json` like `~/.bashrc`; the panel API is behind the host's authenticated `/api`. README says its author validated on 0.2.0-rc.2 / 0.2.1-rc.3 and that the real gate is `peerDependencies`; the 0.2.2-rc.1 compatibility claim is machine-readable but self-declared ⇒ TRIAL-grade smoke test.
- Install: `dsh plugin --profile web add dsh-automations`, restart, then verify the bundle appears in `dsh.profile.bundles` (README §7 asks for this step; `dsh plugin add` reportedly auto-adds bundles that declare `dsh.bundle` — **unverified**, check before restart).

### 3.3 `dsh-monitor` 0.1.1 — **ADOPT (small)** (inbound event triggers)

- 21 KB / 6 files(ish) / 853 dl30 / pub 2026-08-13, zero-ish deps, peers `cordis`,`dsh-llm`,`dsh-agent`,`dsh-tools`; no `engines.dsh`.
- Model calls a `monitor` tool to arm a durable watcher: `source: file` = append-only **NDJSON inbox**, new lines delivered as they land; `source: command` = shell re-run on interval, **output delta** delivered. Delivery: idle → `agent.followup()` (new turn); busy → `agent.inject()` (next step). Disarmable; torn down on unload.
- Fit: our "event triggers" inbound half (another process/webhook/cron writes a line → agent wakes) without the plugin owning a scheduler or a prompt. Tiny surface = easy to vendor/replace.
- Risk: published 3 months ago, README still says "From npm (once published)", no dsh engines. It touches `agent.followup/inject` — API-stable from DSH 0.1.x through 0.2.x (dsh-automations and heartbeat use the same). Smoke test: arm a file watcher, append a line, confirm a turn opens.

### 3.4 `dsh-period-report` 0.2.1 — **TRIAL** (digest)

- 71 KB (but client bundle), 772 dl30, pub 2026-08-16 (oldest shortlisted; pre-dates the 0.2.x compatibility wave), no `engines.dsh`, peers `cordis`,`dsh-tools`,`dsh-system-prompt`; `dsh.client.inject` pulls `dsh-client-connection` etc.
- Features claimed: a **Session Report** settings page; arbitrary date-range report over the session corpus with an **AI narrative** (`Today at a glance` / `Highlights` / `Review` / `Suggestions`, falls back to template stats); full stats (sessions, messages, tool calls, turns, steps, token usage breakdown, top tools); per-session detail; **periodic reminders** = free period (`intervalDays: 1|7|N`, `anchorDate`, `hour:minute`, `range: previous|current`) + **system notification** (macOS `osascript`, Linux `notify-send`).
- Fit: precisely our "daily/weekly digest" component incl. the scheduling and notification edges. Saving if it works: ~0.5 day. Risk: 0.2.x-era peers + age ⇒ highest chance of an API break in the client half; the scheduled-reminder path may not run headless (notifications assume a desktop session — we are on Linux + web profile at 127.0.0.1:7000, so `notify-send` may exist but is untested here).
- Alternative digest generator: **`dsh-weekly-report` 0.1.8** (119 KB, 1039 dl30, pub 2026-11-06, UNPINNED) — selects sessions by last-activity inside the window, auto-discovers repos + filters git commits by author, and shapes output from a **pasted example of your own past report**; writes Markdown to `$DSH_HOME/dsh-weekly-report/reports/`. It is **manual-trigger only**, so pair it with the native `schedule` task system (or automations' `daily` trigger) rather than expecting cron inside the plugin.
- Decision rule: try `dsh-period-report` first (does scheduling natively); if its client half breaks on 0.2.2-rc.1, fall back to `dsh-weekly-report` + native schedule. Both are TRIAL; worst case BUILD-OURS is ~0.5 day (one prompt session + `schedule_create`).

### 3.5 `dsh-plugin-yolo` 0.5.0 — **TRIAL** (the thesis competitor — read this one)

- 1032 KB / 1585 dl30 / pub 2026-09-10, rc dist-tag in their badge flow, no `engines.dsh` (peer `cordis`), README requires host ≥0.1.5-rc.1. Data in `<workspace>/.dsh/yolo/` (SQLite + Markdown snapshots).
- Product: from conversations it extracts **commitments, goals, milestones, reminder rules**; keeps them **cross-session per workspace**, updates on "done"/"postpone to Friday" with an audit trail, **schedules reminders** that fire into YOLO's own notification/special conversation (deliberately **not** into the working session), catches up on reminders missed while dsh was down, and renders a **sidebar assistant dashboard** (today / plans / history-by-time-or-item) with a bounded evidence trail back to the originating session/turn. It explicitly filters pleasantries/profile/knowledge to keep the long-term store small, dedupes re-extraction, and has cancel/delete with strong confirm.
- Overlap with our plan: this is our *entire* "proactivity + memory/status UI" thesis (commitments → plans → reminders → dashboard), minus a heartbeat (it is reminder-driven, not arousal-driven) and minus skill curation. It even plans "connect Agent with explicit permissions/results/acceptance criteria" (roadmap, not shipped).
- Why TRIAL not ADOPT: single-author, 0.1.5-era host claim, 1 MB of UI surface, and adopting it would set the **data model** for our assistant (its `.dsh/yolo/` schema) — a product decision, not a plugin decision. Why not REJECT: reading its extraction/dedupe/evidence design (or lifting the plugin) could save us the hardest part of the plan (commitment lifecycle + reminder catch-up).
- Cheapest evaluation: read `docs/VISION.md` + the data-model page in its repo, and run it for a day in an **isolated test profile** with 3–4 real conversations; if the extracted items are clean, our plan's "plans/reminders" layer becomes integration rather than invention.

### 3.6 Skill curation — `dsh-skill-doctor` **ADOPT (diagnostics)** + `@michengai/dsh-skills-manager` **TRIAL (management)**

- `dsh-skill-doctor` 0.15.0: `engines.dsh >=0.2.0-rc.2` OK, node ≥24 OK, 818 KB, 2324 dl30, pub 2026-11-08, peer `@deepseek-ai/dsh-skill`/`dsh-tools`/`dsh-working-directory`. It is a **diagnoser, not a curator**: shows what the model actually sees (verbatim truncated description text), why a skill silently didn't load (name shadowing, over-long description, missing referenced files), reads runtime fiber phase to distinguish "installed" from "actually running", cross-checks **skill ↔ plugin** (which patch touched the skill chain, which key), and gives prescriptions graded 🔧auto-fix / 🖥one-command / ✍️manual — plus a `/` slash-command entry that bypasses the model. This directly replaces the "why is my skill not being used" debugging loop in our skill-curator component, but it does **not** decide what to prune.
- `@michengai/dsh-skills-manager` 1.4.0: `engines.dsh >=0.2.0-rc.1 <0.3.0-0` OK, **155,917 dl30** (by far the most-used candidate here), 1702 KB, pub 2026-11-09, Apache-2.0, peers incl. `dsh-skill`,`dsh-tools`,`dsh-web-app`,`host-webserver`. Manage local+project skills across global/project/discover/trash views, source detection from install records/lock files/metadata, category folders + drag-sort, batch add, per-category on/off, multi-tool import (Corex/Claude/Copilot/Cursor… "20+"), GitHub install + preview update + backup/rollback. Badge: "支持至 0.2.2-rc.1".
- Skill-curator delta that stays **custom**: the *policy* (when to propose a new skill, when to merge/retire, what "worth keeping" means given usage stats). Neither plugin decides curation; both are read/mutate surfaces. Our plan's curator = a scheduled prompt using these tools + `skill` catalog, not a new plugin.

### 3.7 Sessions / workspace hygiene — `dsh-session-autarchive` **ADOPT (low risk)**, workspace tooling **not adopted**

- `dsh-session-autarchive` 0.1.7: `engines.dsh >=0.2.1-alpha.1` OK, 115 KB, 1572 dl30, pub 2026-11-08, zero deps. Auto-archives sessions idle > N days (default 5) measured by the last `turn/end` event inside `$DSH_HOME/sessions/<ws>/session-*` (not file mtime — resume writes preamble, which would otherwise reset activity). Skips archived, pinned (exempt-by-default), and shield-marked sessions; host sweep every 10 min (first 60 s after boot, runs even without a browser) via official `archiveSession`; right-click "don't auto-archive" + shield toggle + a General-Settings days field. This is our **session-folder hygiene** need solved without touching data.
- `dsh-workspace-control` 0.8.5 REJECTed: rebuild/merge/rename/delete workspaces, move sessions between directories, restart DSH — powerful, transactions with rollback, but **no `engines.dsh` and no peers at all**, and it rewrites workspace/session persistence via `sessionPersistence`. Too much blast radius for an unattended personal agent.
- `dsh-better-workspace` 0.41.0 (OK, `>=0.2.2-rc.1`, 9.4k dl30): two-layer folder tree over the sidebar (disk nesting + `/` in workspace names), official directory-picker flow, context menus. Adopt only if workspace clutter becomes the problem; it is UX, not automation.
- **Session-folder auto-creation stays BUILD-OURS**: nothing found creates a workspace/session folder on a trigger and scaffolds it. The closest are `dsh-better-workspace` (manual add flow) and `dsh-automations`' `session-start` trigger + `shell` action (`mkdir`/scaffold script) — i.e. compose, don't buy.

### 3.8 Agent/session status UI — `dsh-session-kanban` **TRIAL**, boards **REJECT**

- `dsh-session-kanban` 1.1.7: `engines.dsh >=0.2.1-rc.3 <0.3.0-0` OK, 195 KB, no dl30 (no stats), pub 2026-11-06, zero deps, injects `@deepseek-ai/dsh-api-remotes`, `api-session-controller`, `api-workspace-controller`, `client-ui-sidebar`, `client-ui-workspace`. Sidebar board where each session is a card with current work, todo progress, running state, recent activity; overview with totals/running count/todo completion + GitHub-style activity heatmap with day/week/month/year scales; click a card to jump into the session. Fits our "memory/agent status dashboard" idea at the cheapest cost; risk = no download signal, single author.
- `taskboard-workbench` (1580 KB, SQLite, agent-team dispatch, requirement view) and `dsh-kanban-flow` / `@alpacachen/dsh-kanban` are **duplicates of capability we already run**: our profile has `@deepseek-ai/dsh-experimental-agent-team-profile`, and this session already has `team_task_*` (create/claim/update/complete, blockers, write scopes) as the team board. Adding a second board = two sources of truth for tasks. **REJECT** unless the native board's UI proves unusable.
- `dsh-brief-sidebar` (in-conversation todo + deliverables tab) is attractive but hard-depends on `dsh-better-sidebar` peer and its README compatibility statement (`>=0.2.0-rc.1 <0.2.1-0`, dist-tag `dsh-0.2.0`) contradicts its manifest (`>=0.1.1-rc.2 <0.3.0`) — **do not install, inconsistent pinning**.

## 4. Recommended stack (≤3) + install order

1. **`dsh-plugin-heartbeat`** — the proactivity core (heartbeat + event-driven beats + arbitration + panel). Replaces our planned heartbeat plugin wholesale.
2. **`dsh-automations`** — deterministic lifecycle trigger layer (startup / session-* / user-message / tool-after / daily / interval → shell · http · log) + model tools to author rules. Replaces our event-trigger glue and the "nightly sweep / webhook out" plumbing.
3. **`dsh-period-report`** (TRIAL) — digest + reminder scheduling + notification. Fallback if it fails on 0.2.2-rc.1: `dsh-weekly-report` generator + native `schedule` task, or BUILD-OURS (≈0.5 day).

Companions that are safe to add in the same pass (low blast radius, disjoint surfaces): `dsh-skill-doctor` (diagnostics), `dsh-session-autarchive` (hygiene), `dsh-monitor` (inbound watcher, only if external processes must wake sessions).

```sh
# order matters only in that each add is followed by a host restart
dsh plugin --profile web add dsh-plugin-heartbeat
# restart dsh web, then Settings -> Heartbeat: baseIntervalSeconds, quietHours, l3Allow: []
dsh plugin --profile web add dsh-automations
# restart; verify bundle landed in profile package.json dsh.profile.bundles
dsh plugin --profile web add dsh-skill-doctor dsh-session-autarchive
# restart
dsh plugin --profile web add dsh-period-report      # TRIAL — isolated profile first if unsure
```

Smoke checklist after install (each catches a distinct documented failure mode):
1. `/api/heartbeat/status` → 200 with live sessions; set interval to 60 s, confirm an `L0 · no new signal · delivered:false` vitals row and that daily budget stays 0 (README documents this exact check).
2. Add a todo and change it → expect one debounced extra pulse to be *recorded* (still gated); then **Beat now** → confirm one turn opens.
3. `automation_save` a `log`-action rule on `startup` + one on `tool-after` (when=error) → confirm run history rows with trigger/exit code.
4. Restart host with a rule in place → confirm no `duplicate loader entry id` crash and no double execution of `startup`.
5. Ask the heartbeat to speak while a subagent is running → it should stay silent (child-active) or show the child pill.
6. Kill/disable the period-report client half if the panel 404s, and note whether reminders still fire headless.

### Overlaps and conflicts (explicit)

- **Only one heartbeat-type plugin.** `dsh-plugin-heartbeat`, `dsh-idle-watchdog`, `dsh-whale-waker`, `@kanadego/dsh-heartbeat` all open turns on their own schedule; running two = double `followup`/inject into the same session. Pick heartbeat (arousal-gated) and skip the rest. If we ever add a second proactive plugin, the `proactive-cooldown.json` claim only arbitrates speakers that implement that protocol (`heartbeat` and one `memory` plugin); the idle-watchdog and whale-waker do **not**.
- **Two schedulers max, and the native one wins for agent turns.** Native `schedule` task system (already in our tool surface: `schedule_create/list/edit/view`) owns "run a prompt/cron"; `dsh-automations` owns "run a deterministic action". Do **not** add `dsh-scheduler`, `dsh-cron-panel`, `dsh-schedule-later`, `@goodandready/dsh-cron` — same job, extra state.
- **Two hook stacks don't stack.** `dsh-hooks-lite` / `@moon16u/dsh-hooks` / `dsh-hooks` / `dsh-plugin-hooks` all hook `tools/pre-execute|post-execute` + `session/event`; `dsh-automations` also uses `tool-after`. Installing a hook plugin *and* automations on the same tool gives two independent side effects on one event. Choose automations; only add `@moon16u/dsh-hooks` if we need **approval-gated** hooks (its whole point is that hooks stay inert until explicitly approved).
- **UI crowding**: heartbeat panel + skills-manager + skill-explorer + session-kanban + better-workspace + weekly-report + period-report = 7 sidebar/settings surfaces. Install in that priority order and drop the losers after a week; sidebar/context-menu claims (heartbeat uses a `MutationObserver` to claim its nav row by localized label) can degrade if several plugins claim the same row.
- **Agent-team/kanban**: native `team_task_*` (this profile) vs `taskboard-workbench` / `dsh-kanban-flow` / `@alpacachen/dsh-kanban` / `dsh-session-kanban` — at most one board plugin, and only after confirming the native Agent Team board is insufficient.

## 5. Build-vs-buy delta vs our plan

| Planned component | Buy | Then what remains OURS | Est. saving |
|---|---|---|---|
| **Heartbeat (idle-session wake)** | `dsh-plugin-heartbeat` (beat loop, L0–L4, quiet hours/budget/dedupe, vitals panel, arbitration, child pill) | personal **policy** layer: our preferred cadence/quiet hours/workspace overrides in `heartbeat.json`; nothing else | **0.5–1.5 d**, + the arbitration protocol (≈0.25 d) |
| **Event triggers / hooks** | `dsh-automations` (lifecycle triggers → shell/http/log, panel, model tools) + `dsh-monitor` (inbound NDJSON/command-delta watchers) | the *rules themselves* (webhook out, liveness sweep, scaffolding script) — data, not code | **0.5–1 d** |
| **Daily/weekly digest** | `dsh-period-report` (AI narrative + free-period reminders + notify) or `dsh-weekly-report` (sessions+git, template-driven) | digest **content policy** (what a good day looks like for this user) + delivery target (that is a prompt/format, not a plugin) | **0.5 d** if TRIAL passes, else 0 |
| **Skill curator** | `dsh-skill-doctor` (diagnose: what the model sees, shadowing, truncation, fiber phase, skill↔plugin cross-check) + `@michengai/dsh-skills-manager` (manage/install/update/rollback, 155k dl30) | **the curation policy** — when to propose/merge/retire skills, and the scheduled review prompt that uses these surfaces | **0.5–1 d** on the surface; curation logic stays ours (≈0.5 d) |
| **Session-folder auto-creation** | nothing (compose `dsh-automations` `session-start` trigger + `shell` scaffold; or `dsh-better-workspace` add-flow) | **BUILD-OURS**: the scaffold template + naming conventions; small | **0** (still ours, but now 30 min of rule config) |
| **Session hygiene** | `dsh-session-autarchive` (event-time-based idle archive, shields, settings) | nothing | **0.25 d** |
| **Memory / agent status UI** | `dsh-session-kanban` (session cards, running state, todo progress, heatmap) — or nothing, if native board suffices | our **semantic** layer (what "status" means for a personal assistant: commitments, next action) — plugin is generic | **0.25–0.5 d** |
| **Kanban** | **BUILD-OURS = do nothing**: native `team_task_*` + `@deepseek-ai/dsh-experimental-agent-team-profile` already shipped in our profile | — | **0.5 d** by not building a second board |
| **Approval/security hardening** | `@steelunion/dsh-confirm-gate` (per-turn persistent-op budget with 3 escalation tiers → approval) — optional TRIAL; `dsh-trust-panel` needs the missing trust-suite | our **autonomy policy** (which L3 categories, which paths are auto-approved) | 0.25 d if adopted |

Net: the plan's *mechanism* budget shrinks by roughly **3–5 developer-days**; what remains custom is policy/config/prompt content (which was always the valuable part) plus a thin connector if we want commitments→reminders instead of just heartbeat pulses.

## 6. Do-not-use list

| Package | Why not |
|---|---|
| `dsh-trust-panel` | Depends on the nine-channel `dsh-trust-suite`; only `dsh-trust-check` + panel are on npm ⇒ install yields a mostly-empty dashboard. |
| `dsh-workspace-control` | Rebuilds/merges/deletes workspaces and moves sessions through `sessionPersistence`, **no `engines.dsh`, no peers** — unverifiable blast radius on an unattended agent. |
| `dsh-scheduler`, `dsh-cron-panel`, `dsh-schedule-later`, `@goodandready/dsh-cron` | Duplicate the native schedule/task system we already call (`schedule_create` etc.). |
| `taskboard-workbench`, `dsh-kanban-flow`, `@alpacachen/dsh-kanban` | Second task board alongside native Agent Team tasks → two sources of truth. |
| `@kanadego/dsh-heartbeat` 2.2.1 | Not a session heartbeat: a self-scheduled web-browsing agent with an interest profile (1.5 MB); different product, name collision risk with the heartbeat plugin. |
| `dsh-recap` | 6.8 MB unpacked for a `/recap`; digest path covers it with no UI weight. |
| `dsh-better-sidebar`-dependent `dsh-brief-sidebar` | Hard peer + self-contradictory compatibility statements (README `>=0.2.0-rc.1 <0.2.1-0` vs manifest `>=0.1.1-rc.2 <0.3.0`). |
| `dsh-plugin-no-workspace` | Its purpose is to **hide** workspace UI — the opposite of a workspace-centric personal agent. |
| `dsh-plugin-folder-trust`, `dsh-session-recycler` | Windows-only. |
| `dsh-plugin-folder-trust`/`dsh-workspace-migrate`-class migrations | Data-moving operations with no compatibility declaration; not for an always-on profile. |
| `dsh-automation-center` 0.1.0-alpha.8 | Alpha; overlaps automations + native schedule. |
| Any `dsh-hooks*` plugin **alongside** `dsh-automations` | Two side-effect stacks on the same tool/session events (see conflicts). |
| `@hhuangpanda/dsh-automation`, `@wsc…`/`@wisdoverse` skill managers | `engines.dsh` pins to narrow prerelease leaves (e.g. `... || >=0.2.1-rc.1 <0.2.1`) that exclude 0.2.2-rc.1. |

## 7. Unverified / open (TRIAL backlog)

1. **Heartbeat on 0.2.2-rc.1** — semver-satisfying but upstream-tested only on 0.2.1-rc.5; needs the §4 smoke test. Also confirm session format v4 is what our host writes (it is, 0.2.2-rc.1).
2. **`dsh-automations` 0.2.2-rc.1 claim** — machine-readable `dsh.compatibility` but author-tested on 0.2.1-rc.3; and whether `dsh plugin add` alone registers the bundle or the manual `dsh.profile.bundles` edit is required.
3. **`dsh-period-report` headless reminders** — the notification path (`notify-send` on Linux) and the scheduled report generation assume desktop presence; unverified on a `127.0.0.1:7000` web profile.
4. **`dsh-session-kanban` has no download stats** — no field signal (could be brand-new or barely used); inspect repo/issue activity before trusting it.
5. **`dsh-plugin-yolo`** — the strategic read (`docs/VISION.md`, data model) was **not** done; it is the only candidate that overlaps our *whole* product thesis and deserves a 30-minute read before we commit to BUILD-OURS for commitments/reminders.
6. **Native Agent Team board UI** — this session exposes `team_task_*` tools; whether the web GUI already renders a board (making `dsh-session-kanban` unnecessary) was not checked from a browser.
7. Not triaged at all (time-box): GitHub stars/issues/CI for every candidate (0 GitHub API calls), license/attribution copy obligations beyond `license` field, and the 20+ long-tail `ui`/`memory` packages that only *mention* "digest"/"dashboard" in prose.

## 8. Sources

- Index snapshot: `/home/josh/projects/DSH-playground/.cache/plugin-index.json` (format 1, 4,985 plugins, 23 categories).
- Compatibility cache: `/home/josh/.dsh/profiles/web/.dsh-market/discovery-compatibility-v1.json` (schema `dsh-market/discovery-compatibility-cache/v1`, 4,926 entries).
- Installed profile (read-only): `/home/josh/.dsh/profiles/web/package.json` — 17 bundles incl. `@deepseek-ai/dsh-experimental-auto-review`, `@deepseek-ai/dsh-experimental-agent-team-profile`, `@deepseek-ai/dsh-experimental-inspector-profile`, `@deepseek-ai/dsh-experimental-plugin-market-bundle`, `dshmarket`.
- Per-package facts: `https://registry.npmjs.org/<pkg>/latest`; downloads `https://api.npmjs.org/downloads/point/last-month/<pkg>`; READMEs `https://cdn.jsdelivr.net/npm/<pkg>@<version>/README.md`.
- Key repos cited by the READMEs above: github.com/LittleBlackTong/dsh-plugin-heartbeat, github.com/439436269-ctrl/dsh-automations, github.com/AbnerAI/dsh-monitor, github.com/OverDustD7/dsh-chat-digest, github.com/l956615272-hub/dsh-weekly-report, github.com/shuxidemosheng/dsh-skill-doctor, github.com/MichengAI/dsh-skills-manager, github.com/Thunderunruly/session-kanban, github.com/KannaKuron/dsh-better-workspace, github.com/hanshanyike/dsh-yolo, github.com/zhengqiuyang/dsh-trust-suite, github.com/taoziliyouchong/dsh-session-autarchive, github.com/QIUZAIYOU/dsh-workspace-control.

---

# 9. Lead priority answers (added after timebox ping — same snapshot, 5 extra READMEs read)

### (1) `@kanadego/dsh-heartbeat` 2.2.1 — **NO for 0.2.2-rc.1 (peer-compat only); REJECT for our plan**

- **Compat**: no `engines.dsh` at all; only `peerDependencies: ["@deepseek-ai/dsh-llm"]` (`https://registry.npmjs.org/@kanadego/dsh-heartbeat/latest`). README compatibility badge reads **`DSH-0.1.2-rc.1 | 0.2.1-rc.5`** — i.e. its own tested line **stops at 0.2.1-rc.5 and names no 0.2.2 release**. Verdict: not declared compatible; peer-compat only ⇒ if used, it is *trial* territory, unlike `dsh-plugin-heartbeat` (`^0.2.1-rc.5`, which does satisfy 0.2.2-rc.1 semver).
- **What it injects / when** (README 2.2.x, unverified in host): a five-phase beat — 采集 (full-screen screenshot, encrypted-at-rest + busy/idle + foreground-window class) → **闸门 (pure code: silent window → "are you busy" → presence → daily expression cap → speech cooldown; every gate fail logs a reason)** → maintenance/browse-by-interest → decide+express (LLM) → delivery. Delivery is a **"material bundle" into the conversation you are reading**: code assembles candidates (4 random topics + 2 newest chats, ≤6), the model compresses ≤3 into one line each, plus a "he is probably doing X" line and an explicit "this is heartbeat material" disclosure; the receiving agent decides whether to speak, and reports back which items it used. Separately it injects a **time/activity line** into ordinary sessions (throttled 20–30 min, KV-cache-safe append for dynamic-system-prompt models, **never mid-turn, never into subagent sessions**).
- **Token/quiet gates**: explicitly "don't disturb, don't burn tokens" — when the gate says *don't speak*, the decide+express phases **never call the model**; **token-saver mode** (idle ≥30 min or screen locked) reduces to one environment probe every 3 min at zero token cost; **focus mode** pauses beats N minutes (1–1440) without touching config and without consuming daily quota; state persists in `data/focus.json`.
- **Why REJECT for us**: (a) host line unverified on 0.2.2-rc.1; (b) 1.48 MB / 73 files + `qrcode` dep + persona/profile/journal/ledger/"heart-box" subsystems = product, not component; (c) screenshot capture encrypted to disk is a privacy surface a personal agent shouldn't add by default; (d) on **Linux** the PowerShell-backed probes (screenshot, idle, lock screen, foreground window, desktop notify) all degrade to "probe failed" — the busy-detection half of its gate is Windows-only, so its differentiator is gone on our host. Keep `dsh-plugin-heartbeat` instead.

### (2) `@hhuangpanda/dsh-automation` 0.3.37 — **engine-range landmine; TRIAL only**

- **Engine caveat**: `engines.dsh = "0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2 || >=0.2.1-rc.1 <0.2.1 || >=0.2.2-rc.1 <0.2.2"`. The last leaf **matches 0.2.2-rc.1 exactly and nothing else above it** — `0.2.2` stable, `0.2.3-*`, `0.3.x` all fall out of range. So it works on our host today and **breaks on the next host bump**; pin it or expect a hard disable.
- **Provenance**: README is explicit — *"A fork of alpacachen/dsh-automation that adds support for newer DSH versions, tested on 0.2.2-rc.1. If you used the original plugin, disable it before installing this one, or tasks will run twice."* That is the single most useful sentence found for this row: it is a **compat fork**, and installing fork+original double-fires every schedule.
- **What it adds over the native `dsh-schedule` / `schedule_*` tools**: natural-language schedule authoring, **session continuity** (keep running in the same conversation instead of a fresh session), **per-task model and skill selection**, **permission presets**, **message delivery targets**, and failure protection. Those are real gaps in the native scheduler — but they are also exactly the surface `@michengai/dsh-automation` (43k dl30, 3.5 MB, 18 peer deps, Apache-2.0, `>=0.2.0-rc.1 <0.3.0-0`) covers with a *wider* range and far more field exposure. If we want scheduled sessions with per-task model/skill/permissions, compare those two first; do not run both.
- **Do-not-run-together**: native `schedule` + `dsh-scheduler` + this = three schedulers. Pick native + at most one of these.

### (3) Session search — official first, `sessiongraph` only for cross-harness

| Option | Ver | Compat | Assessment |
|---|---|---|---|
| **`@deepseek-ai/dsh-experimental-session-search`** | 0.2.1-alpha.2 | official; only peer `@deepseek-ai/cordis`; deps `dsh-tool-session-query` + `dsh-session-query-sqlite`; `dsh.bundle` manifest | **ADOPT-AS-TRACK**: FTS over past sessions, **off by default**, ships from the same vendor as the host → lowest compatibility risk of anything investigated. Enable it before evaluating third-party search. |
| `dsh-plugin-sessiongraph` | 0.3.2 (index 0.3.0) | no `engines.dsh`, **no peers declared**; 6 sub-packages (`service` + `sqlite` + `sessions` + `tool` + `panel` + `-sessions`) | **TRIAL** — only if we need one corpus across **DSH *and* Codex** sessions (its stated differentiator), with Chinese bigram tokenizer, SQLite `index.db`, seven query types routed native/TS, `raw.ts` to read unabridged events, one model tool + a panel. Interesting seam design, but zero compatibility declaration. |
| `dsh-session-search` 0.1.1 | — | engine OR-list maxes at `0.2.1-rc.1` | **NO** — excludes 0.2.2-rc.1. |
| `@240xu/dsh-session-search` 0.1.11 | — | no engines; peer `dsh-tools` | TRIAL long-tail, no signal. |
| `@lizimin/dsh-session-search` 1.3.6 / `dsh-session-search-bar` 1.0.0 | — | no engines, no peers / no data | unverified long-tail. |

Search layer recommendation: enable official session-search (free), keep `sessiongraph` on the bench, skip the rest — our planned "conversation search UI" is otherwise a two-source-of-truth problem.

### (4) Skills / digest / backup worth adopting (recap with the Lead's frame)

- **Skill curator**: `dsh-skill-doctor` 0.15.0 — **ADOPT (diagnostics)**; `@michengai/dsh-skills-manager` 1.4.0 — **TRIAL→ADOPT** (155,917 dl30, badge 支持至 0.2.2-rc.1, `>=0.2.0-rc.1 <0.3.0-0`); `@linxin666/dsh-client-ui-skill-explorer` 0.4.16 — **TRIAL** (`>=0.2.2-rc.1`, 161k dl30, browse/enable/create/trash UI). **Curation policy stays ours** — none of them decides what to merge/retire.
- **Digest**: `dsh-period-report` 0.2.1 — **TRIAL** (AI narrative + `intervalDays` anchors + notification); fallback `dsh-weekly-report` 0.1.8 — **TRIAL** (sessions+git, reference-format-driven, manual trigger → pair with native schedule); `dsh-chat-digest` — domain-specific (group chats), skip.
- **Backup / undo (new finding, worth adopting)**: `dsh-snapshot-manager` 0.3.4 — **TRIAL→ADOPT for safety**. Per-turn **pre-turn incremental content-addressed snapshot** of the workspace; rollback restores files **and** rewinds the conversation via `sessionController.fork(atSeq)` (original session preserved) and can replay edited input into the new session; panel GC for orphaned snapshots. Pure JS, host half imports **no** `@deepseek-ai/*`. Caveat: `engines.dsh: null`, no peers declared ⇒ UNPINNED, needs a smoke test. This matters more than usual for us: an autonomous L3-ish assistant that edits files wants a per-turn undo it did not write itself. Do **not** confuse with `@xiaoyuyu6420/dsh-backup` 0.14.3 (backup sync; engine OR-list maxes at `^0.2.0-rc.1` ⇒ **NO** for 0.2.2-rc.1) or `dsh-drive-backup` (cloud drive, unverified).

### (5) Session-folder auto-create & memory/status UI — final word

- **Session-folder auto-creation: nothing to adopt — BUILD-OURS via composition.** No package in workflow/session/ui creates a workspace folder on a trigger and scaffolds it. The only path is `dsh-automations` `session-start` trigger (+ optional `workspaces` entry) with a `shell` action running our scaffold script — i.e. ~30 min of rule config, no code. (`dsh-better-workspace` only improves the manual add-workspace flow; `dsh-workspace-control` moves/merges existing workspaces and is REJECTed on blast radius.)
- **Memory / agent status UI: `dsh-session-kanban` 1.1.7 is the only credible buy** (`>=0.2.1-rc.3 <0.3.0-0` OK; session cards with running state + todo progress + activity heatmap; 195 KB; **no npm download stats**). Everything else is either a second task board (native `team_task_*` + `@deepseek-ai/dsh-experimental-agent-team-profile` already installed ⇒ REJECT `taskboard-workbench`, `dsh-kanban-flow`, `@alpacachen/dsh-kanban`) or a thin in-conversation tab (`dsh-brief-sidebar`, blocked by its `dsh-better-sidebar` peer + contradictory compat statements). **The semantic status layer (what "status" means for a personal assistant: commitments, next action, waiting-on) stays ours** — no plugin models it; `dsh-plugin-yolo` models it best but takes over the data model (see §3.5, TRIAL).
