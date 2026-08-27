# ming-core

本 toolkit 的通用能力编排入口。启动面板扩展列表显示为 `ming-core`。

## 编排内容

按加载顺序依次注册：

1. `openai-compat-models` — 对 `models.json` 中未手写 `models` 的 OpenAI 兼容 provider 注册动态发现（`/model` 时刷新）
2. `model-manager` — 新对话默认模型与思考等级
3. `browser-review` — `/review`、`/annotate`、`/annotate-last` 的 localhost 浏览器逐行审阅与自动反馈
4. `chat-mode` — Build / Plan / Ask / Debug（`Shift+Tab`、可用 `/browser off` 关闭的 browser-first Plan 审批、`/debuglog`、`enter_plan_mode` / `exit_plan_mode`、`ask_user_choice`、`finish_debug_cleanup`）
5. `built-in-tool-style` — 可选 Grok 风格 Pi 内置工具时间线（`/grok-tools`）
6. `auto-format` — 每轮 Agent 结束后，使用项目本地 ESLint / Prettier 批量格式化本轮修改文件
7. `agent-todos` — 任务清单工具与 UI
8. `multi-task` — 独立文件任务的后台并行 worker 编排；所有 Batch 共享进程级固定 6 槽 FIFO 上限
9. `repo-search-subagent` — 只读 Repo Search 子 Agent
10. `subagent-console` — `/subagents`、`Alt+A` 与 `subagent_followup`；显示 queued/运行/idle 时间并按精确 ID 复用相关 Agent
11. `session-branch-guard` — 会话与 Git 分支绑定门禁（`/session-branch`），恢复会话时校验分支，dirty 时提供 stash/直接切换/rebind
12. `task-duration` — 在最终回复下方持久显示首次 `agent_start` 到最终 `agent_settled` 的任务耗时，不进入 LLM 上下文
13. `worktree` — `/new-worktree`、`/apply-worktree`、`/delete-worktree`，实现位于本入口的 `worktree/` 子目录
14. `startup-dashboard` — 启动面板与 Footer
15. `helps` — `/helps` 在浏览器打开 [my-pi-toolkit](https://github.com/xiaoming6969/my-pi-toolkit) 仓库页

除内置的 `worktree/` 外，其余实现仍在各自目录；本入口负责组合注册。新增或更新这些模块的终端 UI 时，必须遵循 [`docs/tui-development-guidelines.md`](../../docs/tui-development-guidelines.md)，并优先复用 `extensions/shared/tui/`。

`/debuglog` 进入 Debug 或重新打开实时日志面板（`/debug` 保留给 Pi 内置诊断日志）；Debug 保留完整工具，并由 `finish_debug_cleanup` 在移除临时插桩、验证修复后清日志、停 collector、返回 Build。`built-in-tool-style` 默认启用七个工具的 Grok 展示；使用 `/grok-tools native` 可关闭，`/grok-tools readonly` 可只保留只读工具。切换后会 reload 扩展。

`auto-format` 无需 toolkit 配置：项目本地安装 ESLint / Prettier 后，模块会在 `agent_settled` 时按 ESLint → Prettier 顺序处理主会话本轮成功 `edit` / `write` 的文件。详细边界见 [`../auto-format/README.md`](../auto-format/README.md)。

## 独立加载路径

子 Agent 禁止加载本入口。继续使用：

- `extensions/repo-search-subagent/gitignore-guard.ts` — Repo Search 子进程 `.gitignore` 门禁
- `extensions/multi-task/path-guard.ts` — Multi Task worker 写入路径门禁

`extensions/shared/subagent/` 仍为 repo search / console / tapd 共享库，并负责 managed RPC 的多 turn FIFO 与当前主会话生命周期。

## 独立扩展

- `tapd`、`context7` 仍在 `package.json` 的 `pi.extensions` 中单独注册。
