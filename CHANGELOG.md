# 更新日志

## [Unreleased]

### 新增

- 通用 `spawn_subagent` 工具：按角色把自包含任务委派给独立子 Agent。内置 `explore`（即 `repo_search` 的角色）、`plan`、`implement`、`review`；用户可在 `~/.pi/agent/ming-core.json` 的 `subagents.roles` 定义角色，受信任项目可用 `.pi/agents/*.md`（YAML frontmatter + Markdown prompt）定义或覆盖角色。角色决定能力模式、system prompt、资源加载方式与可选的模型 / 思考等级路由。
- 子 Agent 后台调度：`spawn_subagent` 支持 `background: true` 立即返回 `subagentId` 并在完成后投递 `subagent-complete` follow-up；新增 `subagent_wait`（`wait_any` / `wait_all` + 超时）、`subagent_output`、`subagent_cancel`。Multi Task 的 6 槽 worker 信号量下沉为 `shared/subagent/slot-semaphore.ts`，`spawn_subagent`、`repo_search`、`tapd_review` 与 Multi Task worker 共用同一进程级并发上限。
- 子 Agent 上下文与结果契约：`spawn_subagent` 支持结构化 brief（`relevantFiles` / `constraints` / `expectedOutput`）；每次运行的完整报告写入 `runDir/report.md`，返回文本被截断时附带完整路径；角色可声明 `outputs` 文件契约，子 Agent 按精确路径写出，工具结果列出存在 / 缺失情况。`resumeFrom` 以本会话已结束子 Agent 的 session 为起点（Pi `--fork`）用新角色继续。
- 子 Agent 隔离与模块集成：`spawn_subagent` 新增 `isolation: "worktree"`（复用 `ming-core/worktree` 在 `subagent/<id>` 分支的独立 worktree 中运行，结果给出 diff / merge / 丢弃命令）；`subagents.roleModels` 为任意角色路由模型；Ask / Plan 模式按能力放行只读角色的 `spawn_subagent` 与只读 live 子 Agent 的 `subagent_followup`，观察类控制工具始终可用；`agent_todo_write` 条目可带 `subagentId`，关联子 Agent 成功完成时自动置为 completed 并持久化；任务耗时行追加子 Agent 运行时间与并行峰值。
- 子 Agent TUI 与可观测：Footer 改为 `subagent N run · N queued · N idle` 分组状态；`spawn_subagent` 工具卡运行时显示 `now: <最近工具调用> · <已运行时长>`；`/subagents` 列表新增 `S` 向 live 子 Agent 发送消息（运行中走 Pi RPC `steer` 插入当前 turn，空闲时排队新一轮）；新增基于假 `pi` 子进程的一次性 json 运行时集成测试，以及多 session branch、后台任务、等待原语等用例。
- 子 Agent 嵌套深度限制为 1：所有子进程带 `PI_SUBAGENT_CHILD=1`，`repo_search`、`spawn_subagent`、`subagent_followup`、`multi_task`、`tapd_review` 等父进程控制工具不再下发给任何子 Agent（含 Multi Task implementation worker）。

### 改进

- 子 Agent 共享运行时收敛：新增 `shared/subagent/run.ts` 的 `runSubagent()` 统一入口与 `capability.ts` 能力模式（`read-only` / `read-write` / `execute` / `all`）→ 工具白名单映射；Repo Search、TAPD Review、TAPD 根因总结与 Multi Task worker 全部改用该入口，一次性 `--mode json` 回退、`pi` 拉起方式和 50 KB / 2000 行输出截断只保留一份实现。行为与工具白名单保持不变。
- 将 `repo-search-subagent` 与 `subagent-console` 合并为 `extensions/subagent/`，由单一入口注册 `repo_search`、`subagent_followup` 与 `/subagents`。
- 将 `model-manager`、Repo Search、子 Agent UI 的用户设置合并进 `~/.pi/agent/ming-core.json`。首次读取会从旧的独立 JSON 导入并归档为 `.migrated.bak`；项目级改为 `.pi/ming-core.json`，仍可读旧文件且不改写仓库。

## [1.3.0] - 2026-09-01

### 新增

- Herdr 薄调度技能：用户要操作 Herdr 时先执行 `herdr --skill`，以当前安装二进制输出的指令为准。
- 会话分支提醒：第一条用户消息后记录当前 Git 分支；从其他对话 resume 或新终端打开旧会话时，若分支不一致可选切回或改绑。同一会话内的 `git switch` 不再拦截。
- 浏览器审阅为 Markdown 代码块和 Git diff 增加语法高亮。
- 建立仓库测试流程：每个模块使用 `extensions/<module>/test/`，根目录 `npm test` / `npm run test:coverage`，以及 GitHub Actions CI。
- 为原先缺少测试的模块补齐公共 API 覆盖（agent-todos、helps、model-manager、task-duration、built-in-tool-style），并扩展 TAPD、Chat Mode、Dashboard、Multi Task、Context7、OpenAI 兼容模型等纯逻辑用例。
- 补齐其余值得测的公共 API：Plan 生命周期、TAPD HTTP/合入版本、文档快照、会话选择输入、Git 运行时、浏览器 diff 收集、Context7 环境配置等。
- 覆盖率门禁针对应测源码：行 / 分支 / 函数 ≥ 95%；TUI Overlay、扩展 `index.ts` 注册样板、子进程/浏览器拉起，以及只剩 Git CLI / 体积上限边沿的封装不计入统计。应测公共逻辑尽量提高覆盖率，不要用空 import 灌覆盖率。
- PR 自动生成覆盖率报告（Job Summary、产物、PR 评论）。行 / 分支 / 函数任一低于 95% 时 CI 失败，用于拦住合入。
- CI 合并为单个 `测试` 任务（Node 22）：一次跑测试、覆盖率报告和发包清单校验。

### 修复

- 移除 Subagent 每轮运行时限，避免长任务被中途打断。

## [1.2.1] - 2026-08-26

### 改进

- 将 Worktree 实现移动到 `ming-core/worktree`，明确由 `ming-core` 内置加载，不再作为顶层模块展示。

## [1.2.0] - 2026-08-26

### 新增

- 新增 Worktree 工作流，支持创建、管理并关联会话工作树。
- 新增 Subagent 执行治理、RPC 会话队列、超时控制和持续跟进能力。
- 新增 TAPD Review thinking level 配置。
- 新增 Chat Mode 浏览器审阅开关。

### 改进

- 改进 Subagent Console 导航、运行标签、进度展示和跟进交互。
- 改进 Multi-task 并发控制、执行进度和复用子代理流程。
- 改进 TAPD 分支创建、故事状态及工作流反馈。
- 简化 Model Manager，移除独立 effort 命令。

## [1.1.1] - 2026-08-24

### 新增

- 发布公开 npm 包 `@xiaoming6969/my-pi-toolkit`，支持通过 Pi 直接安装。
- 新增 GitHub Release 触发的 npm Trusted Publishing 工作流，通过 OIDC 自动发布同版本包并生成来源证明。

### 改进

- 补充 npm 包文件白名单、仓库元数据、Node.js 版本要求和 MIT 许可证。
- 将仓库链接更新为 `xiaoming6969/my-pi-toolkit`。

## [1.1.0] - 2026-08-24

### 新增

- 新增本地浏览器审阅工作流，支持审阅 Git 差异、Markdown 文件及最近一条 Assistant 回复。
- 新增 Markdown 渲染预览、Mermaid 图表、源码切换、行选择和逐行批注。
- 新增 Plan 浏览器审批操作，支持批准并实施、暂缓实施、继续编辑和取消计划。
- 新增多问题分页问卷，可通过 `ask_user_choice` 一次集中确认多个关键决策。

### 改进

- 将浏览器审阅集成至 `ming-core`、Chat Mode Plan 审批及 TAPD 文档评审。
- 改进受限模式退出逻辑，确保返回 Build 后能正确恢复实施流程。
- 改进 Agent Todo 的会话关闭清理和异步命令处理。
- 更新相关命令、提示词、文档及审阅界面。

### 修复

- 修复 Windows 下启动面板发现路径的分隔符显示问题。
- 修复 TAPD 审阅工作流使用不受支持的通知级别问题。

[1.3.0]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.0.0...v1.1.0
