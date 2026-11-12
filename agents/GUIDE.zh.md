# 构建指南 —— DSH 上的个人助理（通用）

[English](GUIDE.md) | 中文

这是 [`README.md`](README.zh.md) 的可执行配套文档：你的
DSH agent 在构建**你的**助理时应遵循的阶段、门禁和命令。它有意做到与主机无关；参考
构建（本仓库）把它应用在一台 homelab 主机上，`research/` 深入解释了每个决策。

先读 [`README.md`](README.zh.md) 中的安全规则。agent 在任何
变更前必须执行**只读勘察**，并且**每次主机级变更前都要问你**。

## 下文使用的参数

```sh
export REPO="$(pwd)"                          # this clone
export DSH="$HOME/dsh/node/bin/dsh"            # your DSH CLI (adapt)
export DSH_HOME="$HOME/.dsh-personal"          # assistant home (adapt)
export PROFILE="personal"                      # profile name
export HOST="127.0.0.1"
export PORT="7002"
export UNIT="dsh-personal.service"             # systemd --user unit
export HS_URL="http://127.0.0.1:9177"          # Hindsight, if used
export BANK="dsh-personal"                     # memory bank — yours only
```

## 阶段 0 —— 勘察（只读）

- DSH 版本与 CLI 路径：`"$DSH" --version`。
- 现有主目录/profile：`ls -d "$HOME"/.dsh*`；`"$DSH" --profile "$PROFILE" --dump-config`（只读）。
- 现有服务：`systemctl --user cat "$UNIT"` 和 `systemctl --user status "$UNIT"`。
- 网络：`ss -ltn`、`ip -brief addr`，是否有 VPN/tailnet/代理在 UI 前面。
- 记忆：是否已有 Hindsight 服务器在运行（`curl -s "$HS_URL/health"`）？它是谁的？**绝不复用
  其他用户的记忆库。** 优先自己的实例；专用记忆库是最低要求。
- 数据/空间：`du -sh "$DSH_HOME"`、备份目的地和可用空间。
- 门禁：你掌握了事实并能说出风险；未改动任何文件。

## 阶段 M0 —— 安全与遥测基线

与人类一起决定隔离级别并把决定写下来：

- **务实（单用户）：** 服务以人类用户身份运行；接受的风险：被攻陷的插件拥有
  该用户的数据。用准入审查、审批和较小的插件面来缓解。参考部署就是这样做的；
  见 `research/personal-agent-security.md` §7–§8。
- **隔离（更强）：** 专用 Unix 用户或 rootless 容器，只挂载 profile/工作区，
  并（理想情况下）配出站拒绝列表。设置更多；当助理会运行不可信插件或被共享时才做。

然后按顺序执行（每一项都是主机变更 → 先问）：

1. **加固单元。** 添加 drop-in 配置片段，含 `NoNewPrivileges=yes`、`UMask=0077`、`PrivateTmp=yes`、
   `ProtectSystem=strict`、`ProtectHome=read-only`、`ReadWritePaths=<DSH_HOME>`、`RestrictAddressFamilies`、
   `RestrictSUIDSGID=yes`、`LockPersonality=yes`、`SystemCallFilter=@system-service`，并把日志送往
   journald（`StandardOutput=journal`）。用
   `systemctl --user show "$UNIT" -p ...` **验证用户单元实际应用了哪些** —— 挂载命名空间相关指令
   可能被忽略。参考：`scripts/hardening/`、`research/m0-host-hardening.md`。
2. **禁用 DSH 不必要的出站。** 给助理 profile 打补丁，设置
   `session-log-deepseek.enabled=false`、`plugin-package-inventory-deepseek.enabled=false` 和
   `session-telemetry-otel.mode=DISABLED`（用 `--dump-config` 核对你所用 DSH 版本的行 id）。
   用 `--patch <file> --dump-config` 预检，重启，确认组合后的行。参考：
   `scripts/telemetry/patch-telemetry.yml`、`research/m0-telemetry.md`。
3. **观测出站流量**（除非你选择隔离，否则不做拒绝列表）。systemd 的 `IPAddressDeny/Allow` 可能
   未编译进去（`systemd --version` 输出不带 `+BPF_FRAMEWORK`）；用 nftables 记录该单元 cgroup 的
   新建出站连接，并对意外目的地告警。参考：`scripts/egress/`。
4. **本地遥测汇。** journald 保留上限、摘要定时器、告警检查器、token/成本计量、
   Hindsight 用量。参考：`scripts/telemetry/`；适配路径。
5. **备份 + 恢复演练。** 以 0600/0700 和保留策略备份 profile + 工作区（+ 记忆导出）；
   在另一个端口的临时主目录中跑一次恢复演练，证明主机能启动。参考：
   `scripts/backup/`。
6. **密钥。** 凭据存储 0600，归服务用户所有；单元环境、日志、
   提示词或遥测中无密钥；采集前先脱敏。

**M0 退出条件：** 单元已加固并验证、遥测出站关闭、出站已观测、本地汇正在收集、
恢复演练通过、残余风险已记录。门禁：在此之前不要安装社区插件。

## 阶段 M0.5 —— 插件准入（仅限成熟插件）

对每个候选插件：

1. **成熟度检查**（看实测，不看感觉）：GitHub stars、npm 月下载量、许可证、发布者、
   维护新近度、声明的 DSH 兼容性。优先第一方，其次厂商官方，再次
   成熟社区。核心面不要采用 0–3★ 单作者包；改为自己写少量胶水代码。
2. **固定确切版本**，记录 npm `dist.integrity`（sha512），并扫描 tarball：安装/准备
   脚本、原生二进制、`child_process`/`eval`、硬编码网络域名、凭据访问、依赖。
3. **依赖：** 审计；无安装脚本；无 `latest`；不自动更新。
4. **临时试用**：在一次性 profile 中启动它，验证唯一重要的那个行为，用 strace 或你的
   观测规则盯出站。
5. **台账行：** 版本、sha512、扫描结果、试用结果、结论、回滚命令。进入活动 profile 之前需**人类签核**。

参考：`research/admission-scans.md`、`research/admission-trials.md`、`research/plugin-ledger.md`。

## 阶段 M1 —— 安装技术栈

按此顺序安装，一次一行，安装之间留出间隔：

1. **会话召回** —— 官方 `@deepseek-ai/dsh-experimental-session-search@<exact>`；显式固定索引
   （`path` + `openAt`；patch 会整体替换该行配置，因此两者都要重述）。
2. **长期记忆** —— 厂商 Hindsight 插件固定为**自托管**，用你的
   `HINDSIGHT_CONFIG` 文件（0600）：`serverMode`、`apiUrl`、`bankId`、`dynamicBankId:false`，以及
   autoSeed/autoUpdate/gitIngest 关闭。Cordis profile 的 `config:` 块对本插件**无效**；
   配置在文件里。参考：`plugins`、`research/m1-install-verification.md`。
3. **身份** —— 一个小加载器，在 persona 顺序 0 注入你的 `SOUL.md`（`interpolate:false`、
   有大小上限、文件缺失时为空操作）。参考：`plugins/dsh-soul/`，并在
   `soul/SOUL.md` 中写**你自己的**人格（参考人格只是示例，不是产品）。
4. **推送/主动性（可选）** —— 很小的 ntfy 通知器（在你设置主题前不生效）和安静
   心跳（默认关闭）。参考：`plugins/dsh-push/`、`plugins/dsh-heartbeat/`。
5. **默认不要启用任何面向模型的东西。** 无 shell 自动化、无人值守会话中不放
   插件管理工具、没有真实需要就不开渠道。

**M1 验收：** 跨会话/重启召回；在预算内召回；记忆宕机时 fail-open；记忆库
隔离；会话检索能找到旧对话；无意外出站；日志中无密钥。参考：
`research/m1-acceptance.md`。

## 阶段 M2 —— 卫生与策略

- **记忆整理器：** 定期刷新心智模型并合并的调度任务；一份仅含计数的报告。
  参考：`scripts/memory/curate.sh`。
- **保留/清除策略：** 定义什么存在哪里、存多久、由什么清理，以及“遗忘”对你的记忆引擎意味着什么
  （删除文档 vs 派生观察结果 vs 完全清除）。参考：
  `research/m2-retention-policy.md`、`scripts/memory/forget.sh`。
- **加密离机备份：** 在备份单元离开主机前加密它。参考：
  `scripts/backup/dsh-offsite-bundle.sh`。
- **按界面划分的自主性策略：** 谁可以在无人值守下、用哪些工具、做什么。参考：
  `research/m2-autonomy-policy.md`。

## 改造参考脚本

这些脚本是可运行的示例。运行前，替换参考路径：

```sh
grep -rn '/home/josh' "$REPO"/scripts "$REPO"/plugins | head -50
```

具体来说：`/home/josh/projects/DSH-playground` → 你的克隆，`/home/josh/.dsh-personal` → `$DSH_HOME`，
`dsh-personal.service` → `$UNIT`。`scripts/*/units/` 中的单元文件和 `ExecStart=` 路径也需要同样
处理。

## 不要

- 为了得到接缝已经提供的 UI 或功能，fork DSH 或另写一个 agent 循环。
- 在核心面上安装 0–3★ 单作者插件；改为自己写那一小块。
- 把 `danger-full-access` 设为默认，或为了让安装能跑而放宽沙箱。
- 为组合包插件手写 `insert` 行；使用 `dsh plugin --profile <p> add`。
- 把记忆指向其他用户的记忆库/实例；碰其他应用的数据。
- 为一个渠道 token 运行两个轮询器；在没有允许列表的情况下暴露渠道。
- 把凭据存进仓库、你提交的环境文件、日志或遥测。
- 在验收测试未通过时声称某阶段完成。
