# M1 own code — identity, push, heartbeat, forget (2026-11-11)

D14 says the small surfaces are **ours**, not 1★ plugins. Three build subagents died mid-flight during this
block; the Lead recovered their partial code, fixed it, independently verified it, and installed it.

## Installed into `personal` (local bundles — no npm supply chain)

| Bundle | Source | sha256 (entry) | Behaviour | Live state |
|---|---|---|---|---|
| `@local/dsh-soul` | [`plugins/dsh-soul/`](../plugins/dsh-soul/) | `67289628…15aa773` | injects `$DSH_HOME/soul/SOUL.md` at the deployment-persona order (0) with `interpolate:false`; missing/empty file = no-op | **active** (journal: `[dsh-soul] loaded SOUL persona … (2261 bytes, order 0)`) |
| `@local/dsh-push` | [`plugins/dsh-push/`](../plugins/dsh-push/) | `d55eed7b…4b3b4` | ntfy POST on turn end / approval asked / question asked; no bodies, env-only endpoint, 5 s timeout, fail-open | **installed, inert** (`[dsh-push] inert: NTFY_URL is not set`) |
| `@local/dsh-heartbeat` | [`plugins/dsh-heartbeat/`](../plugins/dsh-heartbeat/) | `1d5ca867…72667e0` | quiet proactivity: default OFF, interval ≥300 s, quiet hours 22–08, digest-change + dedupe gate, `followup()` nudge identified as `heartbeat` | **installed, disabled** (`heartbeat disabled (set DSH_HEARTBEAT=1)`) |

Persona content: [`soul/SOUL.md`](../soul/SOUL.md) (sha256 `f0311a75…61af057`), installed to
`~/.dsh-personal/soul/SOUL.md` **0600**. It carries the identity, voice, untrusted-content rule, "ask before
consequential actions", secrets, memory-discipline and local-first policies.

## Verification evidence (all run 2026-11-11)

| Check | Result |
|---|---|
| SOUL unit selftest (`node plugins/dsh-soul/selftest.mjs`) | **8/8 PASS** — missing/empty/truncated/UTF-8-boundary/config precedence/env override/interpolate:false |
| SOUL headless persona proof (scratch `soul-test`, fixture "Mochi") | reply: *"I'm Mochi, your calm, concise personal assistant…"*; log `loaded SOUL persona … (135 bytes, order 0)` |
| Push inert mode (no `NTFY_URL`) | exit 0, one inert log line, **0 requests** to a local mock |
| Push active mode (`NTFY_URL=http://127.0.0.1:7099/mock`) | exactly **1 POST**, payload `{"title":"DSH: turn complete","kind":"turn-complete","sessionId":…,"timestamp":…,"topic":"mock"}` — no message body |
| Push fail-open (dead endpoint) | turn exit 0, one `send failed: TypeError (ECONNREFUSED)` log, nothing else |
| Heartbeat unit tests (`cd plugins/dsh-heartbeat && node --test`) | **26/26 PASS** — quiet over repeated pulses, one nudge per change, quiet hours, dedupe, read/nudge failure containment, multi-agent determinism |
| Heartbeat boot default | `apply()` returns before registering a timer; log `heartbeat disabled` |
| Heartbeat boot `DSH_HEARTBEAT=1` | log `heartbeat enabled: interval=1800s quiet=22:00-08:00`; no crash |
| Live host after install+restart | **active, `/` 401, 0 error/warn/`did not activate` lines**; all three activation lines present; egress observe still only `api.deepseek.com` |

## Forget path (Hindsight has no delete tool)

The mature Hindsight plugin exposes 8 tools, **none of which deletes** (`bank`, `capture_initiative`,
`diagnose`, `ingest_document`, `knowledge`, `knowledge_refresh`, `list_knowledge_pages`, `memories`,
`memory`, `read_knowledge_page`, `reflect`, `search_knowledge_pages`, `sync_status`). The model correctly
refused to bypass the tool surface via curl. So "forget" is a **human-invoked** script:
[`scripts/memory/forget.sh`](../scripts/memory/forget.sh) (sha256 `fbf4fcf1…c9b318`), bank locked to
`dsh-personal`, requires `--yes`, `--list`/`--doc`/`--match`/`--clear`.

Tested: `--match m1-acceptance-phrase --yes` → `deleted … HTTP 200`, documents **4 → 3**.

**Honest limitation (recorded):** Hindsight 0.10.3 has no per-memory delete endpoint. Deleting the source
document does **not** remove derived observations — a REST recall for `amber-fox-42` still returned 10
observation hits. True erasure = `forget.sh --clear --yes` (whole bank, destructive, backup first) or
future Hindsight versions. M1 acceptance therefore records "forget removes the source document; full
observation erasure requires bank clear".

## Rollback

```sh
DSH_HOME=/home/josh/.dsh-personal /home/josh/dsh/node/bin/dsh plugin --profile personal remove \
  @local/dsh-soul @local/dsh-push @local/dsh-heartbeat
systemctl --user restart dsh-personal.service
# optional: rm ~/.dsh-personal/soul/SOUL.md
```

## Open items

- **Push needs an ntfy topic** (`NTFY_URL` + optional token in a 0600 unit drop-in) before it does anything.
- **Heartbeat live nudge path is unit-tested only** (default OFF). Do not enable until M2 proves one real
  idle-agent nudge and quiet behavior end-to-end; enabling it is a one-line `Environment=DSH_HEARTBEAT=1`.
- **Channel remains HOLD** on a Telegram bot token / upstream #547.
- Remaining M1 acceptance gaps: recall token budget, injection corpus, live Web-UI turn.
