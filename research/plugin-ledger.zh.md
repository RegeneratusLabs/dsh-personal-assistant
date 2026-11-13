# 插件台账

[English](plugin-ledger.md) | 中文

每次插件安装/升级都要经过本文件。**没有条目 = 未获批准。** 构建 agent 在把任何东西装进 `personal` 之前先追加
条目，并在每次升级时重新审计。清单：
[`personal-agent-security.md`](personal-agent-security.zh.md) §4–§5。

字段：tarball 的 **sha512**（`npm view <pkg>@<ver> dist.integrity`）、**scan** 结果
（安装脚本 / 原生模块 / 子进程 / 网络域名 / 凭据）、**trial** = 临时 profile 中的结果、
**verdict**（结论）、**rollback**（回滚）命令。

## 已安装到 `personal` —— 2026-11-10 M1（人工签核“推进”）

| 包 | 版本 | sha512 | 扫描 | 试验 | 结论 | 日期 | 回滚 |
|---|---|---|---|---|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | **0.2.2-rc.1**（确切版本；npm 的 `latest` 是错的构建） | `sha512-FroSkf06spXdPqGTAhMQRolD41QcQLyT7XFHHiawWByUmm7/AF6OPu1LUDVpKJ0ugVVmfGik3a3rhI6QT/4qFQ==` | 第一方 MIT；0 处脚本/原生模块/子进程/eval/网络/环境变量；tarball 只是对 2 个随宿主发布的第一方依赖的薄封装；5 个只读工具（全局工具层） | **PASS** scout-search `:7012`：组合/启动干净 3.8 s、`/` 401、0 个非 UNIX `connect()`、FTS5 索引按 `openAt` 打开 | **ADOPT** —— M1 条件：显式 `path` + `openAt`（patch 会整体替换该行配置 —— 两者都要重新写出）；M1 中要有真实的 `session_search` 验收测试 | 2026-11-10 | **INSTALLED 19:16** —— 索引 `…/storages/session-search.db` 0600 + `openAt: startup`；功能验证：`session_search` 按短语找到了旧会话。回滚：`DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @deepseek-ai/dsh-experimental-session-search` + 重启 |
| `@vectorize-io/hindsight-coding-agents` | **0.8.6** | `sha512-3T67fiyZZ56ir6nnHdrESIpuOaepAa4HM3DyXDEnnjVABWyffmpRmc1LHwbCP8BO1QrOFhH+WoAGJnmw0ypcAA==` | 厂商官方（60k★ 仓库）、0 个 npm 依赖、无脚本/原生模块；**成品里没有许可证**（MIT 只是仓库声明）；**默认**指向云端端点 + 按 git 动态生成记忆库；存在休眠的 seed/git/自动更新/守护进程 spawn 位置 | **PASS** scout-mem `:7014`：组合/启动干净 3.7 s、`/` 401、**0 出站**、8 个 `hindsight_*` 工具、`dsh-personal` 记忆库未被触碰（0 条事实）、`~/.hermes` 未被触碰 | **ADOPT-WITH-CONDITIONS**：配置必须放在 Cordis **之外**（`HINDSIGHT_CONFIG` → 0600 文件）：`serverMode:self-hosted`、`apiUrl:http://127.0.0.1:9177`、`bankId:dsh-personal`、`dynamicBankId:false`、`autoInject:reflect`、`autoSeed/autoUpdate/gitIngest` 全关；没有它就不要启动（否则走云端默认值）；验证首次会话 seed + 技能复制 + 记忆库隔离 | 2026-11-10 | **INSTALLED 19:16** —— `HINDSIGHT_CONFIG` 0600 文件 + 单元 drop-in `20-hindsight.conf`；功能验证：写入（记忆库 0→4 个节点）、重启召回（`amber-fox-42`）、记忆库隔离。副作用：全局技能 `~/.agents/skills/hindsight-coding-agent/SKILL.md` sha256 `ea819c1c…3f8d90`（升级时重新哈希）。回滚：移除插件 + drop-in + patch 备份 + 重启 |
| `@xmanrui/dsh-im` | **5.10.0**（HOLD —— 尚未批准） | `sha512-gWM3D3Rq6z3Plh1nFFfrV1FKKGm1OWpjWGSgUZXjqbmt/xQ+AVT/M6YFV3hpnMjXTKxzDvrPUo01Nl1FarDdkQ==` | MIT；tarball 中无安装脚本/原生模块；121 个包，含可选原生模块 `sharp`/libvips（LGPL）+ 腾讯 Go CLI；10 MB 压缩过的内置 bundle，内置 Lark/Baileys；自更新 RPC 受可信宿主门控；无遥测；有凭据库设计；0 个审计漏洞 | **INSTALL/COMPOSE/BOOT PASS** scout-im `:7013`：安装 4.1 s、启动 4.3 s、`/` 401→200、客户端模块 200、无渠道 poller、启动出站只有 `api.deepseek.com`。**未获得 0.2.2-rc.1 的兼容性认证**；上游 **#547 Telegram 最终答复投递在 0.2.2-rc.1 上失效（用 5.10.0 复现）**、#538 投递结果不确定 + 绑定被清除 | **HOLD，等待线上 Telegram 冒烟测试**（token + 白名单 + 审批往返 + 3 轮对话 + 设置保存 + 重启）。若 #547 复现 → 不安装；自建最小桥。若通过，安装范围：仅 Telegram、DM 白名单、不要语音/AI-Office/其他渠道、固定确切版本 | 2026-11-10 | `DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @xmanrui/dsh-im` + 重启 |

## 内容创作类插件迁到 `personal` —— 2026-11-11（人工指示）

应人工要求：把两者连同数据从编码主机搬过来，并从编码 profile 中移除。两者都通过了准入清单，只带
一个条件（guizang 的认证 patch）。数据在个人端安装前已复制到 `~/.dsh-personal/`；编码主机的数据目录
原地保留，作为备份副本。

| 包 | 版本 | sha512 | 扫描 | 试验 | 结论 | 日期 | 回滚 |
|---|---|---|---|---|---|---|---|
| `dsh-guizang-design` | **0.1.4**（确切版本；作者 `op7418`，AGPL-3.0-only，779★/44 forks） | `sha512-f0RyjQ+sr3dw0Drhu1YXXUhx4oLp5m0rlQ1cIgtMXBNrUm4dNCO2NVjNLgHnKp+I0g7wObZ1+gv9Hbg74Z25bg==` | 0 个 install/postinstall 脚本（只有 `test`/`vendor`）；无原生代码；依赖 `playwright`/`puppeteer-core`/`subset-font`，用于本地缩略图渲染（浏览器已在 `~/.cache/ms-playwright` 中；安装时用 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`）；注册 3 个面向模型的工具 + 一个技能提供方；写入 `$DSH_HOME/guizang-design/{library.json,voice.md,thumbs}`，并读取 `$DSH_HOME/sessions` 取语料做语气画像；**不访问凭据、无遥测、`lib/` 内无外部网络**。**发现：它的 `/guizang-design` web 路由没有所有者认证**（GET 画廊/示例/缩略图/私有作品均以 200 应答未认证请求，经 tailnet 亦然；POST 只在存在 Origin 时才检查）—— **已在本地由 `scripts/ops/patch-guizang-auth.sh` 修复**（调用 `ctx.connection.requestRejection`，故障时关闭并返回 403） | `personal` 上的启动 + 面板：iframe 画廊可渲染、**2 个迁移过来的作品**、语气画像就绪；未打 patch 时路由未认证返回 200，打上后 **401**；带所有者 cookie 返回 200；出站不变（只有 `api.deepseek.com`，符合预期） | **ADOPT-WITH-CONDITION** —— 固定 0.1.4，且**任何重装/升级都要重新施加认证 patch**；在备份 `daily/20261111T060926Z` 之后安装 | 2026-11-11 | `DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove dsh-guizang-design` + 重启；数据 `~/.dsh-personal/guizang-design` 保留 |
| `dsh-media-desk` | **2.6.2**（确切版本；作者 `woniuniuniu`，MIT，1023★/102 forks） | `sha512-r+1GPY1CQaG1zd92ayZNZH4Xsfl4l6U0cMhmIlUpqbQXhNNxQtr/1/5XyHDoAdjKclfn+qcB17e7UGpIMWPVZw==` | 0 个 install/postinstall 脚本（只有 `build`/`test`/`prepack`）；**零运行时依赖**；宿主用自带的 **`ctx.connection.requestRejection` 门禁注册 `/media-desk`，故障时关闭并返回 403**（实测未认证 401）；通过宿主（`ctx`）使用 DSH 默认模型 —— 没有自己的密钥；仅当用户配置 `baseUrl`+`apiKey`（两者均为空）时才用可选的外部图像 API；`execFile` 只对来自自身状态的 `savedPath` 调 `xdg-open`（从不使用请求输入）；无遥测；数据在 `$DSH_HOME/media-desk` | `personal` 上的启动 + 面板：迁移后的状态可加载（1 条想法、15 种样式）、模型选择器跟随宿主、`/media-desk/state` 未认证 401 / 已认证 200；出站不变 | **ADOPT**（在备份 `daily/20261111T060926Z` 之后安装） | 2026-11-11 | `DSH_HOME=~/.dsh-personal dsh plugin --profile personal remove dsh-media-desk` + 重启；数据 `~/.dsh-personal/media-desk` 保留 |

编码主机清理：两个条目都通过插件管理器热禁用，依赖用
`dsh plugin --profile web remove` 移除；`~/.dsh/guizang-design`（212 KB）和 `~/.dsh/media-desk`（40 KB）
原样保留作为备份副本。UI 不需要重启 `dsh-web.service`（fiber 已在线上禁用）；
下次启动不再组合它们。

## 因成熟度门槛被拒 —— D14（2026-11-10，人工决策）

规则：只用成熟插件；核心交互面上不接受 0–3★ 的个人单作者包。实测数据见
[`personal-agent-plugin-shortlist.md`](personal-agent-plugin-shortlist.md) §0。

| 包 | 版本 | 拒绝 / 取代原因 | 替代 |
|---|---|---|---|
| `dsh-switchboard` | 0.5.22 | 1★、月下载 2.0k、单人作者、**GitHub 仓库里没有许可证文件** | `@xmanrui/dsh-im`（若兼容），否则自建最小 Telegram 桥 |
| `dsh-plugin-heartbeat` | 0.8.0 | 3★、月下载 3.3k、单人作者；engine 范围过于激进 | 我们自建约 100 行的主动性循环 —— BUILD |
| `dsh-automations` | 0.2.1 | 0★、月下载 778、面向模型的 shell = RCE | 原生 `dsh-schedule` + systemd 定时器 —— BUILD/DROP |
| `dsh-push-notify` | 1.1.0 | 2★、月下载 1.3k | 我们自建约 60 行的 ntfy 壳层 —— BUILD |
| `dsh-soul-md` | 0.12.2 | 39★ 单人维护（月下载 51.8k 说明有人用，但算不上成熟项目） | 我们自建约 80 行的人格加载器 —— BUILD |
| `dsh-skill-doctor` | 0.15.0 | 1★ | —— DROP |
| `dsh-session-autarchive` | 0.1.7 | 0★ | 原生 API + 定时器 —— DROP |
| `dsh-period-report` / `dsh-weekly-report` | 0.2.1 / 0.1.8 | 0–2★、单人作者、其中一个自 8 月起停更 | 本地摘要（已上线）+ M2 叙述式摘要 —— DROP |

## 审查中

_无 —— M0.5 准入已完成（2026-11-10）。上面已批准的条目各自带着 M1 条件；候选清单里其余每一项
要么被成熟度门槛拒绝（D14），要么由我们自己的少量代码取代。_


## 已拒绝 / 不要安装

| 包 | 原因 |
|---|---|
| `dsh-mem0` | 引擎重复；Mem0 Platform/自托管/Python sidecar 运行时（不适合本技术栈） |
| `@kanadego/dsh-heartbeat` | 没有 `engines.dsh`；重量级人格产品；替代方案 `dsh-plugin-heartbeat` |
| `@hhuangpanda/dsh-automation` | engine 范围 `>=0.2.2-rc.1 <0.2.2`，任何 DSH 升级都会崩；是 alpacachen 的 fork |
| `dsh-notifier`、`dsh-telegram-duty`、`dsh-im-hub`、`dsh-plugin-tlnotify`、`dsh-telegram-notify` | peer 范围与 DSH 0.2.2-rc.1 不兼容 |
| `dsh-backup`、`@xiaoyuyu6420/dsh-backup` | engines 上限低于 0.2.2-rc.1；改用自己的备份脚本 |
| `dsh-longterm-memory`、`dsh-expmem`、`dsh-layered-memory`、`dsh-memory-with-soul` | engines/peers 排除了本主机，或硬依赖 Python |
| `dsh-trust-panel` | 依赖一套尚未完整发布的信任组件 |
| 任何第二个心跳/调度器/hook/看板插件 | 每个交互面只留一个；原生 agent-team 看板已经够用 |

## 升级策略

1. 新版本 = 新条目，重新扫描、重新试验；新版本通过之前，旧版本保持固定。
2. 记录 `dist/` 入口、新依赖、新网络域名、新安装脚本的差异。
3. 出现安全回退 → 回滚到台账中最后一个已知良好版本，并在此留一条记录。

## 我们自己装进 `personal` 的代码（D14 —— 本地组合包，不经 npm 供应链）

| 组合包 | 版本 | sha256（入口） | 扫描 | 试验 | 结论 | 日期 | 回滚 |
|---|---|---|---|---|---|---|---|
| `@local/dsh-soul` | 0.1.0 | `67289628dd20218219dbc52cb37645264b9fcc8a9de6f3517be2be29015aa773` | 我们的代码：只读 fs，无网络/子进程/凭据；字面段落 `interpolate:false`；16 KiB 上限 | 8/8 自测 + headless 人格验证 + 实时 journal 行 | **INSTALLED 2026-11-11** | 2026-11-11 | `dsh plugin --profile personal remove @local/dsh-soul` + 重启 |
| `@local/dsh-push` | 0.1.0 | `d55eed7b263cbe9c1ddebcc90c51de082085fd7ec3172970c157184d1fe4b3b4` | 我们的代码：无依赖；端点只从环境变量取；载荷不含正文/凭据；fail-open | mock：惰性=0 次请求、启用=1 次干净的 POST、死端点=该轮不受影响 | **INSTALLED，惰性（无 NTFY_URL）** | 2026-11-11 | 移除 `@local/dsh-push` + 重启 |
| `@local/dsh-heartbeat` | 0.1.0 | `1d5ca8672d3166aeb724e7c5b7c08049ea4883a9253ad5605df322e8972667e0` | 我们的代码：无工具/网络/shell；默认 OFF；间隔有界；标识为 `source.kind:"heartbeat"` | 26/26 单元测试；默认关闭与启用两种启动均验证 | **INSTALLED，已禁用**（实时提醒路径属 M2） | 2026-11-11 | 移除 `@local/dsh-heartbeat` + 重启 |
| `@local/dsh-capabilities` | 0.1.0 | `dd43ccb2a0b2447f5b0ac4dda9ed69fbdb97dfffad8e1660f7de3490c19661e4`（index.js；client.js `6a2f00a56e3e5939e1e8dba113bb965d8891a967186781fe8d5b33f9c7400d7d`） | 我们的代码：无依赖、无网络、无凭据访问；宿主注册三条所有者门禁的 `/api/capabilities` 路由，只返回名称/版本/状态/错误（不含源码路径、命令或机密）；客户端除连接器探测/重启外只读；本地 `ping` MCP 测试件无依赖且离线 | 5/5 宿主测试；个人主机实测：`GET /api/capabilities` 所有者 200 / 未认证 401，`ping` 状态 `connected`，列出 31 个组合包，Playwright 在 1440 与 390 px 下 0 控制台错误，`dsh-pending` 干净 | **INSTALLED 2026-11-12**（personal；链接式组合包） | 2026-11-12 | `DSH_HOME=/home/josh/.dsh-personal dsh plugin --profile personal remove @local/dsh-capabilities` + 重启；恢复 `cordis.patch.yml.bak-connector-*` 以移除测试件行 |

## 在 DSH 0.2.2-rc.2 上重新准入 —— 2026-11-12

运行时升级被当作一次重新准入事件：每个已安装组件都在 rc.2 上重新检查（启动、组合后的配置树、实时路由/UI、仓库测试）。本轮没有安装新的社区 tarball；官方包跟随运行时升级，session-search 也升到了匹配的 rc.2 构建。

| 组件 | 版本 | rc.2 结果 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | **0.2.2-rc.2** | PASS —— 从 profile lockfile 安装；索引数据库启动时重新打开；dump-config 干净 |
| `@vectorize-io/hindsight-coding-agents` | 0.8.6 | PASS —— 0600 配置未变，记忆库为 `dsh-personal`，API 健康检查 200，无启动错误 |
| `@local/dsh-soul` | 0.1.0 | PASS —— 自测 5/5；journal 出现 `loaded SOUL persona … order 0` |
| `@local/dsh-push` | 0.1.0 | PASS —— 惰性（无 `NTFY_URL`） |
| `@local/dsh-heartbeat` | 0.1.0 | PASS —— 默认关闭；单元测试通过 |
| `@local/dsh-profiles` | 0.1.0 | PASS —— 客户端模块在两个主机上均可提供 |
| `dsh-guizang-design` | 0.1.4 | PASS —— 面板可加载；`/guizang-design` 未认证 401 / 所有者 200（鉴权补丁仍生效） |
| `dsh-media-desk` | 2.6.2 | PASS —— `/media-desk/state` 未认证 401 / 所有者 200 |
| `@deepseek-ai/dsh-experimental-auto-review` | rc.2（运行时） | PASS —— 组合包可组合，无启动错误 |
| `@deepseek-ai/dsh-experimental-voice-input-bundle` | rc.2（运行时） | PASS —— 组合包可组合 |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | — | **REMOVED** —— 没有 rc.2 版本；rc.2 核心提供 `agent-team`、`tool-agent-team`、`ui-agent-team` |
| 编码主机：host-control / web-mobile / dshmarket / context / ffmpeg / blender / web-fetch-playwright / web-search / youtube / inspector / plugin-market / forge | 按已安装版本 | PASS —— 启动 401，90 个实时客户端模块，`dsh-pending` 干净；日志中无逐插件错误 |

残留：完整的会话级 SOUL 开场与 Hindsight 召回轮次仍待在 rc.2 上演练；插件级检查与 M1 验收运行是在 rc.1 上完成的。rc.1→rc.2 升级指南中触及本技术栈的条目是 `subagent-interrupt-default`（我们的预设现在带 `interrupt: false`）与 `web-search-billing`（无需改动 YAML；`*ApiKeyEnv` 仍然优先）。`BundleInfo.updatable` 现在是 `BundleInfo.update`，Capabilities 宿主路由必须使用它。

## `@local/dsh-memory-personal` 0.1.0（2026-11-13）—— 个人助理记忆，替换编码代理客户端

| 字段 | 值 |
|---|---|
| 组件 | `@local/dsh-memory-personal` 0.1.0（第一方、仓库内、无第三方代码） |
| 来源 | [`plugins/dsh-memory-personal`](../plugins/dsh-memory-personal/)——零依赖（Node 内置 + 全局 `fetch`） |
| 替换 | `@vectorize-io/hindsight-coding-agents` 0.8.6 **作为记忆客户端**（服务端与库不变） |
| 理由 | 非编码任务上实测每步注入 3,175 token，约 75% 是工具手册；本主机没有仓库 |
| 试用 | `.tmp/` 下的隔离 `$DSH_HOME`：2 次运行，retain 与跨会话召回均验证；线上主机未动 |
| 回滚 | 移除组合包（或禁用条目）、重新启用 `hindsight`、重启；`profile.json` 与库都不受影响 |
| 待办 | 线上安装尚未获批；`hindsight_reflect` 上游仍为 402 |
