# dsh-personal-assistant

[English](README.md) | 中文

一个**在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）之上组合固定版本插件**构建的个人 AI 助手——不 fork，也不写自定义 agent 循环。本仓库既是这套构建本身，也是它的公开工程日志：每一项决策、插件准入、安全控制、失败与修复都记录在 [`research/`](research/) 下。

> **产品状态（2026-11-14）。** 可安装的消费级产品**尚未构建**。本仓库目前是一套可运行的单用户参考部署，以及用 DSH agent 重建它的工具包。审计、目标产品形态与 90 天计划见 [`docs/product/`](docs/product/)：
> [审计](docs/product/AUDIT-2026-11-14.md) · [方向](docs/product/DIRECTION.md)。在把下面任何内容当作产品之前，请先读那里。

**参考部署状态：** M0（安全与遥测）✅ · M0.5（插件准入）✅ · M1（精选插件栈）🟨 —— 身份、召回与新的记忆层已安装；推送与心跳已安装但不生效/默认关闭；Telegram 渠道**暂缓**，等待上游修复投递问题。

[![ci](https://github.com/RegeneratusLabs/dsh-personal-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/RegeneratusLabs/dsh-personal-assistant/actions/workflows/ci.yml)

## 用你自己的 DSH agent 构建自己的助手

本仓库是一份可用的参考实现，不是安装器：**把你自己的 DSH agent 指向它，它就会为你构建同类的助手**——在你的主机上、用你的路径和你的人格设定，并在每次主机级变更前先征求你的同意。

- 从这里开始：[`agents/README.md`](agents/README.zh.md) —— agent 会构建什么、前置条件、基本规则。
- 可直接粘贴的任务说明：[`agents/PROMPT.md`](agents/PROMPT.zh.md)（填入你的 profile/home/port）。
- 流程与门禁：[`agents/GUIDE.md`](agents/GUIDE.zh.md) + [`agents/checklists.md`](agents/checklists.zh.md)。

`research/` 里的工程日志记录了每一步背后的“为什么”，包括哪些失败了、哪些被否决。参考实现中的人格与路径名只是示例——你的 agent 应当写自己的，而不是照抄。

## 目前具备的能力

| 层次 | 组件 | 状态 |
|---|---|---|
| 身份 | `@local/dsh-soul` + [`soul/SOUL.md`](soul/SOUL.md) —— 在提示词顺序 0 处注入人格、语气、不可信内容与审批规则 | 运行中 |
| 长期记忆 | `@local/dsh-memory-personal` —— 有界精选档案 + `memory_remember/recall/forget`；`127.0.0.1:9177` 上的 Hindsight 是可选的语义后端，仅使用记忆库 `dsh-personal`。旧的 coding-agent 客户端已禁用 | 已安装；代码已于 2026-11-14 修复（下次获批重启后生效） |
| 会话召回 | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.2`（FTS5 索引，持久化文件） | 运行中 |
| 手机推送 | `@local/dsh-push` —— 在轮次、审批、提问时发送 ntfy 通知；不含消息正文或会话标题 | 已安装，设置 `NTFY_URL` 前不生效 |
| 主动性 | `@local/dsh-heartbeat` —— 安静、默认关闭的循环，带静默时段与变更触发的提醒 | 已安装，按设计禁用 |
| 连接器 | 官方 `mcp-manager`（rc.2）+ 本地 `ping` MCP 测试件；`GET /api/capabilities` 由所有者门禁 | 运行中（测试件）；首个西方连接器等待 token |
| 能力页 UI | `@local/dsh-capabilities` —— 左侧边栏页面，列出所有连接器与插件，支持探测/重启（运维面板；不属于消费级产品计划） | 在 `personal` 上运行中 |
| 渠道 | `@xmanrui/dsh-im`（成熟的 Telegram/IM 插件） | **暂缓** —— 未针对此 DSH 版本认证，且一个上游未修复的 bug（#547）会破坏最终回答的投递 |
| 安全与遥测 | 已加固的 systemd 用户单元、DSH 遥测出站关闭、nftables 出站流量观测+告警、journald 日志汇、摘要定时器、token/费用计量、备份 + 恢复演练 | 运行中 |

刻意**未**安装：市场里 0–3★ 单人作者插件的长尾（switchboard、heartbeat、automations、push-notify、soul-md……）。这些在 [`research/plugin-ledger.md`](research/plugin-ledger.zh.md) 中被否决；在能力确有需要的地方，我们自己写了那一小块（[`plugins/`](plugins/)）。

## 架构

```
dsh-personal.service (systemd --user, 127.0.0.1:7002, tailnet via tailscale serve)
├─ DSH 0.2.2-rc.2 (profile "personal", home ~/.dsh-personal)
│  ├─ identity   @local/dsh-soul ──► $DSH_HOME/soul/SOUL.md (0600)
│  ├─ memory     @local/dsh-memory-personal ──► $DSH_HOME/memory/profile.json + Hindsight :9177 (bank dsh-personal)
│  ├─ recall     session-search (FTS5) ──► $DSH_HOME/storages/session-search.db
│  ├─ push       @local/dsh-push ──► ntfy (inert by default)
│  └─ heartbeat  @local/dsh-heartbeat (default OFF)
├─ local telemetry: journald · nftables egress observe+alert · token/cost · digest timer
└─ backups: ~/backups/dsh-personal (profile + workspace + Hindsight bank export)
```

## 它是怎么构建的（以及这个仓库为什么有用）

工程记录解释了产品为什么长成这样——包括哪些失败了、哪些被否决。它不是安装路径；产品计划与当前差距见 [`docs/product/DIRECTION.md`](docs/product/DIRECTION.md)。

| 文档 | 内容 |
|---|---|
| [`research/README.md`](research/README.zh.md) | 所有研究笔记的索引 |
| [`research/build-progress.md`](research/build-progress.zh.md) | 阶段看板、决策日志、工作日志、待解问题（每个工作块更新） |
| [`research/personal-agent-design.md`](research/personal-agent-design.zh.md) | 目标架构、记忆设计、阶段计划、决策 D1–D13 |
| [`research/personal-agent-security.md`](research/personal-agent-security.zh.md) | 威胁模型、DSH 真实的安全姿态、准入清单、残余风险 |
| [`research/m0-baseline-recon.md`](research/m0-baseline-recon.md) | 主机/DSH/Hindsight 侦察，以及“字面可行 vs 实际可行”门禁的发现 |
| [`research/m0-host-hardening.md`](research/m0-host-hardening.md) · [`m0-egress.md`](research/m0-egress.md) · [`m0-telemetry.md`](research/m0-telemetry.md) · [`m0-backup-restore.md`](research/m0-backup-restore.md) | 四项 M0 控制措施、它们的验证与局限 |
| [`research/admission-scans.md`](research/admission-scans.md) · [`admission-trials.md`](research/admission-trials.md) · [`admission-dsh-im.md`](research/admission-dsh-im.md) | M0.5 对每个入选候选的静态扫描与 scratch profile 试用 |
| [`research/m1-install-verification.md`](research/m1-install-verification.md) · [`m1-own-code.md`](research/m1-own-code.md) | M1 安装与功能验收证据，包括如实记录的缺口 |
| [`research/plugin-ledger.md`](research/plugin-ledger.zh.md) | 每个被批准、安装或否决的插件，含版本、sha512、扫描、试用、回滚 |
| [`BUILD-LOG.md`](BUILD-LOG.zh.md) | 一屏内可读的按时间顺序的里程碑日志 |

### 值得了解的决策

- **D13 —— 务实的安全基线。** 单用户主机，接受同 UID 风险；我们没有改用专用 OS 用户，而是保持遥测出站关闭、对出站流量（egress）进行观测与告警、备份经过测试、插件经审查并固定版本。完整论证与残余风险：安全文档 §7–§8。
- **D14 —— 只用成熟插件。** 对每个候选衡量 npm/GitHub 采用度；核心面上不使用 0–3★ 单人作者包；改为自己维护少量胶水代码。
- **最小机制。** 一个 profile，组合包条目可逐条禁用；不打核心补丁。

## 使用这些组件

```sh
# unit tests (no host needed)
cd plugins/dsh-heartbeat && node --test          # 30 tests
node plugins/dsh-soul/selftest.mjs              # loader edge cases

# host checks (read-only)
scripts/telemetry/check-alerts.sh               # alerts: unit, Hindsight, backup age, egress
scripts/hardening/verify-unit-hardening.sh      # what systemd actually applied
sudo scripts/egress/observe.sh status           # egress observation target freshness

# backup + restore drill (live host untouched; drill on :7009)
scripts/backup/dsh-backup.sh
scripts/backup/dsh-restore-drill.sh --require-hindsight

# forget a memory document / clear the bank (human-invoked, bank-locked)
scripts/memory/forget.sh --list
scripts/memory/forget.sh --match <text> --yes
```

## 给读者的安全说明

- 本仓库不含任何凭据、token 或被捕获的提示词（CI 会运行密钥形态字符串扫描；原始捕获文件已 gitignore）。
- 文档描述的是一台真实的 homelab 主机（私有 LAN IP、tailnet 名称、本地端口）。其中没有任何内容可从公网访问。
- 构建日志中的第三方记忆库名称已脱敏为占位符。
- DSH 是开发者预览版本：本构建固定确切版本，并把每次 DSH/插件升级都当作一次重新审查。报告问题见 [`SECURITY.md`](SECURITY.zh.md)。

## 许可证

MIT —— 见 [`LICENSE`](LICENSE)。
