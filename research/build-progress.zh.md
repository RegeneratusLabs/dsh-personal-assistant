# 构建进度

[English](build-progress.md) | 中文

个人 agent 构建的实时状态。构建 agent 在每个工作块结束后更新本文件。
计划：[`personal-agent-design.md`](personal-agent-design.zh.md) · 门禁：[`personal-agent-security.md`](personal-agent-security.zh.md)
· 技术栈：[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md)。

**状态：** P0（设计 + 文档 + 插件探查）**已完成**。**M0 ✅ GREEN（2026-11-10 17:07 AEST，务实基线 D13）**
—— 单元已加固并验证、遥测出站关闭、出站流量已观测 + 告警、本地遥测在线（journald 容量上限、token/成本、
摘要定时器、告警）、`dsh-personal` 记忆库已隔离、备份 + 恢复演练 PASS、残余风险已记录。**M0.5 已完成；
M1 进行中（记忆/召回/身份/推送/心跳已上线；渠道由人工决定延后）；M2 已完成（2026-11-11）。公开构建日志：**
https://github.com/RegeneratusLabs/dsh-personal-assistant `personal` 现在运行：官方
`session-search@0.2.2-rc.1`、厂商 `Hindsight@0.8.6`（配置在 Cordis 之外），以及**我们自己的**身份、
推送与心跳组合包 + `SOUL.md` —— 全部已验证、在线、无报错。遗忘是一个人工触发的脚本（Hindsight 未提供
删除工具；派生观察在文档删除后仍会存在 —— 已记录）。渠道（`@xmanrui/dsh-im`）仍为 **HOLD**，等待
Telegram token/冒烟测试。证据：
[`m1-install-verification.md`](m1-install-verification.md)、[`m1-own-code.md`](m1-own-code.md)。

## 阶段看板

| 阶段 | 范围 | 状态 | 出口门禁 |
|---|---|---|---|
| P0 | 文档地图、构建计划、记忆设计、插件探查、安全模型 | ✅ 已完成 | `research/` 中的交付物 |
| **M0** | 个人主机上的安全与遥测基线 | ✅ **2026-11-10 完成** | 单元已加固并验证、遥测出站关闭、出站流量已观测 + 告警、本地遥测在线、Hindsight `dsh-personal` 记忆库隔离、恢复演练通过、残余风险已记录 |
| M0.5 | 插件准入（仅成熟插件，D14） | ✅ **完成** —— 等待签核 | 台账条目完整；意外发现已记录；人工签核 |
| M1 | 把精选技术栈装进 `personal`（D14 仅成熟插件） | 🟨 **进行中** —— 记忆 + 召回 + 身份 + 推送 + 心跳已安装并验证；渠道 HOLD；仍有验收缺口 | 设计 §3 + 候选清单 §5 的验收测试 |
| M2 | 整理器/摘要、通知策略、各面自主性、保留 | ✅ **2026-11-11 完成** —— 整理器定时器、保留 + 加密离机备份包、自主性策略；叙述式摘要推迟到 M3 | 出站/审批/注入测试通过 |
| M3 | 可选的笔记存储 / 记忆 UI / 技能整理器 / 第二渠道 | ⬜ 以后再做 | 只有出现真实需求才做 |

## M0 任务清单（务实基线，D13）

基线事实与“字面要求 vs 现实可行”的差距见 [`m0-baseline-recon.md`](m0-baseline-recon.md)；采纳的姿态及其
已接受的风险见 [`personal-agent-security.md`](personal-agent-security.zh.md) §7–§8。
状态：⬜ 待办 · 🟨 进行中 · ✅ 完成。

安全：

- [x] 尽力加固 `dsh-personal` 的 systemd **用户**单元，并记录哪些指令真正生效 —— **全部生效**（探测 + 回读），
      journald 日志汇，暴露面 9.8 → **7.0 MEDIUM**，启动/401/模型列表已验证；`LogFilterPatterns`
      在用户单元上被证明无效并已移除（残余风险已记录）。详情：[`m0-host-hardening.md`](m0-host-hardening.md) §8。
      取代“迁出人类用户”（D13）。
- [x] 出站流量**已观测 + 告警**：已施加 `table inet dsh_egress`（限定 cgroup 跳转、策略 accept、精确计数器 +
      限速的 `DSH-EGRESS ` 日志）；用一条带 cgroup 归属的连接验证
      （`DST=3.173.21.63:443` = `api.deepseek.com`）；`summarize-egress` 状态 OK，`check-alerts`
      报 `egress-observe ok`。root 保活定时器在单元重启后重新绑定（cgroup 陈旧问题）。没有拒绝列表
      （D13）。详情：[`m0-egress.md`](m0-egress.md)。
- [x] 密钥：凭据存储 0600，没有任何密钥被写入单元环境；四个在勘察中暴露的凭据引用，其轮换被**拒绝**
      （已接受风险，D12/D13）。旧 `~/dsh/logs` 已清理（目录 0700、文件 0600；token 行不再全局可读）。
      当前进程的启动 token 留在本地用户日志中，**接受为已记录的残余风险**（0640、仅本地、排除在
      备份/导出之外，token 在重启后失效）。
- [x] Hindsight：**已创建 `dsh-personal` 记忆库**，位于现有 `:9177` 实例上（0 条事实，导出 HTTP 200）；
      Hermes 记忆库未被触碰（`josh 58310`、`hermes-bank-3 29`、`hermes-bank-2 66`）。详情：
      [`m0-hindsight-bank.md`](m0-hindsight-bank.md) §8。插件配置必须在 M1 中固定该记忆库。
- [x] 恢复演练：**PASS —— 20/20 项检查**（profile、工作区、会话、storages、凭据 0600、
      `dsh-personal` 记忆库导出 sha256、`:7009` 上的临时启动、带认证的 UI 200、干净拆除；
      4.1 s）。证据：[`m0-backup-restore.md`](m0-backup-restore.md)。

遥测：

- [x] 关闭 DSH 出站：已施加 profile patch —— `session-log-deepseek`/`plugin-package-inventory-deepseek`
      `enabled: false`，`session-telemetry-otel` `mode: DISABLED`；先用 `--patch --dump-config` 预检，
      重启后生效（备份为 `cordis.patch.yml.bak-m0-20261110-154703`）。注意：当前的
      `opencode-go` 路由本来也不会附带这些字段；该 patch 保护的是 `deepseek-official` 通道。
- [x] 本地日志汇：systemd 用户日志（有界：`SystemMaxUse=2G`、保留 30 天；2.4 GB → 1.8 GB）；
      出站观测 + 汇总器在线；token/成本计量（`scripts/telemetry/token-cost.sh` → §7.3 成本文件，
      今日 8,978 tokens；尖峰基线需 3 天建成）；摘要中包含 Hindsight `dsh-personal` 统计；
      插件台账仍是安装/升级的记录汇（M1 之前为空）。
- [x] 告警 + 摘要：`check-alerts.sh` 在线（**无告警**；警告 = 安装以来的 24 小时内 4 次重启，以及
      成本基线不足 3 天；0 项跳过）；用户定时器 `dsh-telemetry-digest.timer` 已在 07:00 启用
      （`Persistent=true`），写出 0600 的脱敏摘要（告警、出站复查、备份年龄、记忆库统计、
      token/成本）；journald 保留策略已生效。
- [x] 对日志汇做密钥扫描，在旧 `~/dsh/logs/*.log` 中发现 35 行 URL token（值已打码，从未打印）；
      新的单元日志写入 journal（不再有文件日志）。清理与摘要脱敏规则已记录。

## 已定案的 M0 决策（2026-11-10 人工签核，标注处由 D13 取代）

| # | 决策 | 结论 |
|---|---|---|
| M0-D1 | 隔离 | **继续以 `josh` 运行；尽力加固用户单元；接受同 UID 下的密钥暴露。** 完整 L0（专用用户/容器 + 拒绝列表）是已记录在案的升级路径。 |
| M0-D2 | Hindsight | **共享实例 `:9177`，只用自有记忆库 `dsh-personal`**；不再起第二个 Postgres（修订了先前“第二实例”的答案）。 |
| M0-D3 | 出站流量 | **观测 + 告警，不设拒绝列表**（由“先观测 24 小时再拒绝”修订而来）。 |
| M0-D4 | 轮换 | **现在不轮换**；接受残余风险，并已记录。 |

## 决策日志（近期）

- D9：安全基线先于任何社区插件；DSH 不审查代码，也不审查提示词注入。
- **D10（2026-11-10）：安全 + 遥测属于 P0，且是长期要求。** 每次插件安装/升级都要审查，
  并记录到 `plugin-ledger.md`；遥测只落本地、脱敏、不向第三方导出。
- **D11（2026-11-10，勘察）：** 基线记录在 [`m0-baseline-recon.md`](m0-baseline-recon.md)。
  后果：该主机构建上 systemd `IPAddressAllow/Deny` 不可用 → 由 nftables 取代；
  Hindsight 目前位于 Hermes 的嵌入式 Postgres 内；`dsh-personal` 以 `josh` 运行且单元未加固；
  尚未安装任何插件，也未做任何主机变更。
- **D12（2026-11-10，关于 M0-D1…D4 的首批人工答复 —— 标注处由 D13 取代）：**
  - **M0-D1 隔离：加固单元，但仍以 `josh` 运行**（专用用户/容器延后）。
  - M0-D2 Hindsight：第二实例 + 自有嵌入式 Postgres，位于 `127.0.0.1:9178` —— **已由 D13 修订**为
    共享 `:9177` 实例上的 `dsh-personal` 记忆库。
  - M0-D3 出站：先只观测约 24 小时，然后拒绝 + 记录 —— **已由 D13 修订**为永久观测 + 告警。
  - **M0-D4 轮换：现在不轮换**；接受残余风险 —— 勘察中暴露的值已随本次会话上下文发送给
    模型提供商。出现任何异常即重新评估；记录于 `m0-baseline-recon.md` §0。
- **D13（2026-11-10，人工决策 —— 最终）：务实的个人 agent 基线，永久采纳。**
  保留：DSH 遥测出站关闭、仅本地的日志汇/摘要/告警、备份 + 经验证的恢复、固定版本 +
  入台账的准入审查、密钥 0600 且绝不进环境变量/日志、`workspace-write`+ask 预设、不默认
  `danger-full-access`、Hindsight `dsh-personal` 记忆库（绝不用 `josh`）、每个 token 只跑一个
  Telegram poller、提示词注入姿态。放弃：专用 OS 用户/容器、第二套 Hindsight 实例 + Postgres、
  出站拒绝列表。改为：出站**观测 + 告警**、记忆库级的 Hindsight 隔离、尽力而为的
  用户单元加固并记录哪些指令真正生效。**已接受的残余风险：** 被攻陷的插件可以支配该人类用户的
  数据，因为服务以 `josh` 运行；补偿控制是准入审查、升级时重新准入、审批以及更小的固定攻击面。
  触发完整 L0（专用用户/容器 + 拒绝列表）的**升级条件**：出现第二个用户、不可信插件、远程访问，
  或真实事件。永久更新的文档：`personal-agent-security.md` §4/§7/§8、`AGENTS.md` 硬性规则 +
  阶段计划 + 验收测试，以及上面的 M0 清单。

- **D14（2026-11-10，人工决策 —— 仅成熟插件准入）：** 插件选择改为**成熟度优先**。
  对每个候选实测（npm 月下载量 + GitHub stars + 许可证 + 维护者 + 声明的 DSH 兼容性）：
  只有 `@deepseek-ai/dsh-experimental-session-search`（官方）、`@vectorize-io/hindsight-coding-agents`
  （厂商，60k★/116k 月下载）和 `@xmanrui/dsh-im`（3.4k★/128k 月下载，但**未声明 0.2.2-rc.1**）
  过线。`dsh-switchboard`（1★，仓库无许可证文件）、`dsh-plugin-heartbeat`（3★）、
  `dsh-automations`（0★/778 月下载）、`dsh-push-notify`（2★）、`dsh-soul-md`（39★ 单人维护）、
  `dsh-skill-doctor`（1★）、`dsh-session-autarchive`（0★）、`dsh-period-report`/`dsh-weekly-report`（0–2★）
  **被拒绝，或由我们自己的少量代码取代**。后果：第三方面收缩到
  2–3 个包；身份/推送/心跳/自动化变成约 80–250 行我们自维护的胶水代码；渠道只有在
  0.2.2-rc.1 试验通过时才落到 `dsh-im`（否则我们自建最小 Telegram 桥，而不是采用 1★ 插件）。
  完整矩阵：[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) §0。

## 下一条线 —— UI / UX（2026-11-11 启动）

后端已经建成（M0–M2）。人类开了一条专门的 **UI/UX 与前端方向**：在 DSH 的客户端插件 seam 上设计
助手自己的面板与组件层。给新会话的自足交接是 [`ui-handover.md`](ui-handover.md)（背景、已验证的
seam、产品诉求、护栏、第一个切片 = 只读的 Status/Health，之后是 Memory 浏览器）。渠道继续搁置。

**设计阶段（2026-11-11）：** 简报已批准 —— 混合方向（A 的仪表盘骨架 + B 的人话语气 + C 的
设置质感），一个 `Assistant` 面板含 Status/Memory/Activity 三个标签页，第一个切片是只读
Status/Health，覆盖 1440 与 390 两种宽度、两套配色。[`ui-design-brief.md`](ui-design-brief.md)，
由 [`ui-primitives-slots.md`](ui-primitives-slots.md)（slot/primitive/路由配方；`ui-primitives` 是
运行时注入的，不是已安装的包）与 `ui-data-inventory.md`（15 个数据源、
22 处交接更正、路由形态/TTL）支撑。

**切片 1 已在编码主机上构建并验证（2026-11-11）：** `plugins/dsh-status`（`@local/dsh-status`，
零构建）—— host 半边 `GET /api/dsh-status/status`（14 个数据源、按段的 TTL + single-flight 缓存、
白名单化的脱敏信封、永不抛错；15/15 测试）+ 客户端半边（Assistant 侧边栏入口 → 键控的
`main` 面板：生命体征、导语、记忆/任务/安全/告警/出站/成本/身份各段、按数据源的新鲜度、
按可见性触发并带退避的刷新、仅用 token 的样式、`en`+`zh`）。已装到编码 profile
（`dsh-web.service`，:7000）并热启用，无需重启；`scripts/verify-dsh-status-ui.mjs` 通过
16/16 项检查、控制台零报错，截图在 `artifacts/ui/status-*`。**尚未装到 `personal`** ——
需要人工批准 + 一次重启。回滚（编码主机）：在 Plugins 中禁用组合包条目
`include:dsh-status`（或移除该依赖），然后重启。

## 面向 agent 的打包（2026-11-11）

仓库现在可以被**别人的 DSH agent 直接使用**：`agents/README.md`（能得到什么、前置条件、
基本规则）、`agents/PROMPT.md`（带占位符、可复制粘贴的任务简报）、`agents/GUIDE.md`（通用、
逐阶段的构建指南，路径参数化）以及 `agents/checklists.md`（阶段门禁）。`AGENTS.md`
把外部 agent 引到那里；README 在开头就说明了这一点。仓库描述现在改为长期有效（不含进度
状态），并加了 topics。

## 待人工确认的问题

1. **渠道决策（未定）：** 真实 Telegram 冒烟测试需要一个 BotFather token + 你的 Telegram 用户 id
   （DM 白名单）。有了它我才能测 dsh-im 的投递/审批；如果上游 #547 复现，我就自建最小
   Telegram 桥。没有 token，渠道保持 HOLD，agent 只能通过 Web UI 使用。
2. **M1 自研代码的顺序：** 身份加载器（约 80 行）→ ntfy 推送壳（约 60 行）→ 心跳循环
   （约 100 行）。请确认顺序或调整优先级。
2. **摘要投递：** 目前是本地 0600 文件（`~/.dsh-personal/telemetry/digest-YYYY-MM-DD.md`），
   通过单元测试 / 定时器读取；手机推送或会话内投递随 M1 一起做（`dsh-push-notify` /
   `dsh-switchboard`）。请确认 v1 可以这样。

## 工作日志

- 2026-11-10 —— M0 勘察完成（只读）；做出决策 M0-D1…D4 并修订过一次；**D13 务实基线永久采纳**；
  文档已更新（`personal-agent-security.md`、`AGENTS.md`、本文件）。
  仓库交付物进行中：备份/恢复、遥测日志汇、出站观测/告警。尚无主机变更。
- **2026-11-10 15:47–16:10 AEST —— M0 第 1 个工作块已施加（主机变更，人工批准）：**
  - 安装 systemd 用户单元加固 drop-in 配置片段（journald 日志汇 + `NoNewPrivileges`、`ProtectSystem=strict`、
    `ProtectHome=read-only` + `ReadWritePaths`、`PrivateTmp`、`RestrictAddressFamilies`、
    `RestrictSUIDSGID`、`LockPersonality`、`SystemCallFilter=@system-service`）；探测 + 回读显示所有
    指令均已生效；暴露面 **9.8 → 7.0 MEDIUM**；启动/401/模型列表已验证。单元重启了
    两次（15:47、15:50），外加 15:53 最后一次 reload；当前 `MainPID` 在 `:7002` 上活跃。
  - 遥测出站 patch 已施加到个人 profile（保留备份 `…bak-m0-20261110-154703`）。
  - 已创建 `dsh-personal` Hindsight 记忆库（0 条事实，导出 200）；Hermes 记忆库计数不变。
  - 首次备份 `/home/josh/backups/dsh-personal/daily/20261110T060955Z`（Hindsight 已 `exported`），
    恢复演练 **PASS 20/20** 到临时 `:7009`；线上 `:7002` 未受影响。
  - 线上 `check-alerts.sh`：无告警（1 条警告：24 小时内 3 次单元启动；2 项跳过：出站观测未安装、
    无成本文件）。密钥扫描：`~/dsh/logs/*.log` 中 35 行旧 URL token（已打码）；新的单元日志
    只写 journal。
  - 回滚：drop-in `rm …/10-hardening.conf` + reload/restart；patch 用 `cp` 把 `.bak` 拷回 + 重启；
    记忆库 `curl -X DELETE …/banks/dsh-personal`（仅限空库）。

- **2026-11-10 16:59–17:07 AEST —— M0 第 2 个工作块已施加（主机变更，块中途审批策略改为“从不询问”；
  所有步骤都记录了回滚）：**
  - 出站观测已施加（`table inet dsh_egress`、限定 cgroup 跳转、策略 accept）；用一条带 cgroup
    归属的连接验证（计数器 1 个包、`DSH-EGRESS … DST=3.173.21.63:443`、`seen_v4` 元素）；
    重启导致的陈旧问题复现，并用 `apply --if-stale` + root 保活定时器（5 分钟）修复。
  - journald 保留 drop-in（`SystemMaxUse=2G`、30 天、单文件 256 MB）；占用 2.4 GB → 1.8 GB。
  - 新增 token/成本计量（`scripts/telemetry/token-cost.sh` → 成本文件契约，今日 8,978 tokens，
    30 天历史）；接入摘要的 `check-alerts --cost-file`。
  - 摘要用户定时器 `dsh-telemetry-digest.timer` 已在 07:00 启用（oneshot 已测，0600 脱敏摘要）。
  - 日志清理：`~/dsh/logs` 0700 / `*.log` 0600；临时目录已删除；`/tmp` 干净。
  - **M0 出口门禁已满足。** 已记录残余：同 UID 密钥暴露（D13）、当前进程启动 token 留在
    本地用户日志（已接受）、出站观测依赖保活定时器（已安装）、成本尖峰基线需 3 天建成、
    摘要在 M1 推送前只是本地文件。

- **2026-11-10 17:28–17:52 AEST —— 工具块，仅仓库变更（无主机变更，未执行重启）：**
  - `scripts/ops/dsh-restart.sh` —— 重启 DSH 的 `--user` 单元；把任务以瞬态单元交给 systemd
    （`systemd-run --user --collect`），这正是它能从目标单元内部（agent bash / Web UI 终端）
    安全运行的原因。Dry-run + 交接机制已验证（`/bin/true` 探测，已 collect）。
  - `scripts/ops/dsh-pending.py` —— 把已保存的组合包选择与运行中 Host 的实时客户端
    图做 diff（从单元日志汇/journal 读取该进程自己的启动 token，用它换取只读的 loopback
    cookie；token 从不打印）。有未生效项时退出码为 1。
  - 发现（已验证）：`dsh-web.service` 从 **11-07 17:26** 起一直运行；`dsh-context@0.83.0`（11-10 17:24
    安装）和 `dsh-guizang-design`（11-10 17:21）已安装且选中，但**未组合** →
    需要重启。11-08/11-09 安装的包都是生效的，所以 HMR 通常能生效；可能的阻塞点是
    17:19 市场取消更新留下的待处理 HMR 状态。`dsh-personal.service` 没有待生效项。
    重启本身**未**执行（主机变更；需要人工 —— 而且它会杀掉正在回答的这一轮）。
  - 参考：`research/dsh-restart-runbook.md`；AGENTS.md 的环境事实已更新。回滚：删除这
    三个文件（未触碰任何主机状态）。

- **2026-11-10 18:33–now —— M0.5 准入开始（D14 仅成熟插件）：**
  - 为所有候选清单中的插件实测成熟度（npm registry/下载 API + GitHub API）；记录在
    候选清单 §0 和上面的 D14 中；渠道决策 = 用 `@xmanrui/dsh-im` 而非 1★ 的 switchboard。
  - 三条并行的准入线：静态扫描（`research/admission-scans.md`）、针对
    Hindsight + 官方 session-search 的探查试验（`research/admission-trials.md`），以及起门禁作用的 dsh-im
    兼容性试验（`research/admission-dsh-im.md`）。
  - 没有把任何插件装进 `personal`；探查工作只使用 `~/.dsh` 的 profile/端口。

- **2026-11-10 18:33–18:50 AEST —— Host-control 面板已构建并装到编码主机（主机变更：
  通过 `plugin_manager` 做 profile 安装，人工要求；未执行重启）：**
  - 新的本地组合包 `plugins/dsh-host-control/`（零构建，镜像 `dsh-profiles`）：Host 半边在带认证的
    `/api` 通道上注册 `GET /api/host-control/status` + `POST /api/host-control/restart`
    （`ctx.connection.fetch`）；客户端半边新增 Settings → **Host control**，含单元信息、
    实时待生效插件清单（已保存的 `dsh.profile.bundles` vs `ctx.clientModules.clientPath()`）以及一个带确认的
    重启按钮。重启 = `systemd-run --user --collect … systemctl --user restart <own unit>`；单元
    取自 `/proc/self/cgroup`，绝不来自请求，且不注册任何面向模型的工具。
  - 在临时 home（`/tmp`）里以独立瞬态单元运行验证过：状态 JSON、客户端组合包在
    图中、方法守卫 404、重启 → 约 2 s 内出现新 MainPID、重启前的 cookie 之后仍有效、
    无重复路由错误、单元日志中有审计行。Playwright UI 运行通过全部六项检查
    （`scripts/verify-host-control-ui.mjs`；`artifacts/scratch-*.png`）。线上主机未受影响。
  - 已装进编码 profile（`application: restart-required`，原因 `package-moved`），所以
    按钮需要一次引导重启；重启之后那两个待生效插件（`dsh-context`、
    `dsh-guizang-design`）也会加载。`dsh-pending.py` 现在报告这三项。
  - **未装进 `personal`**（AGENTS.md：需要人工批准）；只差一次 `install_bundle` 调用。
    回滚：`remove_bundle` + 重启；文档 `research/dsh-restart-runbook.md` §6.1。

- **2026-11-10 18:33–19:00 AEST —— M0.5 准入完成（仅仓库 + 探查 profile；`personal` 未动）：**
  - 成熟度门槛 D14 已实测；技术栈重新收缩到仅成熟候选（候选清单 §0、台账）。
  - 静态扫描（`research/admission-scans.md`）：三者完整性 MATCH；快照证据在
    `.cache/admission/`。session-search 干净；Hindsight 干净，但成品里没有许可证 + 云端/动态记忆库
    默认值 + 休眠的 spawn 路径；dsh-im 无外泄/遥测问题，但是 121 个包的依赖树（含可选
    原生模块（sharp/libvips、腾讯 Go CLI））、压缩过的内置 bundle、自更新 RPC、未声明 0.2.2。
  - 试验：session-search **PASS**（`:7012`、3.8 s 启动、401、0 出站、FTS5 打开），Hindsight **PASS**
    （`:7014`、3.7 s 启动、401、0 出站、8 个工具、`dsh-personal` 记忆库未动），dsh-im **安装/组合/启动
    PASS**（`:7013`、4.3 s、客户端模块 200、无 poller），但**兼容性未认证 + 上游 #547 在 0.2.2-rc.1 上的
    Telegram 投递 bug** → HOLD。
  - 记录的关键意外：Hindsight 配置在 **Cordis 之外**（profile 里的 `config:` 块对它无效；改用
    `HINDSIGHT_CONFIG` 0600 + 单元 `Environment=`）；patch 会整体替换该行配置；创建 profile 用
    `dsh --profile X --from-default-profile web --dump-config`。
  - 台账条目已写入 sha512 + 条件 + 回滚。没有安装任何插件；`personal` `:7002` 仍返回 401。

- **2026-11-10 18:55–19:09 AEST —— 通过计划好的瞬态单元执行重启；预检抓到一个坏掉的
  插件（主机变更：`dsh-web.service` 已重启，人工要求）：**
  - 预检在临时 home（`:7013`、独立瞬态单元）里启动了真实的待生效组合：base +
    web-app + `@local/dsh-host-control` + `dsh-context` + `dsh-guizang-design`，线上 `node_modules` 以软链接接入。
    结果：guizang-design 和 host-control ACTIVE + 客户端半边可服务；**`dsh-context@0.83.0` 在 import 时抛错**
    —— `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-session` —— 因为它的 **Host** 半边导入了宿主包，
    而 profile 设置了 `autoInstallPeers: false`（只有 `cosmokit`、`schemastery` 在
    `profiles/web/node_modules/@deepseek-ai/` 下）。重启救不了它；要么移除它，要么安装 peer
    依赖（不受支持的第二份 cordis 副本）。见 `research/dsh-restart-runbook.md` §6。
  - 重启前面板做了改进：已选中但未运行的包现在分成 **pending**（行缺失 ⇒ 重启有用）和
    **Failed to load**（行存在、fiber 缺失或未 ACTIVE ⇒ 重启无用），数据读自
    `ctx.loader.entries()` 的 fiber 状态。在预检主机中验证：`pending: []`、
    `failed: ["dsh-context"]`，外加一次 Playwright 通过（全部六项检查，含失败卡片）。
  - 重启被排成一个瞬态定时器（`systemd-run --user --on-active`，单元 `dsh-bootstrap-restart`），以便
    正在回答的这一轮能先结束；取消用 `systemctl --user stop dsh-bootstrap-restart.timer`。
  - 之后：`dsh-host-control` + `dsh-guizang-design` 加载，`dsh-context` 停在 **Failed to load**。
    回滚：对新组合包 `remove_bundle` + 重启；移除 `dsh-context` 同理。

- **2026-11-10 19:16–19:30 AEST —— M1 开始：安装并接受两个已准入插件（主机变更，人工“推进”）：**
  - 安装前备份 `20261110T091629Z`；把 `@deepseek-ai/dsh-experimental-session-search@0.2.2-rc.1`
    （+39 个包）和 `@vectorize-io/hindsight-coding-agents@0.8.6`（+1 个包）装进 `~/.dsh-personal` 的 profile `personal`。
  - Hindsight 固定在 **Cordis 之外**：`~/.dsh-personal/hindsight/coding-agent.json` 0600（自托管、
    `:9177`、记忆库 `dsh-personal`、dynamicBankId false、autoSeed/autoUpdate/gitIngest 关闭）+ 单元 drop-in
    `20-hindsight.conf`（`HINDSIGHT_CONFIG`），并在运行进程的环境变量中验证过。
  - session-search 覆盖参数：`storages/session-search.db` 0600 + `openAt: startup`；索引在启动时以 FTS5
    schema（user_version 8）打开 → 覆盖参数已生效。
  - 线上主机 19:17 重启：活跃、401、无 error/warn 行；出站观测只看到 `api.deepseek.com`；
    `check-alerts` 无告警；出站数据 FRESH。
  - 通过临时 headless profile 做功能验收（同一 DSH home/插件/配置，测完删除）：
    记忆写入（记忆库 0→4 个节点）、**跨进程重启召回**（`amber-fox-42`）、**会话检索**
    按短语找到了旧会话。记忆库隔离成立（只有 `dsh-personal`；`josh` 的增长是 Hermes 自己在共享
    实例上的写入，不是我们）。
  - 已记录副作用：插件生成的全局技能 `~/.agents/skills/hindsight-coding-agent/SKILL.md`
    （83 KB，sha256 已记录）—— 第三方指令面；升级时重新哈希（M2 告警）。
  - 渠道仍为 HOLD；身份/推送/心跳等自研项尚未开始。详情：
    [`m1-install-verification.md`](m1-install-verification.md)。

- **2026-11-11 07:39–07:55 AEST —— M1 自研代码块在三个构建子代理中途死亡后完成：**
  恢复了它们的半成品插件，修好了心跳日志（ctx.logger 没有 console exporter → 走 stderr）和
  一个测试目录权限 bug，补写了缺失的 README，并独立在临时 profile 里验证了全部内容
  （队友没有装进 `personal`）。
  - SOUL 加载器：8/8 自测，headless 人格验证（“I'm Mochi…”），order 0 处有实时日志行。
  - 推送：惰性=0 次请求；启用=恰好 1 次干净的 POST 打到本地 mock；死端点=该轮不受影响。
  - 心跳：26/26 测试；默认关闭时惰性；启用后启动日志含间隔/免打扰时段；实时提醒仍属 M2。
  - 已安装 `@local/dsh-soul`、`@local/dsh-push`、`@local/dsh-heartbeat` + `~/.dsh-personal/soul/SOUL.md`
    （0600）；安装前新备份 `20261110T214349Z`；07:44 线上重启，401、0 错误、出站只到
    `api.deepseek.com`；所有激活行都在 journal 中。
  - Forget：`scripts/memory/forget.sh`（人工触发、锁定记忆库、`--list/--doc/--match/--clear`）；
    文档删除实测 4→3 docs；**如实记录了限制** —— Hindsight 0.10.3 没有按条删除，
    所以派生观察在文档删除后仍然存在，彻底清除需要清空记忆库。
  - 死掉的子代理留下的进程/临时 profile 已杀掉并清理。

- **2026-11-11 08:17–08:30 AEST —— 公开构建日志已创建：** 仓库
  https://github.com/RegeneratusLabs/dsh-personal-assistant（公开，`main`）。101 个文件 / 1.2 MB：文档、
  我们的插件、运维脚本、CI（心跳测试 + soul 自测 + shell/模块语法 + 形似密钥的
  扫描）。推送前做了净化：第三方记忆库名替换为占位符，凭据事故说明重写为不含任何值，
  `.cache/`、`artifacts/`、`design-systems/` 和 `.tmp-render/` 加入
  gitignore（原始抓取/截图只留本地）。索引中无语密钥（用模式扫描验证过）；
  本地工作区锚定为 git 工作树，`origin` = 新仓库。

- **2026-11-11 08:28–08:45 AEST —— M1 验收缺口已补齐（渠道由人工决定延后）：**
  - 构建了一个可复用的临时 `verify` profile（与 `personal` 相同的固定插件/Hindsight 配置）。
  - **注入语料 4/4 PASS**（普通文件、伪造的系统通知、隐藏 HTML 注释、记忆投毒）：
    没有金丝雀文件、没有工具执行、没有投毒规则被存储，且持久化的审批策略被
    确定性地验证为仍为 `ask`。把该语料加为可重复使用的工具：
    `scripts/security/injection-corpus.sh` + fixtures（最近一次运行：PASS 4/4 + 策略 `ask`）。
  - **召回 token 预算 PASS**：召回增量约 729 字符（约 180 tokens）；记录到 Hindsight 0.8.6 还会
    每个请求固定注入约 2.95k tokens 的 `<hindsight_knowledge>` 块（无可调项；M2 调优）。
  - fail-open、记忆库隔离、出站、恢复演练再次确认；`forget` 仍为 PARTIAL（文档删除
    有效，派生观察会留存；清空记忆库才是彻底清除路径）。
  - Telegram 渠道**由人工决定延后** —— 搁置，本块不做任何工作。
  - 证据：[`m1-acceptance.md`](m1-acceptance.md)。

- **2026-11-11 08:45–08:50 AEST —— M2 开始：记忆卫生 + 保留（主机：一个用户定时器）：**
  - `scripts/memory/curate.sh`：锁定记忆库的每日流程 —— 刷新心智模型、`POST /consolidate`、有界
    等待、只含计数的 JSON 报告（0600）+ Hindsight 7 天 LLM 用量（首次读数：67 次请求 / 335,897
    tokens）。Dry-run + 真实运行均已验证；报告中不含内容。
  - `dsh-memory-curate.timer`（用户单元）已启用，**每日 07:15**；oneshot 测试运行 `Result=success`。
  - `scripts/ops/retention-report.sh`：只读清单（会话/storages/备份/遥测/日志/journal/
    记忆库）+ `--json`；策略记录在 [`m2-retention-policy.md`](m2-retention-policy.md)（保留表、
    Hindsight 清除约定、未决事项）。
  - `daily-digest.sh` 现在会清理自己超过 90 天的 `digest-*.md` / `curate-*.json`（策略中
    遥测保留的实现机制）。
  - 主机变更：增加一个用户定时器 + service（撤销：`systemctl --user disable --now dsh-memory-curate.timer` +
    删除两个单元文件 + `daemon-reload`）。无插件或 profile 变更。

- **2026-11-11 10:31–10:40 AEST —— M2 完成（按人工要求，不做 Telegram 相关工作）：**
  - **心跳实时路径已验证**：新增 `test/live.test.js`（伪造 Cordis 上下文）—— 定时器注册、
    projection 收集、在有可行动的状态变化时恰好一次 `agent.followup()`、状态未变时保持安静、
    agent 缺失时故障被兜住、默认关闭时的结构性惰性。测试套件现为 **30/30**；
    生产环境仍为 **默认 OFF**。
  - **离机加密备份**：`scripts/backup/dsh-offsite-bundle.sh`（gpg AES-256、口令文件
    0600 或接收方公钥、sha256 sidecar、解密验证、删除明文中间文件）。在真实
    备份上测过：9.7 MB 加密，解密列表已验证。落地位置仍需人工决定；流程记录在
    `m2-retention-policy.md` §5。
  - **成本/上下文**：摘要现在会从整理器报告里呈现 Hindsight 7 天 LLM 用量（67 次请求 /
    335,897 tokens），并把每个请求固定约 3k tokens 的记忆提示词开销记为已接受（插件固有，
    M2 备注；若出现可调项或缓存影响变大再复查）。
  - **各交互面自主性策略**：`m2-autonomy-policy.md` —— Web 所有者、心跳（关）、推送（惰性）、
    定时作业、记忆工具，以及未来渠道的落地默认值（DM 白名单、受限工具
    集、需审批的动作、无访客权限）。
  - M2 出口：整理器 + 保留 + 自主性 + 通知策略完成；**渠道延后**、**叙述式摘要
    推迟到 M3**、技能诊断 N/A（D14 拒绝了该插件）。没有新的第三方代码。

- **2026-11-11 12:10 AEST —— UI/UX 方向已交接：** 写了 [`ui-handover.md`](ui-handover.md) ——
  一份给新会话的自足简报（当前技术栈/状态、已验证的客户端插件 seam：`dsh.client`
  组合包、`__ModuleLoader__`、slot `sidebar.panellist`/`main`/`settings.section`、经 `ctx.connection.fetch.register`
  注册的带认证 host 路由、`--dsw-*` 主题 token + `ctx.theme`、重启语义；产品
  面：Status/Health → Memory → Identity/Activity/Approvals/Settings；无障碍与不可信数据
  规则；协作约定，含显式 git 暂存）。仓库已同步并推送；无主机变更。

- **2026-11-11 12:20 AEST —— 为其他用户的 agent 做仓库打包：** 长期有效的 GitHub 描述 + topics
  （`deepseek-harness`、`dsh`、`personal-assistant`、`ai-agent`、`plugins`）；新增 `agents/` 区块
  （README/PROMPT/GUIDE/checklists），让任何人都能把自己的 DSH agent 指向本仓库、构建自己的
  助手；`AGENTS.md` 现在会把外部 agent 引到那里。无主机变更。

- **2026-11-11 12:15–12:55 AEST —— UI/UX 设计阶段：验证 seam、数据清单、设计简报（仅仓库）：**
  - 读了交接与构建文档；抓取了**线上编码主机 shell**（亮/暗/390），用 loopback
    所有者 cookie 交换，导出了真实的 `--dsw-*` token（415 个属性；别名按配色经
    `body` / `body[data-ds-dark-theme]` 解析）。证据在 `artifacts/ui/`（已 gitignore）。
  - 已验证 seam：组合包形态、`__ModuleLoader__`、slot（`sidebar.panellist` 仅图标 `{size,active}`、
    键控的 `main`、`settings.section`）、`/api` 路由契约（`methods`/`requestBody`/`fetch`，handler 自己负责
    状态码）、焦点环、圆角、设置卡片质感。发现 `dsh-client-ui-primitives`/`-slots` 是
    **运行时注入的，不是已安装的包**（无类型；无 Card/List/EmptyState 导出）—— 我们的套件在 token 之上
    自建这些。`host-control` 的状态路由报告的是*正在服务*的 host，所以新路由必须显式固定
    `dsh-personal`。
  - 数据清单：15 个只读数据源，含脱敏后的实时 schema（systemd 单元/定时器、check-alerts、出站、
    保留、Hindsight 健康/统计/用量、遥测 JSON、备份清单、SOUL 元数据）+ 对
    交接的 22 处更正（没有摘要 JSON；备份 glob 写错；session-search 索引为空；Hermes 记忆库经
    `/v1/default/banks` 列出；出站 `table.present:false` 是一个权限事实）。
  - 写了 [`ui-design-brief.md`](ui-design-brief.md)，含三个方向（A 仪表盘 / B 笔记本 / C 极简），
    并用真实 token 值渲染了亮+暗+390 的草图（`.tmp/mockups/`，已 gitignore；PNG 在
    `artifacts/ui/`）。推荐混合：A 的骨架 + B 的语气 + C 的设置质感。
  - 第一个切片已划定：新的 `plugins/dsh-status`（`@local/dsh-status`）→ 一个固定的
    `GET /api/dsh-status/status`、single-flight TTL 缓存、按段降级；客户端面板含一次
    按可见性触发的 60 s 刷新、loading/empty/error 状态、仅用 token、`en`+`zh`。无写入面。
  - **没有 UI 代码、没有主机变更、没有安装**：等待人工的方向 + 切片决定；首次
    装到编码主机需要重启一次 `dsh-web.service`（届时会先询问）。

- **2026-11-11 13:00–14:15 AEST —— UI 切片 1 已构建：Status/Health 面板在编码主机上线：**
  - 方向由人工选定：混合（A 的仪表盘布局、B 的平实句子语气、C 用于后续 Settings 面的设置
    质感）。简报已按该决定更新，并加了一张混合参考渲染图。
  - 新组合包 `plugins/dsh-status`（`@local/dsh-status`，零构建）：host 半边经
    `ctx.connection.fetch.register` 注册一个固定的 `GET /api/dsh-status/status` —— 14 个只读数据源
    （systemd 单元 + 定时器、插件计数、Hindsight 健康/统计/7 天用量、告警、出站、成本、整理器、
    备份清单、保留、SOUL 元数据）、按段 TTL（5 s–300 s）+ single-flight 缓存、陈旧
    回退、仅 `?fresh=1` 可绕过缓存、白名单/脱敏输出（`~` 路径、打码 token、不含
    hostname/owner/cgroup/sha256）、永不抛错。15/15 个 `node:test` 用例。
  - 客户端半边：侧边栏入口 `Assistant`（id/key 均为 `assistant`）→ `main` 面板，含生命体征条、导语
    句，以及记忆 / 定时作业 / 安全与保留 / 需关注 / 出站 / token-成本 /
    身份各段；按段降级、一次按可见性触发的 60 s 刷新带退避 + 手动
    刷新、相对时间戳每 15 s 跳动、仅用 token 的样式（零字面颜色值）、`en`+`zh`。
  - 经 `plugin_manager` 装进编码 profile（依赖 + 组合包条目）；首次激活
    因缺少 `inject` 导出而失败（被 host 的诊断抓到），修好后经
    插件管理器重新启用 —— 热生效，**无需重启**。验证脚本 `scripts/verify-dsh-status-ui.mjs`：
    16/16 项检查、0 控制台错误、亮/暗/390 截图在 `artifacts/ui/status-*`。
  - CI 增加一个 `status panel host tests` 步骤。Home 半边未装到 `personal`（需批准）。

- **2026-11-11 14:30–14:50 AEST —— 切片 1 无障碍打磨（仓库 + 编码主机预览）：**
  - AA 对比度检查：亮色模式下主题的 `caption`（#adb2b8，2.1:1）和 `tertiary`（#81858c，3.7:1）
    token 在小字号下不达 AA，状态底色上的彩色 chip 文字也不达标（1.99–3.68:1）。把所有
    小标签/提示移到 `label-secondary`（亮色 5.8:1、暗色 12.1:1），并把 chip 改成带
    **主文字色 + 彩色圆点**的着色表面（17.5:1），让颜色不再独自承载信息。
  - 补上缺失的 `role="main"` 地标（shell 自己不渲染），加 `aria-label`，保留 shell 的 2px
    焦点环（已验证：Tab 到 Refresh 按钮后为 `outline: auto 2px #4176e6`）、`(pointer: coarse)` 下
    44px 触摸目标，以及带主文字色的着色警告条。
  - 新增 `scripts/verify-dsh-status-a11y.mjs`：单个 h1 + 7 个 h2、main 地标、live region、17
    种渲染文字样式的 AA 对比度、键盘焦点可达（60 次 tab）、720 CSS px 下 200% 缩放（无溢出）、
    减少动效（无过渡）、粗指针 44px 目标 —— **全部通过，0 控制台错误**。UI 验证仍为 16/16。
  - 仍未完成：真实读屏软件检查（NVDA/Orca/VoiceOver）与人工视觉评审；部署到
    `personal` 仍需人工放行 + 一次重启。

- **2026-11-11 15:10–15:55 AEST —— UI 切片 1 部署到个人主机（主机变更，人工批准）：**
  - 安装前备份 `daily/20261111T051012Z`（9.8 MB，sha256 已记录，Hindsight `dsh-personal` 已导出，
    密钥检查 PASS）。安装：`DSH_HOME=~/.dsh-personal dsh plugin --profile personal add plugins/dsh-status`
    —— 安装器添加了依赖**并**把 `@local/dsh-status` 追加到 `dsh.profile.bundles`
    （没有手写行）。重启 `dsh-personal.service` 一次（新 PID、活跃、401 服务、0 次重启）。
  - 在 `:7002` / tailnet `:8454` 上实测：`GET /api/dsh-status/status` → 200 `ok:true`，
    `serving.unit = dsh-personal.service`；UI 验证 **16/16**、无障碍验证 **10/10**、控制台
    零错误；截图 `artifacts/ui/status-personal-*`。该路由读取助手自己的单元/home/记忆库
    （备份年龄现在反映安装前那次备份）。
  - 之后**移除了编码主机上的预览**（禁用组合包条目 + `dsh plugin --profile web remove`）；
    `:7000` profile 回到切片之前的选择。`personal` 的回滚：移除依赖 + 组合包
    条目并重启；或恢复备份 `20261111T051012Z`。
  - 验证脚本现在接受 `--unit/--port/--authority/--base`（个人单元的 cookie 限定在其
    `--public-url` authority 上）；token 选择优先取目标单元的 journal（web.log 里的 token 在 :7002 上会 401）。

- **2026-11-11 16:00–16:30 AEST —— 内容插件从编码主机迁到 `personal`（人工指示）：**
  - **先审查**（此前没有台账条目）：`dsh-guizang-design@0.1.4`（AGPL-3.0、779★、依赖
    playwright/puppeteer-core/subset-font、0 个安装脚本）和 `dsh-media-desk@2.6.2`（MIT、1023★、零
    运行时依赖、0 个安装脚本）。完整性取自 registry；每次安装的静态扫描记录在
    [`plugin-ledger.md`](plugin-ledger.zh.md)。
  - **安全发现：** guizang 自定义的 `/guizang-design` web 路由**没有所有者认证** —— 画廊、
    示例、缩略图和私有设计作品在 `:7000` 与 tailnet 上都以 200 应答未认证请求，而且它的 POST 路由
    只在存在 `Origin` 时才检查（于是非浏览器客户端可绕过）。已在本地用
    `scripts/ops/patch-guizang-auth.sh` 修复（调用 `ctx.connection.requestRejection`，故障时关闭）；
    任何重装/升级都要重新施加。Media desk 本身门禁正确（未认证 401 / 带 cookie 200）。
  - **数据在安装前迁移：** `~/.dsh/guizang-design/`（library.json、voice.md、thumbs）加两个
    被引用的作品 → `~/.dsh-personal/guizang-design/works/<id>/`，库根路径改写为个人
    home；`~/.dsh/media-desk/`（state.json、settings.json、files/）→ `~/.dsh-personal/media-desk/`。编码主机的
    副本留作备份。
  - **安装：** 固定确切版本（`dsh-guizang-design@0.1.4`、`dsh-media-desk@2.6.2`），在备份
    `daily/20261111T060926Z` 之后；安装器添加了两个组合包条目。重启 `dsh-personal.service` 一次（新 PID、
    活跃、401）。验证：两个侧边栏入口都渲染；guizang 显示 **2 个作品** + 语音 profile 就绪，media
    desk 加载了迁移后的状态；guizang 路由未认证 401（patch）/ 带所有者 cookie 200；media
    desk 401/200；启动日志干净；出站不变（只有 `api.deepseek.com`）；告警不变（2 条原有
    警告，单元重启计数因今天的安装现为 5 次/24 h）。
  - **编码主机已清理：** 两个组合包条目都已热禁用，并对两个依赖执行
    `dsh plugin --profile web remove`；profile 回到 9 个依赖 / 17 个组合包。数据目录留作备份；无需重启 `dsh-web`
    （fiber 已热禁用，下次启动不再组合它们）。

- **2026-11-11 17:35–17:55 AEST —— `personal` 上的 PWA 自动登录已修复（主机变更：代理单元 drop-in + 脚本）：**
  - **现象：** 今天 `dsh-personal` 重启后，个人 PWA 显示 `dsh-pwa-autologin-proxy: re-auth failed: token exchange returned no
    auth cookie (status 401) for homelab.taildace6c.ts.net:8454`。
  - **根因：** `dsh-pwa-autologin-personal.service` 配置的是
    `DSH_WEB_LOG=~/dsh/logs/personal.log`，但 M0 加固 drop-in 把个人单元的 stdout 送到
    **journald**；该文件自 2026-11-10 起就是陈旧的，所以每次重启后的重新换取都用了一个死
    token 并拿到 401。代理本身没问题（编码那条仍写 `web.log`，一直正常）。
  - **修复：** 代理现在通过 `journalctl --user -u <unit>` 从 `DSH_WEB_JOURNAL_UNIT` 读取启动
    token（先 journal，日志文件作回退，10 s token 缓存）—— `scripts/dsh-pwa-autologin-proxy.mjs`。新的单元
    drop-in `~/.config/systemd/user/dsh-pwa-autologin-personal.service.d/10-token-source.conf` 设置
    `DSH_WEB_JOURNAL_UNIT=dsh-personal.service`；代理已重启（不是 DSH 主机）。
  - **验证：** `scripts/verify-autologin-proxy.sh`（已改为从 journal 读取个人 token）
    两条入口都通过 —— 注入路径 + 用自有 cookie POST `session/list`（personal 8 个会话、coding 306 个）；
    tailnet 根路径与 `/api/dsh-status/status` 经代理返回 200；直连 loopback `:7002` 仍为 401。
  - **回滚：** 删除 drop-in + `systemctl --user daemon-reload && systemctl --user restart
    dsh-pwa-autologin-personal.service`（回到陈旧的日志文件行为）；脚本改动在 git 里。

- **2026-11-12 —— 部署人格成为提示词开头；Hindsight 召回加上上限（人工指示）：**
  - **提示词栈：** `personal` 上的 profile patch 设置 `system-prompt: {includeHarnessIdentity: false,
    personaPrefix: ''}`，并用随 0.2.2-rc.1 发布的插件列表覆盖 `preset-standard`，去掉其中仅作用域的
    `persona` 行，于是已安装的部署人格成为系统提示词的第一段（那一行曾遮蔽所有 web 会话的
    全局前缀）。在实时会话上验证：重启 PID 1613944 →
    1648385、启动干净、存储的系统提示词 9,391 字符，以 `# Identity` 开头、编码 agent 与
    harness 身份那两行 0 命中、6 s 内回复。宿主特有的片段故意不
    提交；上面两行即可复现的形式。回滚：恢复 profile 备份并重启。
  - **记忆：** 那个 17.7 KB 的未合成首次提示词转储是降级回退，不是插件 bug ——
    Hindsight 的合成返回 500 `402 Insufficient Balance`（诊断 `reflect_failed`，耗时 19,043 ms，随后
    页面检索 → 22 条原始观察）。客户端配置（`~/.dsh-personal/hindsight/coding-agent.json`）现已改为
    `autoInject: recall`、`injectTimeoutMs: 3000`、`recallOptions.max_tokens: 800`：`inject_recall` 1,222 ms、
    8 条观察、注入 12,801 字符、无 `reflect_failed`。上游 402 在 Hermes 一侧，未作改动。
    文档：[`persona-and-memory-tuning.md`](persona-and-memory-tuning.md)。
  - **隐私说明：** 本仓库提供的是通用起步版 `soul/SOUL.md`；线上部署实际使用的人格
    及其提示词文本属于私有内容，刻意不在本仓库镜像。

- **2026-11-12 —— 公开仓库已净化（人工指示）：**
  - **要求（人工）：** 跨项目的主题/logo 实验和个人人格文本不得出现在
    公开仓库中；线上的主题/logo 也要回退。
  - **仓库：** 从公开历史中移除主题/logo 实验（组合包、生成的 token/资源、验证工具、文档）和
    人格迁移相关提交；恢复通用起步版 `soul/SOUL.md`；把人格/提示词栈文档改为通用表述
    （不含人格文本、姓名、会话 id 或宿主特有片段）；保留
    合理的记忆召回调优记录和 Assistant 面板下线记录。历史已重写并
    强推（force-push）到 `main`；仓库仍为公开。
  - **线上主机：** 从 `personal` profile 卸载实验性主题/logo 组合包，重启一次；
    恢复 DSH 原厂配色与品牌。私有部署人格仍保持安装、未改动。
  - **回滚：** 重写前的完整历史包在 `.tmp/history-backup/`（已 gitignore）；若今后想私下再做该实验，
    可从本地已 gitignore 的归档重新安装。

- **2026-11-12 —— Assistant 面板下线并移除（人工指示）：**
  - **要求（人工）：** “The assistant plugin and feature is not required — disable and remove”（个人
    profile）。目标已确认：`@local/dsh-status`、侧边栏入口 **Assistant** 及其 Status/Health 页面。
  - **主机变更（一次重启）：** 从 `personal` profile 卸载该包
    （`DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove @local/dsh-status`；依赖 + 组合包条目
    消失，`node_modules/@local/dsh-status` 软链接移除），此前已备份 profile 配置
    （`package.json.bak-status-removal-20261112-174555`、`cordis.patch.yml.bak-status-removal-20261112-174555`）。
    `scripts/ops/dsh-restart.sh dsh-personal.service`：PID 1648385 → 1736271、活跃、journal 干净（只有 soul、
    push、heartbeat、模型列表），没有 `dsh-status` 行。`dsh-pending.py`：两台主机都没有待生效项。
  - **实测验证：** loopback `:7002` 401（认证完好）；带认证的 tailnet 探测显示侧边栏只有
    Plugins / Media Desk / Profiles / Guizang Design / Automation tasks —— **没有 Assistant 入口**（桌面
    1440 与移动 390）；`GET /api/dsh-status/status` → **404**；除探测自身的
    404 外无控制台/页面错误。截图在 `/tmp/assistant-removed/`（本地证据，未提交）。
  - **仓库清理：** 删除 `plugins/dsh-status/`（代码、测试、README）、`scripts/verify-dsh-status-ui.mjs`、
    `scripts/verify-dsh-status-a11y.mjs`、CI 的 “status panel host tests” 步骤，以及 `research/ui-data-inventory.md`
    （与面板 1:1 对应）。`ui-design-brief.md` 和 `ui-handover.md` 作为 UI 方向的设计记录保留，
    并写下线说明；`AGENTS.md`、`research/README.md` 和上面的状态表已更新。
  - **回滚：** 恢复两个 profile 备份 + 对移除提交执行 `git revert`，重装该组合包并
    重启 `dsh-personal.service`（一次重启）。

- **2026-11-12 —— 双语文档，中文作为可选语言提供（人工指示）：**
  - **要求（人工）：** 仓库的中文翻译，作为语言选项提供给用户。
  - **约定：** 英文 `*.md` 仍是权威来源；每个被翻译的页面配一个 `*.zh.md` 兄弟文件，
    标题下加语言切换行（`English | [中文](…)` / `[English](…) | 中文`），沿用 DSH 自己 README 的
    约定。政策：`docs/i18n.md`；术语：`docs/i18n-glossary.md`。
  - **已翻译（14 页）：** README、AGENTS、BUILD-LOG、SECURITY、docs/i18n、`agents/{README, PROMPT, GUIDE,
    checklists}`、`research/{README, build-progress, personal-agent-design, personal-agent-security,
    plugin-ledger}`。代码、注释、配置和其余深度研究笔记保持英文（覆盖表
    见 `docs/i18n.md`）。
  - **漂移控制：** `.i18n.json` 保存按段的英文/中文哈希；`scripts/docs/i18n-check.mjs` 检查
    结构、逐字节一致的代码块、相对链接和已记录的哈希；CI 在每次 push/PR 时运行。
    流程：改英文 → 在中文里镜像 → `node scripts/docs/i18n-check.mjs --write`。
  - **下一步：** 其余 `research/` 笔记可在后续工作块中机械翻译。

- **2026-11-12 19:40 —— DSH rc.2 预检（隔离进行，未改动线上）：** 把
  `@deepseek-ai/dsh@0.2.2-rc.2` 装到 `/tmp/dsh-rc2-preflight/runtime`，并在备用端口上启动了两个真实 profile 的
  副本。两者的 `--dump-config` 都干净；组合树新增 `mcp-manager`、`agent-team`、
  `tool-agent-team`、`ui-agent-team`；两台主机 7 s 内应答 401，无 error 行。旧的
  `dsh-experimental-agent-team-profile` 组合包没有 rc.2 版本，无法解析 —— rc.2 核心取代了它，
  因此移除该行。个人 profile 的 `preset-standard` 覆盖已按随 rc.2 发布的预设重新生成，
  去掉 `persona`（新增 `tool-office`、`skill-filesystem.customSkillDirs`、`tool-subagent-control.interrupt:false`）。
  脚本：[`scripts/ops/update-rc2-profiles.mjs`](../scripts/ops/update-rc2-profiles.mjs)、
  [`scripts/ops/dsh-upgrade-rc2.sh`](../scripts/ops/dsh-upgrade-rc2.sh)；运行手册与回滚：
  [`rc2-upgrade.md`](rc2-upgrade.md)。经瞬态用户单元 dry-run 通过。**下一步：** 执行分离的
  线上升级（编码主机重启会断开这个 Web 会话），然后是升级后的重新准入清单。

- **2026-11-12 19:50 —— DSH 0.2.2-rc.2 在两台主机上线（升级块完成）：**
  `npm i -g @deepseek-ai/dsh@0.2.2-rc.2`；profile 由
  [`update-rc2-profiles.mjs`](../scripts/ops/update-rc2-profiles.mjs) 更新（移除 agent-team 组合包条目 —— rc.2
  把 Agent Teams 移入核心；个人 profile 的 `preset-standard` 按随 rc.2 发布的预置重新生成；session-search
  固定到 rc.2；失效的 web 条目已移除）。Personal 5 s 内 401、web 7 s 内 401、`dsh-pending` 干净、79/90 个客户端
  模块。Hindsight（0600 配置、记忆库 `dsh-personal`、API 200）、session-search 数据库、guizang/media-desk 认证
  门禁、profile、soul 加载器全部复验；仓库测试通过。首次线上尝试因瞬态 404 就绪误判而干净回滚；
  重试记录在 [`rc2-upgrade.md`](rc2-upgrade.md)。
  **下一步：** 会话级的 SOUL/Hindsight 验收、通过 `mcp-manager` 接第一个 MCP connector，以及
  `@local/dsh-capabilities` 侧边栏页面。

- **2026-11-12 20:00 —— Capabilities 页面 + 第一个 connector 面在 personal 上线：** 构建了
  [`@local/dsh-capabilities`](../plugins/dsh-capabilities/)（host 路由 + 侧边栏页面：Connectors 来自
  `ctx.mcpManager`、Plugins 来自 `ctx.pluginManager`；connector 探测/重启；插件只读）。通过 rc.2 的
  `mcp-manager` 条目加入了一个无依赖的本地 stdio MCP 测试件（[`mcp-ping-server.mjs`](../scripts/fixtures/mcp-ping-server.mjs)）。
  线上检查：`/api/capabilities` 200（所有者）/ 401（未认证）、connector
  `ping` 状态 `connected`、列出 31 个插件组合包、页面在 Playwright 里以 1440 和 390 px 渲染且 0 个
  控制台错误；personal 80 个在线客户端模块、`dsh-pending` 干净。决策记录与西方服务覆盖 /
  Composio 触发条件：[`connectors-options.md`](connectors-options.md)。**下一步：** 第一个真实西方
  connector 需要 token（先 GitHub PAT），然后做 OAuth 探测（Gmail/Calendar）以决定 Composio
  触发条件。

- **2026-11-13 14:45 —— Hindsight 个人助理记忆层（客户端换型）：** 在一个非编码会话里实测了编码代理插件的每步注入
  （12,066 字符 ≈ 3,175 token，其中约 75% 是工具手册），并替换了客户端：构建
  [`@local/dsh-memory-personal`](../plugins/dsh-memory-personal/)——把有上限的策展档案（2,200/4,000 字符，
  `$DSH_HOME/memory/profile.json`）作为单个静态提示段注入，另加 `memory_remember` / `memory_recall` /
  `memory_forget` 三个走 Hindsight REST API 的工具（schema 共 459 token）。隔离 profile 测试：写入偏好
  → 5 步 / 51 秒 / 70,850 token；下一个会话直接由提示块回答，**1 步、5.5 秒、12,150 token、0 次工具调用**；
  retain 已在 `dsh-personal` 库中验证（158 → 160 节点，打 `user` 标签）。线上主机未改动——安装是单独的
  审批步骤（加组合包、禁用 `hindsight` 条目、重启、重跑两项测试）。设计、实测、被否方案与回滚：
  [`memory-personal-agent.md`](memory-personal-agent.md)。**下一步：** 审批并安装到 `personal`，再决定编码代理
  插件是否以 `autoInject: "none"` 保留。
