# Translation glossary (English → Simplified Chinese)

Working reference for translators and reviewers. Not a translated page.

Rules of thumb: keep DSH, Hindsight, product/plugin names, commands, paths, flags and versions in English;
translate the surrounding prose. When a term is commonly used untranslated in Chinese developer writing,
keep the English form and add the Chinese on first mention. New recurring terms go in this table *before*
they are used.

| English | 中文 | Notes |
|---|---|---|
| DeepSeek Harness (DSH) | DeepSeek Harness（DSH） | product name — never translated |
| plugin | 插件 | |
| bundle / bundle row | 组合包 / 组合包条目 | DSH 术语：“bundle”=组合包，profile 中按行启停 |
| plugin bundle patch layer | 组合包 patch 层 | keep “patch” |
| profile | profile | keep untranslated, like DSH's own Chinese docs; first mention: `profile（配置档案）` |
| host | 主机 | |
| host-level change | 主机级变更 | |
| personal host / reference host | 个人主机 / 参考主机 | |
| workspace | 工作区 | |
| workspace-write preset | workspace-write 预设 | sandbox presets and exact values stay English |
| sandbox | 沙箱 | |
| approval / approve | 审批 / 批准 | |
| credential / credential ref | 凭据 / 凭据引用 | |
| secret | 密钥 / 机密信息 | use 密钥 for tokens/keys, 机密 for the category |
| session | 会话 | |
| session search / recall | 会话检索 / 召回 | “recall” in the memory sense = 召回 |
| memory | 记忆 | long-term memory = 长期记忆 |
| bank (Hindsight bank) | 记忆库（bank） | keep “bank” in parentheses where it matters |
| Hindsight | Hindsight | product name |
| telemetry | 遥测 | telemetry egress = 遥测出站 |
| egress | 出站流量（egress） | first mention keeps English |
| ingress | 入站 | |
| observe + alert | 观测 + 告警 | |
| hardening / hardened | 加固 / 已加固 | |
| systemd user unit | systemd 用户单元 | |
| unit | 单元 | |
| drop-in | drop-in 配置片段 | keep “drop-in” |
| journald sink | journald 日志汇 | |
| digest | 摘要 | daily digest = 每日摘要 |
| timer | 定时器 | |
| keepalive timer | 保活定时器 | |
| backup / restore drill | 备份 / 恢复演练 | |
| off-host backup bundle | 离机备份包 | |
| rollback | 回滚 | |
| pin / pinned version | 固定版本 | pin exact versions = 固定在确切版本 |
| vet / vetting | 审查 / 审查流程 | plugin vetting = 插件审查 |
| admission | 准入 | admission checklist = 准入清单 |
| maturity gate | 成熟度门槛 | |
| ledger | 台账 | plugin ledger = 插件台账 |
| shortlist | 候选清单 | |
| buy-vs-build | 自建 vs 采购 | |
| glue (own the small glue) | 胶水代码 | own the small glue = 自己维护少量胶水代码 |
| persona | 人格 | persona file = 人格文件 |
| soul | 灵魂（SOUL） | `soul/SOUL.md` path stays English; prose may say “人格/灵魂文件” |
| prompt | 提示词 | system prompt = 系统提示词 |
| prompt injection | 提示词注入 | |
| tool surface | 工具面 | |
| agent loop | agent 循环 | keep “agent” |
| agent | agent（智能体） | keep “agent” in running text |
| subagent | 子代理 | |
| skill | 技能 | |
| heartbeat | 心跳 | |
| push notification | 推送通知 | |
| channel | 渠道 | |
| proactivity | 主动性 | |
| autonomy policy | 自主性策略 | |
| retention | 保留 | retention policy = 保留策略 |
| erasure | 清除 | erasure contract = 清除约定 |
| failure mode / fail-open | 故障模式 / fail-open（故障时放行） | keep fail-open |
| least mechanism | 最小机制 | |
| deny list | 拒绝列表 | |
| threat model | 威胁模型 | |
| residual risk | 残余风险 | |
| acceptance test | 验收测试 | |
| gate | 门禁 | |
| phase | 阶段 | M0/M1… stay as-is |
| milestone | 里程碑 | |
| build log / engineering log | 构建日志 / 工程日志 | |
| research note | 研究笔记 | |
| decision (D1, D13…) | 决策（D1、D13……） | IDs stay as-is |
| work block | 工作块 | |
| sign-off | 签核 | |
| escalation | 升级处理 | |
| incident response | 事件响应 | |
| untrusted content | 不可信内容 | |
| source of truth | 权威来源 | English is the source of truth = 英文为权威来源 |
| translation pairing | 双语配对 | |
| language switch line | 语言切换行 | |
| coverage table | 覆盖表 | |
