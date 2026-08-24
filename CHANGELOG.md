# 更新日志

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

[1.1.0]: https://github.com/BigGoblin/my-pi-toolkit/compare/v1.0.0...v1.1.0
