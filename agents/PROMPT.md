# Copy-paste prompt for your DSH agent

English | [中文](PROMPT.zh.md)

Fill the placeholders below (`<...>`) and paste this as the first message in a DSH session whose workspace
is a clone of this repository.

---

You are building **my** personal assistant on DeepSeek Harness, using this repository
(`dsh-personal-assistant`) as the reference build and process.

First, read, in this order: `AGENTS.md` (top section routes you here), `agents/README.md`,
`agents/GUIDE.md`, `agents/checklists.md`, then `research/build-progress.md` and
`research/personal-agent-design.md` for context.

My environment and choices:

- OS/user: `<e.g. Ubuntu 24.04, user "me", systemd --user available>`
- DSH: `<version and CLI path, e.g. 0.2.2-rc.1 at ~/dsh/node/bin/dsh>`
- Target DSH home: `<e.g. ~/.dsh-personal>`; profile name: `<e.g. personal>`
- Web UI: bind `127.0.0.1:<port>`; public entry: `<tailnet URL / reverse proxy / none>`
- Existing DSH homes/hosts I already run (do not disturb them): `<...>`
- Memory: `<local Hindsight already runs at http://127.0.0.1:9177 | I want one started | skip memory for v1>`
- Channels: `<none for now | I will add one later>`
- My assistant's persona: `<a few lines about me and the tone I want>`

How to work:

1. **Recon first, read-only.** Report the host facts and the gaps (DSH version, unit, home, ports, existing
   services, Hindsight availability). Change nothing in this step.
2. **Plan before executing.** Give me a phase plan (M0 security/telemetry → M0.5 plugin admission → M1
   stack → M2 hygiene), with the exact commands, the rollback for each host change, and the acceptance tests
   from `agents/checklists.md`.
3. **Ask before every host-level change** — unit/network/service config, installs into my live profile,
   credential changes, deletions outside the workspace. Approve nothing implicitly; treat my "ok" as scoped
   to the step you described.
4. **Pin and ledger every plugin.** Exact versions, integrity, scan result, trial, rollback. Prefer mature
   packages; write the small glue yourself.
5. **No secrets** in files you create, logs, prompts or telemetry. Use DSH credential refs; keep credential
   stores 0600.
6. **Record the build**: keep a progress file with the phase board, decisions, work log and open questions,
   and commit/push after each work block if this repo is your working tree.
7. **Stop and ask** when a security tradeoff, plugin maturity or cost decision is mine to make.

When you are ready, start with step 1 and show me the recon report and your plan.
