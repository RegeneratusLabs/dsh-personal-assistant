# 给你的 DSH agent 的复制粘贴用提示词

[English](PROMPT.md) | 中文

填写下面的占位符（`<...>`），然后把这段内容粘贴到一个 DSH 会话的第一条消息中，该会话的工作区是本仓库的
克隆。

---

你正在 DeepSeek Harness 上为**我**搭建个人助理，以本仓库（`dsh-personal-assistant`）作为参考构建与流程。

首先，按此顺序阅读：`AGENTS.md`（顶部一节会把你引导到这里）、`agents/README.md`、
`agents/GUIDE.md`、`agents/checklists.md`，然后是 `research/build-progress.md` 和
`research/personal-agent-design.md` 以了解背景。

我的环境与选择：

- 操作系统/用户：`<e.g. Ubuntu 24.04, user "me", systemd --user available>`
- DSH：`<version and CLI path, e.g. 0.2.2-rc.1 at ~/dsh/node/bin/dsh>`
- 目标 DSH 主目录：`<e.g. ~/.dsh-personal>`；profile 名：`<e.g. personal>`
- Web UI：绑定 `127.0.0.1:<port>`；公共入口：`<tailnet URL / reverse proxy / none>`
- 我已运行的其他 DSH 主目录/主机（不要打扰它们）：`<...>`
- 记忆：`<local Hindsight already runs at http://127.0.0.1:9177 | I want one started | skip memory for v1>`
- 渠道：`<none for now | I will add one later>`
- 我助理的人格：`<a few lines about me and the tone I want>`

如何工作：

1. **先勘察，只读。** 报告主机事实与差距（DSH 版本、单元、主目录、端口、现有
   服务、Hindsight 可用性）。这一步不改动任何东西。
2. **先计划再执行。** 给我一个阶段计划（M0 安全/遥测 → M0.5 插件准入 → M1
   技术栈 → M2 卫生），包含确切命令、每项主机变更的回滚，以及
   `agents/checklists.md` 中的验收测试。
3. **每次主机级变更前先问** —— 单元/网络/服务配置、安装进我的活动 profile、
   凭据变更、工作区之外的删除。没有任何事被默许；把我的“ok”视为仅限
   你描述的那一步。
4. **固定并记录每个插件。** 确切版本、完整性、扫描结果、试用、回滚。优先成熟
   包；自己写少量胶水代码。
5. **不得有密钥**出现在你创建的文件、日志、提示词或遥测中。使用 DSH 凭据引用；凭据
   存储保持 0600。
6. **记录构建**：维护一个进度文件，包含阶段看板、决策、工作日志和未决问题，
   如果本仓库是你的工作树，每个工作块后提交/推送。
7. **停下并询问**，当安全权衡、插件成熟度或成本决策需要我来做时。

准备好后，从第 1 步开始，给我看勘察报告和你的计划。
