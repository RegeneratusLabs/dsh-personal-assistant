# 构建日志

[English](BUILD-LOG.md) | 中文

按时间顺序、以链接为主的构建记录。细节见 `research/`。

## 2026-11-09 — 研究与设计（P0）
- DSH 能力审计、生态扫描（Hermes/OpenClaw/Letta……）、插件市场侦察（4,985 个包）、个人主机 runbook。产出：`research/dsh-as-personal-assistant.md`、`personal-agent-design.md`、`personal-agent-plugin-shortlist.md`、`personal-agent-security.md`。

## 2026-11-10 — 安全与遥测基线（M0，通过）
- 对主机/DSH/Hindsight 做只读侦察；发现此构建的 systemd 缺少 `IPAddressAllow/Deny`、Hindsight 是 Hermes 的共享实例、服务以人类用户身份在未加固状态下运行。
- 人类决策 **D13**：务实的安全基线（接受同 UID 风险；出站流量观测+告警；遥测仅本地；备份经过测试；以审查作为控制手段）。
- 已实施：systemd 用户单元加固（暴露面 9.8 → 7.0）、关闭 DSH 遥测出站、nftables 出站观测 + 保活定时器、journald 保留、token/费用计量、摘要定时器、`dsh-personal` Hindsight 记忆库、首次备份 + **恢复演练 PASS 20/20**。
- 文档：`m0-*.md`。

## 2026-11-10 — 插件准入（M0.5）
- 人类决策 **D14**：只用成熟插件，不使用 0–3★ 单人作者包。
- 衡量了候选清单中的每一个候选；否决 switchboard（1★，仓库无许可证）、heartbeat（3★）、automations（0★）、push（2★）、soul-md（39★ 单人维护）等。
- 静态扫描 + 临时 profile 试用：官方 session-search **PASS**，厂商 Hindsight **PASS-WITH-CONDITIONS**，`@xmanrui/dsh-im` 启动兼容但 **暂缓**（上游 Telegram bug）。
- 文档：`admission-*.md`、`plugin-ledger.md`。

## 2026-11-10 — 精选插件栈（M1，进行中）
- 安装 `session-search@0.2.2-rc.1` + `Hindsight@0.8.6`；Hindsight 配置固定在 Cordis 之外（`HINDSIGHT_CONFIG`，0600），因为可以证明 profile 的 `config:` 块对它无效。
- 功能验收：记忆写入（记忆库节点 0→4）、跨进程重启召回（`amber-fox-42`）、按短语进行会话检索；记忆库隔离保持成立。
- 文档：`m1-install-verification.md`。

## 2026-11-11 — 我们自己的胶水代码（M1）
- 重做了三份丢失的子代理交付物：`@local/dsh-soul`（在顺序 0 处注入 SOUL.md 人格）、`@local/dsh-push`（ntfy，默认不生效，不含正文）、`@local/dsh-heartbeat`（默认关闭、安静、26 个单元测试）。
- 三者全部安装 + `~/.dsh-personal/soul/SOUL.md`（0600）；在线重启干净、无错误、出站只有 `api.deepseek.com`；安装后恢复演练 **PASS 20/20**。
- 发现并记录了一个真实限制：Hindsight 0.10.3 没有删除工具/接口，且派生观察（derived observations）在源文档删除后仍会存活 → `forget` 是人工触发的脚本；彻底清除等于清空记忆库。
- Telegram 渠道仍然暂缓；下一步 M2（策略与胶水、心跳实时提醒、摘要、注入语料）。

## 2026-11-11 — M1 验收缺口
- 提示词注入语料 4/4 PASS（普通文件、伪造系统通知、隐藏 HTML 注释、记忆投毒）：无 canary 命中、无工具执行、无审批变更、无被投毒规则写入。语料现可通过 `scripts/security/injection-corpus.sh` 复现。
- 召回 token 预算 PASS（召回增量约 180 token）；记录了一段固定的约 3k token Hindsight 提示词块，作为 M2 的费用项。`forget` 仍是部分功能（Hindsight 缺少按条删除）。Telegram 渠道推迟。
- 证据：`research/m1-acceptance.md`。

## 2026-11-11 — M2 启动：记忆卫生 + 保留
- 每日 Hindsight 整理器（`curate.sh` + `dsh-memory-curate.timer` 07:15）：心智模型刷新、合并整理、仅计数的报告 + 7 日 Hindsight LLM 用量（首次读数 67 次请求 / 335,897 token）。
- 保留策略（`research/m2-retention-policy.md`）与只读盘点（`retention-report.sh`）：会话、存储、备份 14/8、遥测 90 天（摘要会清理自己的报告）、journald 2 GB/30 天、Hindsight 清除约定（文档删除 vs 派生观察 vs 清空记忆库）。

## 2026-11-11 — M2 完成
- 心跳实时路径在集成测试框架中得到验证（30/30 测试）：每个变化的状态产生一次可识别的提醒，其余时间保持安静，生产环境中默认关闭。
- 加密的离机备份包（`dsh-offsite-bundle.sh`，AES-256 + sha256，已通过解密验证）；保留策略补充了相应流程。
- 费用/上下文：摘要会呈现 Hindsight 7 日 LLM 用量；固定的约 3k token 记忆提示词开销已记录为接受项。
- 已编写按面（per-surface）的自主性策略；渠道继续由人类推迟，叙事摘要 → M3。

## 2026-11-11 — UI/UX 轨道交接
- 面向新 UI 会话的自包含交接文档（`research/ui-handover.md`）：已验证的 DSH 客户端插件接缝（组合包、插槽、主机路由、主题 token、重启语义）、产品界面、护栏，首个切片 = 只读 Status/Health，然后是记忆浏览器。渠道搁置。

## 2026-11-11 — 可供他人的 agent 复用
- 常青的仓库简介与 topics；新增 `agents/` 区块（README、可粘贴提示词、通用构建指南、阶段清单），让用户可以把他们自己的 DSH agent 指向本仓库来构建自己的助手。`AGENTS.md` 把外部 agent 引导到那里。

## 2026-11-11 — 本仓库
- 创建公开构建日志：文档、我们自己的插件、运维脚本、CI（插件测试 + shell 语法 + 密钥形态字符串扫描）。

## 2026-11-11 — UI/UX 设计简报（方向待定）
- 捕获了线上 Web 外壳（light/dark/390）及其真实的 `--dsw-*` token 值；验证了后续切片所依赖的客户端插件接缝（侧边栏条目图标、带 key 的主面板、已认证的 `/api` 取数路由、焦点环、圆角、设置卡片材质）。更正：`ui-primitives`/`ui-slots` 随外壳组合包一起发布，而不是作为已安装包——卡片/列表/空状态要我们基于 token 自己构建。
- 盘点了助手 UI 所需的每一个只读数据源（systemd、告警、出站、保留、Hindsight、遥测、备份、身份），含脱敏 schema 和推荐的单一状态路由。
- 写了 `research/ui-design-brief.md`：IA（单个 Assistant 面板，Status/Memory/Activity 选项卡）、token 体系、三套视觉方向与稿（instrument / notebook / minimal）、组件套件、可访问性与不可信数据规则，以及首个切片（只读 Status/Health）。尚无 UI 代码或主机改动。

## 2026-11-11 — UI 切片 1：Status/Health 面板在 coding 主机上线
- 方向已定（混合：仪表盘布局、人类语言句式、原生设置材质），brief 获批。构建 `plugins/dsh-status`：一个固定的 `GET /api/dsh-status/status` 聚合 14 个只读数据源，带分段 TTL、单飞缓存、白名单/脱敏输出与分段降级（15/15 测试），以及 Assistant 侧边栏面板（生命体征、记忆、任务、安全、告警、出站、费用、身份；纯 token 样式；可见性门控刷新；en+zh）。
- 在 coding profile 上安装并热启用（无需重启）；`scripts/verify-dsh-status-ui.mjs` 16/16 通过，控制台零错误；light/dark/390 证据在 `artifacts/ui/`（仅本地）。未安装到 `personal` 主机——那需要人类批准和一次重启。

## 2026-11-11 — 切片 1 可访问性打磨
- 对比度：小字号文本与状态 chip 改用 AA 安全的 token 组合（亮色 5.8:1+、暗色 12.1:1；chip 使用主文本色 + 彩色圆点，而不是在着色底上放彩色文字）。补上缺失的 `role="main"` 地标、用于标示数据新鲜度的 live region、44px 粗指针触控目标，并保留外壳可见的焦点环。
- 新增 `scripts/verify-dsh-status-a11y.mjs` 10/10 通过（标题、地标、live region、17 个文本样式对比度样本、键盘焦点、200% 缩放、减少动态效果、触控目标）；UI 验证保持 16/16。
- 仍待办：真实屏幕阅读器验证，以及把面板部署到 `personal` 主机（审批 + 重启）。

## 2026-11-11 — Status/Health 面板部署到 personal 主机
- 安装前备份 `daily/20261111T051012Z`（9.8 MB，sha256 + Hindsight 导出 + 密钥检查），把 `@local/dsh-status` 装入 `personal` profile（安装器添加了依赖与组合包条目），重启 `dsh-personal.service` 一次。
- 在 `:7002` / tailnet `:8454` 验证在线：路由 200 且 `serving.unit = dsh-personal.service`，UI 验证 16/16，可访问性验证 10/10，控制台零错误。之后移除了 coding 主机的预览。
- 回滚：移除依赖 + 组合包条目并重启，或恢复备份 `20261111T051012Z`。

## 2026-11-11 — Guizang Design + Media Desk 迁到 personal 主机
- 审查了两个社区插件（此前无台账行）：`dsh-guizang-design@0.1.4`（AGPL-3.0，779★）与 `dsh-media-desk@2.6.2`（MIT，1023★）；无安装脚本、无遥测、无凭据访问。
- 安全：guizang 自己的 `/guizang-design` 路由没有所有者认证（经 tailnet 未认证即可 200 访问，包含私有作品）；media desk 已经通过 `connection.requestRejection` 做了门禁。用 `scripts/ops/patch-guizang-auth.sh` 在本地修复了 guizang（失败即关闭，403）——重装/升级后需重新打补丁。
- 把数据迁移到 `~/.dsh-personal/{guizang-design,media-desk}`（库 + 2 个作品 + 音色配置 + 缩略图；media-desk 的状态/设置），从备份 `daily/20261111T060926Z` 安装两个固定版本，重启 `dsh-personal.service` 一次。两个面板都能渲染各自数据；路由未认证 401 / 已认证 200；出站流量无变化。
- Coding profile：两个条目已在线禁用并移除依赖；数据目录保留作为备份副本。

## 2026-11-11 — personal 主机上的 PWA 自动登录修复
- 今天的几次重启之后，personal PWA 的重新认证坏了：代理从 `~/dsh/logs/personal.log` 读取启动 token，但该单元把日志写入 journald（M0 加固），因此文件是陈旧的，每次重新签发都得到 401。代理现在支持 `DSH_WEB_JOURNAL_UNIT`（优先 journal，回退文件），并由一个 drop-in 指向 `dsh-personal.service`；代理已重启，DSH 未动。
- `scripts/verify-autologin-proxy.sh` 已更新为从 journal 读取 personal token；两个条目都通过注入 + 自带 cookie 的 POST `session/list`；经代理 tailnet 200，直接回环仍然 401。

## 2026-11-12 — 部署人格成为提示词开篇；Hindsight 召回设上限
- `personal` 上的 profile patch 去掉了 harness 身份行，清空了全局 coding-agent 人格前缀，并用其插件列表（减去仅作用域的 `persona` 行）覆盖随附的 `standard` preset，使已安装的部署人格成为系统提示词的第一节。在线验证：9,391 字符的提示词以 `# Identity` 开头，没有 coding-agent 或 harness 身份行，6 秒内回复。
- Hindsight 首次提示词转储是降级回退，而不是插件 bug：它的合成 LLM 返回 `402 Insufficient Balance`（Hermes 侧实例），因此每次首个提示词都要等约 19 秒，然后注入 17.7 KB 原始观察。客户端配置现在使用仅检索的 `autoInject: recall`（3 秒预算，800 token 上限）：1.2 秒、8 条观察、注入 12.8 KB。上游额度错误未做处理。
- 已在 `research/persona-and-memory-tuning.md` 中记录并含回滚。仓库交付通用起手 `soul/SOUL.md`；线上部署的实际人格是私有的，不属于本仓库。

## 2026-11-12 — Assistant 面板退役并移除（人类指示）
- 人类：personal profile 中的 Assistant 插件/功能“不需要——禁用并移除”。目标确认为 `@local/dsh-status`（侧边栏条目 **Assistant**、Status/Health 页面）。
- 在备份 `package.json`/`cordis.patch.yml`（`…bak-status-removal-20261112-174555`）后从 `~/.dsh-personal`（profile `personal`）卸载；重启 `dsh-personal.service` 一次（PID 1648385 → 1736271，active，以 401 提供服务，journal 干净；`dsh-pending.py`：无待处理项）。已认证验证：1440 与 390 宽度下都没有 Assistant 侧边栏条目，`GET /api/dsh-status/status` → 404，控制台无错误。
- 从仓库移除：`plugins/dsh-status/`（主机 + 客户端两半、15 个测试、README）、`scripts/verify-dsh-status-ui.mjs`、`scripts/verify-dsh-status-a11y.mjs`、CI 的 status-panel 测试步骤和 `research/ui-data-inventory.md`。`research/ui-design-brief.md` + `research/ui-handover.md` 保留作为 UI 轨道的设计记录并附退役说明；`AGENTS.md`、`research/README.md` 和 `research/build-progress.md` 已更新。
- 回滚：恢复两个 profile 备份，`git revert` 本次提交，重装组合包，重启一次。

## 2026-11-12 — 公开仓库完成脱敏（人类指示）
- 从公开仓库移除了一个误入的跨项目主题/logo 实验以及部署的个人人格文本，包括引入它们的提交；历史已重写并强制推送，仓库保持公开。线上助手保留其私有的人格；实验性主题/logo 组合包已从托管 profile 卸载，并恢复 DSH 原版外观/身份。
- 本仓库交付的是通用起手 `soul/SOUL.md`；线上个人配置不在此镜像。完整的重写前历史包保留在本地（已 gitignore）以便回滚。

## 2026-11-12 — 中文翻译 + 语言选项（人类指示）
- 在英文源旁边新增了面向用户的文档的简体中文（`zh-CN`）版本（`*.zh.md` 配对，例如 `README.md` ↔ `README.zh.md`），每个翻译页都有语言切换行，覆盖范围/政策见 `docs/i18n.md` + `docs/i18n-glossary.md`。已翻译：README、AGENTS、BUILD-LOG、SECURITY、docs/i18n、四个 `agents/` 页面和五个 `research/` 页面（索引、进度、设计、安全、台账）；代码与其余工程笔记保持英文。
- 新增 `.i18n.json` 分段哈希配对 + `scripts/docs/i18n-check.mjs`（结构、代码围栏一致性、链接解析、漂移）以及一个 CI 步骤，使单边文档编辑会失败而不是悄悄漂移。
- 未来变更的流程：改英文 → 在中文里同步 → `node scripts/docs/i18n-check.mjs --write`。

## 2026-11-12 — DSH 0.2.2-rc.2 覆盖两台主机
- 把共享运行时和两个 profile 都升级到 rc.2。该版本带来官方 MCP 服务器管理器与 `${credential:REF}` 模板（连接器的前置条件），并把 Agent Teams 移入核心；旧的 `dsh-experimental-agent-team-profile` 组合包条目已被移除。
- 第一次分离式运行干净回滚，因为 Web 主机启动时会短暂返回 `404`；就绪探针现在等到确切的 `401`。重试约 2 分钟完成，两台主机均健康，`dsh-pending` 干净，客户端模块 79/90。Hindsight、会话检索、guizang/media-desk 认证门禁、各 profile 与 soul 加载器均已重新验证。Runbook/回滚：`research/rc2-upgrade.md`。

## 2026-11-12 — 能力页与第一个连接器
- 新增 `@local/dsh-capabilities`：一个左侧边栏的 **Capabilities** 页面，含两个分节——连接器（来自 rc.2 的 MCP 管理器）与插件（来自 profile 的组合包列表）。连接器探测/重启已可用；插件管理仍留在官方 Plugins 页面。主机路由由所有者门禁，且不返回凭据、命令或 profile 路径。
- 用一个无依赖的本地 stdio MCP 测试件（`ping`）验证了连接器链路：管理器报告 `connected`，页面能列出它，Playwright 在 1440 与 390 px 下验证两个分节且控制台无错误。首个西方连接器（GitHub PAT）与 OAuth/Composio 决策是下一步；`research/connectors-options.md` 记录了覆盖矩阵与回退触发条件。
