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

1. Markdown 默认显示渲染预览；点击标题、段落、列表、表格、引用或代码块即可选择对应源行，也可切到“源码”精确选择起止行。Git diff 保持逐行视图。
2. 添加一条或多条评论；预览/源码切换不会丢失当前选择和已有批注。
3. “发送批注”把服务端重新提取的原文引用和评论组成 Markdown feedback。
4. Pi 空闲时立即启动下一轮；Agent 正在运行时排为 follow-up。
5. “取消”或关闭页面不发送消息。

Chat Mode 的 `exit_plan_mode` 还提供“批准并实现”：批准后仍由 Chat Mode 切换 Build 并触发一次 implementation kickoff；退回则保持 Plan。`/plan review` 只批注，不审批或切模式。TAPD 三类需求文档生成后也会使用同一页面，批注只要求修改目标文档。

`/tapd review` 不受影响：它继续负责需求/设计符合度、隐藏 Bug 和过度设计的 AI 子 Agent 审查；`/review` 负责人工逐行 diff 批注。

## Security and lifecycle

- 仅监听 loopback；每次 review 使用 256-bit 随机 URL token。
- Markdown 使用 `marked` 在服务端渲染 GFM；`mermaid` fenced code 由 `beautiful-mermaid` 生成主题化响应式 SVG，无法解析时回退源码。SVG 编码为本地 data image，移除外部字体导入；普通 Markdown 图片仍只显示占位，链接限制为 HTTP(S)、mailto 和锚点。浏览器再按标签/属性 allowlist 构造 DOM，CSP 仅允许本页资源和 data image。
- submit 有 128 KiB body 上限、100 条批注上限、行范围和评论长度校验；quote 始终由服务端源内容重建。
- `/annotate` 拒绝项目外路径、非 Markdown、目录和超过 2 MiB 的文件。
- submit、取消、AbortSignal、session switch、`/reload` 和 shutdown 都会关闭对应 server；不创建常驻进程或持久数据库。

## UI

页面沿用 `grok-build-dark` 的蓝色强调、深蓝灰分层面板、语义化 diff 色和卡片层级。Plan、TAPD 文档、`/annotate` 与 `/annotate-last` 默认使用带标题、列表、表格、引用、代码块和 Mermaid 图的 Markdown 预览，并可切回源码；`/review` 仍是 diff 视图。宽屏使用内容区和批注侧栏，`<=760px` 降为上下单栏。预览块、源码行、评论框、删除、提交和取消均可键盘访问。浏览器启动失败时 Chat Plan 和 TAPD 文档回退现有终端 Markdown overlay。

刻意未实现多人协作、远程分享、图片上传、富文本、云同步或第三方笔记软件集成；有真实需求时再扩展。
