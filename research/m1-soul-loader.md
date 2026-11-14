# M1 own-code: identity (SOUL.md) loader — `@local/dsh-soul`

> **Document status: HISTORICAL BUILD NOTE (2026-11-10).** The loader was installed on 2026-11-11; the "not installed" line below is the state at writing. Current component doc: [plugins/dsh-soul/README.md](../plugins/dsh-soul/README.md).

**State at writing (2026-11-10):** built + tested on a scratch profile (2026-11-10 19:54–20:04 AEST); **not installed into
`personal`** (Lead does that). Live hosts (`:7000`, `:7002`) untouched; no sudo, no systemctl, no
credentials read.

Source of truth for identity content is `$DSH_HOME/soul/SOUL.md`; the plugin is the only code wired to it.
Design decision D3 (`personal-agent-design.md`) wanted "SOUL.md at the persona slot (order 0) by a small
loader" — this is that loader, as our own code (D14: identity is ours, not a 1★ plugin).

## Deliverables

| File | Role |
|---|---|
| [`plugins/dsh-soul/index.js`](../plugins/dsh-soul/index.js) | Host-only Cordis plugin: reads the file, registers one literal prompt section at the persona order |
| [`plugins/dsh-soul/package.json`](../plugins/dsh-soul/package.json) | `@local/dsh-soul`, private, ESM, `dsh.bundle.patch` → the bundle row |
| [`plugins/dsh-soul/cordis.patch.yml`](../plugins/dsh-soul/cordis.patch.yml) | one insert row `id: dsh-soul` |
| [`plugins/dsh-soul/README.md`](../plugins/dsh-soul/README.md) | contract, config, security, install, rollback |
| [`plugins/dsh-soul/selftest.mjs`](../plugins/dsh-soul/selftest.mjs) | dev harness: runs `apply()` against a fake registry, no DSH process |

```text
67289628dd20218219dbc52cb37645264b9fcc8a9de6f3517be2be29015aa773  plugins/dsh-soul/index.js
bf6435f760b26088d4bbefc76537cbcde93855aa670453c17b47194f9cad016a  plugins/dsh-soul/package.json
949bbae3e1901d6280c8c272a9fd5e410e4328ed8d4f061d8516085a9849944a  plugins/dsh-soul/cordis.patch.yml
c56c9f2f646a454b3e1a90d6373a6b57a24e6db739fb268635da8f8f20ca8f6a  plugins/dsh-soul/README.md
065181d3631223984269755c0c2b63a5c588e25d6df15955030f5a07ed529a6a  plugins/dsh-soul/selftest.mjs
```

`index.js` is 187 lines; no dependencies (only `node:fs`, `node:os`, `node:path`), no network, no
`child_process`, no `eval`, no writes, no credentials. It registers **no tool** and has no browser half —
injection only, least privilege.

## Design decisions (and the one that forced a deviation)

### Section name: `deployment:soul`, order 0 (not literally `deployment:persona-prefix`)

The task allowed the persona-slot name "if acceptable". It is **not** acceptable as a global
registration, by construction:

- `@deepseek-ai/dsh-system-prompt`'s service constructor always registers a global section named
  `deployment:persona-prefix` (`.../dsh-system-prompt/lib/index.js` line 61 = section name, line 236 =
  constructor registration; `SECTION_ORDERS.DEPLOYMENT_PERSONA_PREFIX: 0` at line 12).
- Its registry throws on a duplicate name in the same layer (`@deepseek-ai/dsh-scope`
  `NamedEntries.insert`: `if (data.has(name)) throw this.duplicateError(name)`), so a second global
  registration of that exact name would **fail boot**.

We therefore take a unique name at the same centrally allocated order:
`order = ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')` (0, with a `0` fallback), so SOUL
renders where the persona prefix renders, immediately after it if `personaPrefix` is also set (equal order
→ code-unit name order: `deployment:persona-prefix` < `deployment:soul`). Existing `personaPrefix`
semantics are untouched; this plugin never mutates another row's config.

### Coexistence with the mode bundles' persona

Both `dsh-web-app` and `dsh-headless` override the row with
`personaPrefix: 'You are a coding agent powered by the {{model}} model.'` (and the database default is
`''`). The `personal` profile's own patch currently sets **no** `system-prompt` row (checked
`~/.dsh-personal/profiles/personal/cordis.patch.yml`), so a personal-assistant SOUL will be *appended to*
that coding-agent opener unless the Lead adds one line to the profile patch:

```yaml
# ~/.dsh-personal/profiles/personal/cordis.patch.yml — make SOUL own the persona slot
- id: system-prompt
  config:
    personaPrefix: ''   # a patch replaces the row config wholesale; other keys default
```

Tested both ways implicitly: on the scratch web/headless profiles the coding-agent prefix was still
present, and the model still followed SOUL (see persona proof below), because SOUL renders later in the
prefix block.

### `interpolate: false` is load-bearing

The renderer resolves strict `{{name}}` groups in sections and **throws** on unknown/valueless references.
SOUL files are prose and may contain braces, so the section is registered `interpolate: false` and the
fixture deliberately included `{{model}}` / `{{cwd}}` — assembly succeeded and the brace text stayed
literal. None of this is visible to the model as an error path.

### Fail-open behaviour

| File state | Result (verified) |
|---|---|
| missing | no section, one warning `SOUL file not found … (not an error)`, boot and turn continue |
| unreadable / not a regular file | no section, one warning, boot continues |
| empty or whitespace-only | no section, one warning |
| > `maxBytes` | first `maxBytes` bytes cut on a UTF‑8 boundary, one truncation warning, still loads |
| normal | one `loaded SOUL persona … (N bytes, order 0)` diagnostic |

Path precedence: row `config.file` → `$DSH_SOUL_FILE` → `$DSH_HOME/soul/SOUL.md` → `~/.dsh-personal/soul/SOUL.md`
when `DSH_HOME` is unset (matches real units, which always set it). `~/` expands; relative paths resolve
under `$DSH_HOME`, never the process cwd.

Cap: `config.maxBytes` default **16384**, hard ceiling 262144 (a "persona" larger than that is a prompt
bomb). Diagnostics go to **stderr** via `console.error`/`console.warn`: in headless one-shot runs stdout is
the answer channel (this was caught in testing — the load line polluted stdout before the fix), while both
streams reach journald in the Web Host.

## Scratch test evidence

Environment: `DSH_HOME=/home/josh/.dsh`, profile names `soul-web` (from default `web` template, to test the
serving surface) and `soul-headless` (from default `headless` template, to run real model turns — a DSH
profile selects one app surface, so one profile cannot do both). I added the headless profile's existing
user-layer model route (opencode-go) to the scratch headless profile; no credential values were read or
printed. Port used: **7015**. All scratch profiles/fixtures were removed afterwards (see Clean state).

### 1. Unit/self-test (final revision)

```sh
node plugins/dsh-soul/selftest.mjs
```

```text
PASS missing default file -> warning, no section, no throw
PASS empty file -> warning, no section
PASS normal file -> literal interpolate:false section at order 0
PASS config.file precedence over DSH_SOUL_FILE
PASS DSH_SOUL_FILE env override
PASS truncation 11 of 120 bytes, UTF-8 boundary safe, warning
PASS relative override resolves under DSH_HOME, absent -> no-op
ALL SELFTESTS PASSED
```

### 2. Install into a scratch profile (same CLI path the Lead will use)

```sh
DSH_HOME=/home/josh/.dsh /home/josh/dsh/node/bin/dsh plugin \
  --profile soul-web add /home/josh/projects/DSH-playground/plugins/dsh-soul
```

```text
+ @local/dsh-soul <- ../../../projects/DSH-playground/plugins/dsh-soul
```

The DSH-owned wrapper did the bundle wiring automatically: profile `package.json` gained
`"@local/dsh-soul": "link:/home/josh/projects/DSH-playground/plugins/dsh-soul"` **and**
`dsh.profile.bundles` gained `@local/dsh-soul`. Saved composition confirmed:

```sh
DSH_HOME=/home/josh/.dsh /home/josh/dsh/node/bin/dsh --profile soul-web --dump-config | grep -A2 dsh-soul
# == @local/dsh-soul
- id: dsh-soul
  name: '@local/dsh-soul'
```

Same install into `soul-headless` succeeded. No hand-written `insert` row was needed or made.

### 3. Missing SOUL file — no-op, never a boot failure

Final revision, plugin applied in a booting profile (no fixture present):

```sh
DSH_HOME=/home/josh/.dsh /home/josh/dsh/node/bin/dsh --profile soul-web --help
# exit=0
# stderr: [dsh-soul] SOUL file not found at /home/josh/.dsh/soul/SOUL.md; no persona section registered (not an error)
```

Full serving boot with the file still absent: unauthenticated `GET /` → **401** (auth fence up),
authenticated follow-redirect → **HTTP 200**, `<title>DeepSeek Harness</title>`, 40102 bytes, exactly one
`[dsh-soul]` warning in the log, no error lines. A real headless turn also ran with the file absent:

```sh
DSH_HOME=/home/josh/.dsh /home/josh/dsh/node/bin/dsh --profile soul-headless "Reply with exactly: SOUL-MISSING-OK"
# exit=0
# stdout: SOUL-MISSING-OK
# stderr: [dsh-soul] SOUL file not found at /home/josh/.dsh/soul/SOUL.md; no persona section registered (not an error)
```

### 4. Persona proof (installed plugin + fixture SOUL)

Fixture `~/.dsh/soul/SOUL.md` (0600, 458 bytes, sha256 `8a364e1af1114de414c1a2c32af7379f6901ad64224fb768ada934d2ac8a9f73`):
name is **Mochi**, a concise personal assistant; explicitly says never introduce yourself as a coding
agent / AI agent powered by DSH; includes `{{model}}` and `{{cwd}}` as literal prose.

| Run | Command | stdout |
|---|---|---|
| **With SOUL** | `dsh --profile soul-headless "Who are you? Answer in one short sentence."` | `I'm Mochi, the user's concise personal assistant.` |
| **Negative control** (existing `headless` profile, plugin not installed) | same prompt | `I'm an AI coding agent powered by the DeepSeek Harness, here to help you with software engineering tasks.` |

stderr of the SOUL run carried only the diagnostic
`[dsh-soul] loaded SOUL persona from /home/josh/.dsh/soul/SOUL.md (457 bytes, order 0)` — stdout was the
answer only. This is the evidence that the file text actually reaches the system prompt: the same model
route with/without the plugin changes the self-identification, and an earlier turn proved the braces did
not break prompt assembly.

Web surface with the same fixture: serving boot on `:7015` → authenticated `GET /` **HTTP 200**
(`<title>DeepSeek Harness</title>`), log line `[dsh-soul] loaded SOUL persona from
/home/josh/.dsh/soul/SOUL.md (457 bytes, order 0)`, listener on `127.0.0.1:7015`.

### 5. Cap / truncation

Oversized fixture (20600 bytes) via the env override, booting the web surface:

```sh
DSH_HOME=/home/josh/.dsh DSH_SOUL_FILE=/tmp/soul-big.md \
  dsh --profile soul-web --host 127.0.0.1 --port 7015 --no-open
# [dsh-soul] SOUL file /tmp/soul-big.md is 20600 bytes, above the 16384-byte cap; using the first 16384 bytes
# [dsh-soul] loaded SOUL persona from /tmp/soul-big.md (16384 bytes, order 0)
# authenticated GET / -> HTTP 200
```

No warning for a normal file; exactly one truncation warning; the request still serves.

## Install into `personal` (Lead — exact command)

```sh
DSH_HOME=/home/josh/.dsh-personal \
  /home/josh/dsh/node/bin/dsh plugin --profile personal add \
  /home/josh/projects/DSH-playground/plugins/dsh-soul
```

Then, in order:

1. Create the identity file (the loader soft-fails if it is absent, but the persona is the point):

   ```sh
   install -d -m 700 ~/.dsh-personal/soul
   $EDITOR ~/.dsh-personal/soul/SOUL.md
   chmod 600 ~/.dsh-personal/soul/SOUL.md
   ```

2. (Recommended, human decision) make SOUL the sole persona opener by adding the `system-prompt` row
   override from above to `~/.dsh-personal/profiles/personal/cordis.patch.yml`; back up the file first.
   Without it, the model still gets `You are a coding agent powered by …` first and SOUL after it — proven
   to work, but it reads oddly for a personal assistant.

3. Restart the host once (Settings → Host control, or `scripts/ops/dsh-restart.sh dsh-personal.service`),
   then check the log and composition:

   ```sh
   journalctl --user -u dsh-personal.service -b | grep '\[dsh-soul\]'
   DSH_HOME=~/.dsh-personal dsh --profile personal --dump-config | grep -A2 dsh-soul
   ```

   Expect `[dsh-soul] loaded SOUL persona from /home/josh/.dsh-personal/soul/SOUL.md (N bytes, order 0)`.

Rollback: `dsh plugin --profile personal remove @local/dsh-soul` (or Plugins → Remove) + restart. No other
host state exists; the SOUL file is left for the human to keep or delete.

## Risks / limits (read before relying on it)

1. **Not a security boundary.** SOUL.md is deployment-authored content read at boot. Anyone who can write
   it can change the agent's persona; that is the same trust level as the profile patch, and the service
   runs as the human user anyway. It is *data*, not remote input — nothing here fetches it.
2. **Read once at boot.** Editing SOUL.md requires a host restart (no file watcher). `warnOnce` state is
   per process, so a file created after a missing-file boot is only picked up on restart.
3. **`system-prompt`'s `personaPrefix` still exists** (mode bundles set the coding-agent line). The plugin
   is additive by design; making SOUL the only persona needs the one-line profile patch above.
4. **Config is hand-validated, not schemastery.** A local plugin cannot resolve
   `@deepseek-ai/schemastery` from the repo (the profile tree holds it, the linked package does not), so
   there is no `Config` export; an invalid `maxBytes` silently falls back to 16384 rather than failing
   boot. Documented rather than worked around.
5. **Prompt cost** is `bytes / ~4` tokens on every step while `personaPrefix` renders; the 16 KiB cap
   bounds it but a 16 KiB SOUL is still a real per-step cost. Keep the persona tight.
6. **No subagent/agent-scoped identity**: this registers the global section, so every agent in the process
   (including subagents) sees the same SOUL. Per-agent personas would need `agent.ctx` registration; not
   requested.

## Clean state

- scratch profiles `/home/josh/.dsh/profiles/soul-web` and `soul-headless` **removed**;
  `~/.dsh/soul/SOUL.md` (fixture) **removed**; `/tmp` fixtures/logs removed.
- port 7015 free, no scratch DSH processes left running.
- `personal` untouched (no install, no restart, no config edit); no sudo, no systemctl of live units, no
  credentials/launch-token printed in this document.
