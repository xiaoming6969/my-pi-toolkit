# Subagent Policy

在主会话系统提示中注入 pi-subagents 的使用约定。由 [`ming-core`](../ming-core/README.md) 加载。

未安装 `npm:pi-subagents`、或当前模式没有激活 `subagent` 工具时不注入。

## 行为

每轮 `before_agent_start` 检查 `getActiveTools()`。若包含 `subagent`，追加何时使用 `scout` / `reviewer` / `worker` / `researcher` / `oracle` 的规则：

- 影响面/调用链问题、未读过的模块、规划前摸底、预计 3 次以上 grep/read 时，必须先委派 `scout`；仅目标文件已明确或本会话已读过时才自己查。用户给出符号名不算路径已知。
- 仓库级提示（项目 `AGENTS.md`）只补充必读文档，不解除委派要求。
- 非平凡改动完成后用 `reviewer` 独立审核，返回后默认只总结。
- 第三方库文档走 Context7，不用 scout / researcher 代替。

不注册命令、工具或 TUI。模型与思考等级仍写在 Pi settings 的 `subagents.agentOverrides`。
