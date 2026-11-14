# DSH 上的个人 agent —— 构建计划

[English](personal-agent-design.md) | 中文

> **文档状态：历史计划（2026-11-10）。** 产品方向已由 [docs/product/DIRECTION.md](../docs/product/DIRECTION.md) 取代；决策索引见 [DECISIONS.md](../docs/DECISIONS.md)。保留作为决策依据记录。

**当时状态：** 活文档，2026-11-10。目标：在现有的 `personal` DSH 主机（0.2.2-rc.1、`~/.dsh-personal`、
已通过 tailnet 发布）上运行的个人助手。本文件是决策记录；详细的参考资料见
[`personal-agent-docs.md`](personal-agent-docs.md)，插件调研结果见
[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)（待撰写）。

## 0. 目前的决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | **组合，不 fork。** 助手是一个 profile 组合包，由挂在有文档记录的接缝（seam）上的小型插件组成；不改动核心。 | 保持 DSH“一切皆插件、保持最小”的特性，以及开发预览版的升级路径。 |
| D2 | **一个 profile（`personal`）、一个组合包 `@local/dsh-assistant`。** 各行可逐条禁用。 | 只需一处即可检查、打补丁、备份。 |
| D3 | **身份：** `soul/SOUL.md` 是权威来源，由一个小型加载器注入到人格槽位（order 0）。 | 类 Hermes 的身份机制，无需每会话一个文件。完整分析见 `personal-agent-docs.md` §5。 |
| D4 | **记忆：** 三个层级——人工整理笔记（冻结）、长期记忆引擎（Hindsight，经 `ctx.memory` 接缝 + 适配器）、情景式会话检索（FTS5）。不要自己写记忆引擎。 | Hindsight 0.10.3 已在本机运行（`127.0.0.1:9177`，REST + `/mcp`）；它提供记忆库、观察（observations）、实体图、心智模型、指令（directives）与审计。详见 §3。 |
| D5 | **先采购，再自己维护胶水代码。** 写插件之前，先在 4,985 个插件的市场里找兼容的；通过审查就采用/试用，否则再写一个轻量包。 | 用户指示：优先即插即用，而非从零自建。 |
| **D5.1** | **2026-11-10 的调研确认了该策略：** 整套技术栈约 90% 可直接采购。采用 `dsh-soul-md`（身份）、`@vectorize-io/hindsight-coding-agents`（长期记忆，复用正在运行的 Hindsight `:9177`）、官方会话检索、`dsh-switchboard`（渠道 + 审批）、`dsh-plugin-heartbeat`、`dsh-automations`、`dsh-push-notify`、`dsh-skill-doctor`、`dsh-session-autarchive`。自写代码收缩到 **~140–200 LOC**（整理器 + 可选的 notify 包装层），外加配置/内容。完整表格与证据见：[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)。 |
| D6 | **先只接一个渠道**（Telegram），先出站后入站，审批稍后再做。 | 渠道的广度不是产品；投递 + 信任才是。 |
| D7 | **信任是显式的：** Web 审批仍是默认；对无人值守/渠道触发的运行采用按面（per-surface）默认值；记忆 fail-open，策略 fail-closed。 | 常开型助手必须能安全地无人看管。 |
| **D9** | **安全基线先于任何社区插件。** DSH 不审查插件代码，也不过滤提示词注入（SAFETY.md：“未经过安全审计”）；插件是进程内的受信代码。因此：固定版本的准入流水线 + 降低能力的运行时策略，再加主机侧控制。完整威胁模型、候选清单审计与检查表见：[`personal-agent-security.md`](personal-agent-security.zh.md)。**经 D13 修订：** 专用操作系统用户/容器与出站拒绝列表被推迟；基线改为关闭遥测出站、准入审查、本地遥测、备份、尽力而为的单元加固，并接受同 UID 的残余风险（§8）。 | 未经审查的插件就是以服务用户权限运行的任意代码。 |
| **D13** | **务实安全基线（2026-11-10，永久生效）。** 保留：遥测出站关闭、仅本地日志汇/摘要/告警、备份 + 恢复演练、固定版本/记入台账的准入、密钥 0600、`workspace-write`+ask、Hindsight `dsh-personal` 记忆库。舍弃：专用用户/容器、第二个 Hindsight 实例、出站拒绝。替换为：出站观测 + 告警、记忆库级隔离、尽力而为的用户单元加固。接受的风险：被攻陷的插件可掌控该人类用户的数据；准入审查是补偿性控制，完整 L0 是升级路径。 | 与单用户个人助手相称；那些昂贵的控制针对的是审查 + 审批本已排除的恶意插件。 |
| **D10** | **安全 + 遥测是 P0 且永久有效。** 每次插件安装/升级都要审查并记入 [`plugin-ledger.md`](plugin-ledger.zh.md)；遥测仅本地且脱敏，不向第三方导出。M0（基线）是所有安装的门禁。 | 用户 2026-11-10 的决定：把安全与遥测放在首位，插件随到随审。 |
| D8 | **在数据存在之前不做自定义 UI。** 先做 Web GUI + 渠道消息；记忆/状态 UI 放在之后。 | 不要为尚未运行的功能造仪表盘。 |

## 1. 原则

1. **每个能力都是一行。** 如果禁用它需要改一行以上 patch，设计就是错的。
2. **文件优先于数据库**，用于身份/笔记；记忆引擎是例外，因为它是外租的。
3. **接缝优先于 fork。** 新行为通过 `ctx.*` 服务、事件、工具、提示词片段挂接。
4. **采购通用件，自己维护胶水。** 身份、记忆策略、在场感（presence）与主动性接线才是产品。
5. **缓存友好的提示词。** 稳定前缀在前；动态记忆以用户上下文的形式注入其后，绝不写进系统提示词。
6. **每个插件都要挣得自己的位置。** 小、固定版本、可检查、可移除；不要把巨型组合包当作地基。

## 2. 目标架构

```
dsh web (personal profile)
├─ core harness: dsh-base + dsh-web-app (+ headless for scripts)        [shipped]
├─ preset "personal"                                                    [config]
│   ├─ identity:   SOUL.md loader → persona-prefix section              [buy or ~80 LOC]
│   ├─ memory:     ctx.memory seam → Hindsight adapter + notes tier     [buy + ~250 LOC]
│   ├─ tools:      memory_retain / memory_recall / memory_reflect       [adapter]
│   └─ policy:     permission preset, sandbox, fail-open memory         [config]
├─ proactivity: dsh-schedule rows (brief, review) + heartbeat plugin    [shipped + buy/build]
├─ presence:   outbound notify → Telegram adapter                       [buy or ~250 LOC]
├─ recall:     session search (FTS5) — official experimental bundle    [buy]
├─ integrations: MCP rows (calendar/mail later)                         [config]
└─ ops: systemd unit, tailnet serve, backups, pinned versions            [existing]
```

## 3. 记忆子系统（2026-11-10 增补）

**引擎：** Hindsight，已在本机运行——`hindsight-api 0.10.3`、`127.0.0.1:9177`、内嵌
Postgres；REST OpenAPI（`/openapi.json`）与 MCP（`/mcp`）。Hermes 把它当作外部记忆提供方；
我们照搬这套架构，而不是它的 Python 适配器。

**三个层级**

| 层级 | 内容 | 机制 | 注入 |
|---|---|---|---|
| 1. 人工整理笔记 | `USER.md`、`MEMORY.md`（有上限） | 我们的 notes 插件，agent 可编辑但有上限，外加整理任务 | 会话开始时冻结；缓存安全 |
| 2. 长期记忆 | Hindsight：观察、图、心智模型、reflect | `ctx.memory` 接缝 + Hindsight 适配器 | 每轮，有预算（≤1.5–2k tokens），prefetch 或 sync |
| 3. 情景记忆 | 过去的对话 | 官方 `@deepseek-ai/dsh-experimental-session-search`（FTS5，默认关闭） | 按需，经工具 |

**DSH 机制**

- **自动留存（auto-retain）：** `agent/turn-stopping`（串行/等待）→ 每 N 轮向 `ctx.jobs` 入队一个任务 →
  带轮次切片与标签（会话、工作区、preset）调用 Hindsight 的 `retain`/`sync_retain`。绝不阻塞该轮；
  失败只记日志。
- **自动召回（auto-recall）：** 两种模式，镜像自 Hermes：
  - *prefetch*（默认）：新的用户输入到来时启动召回；用 `agent.inject()` 注入结果——“不唤醒驱动即添加，
    落在下一个被接纳的步骤里”。
  - *sync*：`agent/pre-step` 瀑布钩子等待一次有界召回，并追加一条上下文消息。
  - 注入位于**稳定前缀之后**，作为用户上下文（KV-cache 准则），并带上去重、分数与来源信息。
- **工具：** 只暴露三个精选工具（`memory_retain`、`memory_recall`、`memory_reflect`），而不是 Hindsight 的
  ~40 个 MCP 工具。原始 MCP 仍可作为调试叠加层经 `dsh-mcp-client` 使用
  （`transport: streamable-http`、`url: http://127.0.0.1:9177/mcp`）。
- **整理：** 每日 `dsh-schedule` 任务 → Hindsight `/consolidate`、心智模型刷新、笔记
  去重/矛盾检查、“变化了什么”摘要。
- **记忆库（bank）：** 用 `dsh-personal` 记忆库，绝不用 Hermes 的 `josh` 记忆库；按会话/工作区打标签；
  对不得重定向记忆库的仓库使用可信目录（trusted-dir）概念。
- **配置默认值：** `auto_retain: true`、`retain_every_n_turns: 2`、`auto_recall: true`、
  `recall_mode: prefetch`、`recall_budget: mid`、`recall_max_tokens: 1600`、设置 `recall_min_scores`、
  `recall_types: observation`、`timeout_ms: 400`、`fail_open: true`。
- **成本/时延：** 留存抽取使用廉价模型；召回在本地（~100–300 ms）；注入的 token 有上限；
  用 Hindsight `/llm-requests/stats` 与 DSH 的 token 计量表测量。

**插件清单（依据 2026-11-10 的调研修订——采购，而非自建）**

| 组件 | 已采购（固定版本） | 仍由我们维护 |
|---|---|---|
| 身份加载器 | `dsh-soul-md@0.12.2`（显式声明兼容 0.2.2-rc.1；人格卡片；关闭它自带的记忆） | 人格/灵魂内容 |
| 长期记忆引擎 | `@vectorize-io/hindsight-coding-agents@0.8.6`——`serverMode: self-hosted`、`apiUrl: http://127.0.0.1:9177`、新建记忆库（绝不用 Hermes 的 `josh`）；自动捕获 + 首个提示词时的召回注入 | 记忆库策略、预算、`autoInject` 模式 |
| 笔记 / 接缝方案 | `dsh-memento@0.5.30` **或** `dsh-hermes-memory@1.2.0`，前提是我们想要 DSH 内受门控/可审计的笔记，而不是 Hindsight 页面——绝不同时用两个笔记存储 | 笔记策略内容 |
| 情景召回 | `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`（确切版本；npm 的 `latest` 带错了 cordis peer） | — |
| 整理/摘要循环 | — | 通过 `dsh-schedule` **自建 ~40–80 LOC** → Hindsight `/consolidate`、心智模型刷新、摘要 |
| 渠道 + 审批 | `dsh-switchboard@0.5.22`（试用；备选 `@xmanrui/dsh-im@5.10.0`） | 按面的自主性策略 |
| 手机推送 | `dsh-push-notify@1.1.0`（可选） | — |
| 通知策略包装层 | — | ~100 LOC，**仅在**需要按面路由/免打扰时段时才写 |
| 心跳 | `dsh-plugin-heartbeat@0.8.0` | 节奏/免打扰时段配置 |
| 事件触发 | `dsh-automations@0.2.1`（必要时加 `dsh-monitor@0.1.1`） | 规则本身（配置） |
| 技能诊断 | `dsh-skill-doctor@0.15.0` | 整理策略（以后） |
| 会话卫生 | `dsh-session-autarchive@0.1.7` | — |
| 摘要 | `dsh-period-report@0.2.1` 试用，否则用原生 schedule + `dsh-weekly-report@0.1.8` | 摘要内容策略 |
| 看板/agent 团队 | 原生 `team_task_*` + agent-team profile | 不要另买一块看板 |
| 备份 | — | 我们自己的脚本（Hindsight Postgres + `~/.dsh-personal`） |

**验收测试：** 重启后的跨会话召回；召回不超 token 预算；Hindsight 宕机时 fail-open；记忆库隔离；
`forget` 能移除某条事实；投毒文本无法触发工具；笔记写入遵守上限；成本可见。

**风险：** 守护进程/Postgres 依赖与升级；数据在 DSH home 之外（备份！）；经记忆的提示词注入；
每轮注入导致缓存命中退化；抽取质量；开发预览版 API 变动。

## 4. 自建 vs 采购（2026-11-10 定案）

调研结果足够正面，计划中的机制层如今基本就是一份**固定版本安装清单**
（见 [`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)）。采用规则不变：插件只有
在以下条件全部满足后才能进入 `personal`：(1) `engines.dsh` 接受 0.2.2-rc.1，(2) 它声明了 `dsh.bundle`，
(3) 它近期发布/更新过，(4) 它的配置面可检查，(5) 它被固定在确切版本，(6) 它通过临时 profile（scratch-profile）的冒烟测试。

| 层 | 已采购 | 试用失败时的备选 |
|---|---|---|
| 身份/灵魂 | `dsh-soul-md` | 我们自写的 ~80 LOC 加载器 + `soul/SOUL.md` |
| 长期记忆 | `@vectorize-io/hindsight-coding-agents` | `dsh-memento`（DSH 内的 SQLite 接缝）或我们的适配器 |
| 笔记层 | Hindsight 页面/心智模型（或 `dsh-memento` / `dsh-hermes-memory`） | 小型 notes 插件 |
| 会话召回 | 官方 FTS5 组合包 | `dsh-plugin-sessiongraph` |
| 渠道 + 审批 | `dsh-switchboard` | `@xmanrui/dsh-im`（成熟、更大） |
| 手机通知 | `dsh-push-notify` | switchboard 通知 |
| 心跳 | `dsh-plugin-heartbeat` | 我们自写的 ~100 LOC 心跳 |
| 事件触发 | `dsh-automations` | 我们的胶水代码 |
| 摘要 | `dsh-period-report` | 原生 schedule + 模板 |
| 技能诊断 | `dsh-skill-doctor` | 无需备选 |
| 看板 | 原生 agent team | — |
| 备份 | 我们自己的（脚本） | — |

**仍然自写的部分：** 一个整理/摘要任务（在 `dsh-schedule` 上 ~40–80 LOC）、一个可选的、不绑定具体面的
notify 包装层（~100 LOC）、profile 组合包/patch 配置、人格/技能内容，以及一个备份/恢复脚本。
其余全部是安装、固定版本、可禁用的。

## 5. 路线图

| 阶段 | 交付物 | 门禁 |
|---|---|---|
| P0 | 计划 + 文档 + 插件候选清单；profile 骨架；固定的市场来源 | 候选清单核实，无未审查安装 |
| **M0** | **对拟采用技术栈做临时 profile 冒烟测试**（`scout` profile）：soul-md、Hindsight 插件（新记忆库）、switchboard、heartbeat、automations、push、会话检索 | 每个 ADOPT 都能完成它那一个行为；无启动冲突；Hindsight 记忆库隔离 |
| **M1** | 把固定清单安装进 `personal`；整理器（~40–80 LOC）+ 摘要；身份内容 | 重启后的跨会话召回；简报投递到 Telegram；心跳受门控/静默 |
| **M2** | 策略：按面自主性、免打扰时段、通知路由；Hindsight + home 的备份/恢复 | 注入/审批测试通过；恢复演练可用 |
| **M3** | 可选：dsh-memento 或 hermes-memory 笔记、记忆 UI、技能整理器、第二渠道/语音 | 仅在确有需要时 |

## 6. 插件审查协议

完整威胁模型与准入清单见 [`personal-agent-security.md`](personal-agent-security.zh.md)。摘要：

1. 核对 `engines.dsh` 是否接受 0.2.2-rc.1，以及 `dsh.bundle` 是否存在（兼容性缓存 + npm 元数据）。
2. 检查 tarball（安装脚本、原生二进制、`child_process`/`eval`、网络域名、
   凭据访问、依赖数量）；阅读有风险的位置。
3. 读 README + 配置 schema；记录数据位置与权限；把其声明视为未经核实。
4. 固定确切版本并记录 sha512；不用 `latest`、不自动更新、不用未审查的构建脚本。
5. 在沙箱 profile（`dsh --profile scout --from-default-profile web`）中带出站日志试用；启动、
   测试那一个关键行为，检查有无意外流量。
6. 只有到这时才加入 `personal`，作为它自己的组合包条目，带一行即可禁用的路径。
7. 记录：版本、来源、sha512、日期、理由、回滚命令；每次升级都重新审计。
8. **安全基线优先：** 专用操作系统用户/容器 + 出站允许列表 + `workspace-write`+ask 预设；
   绝不把 `danger-full-access` 设为默认；把 `dsh-automations` 的 `shell` 动作当作 RCE（禁用或加门控）。

## 7. 待解问题

1. 市场上是否已有 Hindsight/mem0 集成实现了召回注入（recall-injection）策略，还是只有工具？
2. 哪个 Telegram 插件有真正的入站认证/配对，它的审批方案是什么？
3. 心跳：是有现成插件，还是我们自己写那 ~100 行的调度钩子？
4. 我们如何把 Hindsight（内嵌 Postgres）与 profile/会话备份一起备份？
5. 按项目划分记忆库是现在就做，还是等个人记忆库证明自己之后？
6. 哪些记忆插件声称能做提示词注入防护——它们是否与我们的稳定前缀策略冲突？
