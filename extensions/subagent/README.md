# Subagent

由 `ming-core` 注册的子 Agent 模块：通用 `spawn_subagent`、只读 `repo_search`、按精确 ID 续接的 `subagent_followup`，以及 `/subagents` / `Alt+A` 只读 Overlay。RPC 运行时仍在 [`../shared/subagent/`](../shared/subagent/)；TAPD Review 与 Multi Task 继续作为调用方，不并入本目录。

## `spawn_subagent` 与角色

`spawn_subagent` 把一个自包含任务委派给独立上下文窗口中的子 Agent。参数：

```json
{
  "prompt": "完整任务描述，包含相关文件路径与期望的报告格式",
  "description": "3-8 个词的短标签",
  "role": "explore",
  "cwd": "可选，默认主 Agent 当前目录",
  "background": false
}
```

### 后台运行与等待原语

`background: true` 时工具立即返回 `subagentId`，主 Agent 可以继续做其它独立工作；子 Agent 完成、失败或被取消后，扩展会向主会话排队一条 `subagent-complete` follow-up（与 `multi_task start` 相同机制），要求主 Agent 调用 `subagent_output` 读取报告。不要轮询。配套工具：

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `subagent_wait` | `subagentIds[]`（≤ 20）、`mode: wait_all \| wait_any`（默认 `wait_all`）、`timeoutMs`（默认 30000，最大 600000） | 阻塞直到全部 / 任一后台子 Agent 结束或超时，返回每个 ID 的状态；超时不报错 |
| `subagent_output` | `subagentId` | 已结束的后台任务返回报告（同样受 50 KB / 2000 行截断，可复用时附 `Reusable subagentId`）；运行中的任务或 live 可复用子 Agent 返回状态、最近工具调用与最新 assistant 文本 |
| `subagent_cancel` | `subagentId` | 取消排队 / 运行中的后台任务，或终止 live 可复用子 Agent；已结束时返回成功并说明状态 |

三者都只接受当前主会话创建的 ID。后台任务若使用 managed RPC，同样出现在 `/subagents` 与 `Alt+A` Overlay 中；主会话 shutdown / reload 会取消本会话所有排队和运行中的后台任务。

### 并发上限

所有启动路径（`spawn_subagent` 前台与后台、`repo_search`、`tapd_review`、Multi Task worker）共用 `shared/subagent/slot-semaphore.ts` 的进程级 6 槽 FIFO 信号量：超出时新任务保持 queued 等待，取消会移出等待队列。`subagent_followup` 续接已存在的子进程，不占用新槽位。

`role` 决定子 Agent 的 system prompt、能力模式与资源加载方式。内置角色：

| 角色 | 能力 | 资源 | 用途 |
| --- | --- | --- | --- |
| `explore`（默认） | `read-only` + pi-lens 只读工具 | lean，带 `.gitignore` 守卫，不读上下文文件 | 跨文件检索、调用关系与证据收集；即 `repo_search` 的角色 |
| `plan` | `read-only` | lean | 只读探索并返回结构化实现计划 |
| `implement` | `all`（父 Agent 工具快照） | inherit，加载父 Agent 的 extensions / skills | 执行一个独立实现任务并自检 |
| `review` | `execute`（只读工具 + `bash` 跑 `git diff/log/show`） | lean | 独立审查，按严重级别返回问题；不得让产出方自审 |

lean 角色以 `--no-extensions` 启动，只显式加载 `openai-compat-models`（自定义 provider）、选择 `cursor/*` 模型时的 `pi-cursor` provider，以及 `explore` 的 `.gitignore` 守卫与已启用的 pi-lens；inherit 角色加载父 Agent 的正常资源（可能包含 `ming-core`）。无论哪种模式，`repo_search`、`spawn_subagent`、`subagent_followup`、`subagent_wait` / `subagent_output` / `subagent_cancel`、`multi_task`、`tapd_review` 都不会下发给子进程，子进程还会带 `PI_SUBAGENT_CHILD=1`，因此子 Agent 不能再派生子 Agent（嵌套深度上限 1）。

模型优先级：角色定义的 `model` → `explore` 沿用 `repoSearch` 的项目 / 用户配置 → 主 Agent 当前模型。思考等级取角色 `thinkingLevel` 或主会话当前值，并只在目标模型支持 reasoning 时传递。首轮完成后可复用的子 Agent 会返回 `Reusable subagentId`，用 `subagent_followup` 续接。

### 自定义角色

用户级：`~/.pi/agent/ming-core.json` 的 `subagents.roles`。

```json
{
  "subagents": {
    "roles": {
      "tester": {
        "description": "运行测试并解释失败",
        "capability": "execute",
        "prompt": "You run the project's tests and explain failures with file and line evidence.",
        "model": "provider/model-id",
        "thinkingLevel": "low",
        "tools": ["lsp_diagnostics"]
      }
    }
  }
}
```

受信任项目：`.pi/agents/<name>.md`（从当前目录向上查找最近的 `.pi/agents/`），YAML frontmatter + Markdown 正文作为 system prompt：

```markdown
---
description: Project-specific reviewer
capability: read-only
model: provider/model-id
contextFiles: true
---
Review changes against docs/architecture.md ...
```

字段：`capability`（`read-only` / `read-write` / `execute` / `all`，默认 `read-only`）、`resources`（`lean` / `inherit`，`all` 默认 `inherit`）、`prompt` / `promptFile` / 正文、`model`、`thinkingLevel`、`tools`（追加到能力基础集的额外工具）、`repoSearchGuard`、`contextFiles`。角色名只允许小写字母、数字与连字符。优先级：受信任项目 `.pi/agents/*.md` > 用户 `subagents.roles` > 内置角色；同名可覆盖内置角色。未受信任项目的角色文件不会读取。配置非法时 `spawn_subagent` 明确报错，不会静默回退。

## 共享运行时入口

所有子 Agent 调用方（`spawn_subagent`、Repo Search、TAPD Review、TAPD 根因总结、Multi Task worker）都通过 `shared/subagent/run.ts` 的 `runSubagent()` 启动，不再各自拼装 CLI 参数或复制一次性子进程逻辑。角色定义与角色级启动（extension 路径、资源模式）在本模块的 `roles/`；`repo_search` 只是 `explore` 角色加 Repo Search 模型配置的薄封装。

- `capability.ts`：能力模式 → 精确 `--tools` 白名单。`read-only` = `read, grep, find, ls`；`read-write` 追加 `edit, write`；`execute` 追加 `bash`；`all` 使用调用方提供的父 Agent 工具快照。可用 `extraTools` 追加角色专属工具（如 Repo Search 的 pi-lens 只读工具）。所有会派生或操控子 Agent 的父进程控制工具在任何模式下都不会下发给子进程。
- `child-guard.ts`：所有启动路径为子进程设置 `PI_SUBAGENT_CHILD=1`；`spawn_subagent` / `subagent_followup` 等控制工具在子进程内直接拒绝执行。
- `slot-semaphore.ts`：进程级 6 槽 FIFO 启动信号量。
- `background.ts`：后台任务表（queued / running / completed / failed / cancelled）、`wait_any` / `wait_all` 等待与按会话取消；managed RPC 子进程仍由 `registry.ts` 记录。
- `run.ts`：按 `presentation` 分流到 managed RPC（`manual`）、Windows Terminal（`split` / `tab`），否则回退到 `json-runner.ts` 的一次性 `pi --mode json -p` 子进程。一次性子进程没有 `subagentId`，`reusable` 恒为 `false`。
- `pi-invocation.ts`：统一决定如何拉起子 Pi（复用父进程入口脚本、PATH 上的 `pi` 或已编译二进制）。
- `output-limit.ts`：统一 50 KB / 2000 行的返回文本截断；完整输出保留在工具 `details`。

各调用方只声明 `capability`、system prompt、扩展路径与任务文本；工具白名单、扩展隔离与 presentation 回退由共享层保证一致。

`repo_search` 专门探索当前本地代码库。主 Agent 判断本地仓库任务需要跨多个目录、多个文件或梳理分散调用关系时会自动调用；用户也可以通过 `/repo-search <检索任务>` 明确唤起。`multi_task` 的 `kind: "research"` 任务会直接复用同一个 runner，作为 Batch 内的平级只读 worker，而不是由通用 worker 再嵌套调用 `repo_search`。它不能联网，也不用于第三方库、外部 API、官方文档或 GitHub 项目调研；这类任务应优先使用 Context7 或可用的联网搜索工具。`@` 继续保留给文件引用，不作为子 Agent 前缀。

## 能力与安全边界

子 Agent 在独立的 Pi 进程和上下文窗口中运行。基础工具固定为 `read, grep, find, ls`。如果用户或受信任项目已启用并安装 `npm:pi-lens`，还会只读增强为：

```text
lens_diagnostics, lsp_diagnostics, symbol_search, project_report,
module_report, read_symbol, read_enclosing, ast_grep_search,
ast_grep_outline, ast_grep_dump
```

它不能使用 `bash`、`edit`、`write`、`ast_grep_replace`、`lsp_navigation`、`lens_diagnostic_mark` 或 `pi_lens_activate_tools`，也不能由工具调用方临时扩大权限、切换目录或覆盖模型。子进程始终保留 `--no-extensions` 隔离，只显式加载 `.gitignore` 访问守卫和已启用的 pi-lens 路径；通过 `--tools` 强制精确白名单，同时禁用 Skills、提示模板和上下文文件。pi-lens 未安装、未启用或解析失败时会静默降级到四个基础文件工具，不会自动安装或激活。

适合：

- 涉及至少约 5 个文件或多个目录的检索
- 全仓库定位分散实现
- 架构、入口、依赖关系和调用流侦察
- 收集带文件路径、行号的实现证据

不适合：

- 已知单个文件的读取
- 一个简单 `grep` 即可完成的精确查询
- 修改文件、运行测试或执行命令
- 第三方库发现、外部 API、官方文档、GitHub 项目或通用联网调研

## 模型配置

用户级配置：`~/.pi/agent/ming-core.json` 的 `repoSearch`。

```json
{
  "repoSearch": {
    "model": "anthropic/claude-haiku-4-5",
    "presentation": "manual"
  }
}
```

受信任项目可以覆盖用户配置：`.pi/ming-core.json` 的同名字段。

```json
{
  "repoSearch": {
    "model": "openai/gpt-5-mini",
    "presentation": "inline"
  }
}
```

优先级：

1. 受信任项目的 `.pi/ming-core.json`（同目录没有时回退 `.pi/repo-search-subagent.json`）
2. 用户级 `~/.pi/agent/ming-core.json` 的 `repoSearch`（旧的 `repo-search-subagent.json` 会在首次读取时导入并归档）
3. 当前主 Agent 模型

目标模型支持 reasoning 时，思考等级继承主会话当前的 `thinkingLevel`，并显示在工具卡 summary 与 Subagent Overlay Header 中；不支持 reasoning 的模型不会显示或传递思考等级。

未受信任项目的项目配置不会被读取。配置文件不是合法 JSON、`model` 为空或 Pi 无法解析/使用指定模型时，工具会明确失败，不会静默换用其他模型。

子进程禁用全部普通扩展，只显式加载本 toolkit 的 `extensions/subagent/repo-search/gitignore-guard.ts`、通过 Pi 的 `SettingsManager` + `DefaultPackageManager` 解析出的已启用 `npm:pi-lens` extension path，以及选择 `cursor/*` 模型时所需的 `npm:@rahularya01/pi-cursor` provider；不会加载其它普通扩展。守卫在每次文件工具调用前使用 `git check-ignore --no-index` 执行项目 `.gitignore` 规则，并同时检查工具参数中的 `path` 和 `paths[]`。最终可调用工具仍受上述精确白名单限定。若指定模型依赖其他未加载的自定义 provider 或凭据，工具会返回模型启动错误。

## 使用

通常无需手动操作：工具描述会指导主 Agent 在广泛检索时自动调用。

也可以通过 Slash Command 明确要求：

```text
/repo-search 查找所有权限校验入口，并梳理调用关系
```

命令会要求主 Agent 立即调用 `repo_search` 工具；检索进度和结果仍显示在原生工具框中。任务为空或主 Agent 正在执行时，命令会提示后退出。

工具参数只有一个：

```json
{
  "task": "查找所有权限校验入口，给出文件、行号和主要调用关系"
}
```

运行期间，主对话等待工具完成，并在工具区域流式显示最近的只读工具调用；按 `Ctrl+O` 可在运行期间查看全部已记录调用。所有路径是否允许访问由当前 Git 项目的 `.gitignore` 决定：被忽略的文件或目录会在工具执行前直接阻止；未被忽略的路径可以正常检索。非 Git 项目没有 `.gitignore` 守卫。按 Escape 会取消主任务并终止子进程。完成后，主 Agent只接收压缩后的检索报告；展开工具结果可以查看更完整的信息。

## 命令与键位

- `/subagents`：打开任务列表。默认显示当前主会话创建的任务，`Tab` 切换全部会话；live 项按实际状态显示 queued 数、当前 turn 运行时长或 Multi worker 的 2 分钟 idle 剩余时间。
- `Alt+A`：直接进入当前会话最近的活跃子 Agent；没有活跃任务时打开列表。
- 列表：`↑/↓` 选择，`Enter` 执行默认动作，`C` 请求取消，`X` 终止活跃任务，`D` 清理已退出记录，`Esc` 关闭。
- 详情：`←/→` 按列表排序循环切换上一个/下一个子 Agent。Header 左侧显示当前位置与标题，右侧显示状态与 queued/运行时长/idle 剩余时间；宽屏且该行仍有剩余列时再显示模型、可复用短 ID/turn 与 thinking，空间不足或窄屏时先隐藏这些元数据，不截断运行时长。`↑/↓`、`PageUp/PageDown`、`Home/End` 滚动，regular 模式还支持鼠标滚轮；Pi 0.84 fullscreen 会先消费 wheel，因此详情 Footer 会隐藏无效的 wheel 提示并保留完整键盘操作。`app.thinking.toggle`（默认 `Ctrl+T`）折叠/恢复 thinking，`app.tools.expand`（默认 `Ctrl+O`）展开工具结果，`Esc` 返回列表。Footer 会显示当前配置的实际键位。详情切换范围沿用打开时的 `CURRENT`/`ALL` 列表范围；`Alt+A` 打开的详情只在当前会话的活跃子 Agent 间切换。

## 复用相关 Agent

Repo Search、TAPD Review 和 Multi Task worker 的 managed RPC 首轮结果在可复用时会返回完整 `subagentId`。同一调查线程需要补查、修正结论、继续实现或换一个观察角度时，主 Agent 应调用 `subagent_followup` 并传入该精确 ID：

```json
{
  "subagentId": "首轮结果中的完整 ID",
  "task": "直接相关的后续任务"
}
```

`subagent_followup` 只接受当前主会话创建、仍存活且 `reusable: true` 的精确 ID；不会猜测最近 Agent，也不会在目标失效时静默新建。它保留原子 Agent 的上下文、cwd、模型、system prompt、extensions 和工具权限，不能借 follow-up 改变执行 profile。同一 ID 的多个请求按 FIFO 串行，每一轮分别返回自己的 output、tool calls 和递增 turn。新主题、需要不同模型/权限/cwd，或没有 reusable ID 时仍启动新的子 Agent；需要独立审查或复核已有结论时必须新建 reviewer，不能让产出实现或结论的同一 Agent 自我审查。

复用只在当前主会话进程内有效，不会跨切换、reload、退出或 Pi 重启恢复。`~/.pi/agent/ming-core.json` 里 `subagents.keepOpen: false` 会禁用复用；Multi Task worker 还会在 Batch 结束后的 2 分钟空闲期到期时自动回收。Repo Search 的 `inline`、`split`、`tab` 是一次性 backend；managed RPC/manual 才可续接。续接后仍保持完全相同的工具白名单、扩展隔离和（Repo Search 的）`.gitignore` guard。Overlay 继续保持只读，不提供输入框。

## 后台子 Agent 与只读 Overlay

默认使用 `presentation: "manual"`：子 Agent 在持久 RPC Session 中后台运行，不会自动抢占焦点或创建分屏。按 `Alt+A` 可在当前 TUI 上方打开居中的大尺寸只读 Overlay，以主 Agent 相同的消息、Markdown、思考块和工具组件查看最近子 Agent 的过程。首轮任务完成后报告仍会自动返回主 Agent；可复用 live Agent 的 Header 会显示短 ID 与 turn，完整 ID 在工具结果中。

如需原来的 Windows Terminal 行为，可显式设置 `presentation: "split"` 或 `"tab"`；`"auto"` 会在原生 Windows Terminal 中自动分屏，在其他环境回退到内联模式。

全局配置位于 `~/.pi/agent/ming-core.json` 的 `subagents`：

```json
{
  "subagents": {
    "presentation": "manual",
    "fallback": "inline",
    "keepOpen": true,
    "retainCompletedMinutes": 60,
    "windowsTerminal": {
      "size": 0.45,
      "shell": "pwsh.exe"
    }
  }
}
```

`presentation` 支持 `manual`、`auto`、`inline`、`split` 和 `tab`。`manual` 是默认值并提供最接近 OpenCode 的手动进入/退出体验；`inline` 使用一次性 JSON 子进程；`split` 和 `tab` 自动打开 Windows Terminal；`auto` 根据环境决定。Repo Search 的用户级或受信任项目配置可以覆盖全局值。所有模式都严格保留只读工具白名单、扩展隔离和 `.gitignore` 守卫。由 `multi_task` 调度时会固定走 RPC/manual 路径，把进度保留在同一张 Batch 工具卡片中；全局 `keepOpen` 决定是否提供 reusable handle，保活的 worker 会在 Batch 结束后按 Multi Task 的 2 分钟空闲期自动回收。此场景不采用 Repo Search 配置中的 split/tab 展示方式，但仍沿用项目/用户/当前模型的选择优先级。

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

## 输出限制

返回主 Agent 的文本最多约 50 KB 或 2000 行，超出部分会截断，以避免挤占主会话上下文。完整最终输出仍保存在工具结果的 `details` 中。
