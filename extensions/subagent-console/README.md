# Subagent Console

`subagent-console` 由 `ming-core` 注册，为 Repo Search、TAPD Review 和 Multi Task 等共享 RPC 子 Agent 提供统一管理、只读详情 Overlay，以及按精确 `subagentId` 续接相关任务的 `subagent_followup` 工具。

## 命令与键位

- `/subagents`：打开任务列表。默认显示当前主会话创建的任务，`Tab` 切换全部会话；live 项按实际状态显示 queued 数、当前 turn 运行时长或 Multi worker 的 2 分钟 idle 剩余时间。
- `Alt+A`：直接进入当前会话最近的活跃子 Agent；没有活跃任务时打开列表。
- 列表：`↑/↓` 选择，`Enter` 执行默认动作，`C` 请求取消，`X` 终止活跃任务，`D` 清理已退出记录，`Esc` 关闭。
- 详情：`←/→` 按列表排序循环切换上一个/下一个子 Agent。Header 左侧显示当前位置与标题，右侧显示状态与 queued/运行时长/idle 剩余时间；宽屏且该行仍有剩余列时再显示模型、可复用短 ID/turn 与 thinking，空间不足或窄屏时先隐藏这些元数据，不截断运行时长。`↑/↓`、`PageUp/PageDown`、`Home/End` 滚动，regular 模式还支持鼠标滚轮；Pi 0.84 fullscreen 会先消费 wheel，因此详情 Footer 会隐藏无效的 wheel 提示并保留完整键盘操作。`app.thinking.toggle`（默认 `Ctrl+T`）折叠/恢复 thinking，`app.tools.expand`（默认 `Ctrl+O`）展开工具结果，`Esc` 返回列表。Footer 会显示当前配置的实际键位。详情切换范围沿用打开时的 `CURRENT`/`ALL` 列表范围；`Alt+A` 打开的详情只在当前会话的活跃子 Agent 间切换。

## 复用相关 Agent

Repo Search、TAPD Review 和 Multi Task worker 的 managed RPC 首轮结果在可复用时会返回完整 `subagentId`。主 Agent 对同一调查或实现线程有后续任务时可调用：

```json
{
  "subagentId": "首轮结果中的完整 ID",
  "task": "直接相关的后续任务"
}
```

`subagent_followup` 只接受当前主会话创建、仍存活且 `reusable: true` 的精确 ID；不会猜测最近 Agent，也不会在目标失效时静默新建。它适合同一线程内补充证据、修正结论、继续实现或处理反馈，并保留原子 Agent 的上下文、cwd、模型、system prompt、extensions 和工具权限，不能借 follow-up 改变执行 profile。同一 ID 的多个请求按 FIFO 串行，每一轮分别返回自己的 output、tool calls 和递增 turn。需要独立审查或复核时必须启动新的 reviewer；不能让产出实现或结论的同一 Agent 自我审查。

复用不会跨当前主会话切换、reload、退出或 Pi 重启恢复。`~/.pi/agent/ming-core.json` 里 `subagents.keepOpen: false` 会禁用复用；Multi Task worker 还会在 Batch 结束后的 2 分钟空闲期到期时自动回收。Repo Search 的 `inline`、`split`、`tab` 是一次性 backend；managed RPC/manual 才可续接。Overlay 继续保持只读，不提供输入框。

## 实时与历史详情

live 任务直接订阅内存 registry，并复用 Pi 的 `UserMessageComponent`、`AssistantMessageComponent` 和 `ToolExecutionComponent`，显示跨 turn 的完整 user、assistant/thinking 与工具时间线。详情 Header 仅在目标模型支持 reasoning 时于模型名后显示启动时的思考等级（例如 `anthropic/claude-sonnet-4-5 · high`、`lumilegend/gpt-5.6-sol · max`）；非 reasoning 模型及旧 `launch.json` 没有该字段时省略。thinking 内容块在 Overlay 中默认折叠，可用 `app.thinking.toggle` 恢复显示；折叠不会从 transcript 删除内容。Subagent 的 live、history 和 fallback Markdown 都继承 `markdown.mermaid` 的 `off` / `final` / `streaming` 设置，并启用 Pi 0.84 内置的 terminal-friendly Unicode LaTeX；过宽、无效或不受支持的 Mermaid/LaTeX 会保留原始源码。

持久 RPC Session 同时兼容 Pi 0.83 的累计 `message_update.message` 与 Pi 0.84 的 `assistantMessageEvent` delta：流式阶段按 `message_start` 组装 text/thinking，`message_end` 仍作为最终权威消息。任务完成或退出后，控制台从运行目录的 `sessions/*.jsonl` 读取当前 session branch，重建全部消息与工具调用/结果，并继续使用同一组 Pi 组件渲染。因此 completed 历史不再只显示最后一条 assistant 输出，只有 `exited.json` 的任务也不会退化为无样式的 transcript 摘要。

built-in 工具 renderer 遵循 `~/.pi/agent/ming-core.json` 的 `builtinToolStyle`：默认 `grok` 时复用 `built-in-tool-style` 的 read/write/edit/bash/grep/find/ls 时间线；`native` 或部分工具配置会与主界面一致地回退原生 renderer。配置损坏时只回退原生，不阻止 Overlay 打开。

为兼容旧记录，如果 session 文件缺失、损坏或无法读取，详情会回退到 `result.json` 的最终 Markdown；仍无结果时再显示 `transcript.jsonl` 文本摘要或明确的空记录提示。

## TUI 与生命周期

Overlay 使用主题语义色和共享 `fitLine()`，宽度由终端响应式计算；固定 Header、Footer 与边框计入高度预算。键盘可完成全部操作；鼠标滚轮仅在 regular 模式作为增强，fullscreen 使用键盘滚动。

Capturing Overlay 可见期间始终拥有键盘优先级：若主对话同时弹出 `ask_user_choice` 等阻塞 UI，滚动、切换和快捷键仍由详情 Overlay 响应，按键不会提交或取消下方选项。第一次 `Esc` 只关闭详情并把焦点交回提问；之后的输入才会作用于提问。从 `/subagents` 进入详情时，此路径不会重新打开任务列表覆盖等待中的提问。

实时详情打开时订阅 run 更新并获取共享 mouse tracking；regular 模式由扩展按引用计数启停 SGR tracking，Pi 0.84 fullscreen 模式则复用宿主管理的 mouse mode。左右切换时会取消旧 run 订阅、按需加载新详情并订阅新的 live run，同时重置滚动和 auto-follow。组件关闭、异常销毁或 reload 时会幂等取消当前订阅并释放扩展持有的 tracking，且不会禁用 fullscreen 宿主的滚轮/选择。关闭 Overlay 不会终止子 Agent。根因总结等主动弹出的过程 Overlay 在任务完成或失败时自动关闭；`Esc` 会取消该次总结。

主会话 shutdown 会终止 active 与 idle reusable 子进程并释放 queued 请求、timer 和路径锁。managed RPC turn 不设固定运行时限，会持续到正常 settled、用户取消、主会话 shutdown/reload、子进程退出或强制 dispose。用户取消运行中的 follow-up 最多等待 5 秒；若未收到 settled 就终止该进程，queued 请求和路径锁也会随取消或清理释放。Overlay 的 1 秒显示刷新 timer、run 订阅和 mouse tracking 在 Esc、自动关闭、异常、dispose 或 reload 时幂等释放。运行记录默认位于系统临时目录的 `my-pi-toolkit-subagents/`，保留时间由 `~/.pi/agent/ming-core.json` 的 `subagents.retainCompletedMinutes` 控制。
