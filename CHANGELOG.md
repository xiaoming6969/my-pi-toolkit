# 更新日志

## [Unreleased]

### 新增

- 建立仓库测试流程：每个模块使用 `extensions/<module>/test/`，根目录 `npm test` / `npm run test:coverage`，以及 GitHub Actions CI。
- 为原先缺少测试的模块补齐公共 API 覆盖（agent-todos、helps、model-manager、task-duration、built-in-tool-style），并扩展 TAPD、Chat Mode、Dashboard、Multi Task、Context7、OpenAI 兼容模型等纯逻辑用例。
- 补齐其余值得测的公共 API：Plan 生命周期、TAPD HTTP/合入版本、文档快照、会话选择输入、Git 运行时、浏览器 diff 收集、Context7 环境配置等。
- 覆盖率门禁针对应测源码：行 / 分支 / 函数 ≥ 95%；TUI Overlay、扩展 `index.ts` 注册样板、子进程/浏览器拉起，以及只剩 Git CLI / 体积上限边沿的封装不计入统计。应测公共逻辑尽量提高覆盖率，不要用空 import 灌覆盖率。

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

[1.2.1]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/xiaoming6969/my-pi-toolkit/compare/v1.0.0...v1.1.0
