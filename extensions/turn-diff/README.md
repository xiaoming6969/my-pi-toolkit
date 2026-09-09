# Turn Diff

每轮主会话 Agent 结束后，在最终回复下方留下本轮 `edit` / `write` 的文件摘要；用 `/turn-diff` 在浏览器中查看合并后的 unified diff。本模块由 [`ming-core`](../ming-core/README.md) 编排加载，复用 [browser-review](../browser-review/README.md) 的 localhost 代码审阅页。

## 展示

```text
本轮修改 3 个文件  +42 −18  · /turn-diff
```

摘要是不进入 LLM 上下文的 custom entry，恢复会话或 `/reload` 后仍可显示。`Ctrl+O` 展开只列出路径和 `+n −m`（或 `omitted`）；完整 diff 只在浏览器里。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/turn-diff` | 用最近一轮已保存的 patch 打开浏览器 diff 页 |

- 不自动打开浏览器；无改动的回合不写 entry。
- 「发送批注」把反馈交回当前 Agent（空闲立即发，忙碌时 follow-up）；关闭或取消不发消息。
- 浏览器打不开时只 notify，不回退 TUI Overlay。
- 本轮合计 patch 超过 5 MiB 时拒绝打开并提示缩小范围。

## 采集边界

- 从首次 `agent_start` 清空快照，到 `agent_settled` 再读磁盘。同一文件多次 `edit` / `write` 合并为「回合开始 → 回合结束」一份 diff，因此包含其后的 auto-format。
- 只跟踪主会话成功路径上的 `edit` / `write`；不含 `bash`、子 Agent、worktree，也不把 Git 工作区混进来（那是 `/review`）。
- 跳过项目外路径和 `node_modules`。单文件超过 256 KiB 或含空字节时只留占位。
- 仅交互式 TUI 记录。Print / JSON / RPC 以及瘦加载子 Agent 不写 entry。

## 已知限制

- Transcript 摘要行不能点击，入口是 `/turn-diff`。
- 不把本轮 diff 铺进终端，也不注册快捷键或 Footer status。
