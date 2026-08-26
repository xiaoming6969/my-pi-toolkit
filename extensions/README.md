# Extensions

本目录包含 `my-pi-toolkit` 加载的 Pi 扩展。

`package.json` 的 `pi.extensions` 现为 **3 个入口**：

| 扩展 | 说明 | 文档 |
| --- | --- | --- |
| ming-core | 通用能力编排（模型、会话壳、子 Agent、Dashboard 等） | [`ming-core/README.md`](ming-core/README.md) |
| TAPD | TAPD 待办、需求文档工作流、Bug 定位和子需求同步；待办 Overlay 与 Subagent 共用响应式单层 shell | [`tapd/README.md`](tapd/README.md) |
| Context7 | 第三方库最新文档查询工具 | [`context7/README.md`](context7/README.md) |

## ming-core 内能力模块

实现仍在下列目录；由 `ming-core` 统一注册，启动面板扩展列表只显示 `ming-core`（外加 tapd / context7）。

| 模块 | 说明 | 文档 |
| --- | --- | --- |
| Multi Task | 对独立、非重叠文件任务运行后台并行 worker；所有 Batch 共享进程级固定 6 槽 FIFO 上限，完成后可凭 worker `subagentId` 继续相关任务 | [`multi-task/README.md`](multi-task/README.md) |
| Repo Search Subagent | 面向当前本地仓库大规模文件检索的独立只读子 Agent；manual/RPC 模式支持上下文复用 | [`repo-search-subagent/README.md`](repo-search-subagent/README.md) |
| Subagent Console | 用 `/subagents` / `Alt+A` 查看 queued/运行/idle 时间并管理过程；`subagent_followup` 按精确 ID 串行复用当前主会话内的 managed RPC Agent | [`subagent-console/README.md`](subagent-console/README.md) |
| Session Branch Guard | 会话与 Git 分支绑定：恢复会话时校验分支，dirty 工作区提供 stash/直接切换/rebind，阻止跨分支误操作 | [`session-branch-guard/README.md`](session-branch-guard/README.md) |
| Worktree | `ming-core` 内置的 worktree 创建、应用和删除命令 | [`ming-core/worktree/`](ming-core/worktree/) |
| Agent Todos | Cursor TodoWrite 风格任务清单，editor 上方完整进度 | [`agent-todos/README.md`](agent-todos/README.md) |
| Browser Review | localhost 浏览器 Plan / Markdown / 最近答复批注和 Git diff review，提交后自动反馈 Agent | [`browser-review/README.md`](browser-review/README.md) |
| Chat Mode | 使用 `Shift+Tab` 循环 Build/Plan/Ask/Debug；Plan 提供默认浏览器、可用 `/browser off` 切回终端的 session `plan.md` 审批，Debug 提供完整工具、`/debuglog` 实时日志面板与 `finish_debug_cleanup` 清理闭环 | [`chat-mode/README.md`](chat-mode/README.md) |
| Built-in Tool Style | 通过官方 tool factory 为 Pi 七个内置工具提供可选 Grok 时间线；`/grok-tools` 配置 | [`built-in-tool-style/README.md`](built-in-tool-style/README.md) |
| Auto Format | 每轮 Agent 结束后，使用项目本地 ESLint / Prettier 格式化主会话本轮修改文件 | [`auto-format/README.md`](auto-format/README.md) |
| OpenAI Compat Models | 对 `models.json` 中未手写 `models` 的 OpenAI 兼容 provider 在 `/model` 时拉取 `/models` | [`openai-compat-models/README.md`](openai-compat-models/README.md) |
| Model Manager | 为新对话应用可配置的默认模型和思考等级 | [`model-manager/README.md`](model-manager/README.md) |
| M-PI Dashboard | M-PI 响应式启动面板、自定义 Header 与模型 Footer；兼容第三方扩展 `setStatus()` 状态 | [`startup-dashboard/README.md`](startup-dashboard/README.md) |
| Task Duration | 在最终回复下方持久显示本次 Agent 任务耗时，不进入 LLM 上下文 | [`task-duration/README.md`](task-duration/README.md) |
| Helps | `/helps` 打开 toolkit GitHub 仓库页 | [`helps/index.ts`](helps/index.ts) |
| Hello | 用于确认 toolkit 已加载的简单 smoke test（未注册） | `hello.ts` |

子 Agent 仍通过瘦路径单独加载 Repo Search 的 `gitignore-guard` 或 Multi Task 的 `path-guard`，不要改为加载 `ming-core`。

## TUI 视觉层

`shared/tui/visual-language.ts` 统一状态字符、模式 badge、间距与行宽处理；`overlay-shell.ts` 统一复杂 Overlay 的 Header/viewport/Footer、高度预算和边框；`tool-render.ts` 和 `tool-format.ts` 为 toolkit 工具提供运行/成功/失败时间线。`built-in-tool-style` 可选择性覆盖仍由 Pi builtin 提供的工具 definition；它不替换 Pi 内置主对话 renderer，也不承诺主对话区鼠标点击。

TUI 层兼容 Pi 0.84 的 `regular` 与 `fullscreen` renderer：扩展不清屏、不依赖 `pi-tui/dist/*`，Overlay 高度预算与 `maxHeight`/margin 对齐。Plan、Debug Logs 与 Subagent overlay 在 regular 模式按引用计数启停 SGR mouse tracking；regular 支持 wheel，Pi 0.84 fullscreen 会在 Overlay 前消费 wheel，因此只显示键盘滚动提示，且关闭时不会发送 disable 序列影响宿主。Overlay 不承诺鼠标点击。Browser Review 启动失败或通过命令关闭自动 Plan 浏览器审批时，Plan fallback Markdown 与 TAPD/Subagent live/history Markdown 继承 `markdown.mermaid` 设置，并使用 Pi 0.84 Unicode LaTeX。共享 RPC 子 Agent同时接受旧版累计 `message_update.message` 与 0.84 的 `assistantMessageEvent` delta，并以 `message_end` 覆盖最终消息；每个 follow-up 独立结算 output/tool calls，按 Agent FIFO 串行执行，并从 prompt 写入后应用固定 30 分钟硬超时。

`auto-format` 只使用 Pi notification 报告 formatter 失败，不注册 Widget、Overlay、Footer、快捷键或长期生命周期资源。

新增模块或更新任何 TUI 功能时，必须遵循 [`docs/tui-development-guidelines.md`](../docs/tui-development-guidelines.md)，包括共享视觉语义、响应式宽度、overlay 高度预算、输入与资源释放、工具 renderer、文档和验证清单。
