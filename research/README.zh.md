# DSH 作为个人 AI 助手 — 研究资料集

[English](README.md) | 中文

本项研究开展于 2026-11-09，围绕的问题是：*DSH（`@deepseek-ai/dsh` 0.2.2-rc.1）怎样成为像 Hermes Agent /
OpenClaw 那样的个人 AI 助手，以及这个方向上目前都有哪些工作在推进？*

## 先读这些

- **[`dsh-as-personal-assistant.md`](dsh-as-personal-assistant.md)** — 综述：生态全景、DSH 能力映射、差距分析、
  三条构建路径、含验收测试的分阶段计划，以及待解问题。（主要交付物。）
- **准备现在就动手构建这个 agent？** 请从 **[`personal-agent-design.md`](personal-agent-design.zh.md)** 开始 ——
  构建计划（决策、架构、记忆子系统、阶段、审查流程）—— 再加上
  **[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)**：经过验证的自建 vs 采购技术栈
  （约 90% 开箱即用）。文档地图见 [`personal-agent-docs.md`](personal-agent-docs.md)。

## 支撑研究笔记

| 文件 | 范围 | 依据 |
|---|---|---|
| [`personal-agent-design.md`](personal-agent-design.zh.md) | **构建计划**：决策 D1–D8、架构、记忆设计（3 层/Hindsight）、阶段、插件审查 | 本次会话 |
| [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) | **自建 vs 采购技术栈**：各层固定版本的候选插件、自研增量（约 140–200 行代码）、安装顺序、冒烟测试、禁用清单 | 3 项探查 + npm/兼容性验证 |
| [`personal-agent-security.md`](personal-agent-security.zh.md) | **安全模型**：DSH 审查什么（不审查代码/提示词注入）、威胁模型、候选清单的 tarball 审计、OS 隔离、遥测基线、准入清单、事件响应 | DSH 文档 + 六个 tarball 的静态扫描 |
| [`build-progress.md`](build-progress.zh.md) | 阶段看板、M0 安全/遥测清单、决策、待解问题 —— 每个工作块结束后更新 | 本次会话 |
| [`plugin-ledger.md`](plugin-ledger.zh.md) | 每个已批准/审查中/已拒绝的插件，含版本、sha512、扫描结果、回滚方式 | 本次会话 |
| [`plugin-scout-memory.md`](plugin-scout-memory.md) | 记忆/身份：15 个候选插件，Hindsight vs memento vs mem0，身份矩阵 | 索引 + npm + README |
| [`plugin-scout-channels.md`](plugin-scout-channels.md) | 渠道/通知/远程/语音：24 个候选插件，switchboard vs dsh-im，出站流量/安全 | 索引 + npm + README |
| [`plugin-scout-proactivity.md`](plugin-scout-proactivity.md) | 心跳/自动化/会话/技能/安全：24 个候选插件，引擎层面的坑 | 索引 + npm + README |
| [`personal-agent-docs.md`](personal-agent-docs.md) | **构建用的文档地图**：五个文档语料库、13 步阅读路径、关注点→文档对照表、空白点 | 文档站点 + 仓库克隆 + 已安装包的 README |
| [`docs-official-site.md`](docs-official-site.md) | 全部 95 个英文文档站点页面分类（31 HIGH / 33 MEDIUM / 31 LOW），含每页范围与空白点 | 文档站点，逐页抓取 |
| [`docs-installed-packages.md`](docs-installed-packages.md) | 按领域划分的全部 330 个已安装包；哪些 README 属于编写指南；Web profile 如何组合 4 个 agent preset | 已安装目录树 + `--dump-default-config` |
| [`hermes.md`](hermes.md) | Hermes Agent 的架构、功能、“为什么它用起来像个私人助理”、给 DSH 的 12 条经验 | 本地安装 `~/.hermes`（v0.23.0）+ 官方文档 |
| [`openclaw.md`](openclaw.md) | OpenClaw 的网关/渠道/节点/记忆/安全、克隆潮生态、给 DSH 的 10 条经验 | 一手文档、仓库元数据、媒体报道 |
| [`landscape.md`](landscape.md) | Letta/Goose/Open Interpreter/Kortix/Manus/DIY 方案、趋同的 10 层架构、功能矩阵、难题 | 一手资料 + GitHub API |
| [`dsh-audit.md`](dsh-audit.md) | DSH 0.2.2-rc.1 实际交付了什么：插件架构、seam、交互面、持久化、差距表、5 条构建建议（S/M/L） | 330 个包的安装 + 组合配置导出 |
| [`dsh-ecosystem.md`](dsh-ecosystem.md) | 从社区插件市场（4,872 条）中挖掘渠道/记忆/主动性/语音/移动端插件 | `dsh-plugin-catalog` 索引 + 本地安装 |

## 构建阶段文档（M0/M0.5，2026-11-10 增补）

| 文件 | 范围 |
|---|---|
| [`m0-baseline-recon.md`](m0-baseline-recon.md) | 只读的主机/DSH/Hindsight 基线，以及 M0 中“字面要求”与“现实可行”的差距 |
| [`m0-host-hardening.md`](m0-host-hardening.md) | systemd 用户单元加固：探测、施加、验证（9.8 → 7.0 MEDIUM），以及残余 token 说明 |
| [`m0-egress.md`](m0-egress.md) | nftables 观测 + 告警（不拒绝，D13）、保活定时器、汇总器/台账 |
| [`m0-telemetry.md`](m0-telemetry.md) | 遥测关闭 patch、本地日志汇、摘要/告警、token/成本计量、脱敏 |
| [`m0-hindsight-bank.md`](m0-hindsight-bank.md) | 共享 `:9177` 上的 `dsh-personal` 记忆库，绝不用 `josh`，导出/备份 |
| [`m0-backup-restore.md`](m0-backup-restore.md) | 备份脚本 + 恢复演练（PASS 20/20）以及仍然存在的导入缺口 |
| [`admission-scans.md`](admission-scans.md) | M0.5 静态扫描：完整性、脚本/原生模块/子进程/eval/域名/依赖、结论 |
| [`admission-trials.md`](admission-trials.md) | M0.5 探查试验：Hindsight + 官方 session-search（启动/出站/配置证据） |
| [`admission-dsh-im.md`](admission-dsh-im.md) | M0.5 门禁试验：0.2.2-rc.1 上的 `/dsh-im`（可兼容启动、未获认证、上游 Telegram bug） |
| [`m1-own-code.md`](m1-own-code.md) | M1 自研组合包：SOUL 身份加载器、ntfy 推送、安静心跳、人工触发的 forget，以及验证证据 |
| [`m1-install-verification.md`](m1-install-verification.md) | M1 安装 + 验收证据：固定版本插件安装、Cordis 之外的 Hindsight 配置、写入/召回/检索证据、副作用、回滚 |
| [`m2-retention-policy.md`](m2-retention-policy.md) | M2 记忆整理器（每日 Hindsight 合并）+ 保留/清除策略与清单 |
| [`m2-autonomy-policy.md`](m2-autonomy-policy.md) | 各交互面的自主性默认值（Web、心跳、推送、定时任务、未来渠道） |
| [`ui-handover.md`](ui-handover.md) | 新 UI/UX 方向的工作交接简报：背景、DSH 客户端插件 seam、产品诉求、协作约定 |
| [`ui-design-brief.md`](ui-design-brief.md) | **UI 方向设计简报**：信息架构与面板模型、已验证的 token 体系、三个视觉方向与草图、组件套件、无障碍/不可信数据规则（第一个切片 Status/Health 已交付，随后于 **2026-11-12 下线**） |
| [`ui-primitives-slots.md`](ui-primitives-slots.md) | 已验证的 DSH 客户端 seam：slot 目录与 props、311 个 primitive 导出、客户端模块契约、`/api` 路由配方、防御性规则 |
| [`dsh-restart-runbook.md`](dsh-restart-runbook.md) | 重启 DSH 主机 + 待生效插件检测（host-control UI、scripts/ops） |

## 一段话总结

这个领域已经收敛到一种架构 —— 通用 agent 框架外面包一层常驻运行时，再加上聊天渠道、分层记忆、
调度/心跳、信任/策略层和人格。DSH 已经交付了框架那一半（会话、工具、沙箱、审批、技能、MCP、子代理/团队、目标、
定时任务、Web GUI、headless/SDK/ACP），缺的是助手那一半：IM 渠道、出站通知、长期记忆、感知渠道的审批
和主动心跳。这些都可以做成插件嵌进 DSH 的 seam，而社区市场里已经有约 130 个渠道桥接插件、约 229 个
记忆插件和约 277 个主动性插件，其中还包括两个接近完整的助手组合包（`dsh-bao`、`@starsharryzhu/dsh-assistant`）。
因此杠杆率最高的工作是集成与加固：一个精选的「个人助手」profile 组合包、一个先接 Telegram provider 的
`ctx.channels` seam、一个带整理的记忆子系统，以及一套感知渠道的审批/信任策略 —— 而不是再写一个 agent 循环。

## 注意事项

- DSH 是开发者预览版（已宣布会有破坏性变更）；市场上的插件未经审查，质量参差不齐。文中的数量统计来自
  2026-11-09，按关键词/分类匹配得出，后续会漂移。
- 本地检查全程只读；没有读取或复制任何凭据，也没有读取或复制任何个人记忆/聊天内容。
