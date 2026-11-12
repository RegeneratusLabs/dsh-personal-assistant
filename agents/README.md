# Build your own personal assistant with your DSH agent

English | [中文](README.zh.md)

This repository is a **reference build**: a working personal AI assistant composed on
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) from pinned, vetted plugins, with
an engineering log behind every decision. You can point **your own DSH agent** at it and have it build the
same kind of assistant for **you** — on your host, with your paths, your persona and your choices.

It is a guide + working code + a proven process, not an installer. Your agent does the work; you keep the
keys.

## What the agent will build (after your approvals)

| Layer | Reference choice | Notes |
|---|---|---|
| Identity | a `SOUL.md` persona injected at the prompt's persona slot | written by you, not shipped as "the" persona |
| Long-term memory | self-hosted Hindsight (or your existing local instance) with a dedicated bank | never another user's bank |
| Session recall | official DSH session search (FTS5) | pinned exact version |
| Notifications | a tiny ntfy push plugin (ours, inert by default) | no third-party notifier needed |
| Proactivity | a quiet heartbeat loop (ours, default OFF) | no 1★ heartbeat plugin |
| Security & telemetry | hardened systemd user unit, DSH telemetry egress off, egress observe+alert, local digest, token/cost, backups + tested restore | the part most builds skip |
| Channel | none by default | add a channel only when you actually need one |

Everything is installed as **disableable bundle rows**; nothing forks DSH.

## How to use it

1. **Clone** this repository on the machine that will run the assistant:
   ```sh
   git clone https://github.com/RegeneratusLabs/dsh-personal-assistant.git
   cd dsh-personal-assistant
   ```
2. **Open DSH with this directory as the session workspace** (or `cd` there in an existing DSH session).
3. **Paste the prompt** from [`agents/PROMPT.md`](PROMPT.md) — fill in the short list of placeholders
   (your profile name, DSH home, port, whether you already run a Hindsight instance).
4. **Approve in stages.** The agent's job is to run a read-only recon first, then present a plan with
   rollback for each host change, then execute only what you approve. It follows
   [`agents/GUIDE.md`](GUIDE.md) and the gates in [`agents/checklists.md`](checklists.md).

The agent will also read [`AGENTS.md`](../AGENTS.md) automatically (DSH loads it for this workspace);
its top section routes agents from "building your own" to this folder.

## Prerequisites

- **DSH** 0.2.2-rc.x or newer (the reference host is `0.2.2-rc.1`), Node 22+/24+.
- A Unix account that can run a **systemd user unit** (the reference uses `systemctl --user`; adapt for
  launchd/other init if needed).
- Optional: a local **Hindsight** server (`hindsight-api`) for long-term memory. No Hindsight? The agent can
  start without memory and add it later — recall is fail-open, never a boot dependency.
- Optional: a tailnet/VPN or reverse proxy if you want the Web UI off `127.0.0.1`. Plain loopback is the
  safest default.
- **About 30–60 minutes** with your agent for a first pass; M0 (security/telemetry) is the part worth not
  skipping.

## What you get from this repo

- `agents/` — the prompt, the build guide, the phase checklists (this folder).
- `research/` — why each decision was made: security model, plugin admission with measured maturity data,
  memory design, telemetry baseline, retention/erasure policy, verification evidence. Yes, including the
  mistakes; that is the useful part.
- `plugins/` — small, readable reference plugins: identity loader, ntfy push, quiet heartbeat, plus a
  profile switcher and a host-control panel.
- `scripts/` — operator tooling you can adapt: systemd hardening verify, egress observe/summarize, telemetry
  digest/alerts, backup + restore drill, memory curate/forget, retention inventory.
- `.github/workflows/ci.yml` — tests that keep the reference code honest.

## Ground rules the agent must follow (and you should enforce)

1. **Read-only recon first.** No host changes until the agent has shown you what exists and what it plans.
2. **Ask before every host-level change.** Unit edits, user/service/network config, installs into your
   live profile, credential changes, deletions outside the workspace.
3. **Pin everything; no `latest`; no unreviewed install scripts.** Record version + integrity + rollback
   for every plugin in a ledger (the reference has one).
4. **Mature plugins only.** Prefer first-party/vendor-official code; for small surfaces, have the agent
   write the few dozen lines instead of adopting an unmaintained 1★ package.
5. **No secrets in the repo, logs, prompts or telemetry.** Credential refs and a 0600 store, not env files
   you commit.
6. **Back up before you migrate, and test a restore.** A backup you have not restored is a hope.
7. **Do not borrow someone else's memory.** Use your own Hindsight instance or at least your own bank; never
   point at another user's data.

## Adapting vs copying

Scripts in `scripts/` and plugin paths hard-code the reference host layout (for example `/home/josh/...`).
That is intentional: they are working examples, not a product. Your agent should copy them into your own
layout and replace:
- `/home/josh/projects/DSH-playground` → your clone path,
- `/home/josh/.dsh-personal` → your `$DSH_HOME`,
- `dsh-personal.service` → your unit name,
- the reference persona in `soul/SOUL.md` → **your own** persona and policies.

A quick inventory of hardcoded paths:
`grep -rn '/home/josh' scripts plugins agents | head -50`.

## License

MIT. Use it, fork it, adapt it; attribution is welcome but not required.
