# Product direction — the consumer assistant on DSH

Companion to [AUDIT-2026-11-14.md](AUDIT-2026-11-14.md). That document says where we are; this one says what
we are building and in what order. It is deliberately narrower than the accumulated research: one product,
one install path, one channel, one memory model, one UI.

---

## 1. The product in one paragraph

**An always-on personal assistant that lives on your own computer and that you message from your phone.**
It remembers you in a way you can see and correct, it does small things without being asked, it asks before
anything consequential, and it never sends your conversations to a third party. You install one app, answer
five onboarding questions, and start texting it. It is built on DeepSeek Harness — the harness is the engine,
not the product — and ships with its own shell, defaults, identity and memory.

Working name: **`<product>`** (placeholder; naming is D20 in the audit). Never use DeepSeek or DSH marks in
the product name or imply endorsement.

## 2. Who it is for, and the job

The first user is a single person who already uses ChatGPT/Claude daily and wants an assistant that (a) is
reachable where they already chat, (b) remembers their context across weeks, and (c) can act on their own
machine or accounts with approval. They are not a developer. They will tolerate one install and one bot
token; they will not tolerate a terminal, a workspace picker, systemd, nftables, or an AI agent reading a
build guide.

The job to be done: *"Remember this for me, remind me, do this small task, and ask me before anything that
matters — from my phone."*

## 3. The promise and the non-goals

**Promise (v1):** install → message from Telegram → it remembers → it nudges you once a day → it asks before
acting → you can see and delete everything it knows.

**Non-goals for v1** (each one is a later product or a different product):

- A coding workspace or IDE replacement.
- 25 messaging adapters; Telegram first, one more only after retention.
- A plugin marketplace or third-party skill hub.
- Multi-tenant, SSO, teams, billing, cloud hosting.
- Voice calls, computer-use, autonomous money movement.
- The B2B productised-services offer in `research/business/` (parked).

## 4. What "a DSH wrapper" means here

The wrapper is a real product layer, not a folder of patches:

1. **A pinned DSH runtime.** We ship a known-good `@deepseek-ai/dsh` version and upgrade it behind a release
   gate. Users never run `npm`, `pnpm`, or `dsh plugin`.
2. **A prebuilt profile bundle.** One package — `dsh.profile.bundles` plus a committed `node_modules` — that
   composes identity, memory, session search, channel, presence, schedule and the product UI. No link paths,
   no peer installs at runtime.
3. **A shell.** A signed desktop application that supervises the host on loopback, owns the launch-token
   handoff, provides the tray/autostart lifecycle, and loads the product UI. This replaces the "open a browser
   at :7002 and choose a workspace" experience.
4. **Product defaults.** Telemetry off, approvals on, memory local, proactivity quiet, one channel, no admin
   panels. The security posture is a default, not a config exercise.
5. **An upgrade and exit path.** Signed updates with rollback; export and delete-all; a trust page that says
   what leaves the machine.

## 5. v1 architecture

```
<product> app (signed; tray; launch at login)
├─ pinned dsh runtime (bundled Node, exact version)
├─ profile bundle  @<product>/assistant  (prebuilt, no pnpm at runtime)
│   ├─ identity      SOUL.md (file, edited in-product)
│   ├─ memory        bounded profile block + remember/recall/forget
│   ├─ recall        official session-search (FTS5, local)
│   ├─ channel       Telegram bridge (owned; long-poll, allowlist, approvals)
│   ├─ presence      local notifications; optional push (off by default)
│   ├─ schedule      DSH schedule rows (morning brief, reminders)
│   └─ product UI    chat, memory, activity, settings, onboarding (client plugin)
├─ onboarding wizard (model access, identity, channel, privacy)
├─ updater (signed; pinned DSH + bundle; rollback)
└─ data  ~/.<product>/  0700 · secrets in OS keychain · export/delete in Settings
```

**Memory model (v1):** local-first. The bounded profile block and FTS5 session search are always on; Hindsight
is an opt-in "deep memory" connector for users who want semantic recall, never a first-run dependency and
never a Postgres the user has to operate. This is the single most important simplification in the plan.

**Channel model:** an owned Telegram bridge on DSH's session and approval APIs — long polling, one bot token,
a numeric-user allowlist, approval buttons inline, delivery of final answers. If `@xmanrui/dsh-im` becomes
certified and the upstream bug is fixed, re-evaluate; do not wait for it.

## 6. Distribution: the choice to make

| Shape | Reaches non-technical users | Always-on | Effort | Verdict |
|---|---|---|---|---|
| Desktop app (Electron/Tauri) supervising a local host | yes | while the machine is awake; tray + login item | 6–8 weeks | **Recommended v1** |
| One-command self-hosted install (macOS/Linux server or VPS) | no (terminal) | yes | 3–4 weeks | **Recommended server mode**, documented for technical users |
| Managed cloud | yes | yes | multi-tenant, billing, compliance, support | Not in v1 |

**Recommendation:** ship the desktop app as the product and keep the self-hosted installer as a supported
"server mode" in the same bundle. The desktop path is the only one that reaches the target user; the server
path preserves the always-on, message-from-anywhere behavior for the technical minority and later becomes the
hosted offering's on-ramp. This is D16 in the audit and needs your sign-off before build.

## 7. The five product surfaces (nothing else in v1)

1. **Onboarding** — model access (account login or key), name/tone, one channel, privacy choices. Under five
   minutes, no terminal.
2. **Chat** — conversation-first home, no workspace picker; approvals inline.
3. **Memory** — what it knows, where it learned it, edit/delete, "forget this". Same-session effect.
4. **Activity** — scheduled runs, nudges, approvals, errors; a plain-language log.
5. **Settings** — model, channel, proactivity/quiet hours, privacy, updates, export/delete, diagnostics.

Host control, Profiles, Capabilities/Composio and the content plugins leave the consumer surface. They may
survive as an "Advanced" profile or in the homelab reference.

## 8. 90-day plan

Each milestone ends in a demo a stranger can run.

### Milestone A — product spine (weeks 1–2)

- Freeze the profile: root `package.json`, `packages/assistant-profile/` with a prebuilt dependency set,
  no `link:` paths, no absolute `/home/josh` references in anything on the product path.
- One dev command boots the product profile on a clean machine (`node scripts/dev.mjs` or equivalent) with
  no pnpm required from the user.
- Ship the memory fix (P0-1) to the reference host after approval; verify write → same-session recall in the
  real UI. This closes the "memory is unproven" gap.
- Contain P0-2 and P0-3 on the reference host (allowlist the PWA, default Composio to read-only or off).
- CI: build the profile bundle, boot it headless, run a smoke conversation against a stub model, scan for
  path leakage and secrets.

**Gate:** a clean container can boot the frozen profile and answer one prompt without network setup beyond a
model key; `grep -r '/home/josh'` over the product path returns zero.

### Milestone B — the channel and the memory surface (weeks 3–6)

- Owned Telegram bridge: pairing code, allowlist, message → session, final-answer delivery, approval
  buttons. One poller per token, enforced.
- Memory surface: list/add/edit/delete with provenance; injection-pattern scan and staged writes for
  suspicious entries; explicit erasure contract.
- Onboarding CLI/HTTP first (the shell comes next), so the end-to-end path can be tested now: message from
  a phone → answer → approval → memory write visible.

**Gate:** the audit's acceptance tests 3 and 4 pass on a clean install, from a phone, with no browser.

### Milestone C — the shell (weeks 7–10)

- Electron shell: spawn/supervise the host, parse the launch URL, singleton lock, tray, autostart, crash
  restart, signed macOS build; Windows second.
- First-run wizard and the five surfaces; remove the workspace picker from the product preset.
- Updater: pinned runtime + bundle, staged rollout, rollback; uninstall and delete-all.

**Gate:** a non-technical tester installs the signed build, completes onboarding, messages from their phone,
and updates to a new build without help.

### Milestone D — trust and release (weeks 11–12)

- Trust page, third-party notices, privacy policy, diagnostics bundle with redaction, support runbook.
- Two weeks of dogfooding by the author, then a 10-person private beta.
- Release checklist: pinned versions, reproducibility, signed artifacts, rollback rehearsal.

**Gate:** all eight readiness gates in the audit §8 are green for at least one platform.

## 9. v1 acceptance tests

1. Fresh macOS install → first answer in under five minutes, no terminal.
2. Telegram message from an unknown account is denied; from the allowlisted account it answers and delivers.
3. Approval round-trip: a consequential action pauses, the phone shows approve/deny, the decision is honored.
4. Memory: say a preference in chat → ask "what do you remember?" → see it → delete it → it is gone from the
   prompt in the same session.
5. Injection: a poisoned web page or file cannot add a durable memory entry or trigger a tool.
6. Proactivity: one useful scheduled message per day, quiet hours respected, one switch to turn it off.
7. Update: v0.1 → v0.2 with rollback; no data loss.
8. Uninstall: delete-all removes data and keys, and the trust page lists exactly what was stored where.

## 10. Risks and kill criteria

| Risk | Mitigation |
|---|---|
| DSH preview churn breaks the product | pin a version, own the upgrade gate, budget one week per DSH minor |
| Telegram/pairing UX is harder than expected | test the BotFather flow with five non-technical users before building more |
| Memory quality disappoints | local-first defaults, visible corrections, no semantic dependency |
| Desktop shell work balloons | timebox to 4 weeks; fall back to a local web app + installer for beta |
| Support burden exceeds a solo operator | diagnostics + logs, no plugin marketplace, one channel |
| Consumer demand is not there | 10-person beta with a 4-week retention bar before investing in Windows/cloud |

**Kill criteria for v1:** fewer than 5 of 10 beta users still message it weekly after four weeks, or support
exceeds 2 hours/user/month. In that case narrow to a single workflow instead of adding capability.

## 11. What this means for the existing repo

- `research/` stays as the engineering record and the "why"; it is linked, not required reading.
- `agents/` stays as the builder path for people who want to assemble their own; it is not onboarding.
- The homelab deployment is frozen as a reference (`reference/` or a tag), not evolved as the product.
- The retired UI design system is reused for the product shell.
- New product code lives in `packages/` (profile, shell, channel) and `plugins/` (product UI), not in
  `scripts/`.

The next commit should be Milestone A's skeleton, not another research note.
