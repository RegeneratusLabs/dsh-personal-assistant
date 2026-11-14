# dsh-soul — file-based identity for a DSH deployment

A zero-build local bundle (`@local/dsh-soul`) that injects a persona file into the DeepSeek Harness
system prompt. The personal agent's identity is content, not code: `soul/SOUL.md` is the source of truth,
and this ~190-line Host plugin is the only thing wired to it.

Why a file rather than a profile string: a persona is long-form prose the human edits often, and a Cordis
`personaPrefix` config value would have to be re-quoted into a patch layer every time. A file also keeps
identity out of the patch stack, so it can be backed up, diffed and restored on its own.

## Install

```sh
DSH_HOME=/home/josh/.dsh-personal \
  /home/josh/dsh/node/bin/dsh plugin --profile personal add \
  /home/josh/projects/dsh-personal-assistant/plugins/dsh-soul
```

`dsh plugin add` installs the package, sees its `dsh.bundle`, and appends `@local/dsh-soul` to
`dsh.profile.bundles` automatically. The install reports `restart-required`: restart the Host once
(Settings → Host control, or `scripts/ops/dsh-restart.sh dsh-personal.service`).

Then write the persona (0600 — it is identity content, not a secret, but there is no reason to widen it):

```sh
install -d -m 700 ~/.dsh-personal/soul
$EDITOR ~/.dsh-personal/soul/SOUL.md
chmod 600 ~/.dsh-personal/soul/SOUL.md
```

## Contract

| | |
|---|---|
| Loader row | `id: dsh-soul`, `name: '@local/dsh-soul'` |
| Injects | `systemPrompt` only — no tools, no routes, no client half |
| File default | `$DSH_HOME/soul/SOUL.md` (real units set `DSH_HOME`; falls back to `~/.dsh-personal`) |
| Overrides | row `config.file`, then `$DSH_SOUL_FILE`; `~/` expands, relative paths resolve under `$DSH_HOME` |
| Cap | `config.maxBytes`, default 16384, hard ceiling 262144 |
| Section | name `deployment:soul`, order = `getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')` (0), `interpolate: false` |

Behaviour is deliberately fail-open:

| File state | Result |
|---|---|
| readable, non-empty | text registered once as a literal prompt section; one `loaded` log line |
| missing | no section, one warning (`SOUL file not found … not an error`), boot continues |
| unreadable / not a regular file | no section, one warning, boot continues |
| empty / whitespace-only | no section, one warning |
| longer than the cap | first `maxBytes` bytes (cut on a UTF-8 boundary), one truncation warning |

### Why `deployment:soul` and not `deployment:persona-prefix`

`@deepseek-ai/dsh-system-prompt` registers the global `deployment:persona-prefix` section itself when its
service is constructed (its `personaPrefix` config), so a plugin registering that exact name in the same
layer would hit the registry's duplicate-section error and fail boot. The README for that package says
external contributions may use any finite order, so this plugin takes a unique name at the centrally
allocated persona order. Consequences:

- an empty `personaPrefix` (the `dsh-base` default) leaves SOUL as the persona opener;
- a set `personaPrefix` still renders first and SOUL follows it (`deployment:persona-prefix` sorts before
  `deployment:soul` at equal order). The mode bundles set `You are a coding agent powered by the {{model}}
  model.`; for a personal assistant persona, set `personaPrefix: ''` on the `system-prompt` row in the
  profile patch (one line) and let SOUL own the slot. This plugin never mutates another row's config.

### Why `interpolate: false`

The system-prompt renderer resolves strict `{{name}}` references in sections and throws on unknown or
valueless ones. SOUL prose may legitimately contain `{{…}}`-looking text (templates, code, examples), so
the section is registered literal: braces reach the model verbatim and cannot fail prompt assembly.

## Security

- Text is **data from a local file**, never instructions from a remote source; nothing here fetches,
  writes, executes, or reads credentials.
- Only `node:fs` reads (`statSync`, `readFileSync`), `node:os`, `node:path` — no dependencies, no network,
  no `child_process`, no `eval`.
- A missing file is a no-op: identity must never be able to cause an outage.
- The cap bounds per-step prompt cost and stops a pathological file from becoming a prompt bomb.
- Nothing model-facing exposes the file path or contents as a tool; injection only (least privilege).

## Verify

```sh
# saved composition contains the row
DSH_HOME=~/.dsh-personal /home/josh/dsh/node/bin/dsh --profile personal --dump-config | grep -n dsh-soul

# boot logs (journald): one load line, or one no-op warning
journalctl --user -u dsh-personal.service -b | grep '\[dsh-soul\]'
```

```sh
# loader unit checks (fake registry, temp DSH_HOME, no DSH process)
node plugins/dsh-soul/selftest.mjs
```

Scratch-profile evidence and the exact commands are in
[`research/m1-soul-loader.md`](../../research/m1-soul-loader.md).

## Uninstall / rollback

Remove the bundle from the profile (`Plugins → Remove`, `plugin_manager` `remove_bundle`, or
`dsh plugin --profile personal remove @local/dsh-soul`) and restart. No other host state exists; the SOUL
file is the human's and is left alone.
