# Multi Task

`multi_task` 是多任务编排工具。默认的 `run` 模式保持当前工具调用打开，并在同一张工具卡片中显示聚合进度；主 Agent 不需要轮询。一个 Batch 可以平级混合两类 worker：默认的 `implementation` worker 负责受限路径内的实现，`research` worker 直接复用只读 Repo Search 子 Agent。`research` 不会先启动通用 worker，因此不会形成嵌套子 Agent。`start` 保留为高级后台模式，适用于主 Agent 已经有其它不依赖 worker 结果的工作。所有任务都必须彼此独立。

## 工作流

工具提供五个 action：

1. `run`：启动批次并等待全部 worker 结束；通过 `onUpdate` 在当前工具卡片中显示 queued/running/完成进度，最终一次性返回所有报告
2. `start`：创建后台批次并立即返回 `batchId`；完成后自动发送 follow-up，**不要主动轮询**
3. `status`：按需查看批次和各 worker 状态，包含最近工具调用摘要
4. `collect`：收集后台批次的最终报告或错误
5. `cancel`：取消正在运行和排队的 worker

`run` 不需要再调用 `collect`，也不会发送重复完成 follow-up。`start` 完成后，扩展会向主 Agent 排队一条 follow-up，要求调用 `collect`、整合结果并执行项目级验证。所有模式的运行过程也会出现在 `/subagents` 和 `Alt+A` 子 Agent 控制台中；worker 完成或退出后，历史详情仍会按主界面样式显示完整消息、可折叠思考块和工具时间线，并遵循当前 `/grok-tools` 配置。

## 默认实时模式

```json
{
  "action": "run",
  "tasks": [
    {
      "id": "auth-flow-research",
      "kind": "research",
      "task": "梳理认证入口、错误映射和主要调用关系，给出文件与行号证据",
      "paths": ["src/auth", "src/api"]
    },
    {
      "id": "logger-fields",
      "kind": "implementation",
      "task": "补充结构化日志字段",
      "paths": ["src/logger.ts"]
    }
  ],
  "maxConcurrency": 2
}
```

`run` 会在一张工具卡片中显示每个 worker 的类型、状态和最近工具调用，完成后直接返回报告。`kind` 可省略，默认是 `implementation`，因此旧调用保持兼容。只有纯只读、跨多文件或目录的探索任务才应使用 `research`；如果任务最终需要修改文件，即使前置步骤需要搜索，也应使用 `implementation`。

## 后台模式

```json
{
  "action": "start",
  "tasks": [
    {
      "id": "auth-errors",
      "task": "完善认证错误映射并保持现有公共 API",
      "paths": ["src/auth/errors.ts"]
    }
  ]
}
```

`start` 立即返回 `batchId`。不要循环调用 `status`；继续做其它独立工作，等待完成 follow-up 后再调用：

```json
{ "action": "status", "batchId": "..." }
{ "action": "collect", "batchId": "..." }
{ "action": "cancel", "batchId": "..." }
```

`status` 适合用户明确要求查看或排错，不是后台进度通知机制。`model` 可选，控制 implementation worker，默认继承主 Agent 当前模型。目标 worker 模型支持 reasoning 时，思考等级继承主会话并显示在聚合卡片与 Subagent Overlay Header 中；不支持 reasoning 时不会显示或传递思考等级。research worker 沿用 Repo Search 的模型优先级：受信任项目配置、用户配置、当前主 Agent 模型。Batch 内 research 强制使用 managed RPC/manual 执行并在聚合卡片中更新，不采用 Repo Search 的 split/tab 展示配置。单批最多 8 个任务，并发数范围为 1–6，默认 3；两类 worker 共用 Batch 上限。所有 Batch 还共享当前 Pi 进程内固定 6 槽的 FIFO worker semaphore，因此多个 Batch 不会叠加突破 6 个 running worker；各 Batch 的较低 `maxConcurrency` 继续生效。

## 复用已完成 worker

全局 `~/.pi/agent/subagents.json` 保持默认 `keepOpen: true` 时，`run` / `collect` 会为成功完成的 research 与 implementation worker 返回完整 `subagentId`。主 Agent 对同一 worker 有直接相关的后续任务时，可使用 `subagent_followup`；原进程、上下文、模型、工具快照和 scope 均保持不变，同一 ID 的请求按 FIFO 串行。Batch 结束后，每个 reusable worker 有 2 分钟空闲期；运行 follow-up 时暂停计时，完成后重新计时并自动回收。

implementation follow-up 发出 prompt 前会重新占用原 `paths`，与运行中 Batch、其他 implementation follow-up 以及主 Agent 的 `edit` / `write` 互斥；结束、失败、取消或子进程退出后释放。子进程内原有 `path-guard.ts` 继续阻止 `edit` / `write` 扩大范围，follow-up 参数也不能提供新 paths。`bash` 和其他扩展工具的副作用仍不受这个门禁可靠覆盖，安全限制与首轮 worker 相同。research follow-up 不取得写锁并保持只读；它只登记允许 research/research 重叠的读占用，用于阻止新的重叠 implementation Batch。

`keepOpen: false` 会恢复一次性 worker，不返回 reusable handle。managed RPC turn 不设固定运行时限，会持续到正常 settled、用户取消、主会话 shutdown/reload、子进程退出或强制 dispose；用户取消后最多等待 5 秒 settled，之后终止子进程。复用仅限当前主会话进程和上述空闲期；worker 被终止、reload、切换会话、退出或手动终止后必须启动新 worker。

## 调度边界

适合：

- 修改互不相交文件的独立 implementation 任务
- 跨多个文件或目录、只需证据报告的独立 research 任务
- 同一 Batch 中平级混合互不依赖的实现与检索
- 主 Agent 同时还有其他不依赖 worker 结果的工作
- 每个任务都有明确目标和路径范围

不适合：

- 多个 implementation 任务修改相同文件或父子目录
- research 范围与并发 implementation 写入范围重叠
- 后一个任务依赖前一个任务
- 尚未完成架构决策的重构
- 需要共同修改公共类型、锁文件或中央导出文件

`start` 会规范化路径并拒绝：

- 空任务、重复任务 ID 或无效 `kind`
- 当前项目之外的路径
- implementation/implementation 或 implementation/research 之间相同、父子包含或目录重叠的路径

research/research 可以重叠，因为两者都是只读；research 的 `paths` 是检索 scope，implementation 的 `paths` 是授权写入范围。跨运行中 Batch 也应用相同冲突规则，避免 research 在并发写入中读取不一致状态。路径会解析到最近存在的真实父目录，因此不能借助符号链接或尚未创建的子目录逃出项目边界。主 Agent 在批次运行期间不能通过 `edit` 或 `write` 修改 implementation worker 已锁定的路径；research 不持有写锁。

## Worker 安全边界

每个 worker 使用独立 RPC 子进程、会话和上下文，但按类型采用不同权限：

```text
implementation: 主 Agent 当前启用的工具（repo_search 除外）
research:       read, grep, find, ls（可选启用受限 pi-lens 只读工具）
```

implementation worker 会继承主 Agent 启动时可发现的 extensions、skills、prompt templates，并使用创建 Batch 时的活跃工具快照；`repo_search` 与父进程控制工具 `subagent_followup` 始终从 allowlist 排除。它另外加载 `path-guard.ts`，在每次 `edit`、`write` 前规范化目标并阻止声明范围外的写入。正常资源加载可能包含 `ming-core`，这是为继承主 Agent 能力而对默认子 Agent 瘦加载规则作出的明确例外。

`paths` 强制门禁只覆盖 `edit` 和 `write`。如果继承的工具包含 `bash` 或其他可产生文件副作用的扩展工具，这些副作用无法由当前路径守卫可靠识别；worker prompt 仍要求只修改声明路径，但这不是 OS 级沙箱。只应把 implementation 任务派给受信任模型，并避免在不信任项目中开放高风险工具。

research worker 由 Batch manager 直接调用 Repo Search runner，与 implementation worker 平级；它保持 `--no-extensions` 隔离，只加载 `.gitignore` guard，以及 Pi 设置中已启用且已安装的 `npm:pi-lens` extension path。pi-lens 仅开放 `lens_diagnostics`、`lsp_diagnostics`、`symbol_search`、`project_report`、`module_report`、`read_symbol`、`read_enclosing`、`ast_grep_search`、`ast_grep_outline`、`ast_grep_dump`；未安装时降级到 `read/grep/find/ls`。research 不能使用 shell、写工具、pi-lens 替换/导航/标记/激活工具，也不能调用另一个 `repo_search`。任务声明的 `paths` 会写入搜索请求作为范围，报告应包含文件、行号和调用关系证据。

这是共享工作区模式，不是 Git worktree 隔离。路径锁可以避免已声明范围之间的竞争，但主 Agent 仍应只并行派发真正独立的任务，并在收集后检查整体 diff、运行诊断与测试。

## 生命周期

- `run` 等待 worker 完成；进度只在当前工具调用仍运行时通过 partial result 更新，不产生 Agent 轮询。
- `start` 不等待 worker 完成，因此不会阻塞主 Agent 后续工作；完成 follow-up 是后台模式的通知渠道。
- 单 Batch 默认最多同时运行 3 个 worker；所有 Batch 进程级固定最多运行 6 个，等待者按 acquire 到达顺序 FIFO，且仍保持 `queued`。
- worker 成功、失败或取消都会在实际结束后释放全局槽；取消 Batch 或 session shutdown 会移除尚未运行的 waiter，并中止运行者后释放其槽。
- 单个 worker 失败不会取消其他独立 worker；批次最终状态为 `failed`。
- 主会话关闭、切换或 reload 时，该会话启动的运行中批次会被取消，已完成但保留的 reusable worker 也会终止。
- `run` 和 `collect` 返回主 Agent 的文本最多 50 KB 或 2000 行；完整 worker 输出仍保存在工具 `details` 中。
- 进度卡片只聚合每个 worker 最近最多 8 个工具调用，避免多 worker 并发时撑爆终端或上下文。
- worker 正常结束但没有返回文本时会标记失败，不会让批次永久停留在运行中。
- 批次记录和 reusable handle 都保存在当前 Pi 进程内；重启 Pi 后不能再通过旧 `batchId` 收集或续接，但子 Agent transcript 仍由共享运行目录和控制台管理。

## 选择建议

- 默认使用 `run`：需要当前任务结果，想让工具卡片持续显示进度。
- 使用 `start`：主 Agent 能继续处理完全独立的工作，并愿意等待完成 follow-up。
- 不要用 `status` 轮询模拟实时进度；Pi 工具在 `execute()` 返回后不能再更新原工具卡片。
