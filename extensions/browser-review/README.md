# Browser Review

内置的本地浏览器审阅模块，不依赖第三方审阅 package。它使用 Node 标准库在 `127.0.0.1` 随机端口启动一次性页面，把逐行批注自动反馈给当前 Pi Agent。

## Commands

| 命令 | 作用 |
| --- | --- |
| `/review [uncommitted\|branch] [--base origin/dev]` | 审阅 Git diff；不指定 scope 时交互选择 |
| `/annotate <markdown-path>` | 批注当前可信项目内的 Markdown/MDX 文件 |
| `/annotate-last` | 批注当前 session 最近一条 Assistant 文本消息 |

`uncommitted` 包含 staged、unstaged 和 untracked；`branch` 使用 base 与 `HEAD` 的 merge-base，并叠加工作区修改。未跟踪二进制和超过 256 KiB 的单文件只显示占位；总 diff 超过 5 MiB 时要求缩小范围。

## Feedback loop

1. 浏览器中用每行的选择按钮确定起止范围。
2. 添加一条或多条评论。
3. “发送批注”把服务端重新提取的原文引用和评论组成 Markdown feedback。
4. Pi 空闲时立即启动下一轮；Agent 正在运行时排为 follow-up。
5. “取消”或关闭页面不发送消息。

Chat Mode 的 `exit_plan_mode` 还提供“批准并实现”：批准后仍由 Chat Mode 切换 Build 并触发一次 implementation kickoff；退回则保持 Plan。`/plan review` 只批注，不审批或切模式。TAPD 三类需求文档生成后也会使用同一页面，批注只要求修改目标文档。

`/tapd review` 不受影响：它继续负责需求/设计符合度、隐藏 Bug 和过度设计的 AI 子 Agent 审查；`/review` 负责人工逐行 diff 批注。

## Security and lifecycle

- 仅监听 loopback；每次 review 使用 256-bit 随机 URL token。
- 页面内容只按文本写入 DOM，不执行项目 Markdown/代码中的 HTML 或脚本。
- submit 有 128 KiB body 上限、100 条批注上限、行范围和评论长度校验；quote 始终由服务端源内容重建。
- `/annotate` 拒绝项目外路径、非 Markdown、目录和超过 2 MiB 的文件。
- submit、取消、AbortSignal、session switch、`/reload` 和 shutdown 都会关闭对应 server；不创建常驻进程或持久数据库。

## UI

宽屏使用内容区和批注侧栏，`<=760px` 降为上下单栏。每行选择器、评论框、删除、提交和取消均可键盘访问；diff 同时使用 `+`/`-` 文本和背景区分，不只依赖颜色。浏览器启动失败时 Chat Plan 和 TAPD 文档回退现有终端 Markdown overlay。

刻意未实现多人协作、远程分享、图片上传、富文本、云同步或第三方笔记软件集成；有真实需求时再扩展。
