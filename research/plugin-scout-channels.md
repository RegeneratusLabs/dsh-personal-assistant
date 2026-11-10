# DSH plugin scout — channels / notify / remote / voice

Scouted for the personal-agent build: **one excellent inbound IM channel (Telegram-first), outbound phone notify, approvals-over-chat, mobile access, TTS**. Read-only survey; nothing installed or modified. Facts collected 2026-11-10 (UTC).

## 1. Method

- Index: `.cache/plugin-index.json` (format 1, **4,985** plugins, 24 categories).
- Slice: `notify` **162** + `remote` **159** + `voice` **76** + `identity` **63** = **460**; plus keyword recall over all 4,985 (telegram/whatsapp/discord/slack/email/sms/ntfy/push/approval/pairing/mobile/tunnel/tts/stt/voice/webhook/bark…) → **1,636** unique candidates.
- Scored by feature fit (Telegram +100, notify/push +50, approvals +45, pairing/auth +35, mobile/remote +40, TTS/STT +40, other IM +30), then reviewed **~70** titles/descriptions.
- **24 packages** verified against live npm metadata (`https://registry.npmjs.org/<pkg>/latest`) and last-month downloads (`https://api.npmjs.org/downloads/point/last-month/<pkg>`, window 2026-10-10 → 2026-11-08); **10 READMEs** read in full/section at the exact latest version via `https://cdn.jsdelivr.net/npm/<pkg>@<version>/README.md`; **10 GitHub API** repo queries (stars / `pushed_at` / archived).
- Compatibility cache: `/home/josh/.dsh/profiles/web/.dsh-market/discovery-compatibility-v1.json` (snapshot **2026-11-09 07:06 UTC**, entries carry `facts.{version, enginesDsh, peerDependencies}`). Cache is **stale vs npm latest** for at least 4 packages (dsh-tg-bridge 1.48→1.50, dsh-zen-remote 2.3.11→2.4.1, @memef1f1y/dsh-plugin-tts 0.6.7→0.7.0, dsh-web-mobile 3.3.0→3.3.5), so peers/engines were re-evaluated from live npm data where they differ.
- Installed baseline (read from `/home/josh/.dsh/profiles/web/package.json`): `dsh-web-mobile@3.3.5`, `dshmarket@^1.73.14`, plus ffmpeg/media/design plugins. **`@feiyang666/dsh-mobile-remote` is NOT in this profile's dependencies/node_modules** — the brief's "already installed" claim needs re-checking.
- Target host: DSH **0.2.2-rc.1**, Node **24.22.1**, Linux (no display server for TTS).
- Marketplace/README claims below are treated as **claims**, not verification. Behavior at runtime was not executed (no install allowed) → anything not npm-verified is marked TRIAL/unverified.

### Compatibility legend (for DSH 0.2.2-rc.1)

| Mark | Meaning |
| --- | --- |
| **PASS** | `engines.dsh` explicitly admits 0.2.2-rc.1 (e.g. `>=0.2.1-rc.2 <0.3.0-0`, `>=0.2.2-rc.1`, or a `>=0.2.x-0 <0.3.0` union), or no `engines.dsh` and all `@deepseek-ai/*` / cordis peers resolve under the market's prerelease-ware evaluation (`includePrerelease=true`) against installed dsh/cordis 4.1.0/schemastery 3.19.0. |
| **PASS\*** | Same, but peer range only admits prereleases under `includePrerelease` (plain semver would exclude 0.2.2-rc.1). This is how the DSH market cache itself classifies these; it is a mild risk if the loader ever uses strict semver. |
| **FAIL** | peer pinned to an old line (0.1.x dsh packages, cordis ^3, schemastery 3.18.x) or platform incompatible. |
| **TRIAL** | Compatible/deterministic from metadata, but low adoption, unverified runtime behavior, or external-service dependency. |

## 2. Candidate table (verified 2026-11-10)

Downloads = npm last-month. Size = unpacked. All listed plugins declare `dsh.bundle` (i.e. are DSH profile plugins) unless noted.

| # | Package / latest | Cat | Compat | Downloads | Size / deps | GitHub | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **dsh-switchboard** 0.5.22 | remote | **PASS** (`engines.dsh >=0.2.0-0 <0.3.0`; 18 peers OK) | 2,055 | 654 KB / 0 | 1★, pushed 11-06 | **ADOPT (TRIAL on maturity)** — best fit |
| 2 | **@xmanrui/dsh-im** 5.10.0 | notify | **PASS\*** (no dsh peers; node ≥22.19) | 127,901 | 28.7 MB / 10 | 3,427★, pushed 11-07 | **ADOPT (heavyweight)** |
| 3 | **dsh-tg-bridge** 1.50.0 | remote | **PASS** (`engines.dsh >=0.2.2-rc.1`; node ≥24) | 31,794 | 1.87 MB / 0 | 6★, pushed 11-09 | **TRIAL** — standalone daemon, not Web-profile |
| 4 | **@goodandready/dsh-messenger-gateway** 0.4.29 | notify | **PASS\*** (peers ^0.2.0-rc.1) | 5,931 | 564 KB / 0 | 5★, pushed 11-03 | **TRIAL** |
| 5 | **dsh-telegram-channel-ru** 0.13.2 | remote | **PASS\*** (peers ^0.2.1-alpha.2) | 3,867 | 802 KB / 1 | 1★, pushed 11-04 | **TRIAL** — RU fork, in-process |
| 6 | **dsh-push-notify** 1.1.0 | notify | **PASS** (`engines.dsh >=0.2.0-rc.1 <0.3.0`) | 1,334 | 67 KB / 0 | 2★, pushed 11-05 | **ADOPT** — outbound-only |
| 7 | **dsh-push-host** 0.7.38 | notify | **PASS\*** (cordis ^4.0.2, schemastery ^3.18.2) | 9,559 | 368 KB / 1 | 0★, pushed 11-09 | **TRIAL** — needs external relay |
| 8 | **dsh-my-remote** 0.2.0 | remote | **PASS\*** (cordis ^4.0.0-rc.10) | 0 | 369 KB / 1 | — | **TRIAL** — reference design |
| 9 | dsh-zen-remote 2.4.1 | remote | **PASS** (`engines.dsh >=0.2.1-alpha.2 <0.3.0-0`) | 0 | 9.6 MB / 1 | 28★, pushed 11-10 | **REJECT/TRIAL** — overlaps installed mobile |
| 10 | @eternalloveone/dsh-palm 1.7.1 | remote | **PASS** (`engines.dsh >=0.2.1-rc.2`) | 0 | 11.3 MB / 5 | — | **TRIAL** — overlaps installed mobile |
| 11 | dsh-reach 0.1.24 | remote | **PASS** (engines union incl. `>=0.2.1-0 <0.3.0`) | 0 | 1.31 MB / 2 | 3★, pushed 11-06 | **TRIAL/REJECT** — superseded by #2 (its own README says so) |
| 12 | dsh-connect 1.0.17 | notify | **PASS\*** (peers ^0.2.0-rc.2) | 0 | 4.73 MB / 3 | — | **TRIAL unverified** |
| 13 | dsh-im-channel 0.2.1 | notify | **PASS** (no peers; node ≥18) | 0 | 223 KB / 2 | — | **TRIAL unverified** |
| 14 | dsh-voice 0.5.6 | voice | **PASS** (`engines.dsh >=0.2.1-rc.3`) | 9,910 | 499 KB / 4 | — | **TRIAL/ADOPT** for TTS |
| 15 | @goodandready/dsh-tts 0.4.42 | voice | **PASS\*** (no dsh peers) | 8,376 | 386 KB / 0 | — | **TRIAL** — cloud TTS |
| 16 | @goodandready/dsh-voice 0.9.55 | voice | **PASS\*** | 9,133 | 498 KB / 0 | — | **TRIAL** — cloud STT |
| 17 | dsh-telegram-notify 0.2.3 | notify | **FAIL** (peer `schemastery ~3.18.4 \|\| ~3.18.5`; installed 3.19.0) | 0 | 66 KB / 0 | — | **REJECT** |
| 18 | @luzhengyangtx/dsh-telegram-duty 0.5.0 | notify | **FAIL** (peers `^0.1.5-rc.2`) | 1,782 | 620 KB / 3 | — | **REJECT** |
| 19 | dsh-notifier 0.13.1 | notify | **FAIL** (peer `dsh-session 0.1.7-alpha/rc` only) | 2,405 | 6.25 MB / 0 | — | **REJECT** (despite "28 channels") |
| 20 | dsh-im-hub 0.2.3 | notify | **FAIL** (peers ^0.1.0-rc.6) | 0 | 122 KB / 0 | — | **REJECT** |
| 21 | @dsh-overdrive/gateway-core 0.2.1 | notify | **FAIL** (peer `dsh-settings ^0.1.0-rc.6`) | 0 | 122 KB / 5 | — | **REJECT** |
| 22 | dsh-plugin-tlnotify 1.4.0 | notify | **FAIL** (peer `cordis ^3.0.0`; installed 4.1.0) | 0 | 2.6 MB / 2 | — | **REJECT** |
| 23 | dsh-speak 1.8.4 | voice | **FAIL platform** (Windows SAPI / macOS `say` only; no Linux path found) | 0 | 225 KB / 1 | — | **REJECT** (Linux host) |
| 24 | dsh-web-mobile 3.3.5 | remote | PASS (installed; node ≥24, peer client-locale ≥0.2.2-rc.1) | — | 4.38 MB / 0 | — | **KEEP** — mobile Web over Tailscale already covered |

Not installable as an in-process bundle: `dsh-tg-bridge` is a **standalone daemon** (`npx dsh-tg-bridge@latest init/setup`, systemd/launchd, own bot token, talks to a DSH CLI/headless profile). It is a bridge, not a Web-profile plugin.

## 3. Deep notes on the shortlist (npm-verified)

### 3.1 dsh-switchboard — the best fit (ADOPT candidate, maturity risk)
README claims (13.6 KB, v0.5.22): Telegram **and** Feishu lines as other clients of the Web host via `ctx.sessionController` — bot-created sessions appear in the Web sidebar and Web sessions can be taken over/followed. Per-line bot credentials, **allowed users/chats**, default working dir. In-chat: text/photo/file/**voice note** (Harness speech service via ffmpeg), one live progress message with Stop, **approvals `Allow once / Reject` buttons (with diff for file edits), agent questions as option buttons**, plain text while a question waits becomes the answer; unanswered fall back to the Web UI after timeout. A **`notify_phone` tool** lets a linked Session send a milestone/urgent message mid-turn (max once/30 s/session), reply-to answers the Session. **Scheduled-task reports**, `/away` mode, daily digest, `/watch`, `/link` one-time codes (10 min), per-person rights (admin/member/guest), group @mention rules. Secrets in the **Harness credentials store** (`TELEGRAM_BOT_TOKEN`, `FEISHU_APP_SECRET`), never profile file/browser. Telegram side uses Bot API polling (no public URL); Feishu uses persistent connection.
Risk: 1 GitHub star, 2,055 dl/mo, single author, README mentions migrating from `dsh-telegram-bridge` → young project. 0 npm runtime deps / 654 KB is a small supply-chain surface. **Verdict: ADOPT with trial install; read `src/` before trusting.** This single plugin replaces most of our planned `dsh-notify` + Telegram adapter: outbound notice, inbound channel, approval/question transport, and an agent-callable notify tool.

### 3.2 @xmanrui/dsh-im — the mature, heavyweight choice (ADOPT alternative)
9+ channels (Feishu, WeChat, DingTalk, WeCom, QQ, Slack, **Telegram**, Discord, WhatsApp, Matrix, iMessage, email, "AI Office"), multi-bot per channel, workspace/model/preset per bot, streaming edits, file round-trip. Remote approvals: reply **`批准`/`拒绝`/`yes`/`no`**; Web and bot race with first-writer-wins, no permanent approval; questions/batch input supported. Secrets only to the local Host credential store; state/RPC never returns them. Optional Feishu voice interaction via DashScope `qwen3-asr-flash` / `qwen3-tts-flash` (needs `DASHSCOPE_API_KEY` + ffmpeg).
Flags: 28.7 MB, 10 deps, many channels we don't need; WeChat via iLink third-party service; **"AI Office Connector" is an optional public-cloud link** (device credentials/job lease) — leave disabled. Telegram is long-polling; per-bot private-chat allowlist mode.
**Verdict: ADOPT if we value adoption/maturity > fit; it is strictly broader than we need.**

### 3.3 dsh-tg-bridge — strong Telegram UX, wrong architecture for us (TRIAL)
Standalone bridge: forum topic = project (own session, cwd, model, permissions), one edited message/turn with reasoning + tool calls, `/diff` per-hunk revert with hash guard, voice via any local/CLI/OpenAI-compatible STT engine, goal/checklists, journal with ack/replay, `/report` redacted diagnostics. Token in `~/.dsh/.credentials.yaml` (`DSH_TELEGRAM_BOT_TOKEN`), config in `~/.dsh/tg-bridge/config.json`; requires **BotFather privacy mode disabled**; `TG_CONFLICT` if two processes poll one token. Explicitly declares `>=0.2.2-rc.1`.
**Verdict: TRIAL** — excellent if we wanted a persistent headless agent on a VPS; wrong if we want the Web GUI session to be the one source of truth (it drives its own CLI profile).

### 3.4 @goodandready/dsh-messenger-gateway (TRIAL)
Telegram long-poll or webhook; **allowlist + pairing codes**; per-user/chat sessions; forum topics; multi-select `messenger_ask` forms with pagination; inline buttons; optional TTS voice replies (needs `@goodandready/dsh-tts`, ffmpeg → OGG/Opus) and STT (`@goodandready/dsh-voice`); Discord/Slack outbound; admin alert channel; inbound webhook `POST /dsh-messenger-gateway/events`; token is a DSH secret field. Peers admit 0.2.x only with prerelease-aware semver.
**Verdict: TRIAL** — closest in-process Telegram alternative to switchboard; webhook mode implies a public endpoint (we'd keep long-poll behind Tailscale).

### 3.5 dsh-telegram-channel-ru (TRIAL)
In-process (`link:`-style install, `dsh plugin --profile web add dsh-telegram-channel-ru`) Telegram remote for a **live Web session**: phone attaches to the session already open on the PC, one dialog two sides, replies and approval/question answers from Telegram, Web-UI settings tab for token/allowlist. Russian fork of `hi-wenw/dsh-telegram-channel` (base 0.3.5); upstream `dsh-telegram-channel` has no resolvable npm `latest` (downloads 283/mo, package metadata empty) → do not install the bare name.
**Verdict: TRIAL** — good minimal "remote for the current session"; RU UI is a real drawback; 1★.

### 3.6 Outbound notify
- **dsh-push-notify** (ADOPT for outbound): in-process, **Bark (iOS) + ntfy**, on turn-end / approval-request / ask-question / error, parses question title+options, tap opens the DSH Web UI session; settings page in the Web UI; keys masked. 0 deps, 67 KB. Data leaves host: ntfy official cloud (or self-hosted ntfy) sees notification text; Bark goes through Apple APNs.
- **dsh-push-host** (TRIAL): process-internal `userQuestions` waterfall → ntfy push + an **answer relay** (`/answer/register`, `/answer/pending`) so the phone can answer late; then `ctx.userQuestions.answer()` + `agent.steer()`. Hard prerequisites, documented in README: `tool-ask-user` must be `mode: timed` (all three local profiles default to `legacy`, so phone answers can't land), and a **third-party relay server** is required (relay TTL 1 h, host token). Not plug-and-play for us; useful as a design reference for late-answer injection.
- **dsh-my-remote** (TRIAL): Web-profile plugin exposing loopback-fenced HTTP API — downlink webhook frames for `ask`/`approval`/`end`, inbound `POST /remote/api/command` with `x-remote-token` for `answer` / `approve(allowed-once|rejected)` / `continue`, status snapshot, command whitelist + audit. **Channel-agnostic adapter contract** — the missing piece is our Telegram transport. Good BUILD-OURS scaffold if we'd rather own the channel.
- **dsh-push-notify alternatives that fail**: dsh-telegram-notify (schemastery pin), tlnotify (cordis ^3), notifier (dsh-session 0.1.7), push-host's ntfy-only siblings.

### 3.7 Mobile / remote surfaces — already covered
`dsh-web-mobile@3.3.5` (installed) + the existing Tailscale trusted-host fence already give phone access to the real Web GUI; **do not add a second mobile surface**. `dsh-zen-remote` (PWA + pairing + **Web Push** lock-screen notifications) and `@eternalloveone/dsh-palm` (standalone `/m/` UI, SSE mux, Web Push, pairing wizard with one-click Tailscale) both overlap, and running two `/m/` UIs risks route/settings collisions. Keep them as fallback only if Web Push becomes a requirement (dsh-web-mobile's push story was not verified here).

### 3.8 Voice
- Installed: `@deepseek-ai/dsh-experimental-voice-input-bundle` (STT). Lead says SenseVoice STT is already installed — do not re-buy STT.
- **dsh-voice 0.5.6** (TRIAL/ADOPT): Edge TTS read-aloud + compatible ASR transcription + workspace file guard; `engines.dsh >=0.2.1-rc.3` so PASS; 9.9k dl/mo; 4 deps. Edge TTS sends reply text to Microsoft's online service — flag for privacy.
- **@goodandready/dsh-tts / dsh-voice** (TRIAL): provider fallback chains (OpenAI, ElevenLabs, …) → text leaves host to third-party clouds; only adopt with a local provider configured.
- **@memef1f1y/dsh-plugin-tts 0.7.0**: Edge TTS default + local RVC / Index-TTS2 / CosyVoice / GPT-SoVITS / cloud Google; 740 KB, 0 deps. 0 downloads on npm (badge claims 133 tests) → unverified.
- **dsh-speak**: REJECT on Linux (Windows SAPI / macOS `say` only). Also not needed if we notify by phone.

## 4. Recommended stack (≤3)

Order matters: one Telegram bot per token; do not run two Telegram pollers.

```sh
# 1) Primary channel + approvals/questions + agent-callable notify
dsh plugin --profile web add dsh-switchboard
#    then: Plugins → Installed → Switchboard → Lines → + Telegram line
#    (BotFather token, allowed users, default working directory), restart dsh web

# 2) Outbound phone notify, independent of the chat surface (Bark iOS / ntfy)
dsh plugin --profile web add dsh-push-notify
#    then: Settings → Notifications → configure Bark key or ntfy topic/token

# 3) (optional, later) TTS read-aloud on the Linux host
dsh plugin --profile web add dsh-voice
```

Fallback for #1 if switchboard's maturity is unacceptable: `dsh plugin --profile web add @xmanrui/dsh-im` (3.4k★, 128k dl/mo, Telegram approvals by text reply) — bigger, but battle-tested; keep its AI Office connector off.

Why this order: switchboard establishes the bot/token/allowlist and the approval transport; push-notify is stateless and cannot conflict; TTS is read-only and can wait. After each install, restart `dsh web` and check the plugin card/health; verify Telegram with `/whoami`, then `/watch`, then a real approval.

## 5. Build-vs-buy delta vs our plan

| Planned piece | Covered by | Delta we still own |
|---|---|---|
| `ctx.notify` seam (agent-callable, per-surface) | switchboard `notify_phone` tool (linked Sessions only, 1/30 s); dsh-push-notify is event-only (turn end/approval/question/error) | **No generic surface-agnostic `ctx.notify`**: notify_phone is Telegram/Feishu-only and chat-bound; no per-surface routing policy, no quiet-hours-except-approval, no dedupe across surfaces. A thin wrapper tool (`notify(surface, priority)`) that calls notify_phone and/or an ntfy webhook is still ours (~100 LOC). |
| Telegram adapter (inbound, pairing, voice notes) | switchboard / dsh-im / messenger-gateway / tg-bridge / telegram-channel-ru | **Buy.** No adapter work needed. Pick one; all have allowlist/pairing. Voice notes: switchboard uses Harness speech service; messenger-gateway/tg-bridge need an STT engine. |
| Approval transport (approve/reject from chat) | switchboard buttons (`Allow once`/`Reject`, diff, timeout→Web); dsh-im text replies with first-writer-wins; dsh-my-remote HTTP `approve` | **Buy for in-chat approvals.** Gap: no unified policy across surfaces (e.g. "approve only from my Telegram, never from Feishu guests"), no cross-channel audit view; switchboard's per-person rights + `/away` are the closest. |
| Scheduled-task delivery to phone | switchboard `/schedule` + digest + per-task "report to this chat" | Buy; note it reports into chat, not to a generic notify bus. |
| Mobile access | installed `dsh-web-mobile` + Tailscale fence | Buy/keep. Only add Web Push if lock-screen notify without Telegram is required. |
| STT | installed voice-input bundle / SenseVoice | Buy/keep. |
| TTS | dsh-voice / dsh-plugin-tts (cloud) | Buy later; accept Edge TTS egress or pin a local engine. |

## 6. Security notes (data-egress and trust)

- **Token storage**: dsh-switchboard, dsh-im, messenger-gateway store bot tokens as DSH secrets/credential-store entries (not profile YAML, not browser). dsh-tg-bridge stores the token in `~/.dsh/.credentials.yaml` and config in plain JSON under `~/.dsh/tg-bridge/`. dsh-push-notify masks Bark key/ntfy token after save. dsh-my-remote's `apiToken` is masked; empty token means loopback fence only.
- **Off-host data**: any Telegram/Feishu bridge necessarily sends message text, files, voice notes and approval/question content to Telegram Inc. / ByteDance. switchboard/dsh-im use long-polling or vendor persistent connections — **no third-party relay server**. Additional egress created by specific plugins: ntfy.sh or self-hosted ntfy (dsh-push-notify, dsh-push-host), Apple APNs (Bark), Microsoft Edge TTS (text of replies), OpenAI/ElevenLabs/DashScope (optional TTS/ASR providers), Cloudflare tunnels (dsh-bridge external plugin, not in this shortlist). **dsh-push-host requires a relay server that stores pending answers** — flag; only self-host.
- **Inbound auth**: never leave allowlists empty. switchboard: line allowed users/chats + member rights; dsh-im: per-bot private-chat allowlist (QR-created Feishu/QQ bots default to allow-all — tighten); messenger-gateway: allowlist + pairing codes; tg-bridge: bot sees only allowed user? (README focuses on single-owner `init --user`; group privacy mode must be disabled for it to receive group messages — extra exposure). dsh-my-remote: loopback trust fence + token + command whitelist.
- **Supply chain**: 0 runtime deps for switchboard/push-notify/push-host (good); dsh-im 10 deps / 28.7 MB; tg-bridge 0 deps. None of the shortlisted packages declares `postinstall` in the metadata fetched (not exhaustively inspected — check before install). dsh-switchboard has 1 star / dsh-im 3.4k stars; maturity differs ~100× — audit switchboard source or accept the risk.
- **Platform**: Linux host — skip Windows-only notification plugins (`dsh-approval-toast`, `dsh-notify-desktop`, `dsh-tray-flash`, `dsh-sound-notify` variants may still work via browser but were not verified) and dsh-speak.
- Keep the Web GUI Tailscale/trusted-host fence; a chat bridge is an *additional* authenticated surface, not a replacement — bot tokens are full bot control.

## 7. Do-not-use / rejected list

| Package | Reason |
|---|---|
| dsh-notifier 0.13.1 | peer `@deepseek-ai/dsh-session` pinned to 0.1.7-alpha/rc only → cannot satisfy 0.2.2-rc.1; "28 channels" irrelevant if it will not load (TRIAL if a future release widens peers). |
| @luzhengyangtx/dsh-telegram-duty 0.5.0 | all 16 peers pinned `^0.1.5-rc.2` → FAIL. |
| dsh-im-hub 0.2.3 | peers `^0.1.0-rc.6` → FAIL. |
| @dsh-overdrive/gateway-core 0.2.1 | peer `dsh-settings ^0.1.0-rc.6` → FAIL. |
| dsh-plugin-tlnotify 1.4.0 | peer `cordis ^3.0.0`, installed 4.1.0 → FAIL. |
| dsh-telegram-notify 0.2.3 | peer `schemastery ~3.18.4 \|\| ~3.18.5`, installed 3.19.0 → FAIL; one-way only anyway. |
| dsh-speak 1.8.4 | Windows/macOS-only TTS engine; no Linux support found → REJECT for this host. |
| dsh-notify-bark 0.1.4, dsh-gotify-notify, dsh-serverchan-watchdog, dsh-ping, dsh-sound-* | superseded by dsh-push-notify (Bark+ntfy, compatible); keep only if one specific channel is required. |
| dsh-zen-remote / @eternalloveone/dsh-palm | don't install on top of dsh-web-mobile (duplicate phone UIs/routes); reconsider only if Web Push is required. |
| dsh-tg-bridge in a Web-profile | wrong architecture for "one source of truth" (separate daemon/profile); fine on a VPS. |

## 8. Overlaps, conflicts, install ordering

- **One Telegram poller per token.** `TG_CONFLICT` (dsh-tg-bridge README) — a second process polling the same bot breaks both. Install exactly one of switchboard / dsh-im / messenger-gateway / tg-bridge / telegram-channel-ru.
- **switchboard vs dsh-im**: both in-process, both session-controller based, both approval-capable → pick one (don't double-answer in chat). switchboard = fit + small + new; dsh-im = mature + broad + big.
- **switchboard + dsh-push-notify**: safe (different delivery paths), but both alert on turn end/approval → configure switchboard digest/per-turn notices off, or use push-notify only for approval/question to avoid double buzz.
- **push-host alongside switchboard**: don't — two different `userQuestions` interceptors plus a relay server; avoid.
- **dsh-my-remote alongside any chat bridge**: possible (it's an API plane), but duplicate approval transports confuse "who answered first"; use it only as a reference, not as a second live path.
- **dsh-web-mobile + zen-remote/palm**: route/UI collisions likely; keep only installed `dsh-web-mobile`.
- Ordering: `switchboard → (verify Telegram /whoami + one approval) → push-notify → (optional) dsh-voice`. Restart `dsh web` after each bundle change; verify plugin health cards; keep a working Web UI token/URL as fallback.

## 9. Open items / unverified

- Runtime behavior of every shortlisted plugin is **unverified** (no installs). Switchboard's button-approval e2e, dsh-im's Telegram text-approval race, and push-notify's event coverage must be smoke-tested after install.
- dsh-switchboard's npm provenance / publisher identity and whether it sits on the same author's `dsh-telegram-bridge` lineage — not checked (GitHub license field `null`).
- `@feiyang666/dsh-mobile-remote` is absent from the web profile despite the brief — re-verify before assuming a mobile remote is already present.
- Whether `dsh-web-mobile` offers Web Push / lock-screen notifications (would remove the only reason to consider zen-remote/palm).
- ntfy topic privacy (public topics are writable by anyone who guesses the name) — use auth token + unguessable topic or self-hosted ntfy.

## 10. Sources

- npm metadata/downloads: `https://registry.npmjs.org/dsh-switchboard/latest`, `https://api.npmjs.org/downloads/point/last-month/@xmanrui/dsh-im`, and same for each row above.
- READMEs: `https://cdn.jsdelivr.net/npm/dsh-switchboard@0.5.22/README.md`, `.../@xmanrui/dsh-im@5.10.0/README.md`, `.../dsh-tg-bridge@1.50.0/README.md`, `.../@goodandready/dsh-messenger-gateway@0.4.29/README.md`, `.../dsh-telegram-channel-ru@0.13.2/README.md`, `.../dsh-push-host@0.7.38/README.md`, `.../dsh-push-notify@1.1.0/README.md`, `.../dsh-my-remote@0.2.0/README.md`, `.../dsh-reach@0.1.24/README.md`, `.../@eternalloveone/dsh-palm@1.7.1/README.md`.
- Repos: `https://github.com/heavenJiang/dsh-switchboard`, `https://github.com/xmanrui/dsh-im`, `https://github.com/aleksvega/dsh-tg-bridge`, `https://github.com/GooDAnDReaDY/dsh-messenger-gateway`, `https://github.com/danilinao/dsh-telegram-channel-ru`, `https://github.com/thiscp/dsh-push`, `https://github.com/KyoMio/dsh-zen-remote`, `https://github.com/PerryLink/dsh-reach`.
- Inputs: `/home/josh/projects/DSH-playground/.cache/plugin-index.json`; `/home/josh/.dsh/profiles/web/.dsh-market/discovery-compatibility-v1.json` (snapshot 2026-11-09 07:06 UTC).
