# Chat Mode

为 Pi 提供 `Build`、`Plan`、`Ask`、`Debug` 四种会话模式。新会话默认使用 Build；恢复会话或 `/reload` 时恢复当前分支最近保存的模式。

Plan Mode 对齐 [Grok Build](https://github.com/xai-org/grok-build) 的 `PlanModeTracker`、`enter_plan_mode` 和 `exit_plan_mode`：每个 session 固定一个 `plan.md`、进入时 seed 但不截断、重入继续同一方案、磁盘内容作为审批依据，并交替注入 full/sparse/reentry/exit reminder。Debug Mode 采用 Cursor 风格的“假设 → 插桩 → 复现 → 分析 → 修复 → 验证 → 清理”闭环，以 session 级运行时日志支持证据驱动定位。

## 切换

按 `Shift+Tab` 循环：

```text
BUILD → PLAN → ASK → DEBUG → BUILD
```

也可使用 `/plan` 进入 Plan，使用 `/plan review` 随时重新打开当前 session 已写入的方案；`/debuglog` 进入 Debug，已在 Debug 时则重新打开实时日志面板（`/debug` 是 Pi 内置诊断日志命令）。Agent 运行时不能通过快捷键或模式切换命令进入其他模式；但 `/plan review` 是只读浏览，可在 Agent 运行中打开，不会暂停 Agent、触发审批、切换模式或修改 Plan。模型在运行中仍可调用 Enter/Exit Plan 工具。Pi 无法可靠地为已发出的模型请求动态替换工具集合，因此没有照搬 Grok 的 mid-turn toggle。

## Build

默认模式，不限制工具和项目写入。每轮会明确向模型声明当前为 Build，避免历史 Ask / Plan 提示被误当成当前限制。输入框顶边线显示：

```text
─ BUILD ───────
```

## Plan

Plan 用于实施前的只读调研与方案审批：

- 只启用登记的只读工具、Plan 生命周期工具、`ask_user_choice` 和受路径保护的 `write` / `edit`。
- 遇到会实质影响方案的待确认决策时，Agent 在写 Plan 前调用 `ask_user_choice`：展示 2～5 个候选方案，可标记一个推荐项，最后固定提供“其他（自定义输入）”；已有代码证据可以确认的内容不重复询问。
- 用户取消选择时停止规划，不推测答案，也不进入 Plan 审批。
- `write` / `edit` 只能修改本 session 固定的 `plan.md`。
- 禁止修改项目源码或其他 session 的 Plan。
- 输入框顶边线显示主题 warning 色的 `─ PLAN ─`。

### 固定 Plan 文件

与 Grok 一样，每个 session 只有一个固定 Plan：

```text
<pi-session-dir>/<session-id>/plan.md
```

默认位置类似：

```text
~/.pi/agent/sessions/<encoded-cwd>/<session-id>/plan.md
```

- 进入 Plan Mode 时创建空文件，文件已存在则绝不截断。
- 同一 session 再次进入时继续读取和修改同一个文件。
- 不提供 Plan ID、Plan 列表、`/plan new` 或多 Plan artifact。
- 不同 session 通过不同目录隔离。
- Pi 运行期间删除持久会话（包括在 `/resume` 中删除）时，会同步删除该 session 的 `plan.md`、`debug.jsonl` 和 `debug-endpoint.json`；目录中无关文件仍会保留。
- `--no-session` 等内存会话没有 session 存储目录，Plan 临时放在系统临时目录的 `pi-plan-sessions/<session-id>/plan.md`。
- 旧 `.pi/plan.md` 与 `.pi/plans/**` 不再读取或写入，也不会自动删除。

预创建空文件是 Grok 的原始行为：用于提前确定唯一可写路径；只有写入内容后才形成实际方案正文。

### Enter / Exit 工具

| 工具 | 作用 |
| --- | --- |
| `enter_plan_mode` | 征得同意后进入 Plan，seed 并返回本 session 固定的 `plan.md` |
| `exit_plan_mode` | 从磁盘读取 Plan，以带背景色的 Markdown 对话框展示全文，再显示审批选项 |
| `ask_user_choice` | 在写 Plan 前确认关键决策；提供推荐选项和最后一项自定义输入 |

TUI 中 Plan 正文和审批选择分开显示：先在 Grok 风格的 `PLAN REVIEW` 单线边框 Markdown overlay 中展示完整方案，底部单独显示滚动和关闭提示；关闭后选择组件只显示操作。overlay 有固定视口，高度预算与 Pi 的 `maxHeight`/margin 对齐，不会撑高终端内容。regular 模式支持鼠标滚轮、↑/↓、PageUp/PageDown、Home/End；Pi 0.84 fullscreen 会先消费 wheel，Overlay 因此只提供键盘滚动，Footer 会隐藏无效的 wheel 提示。Enter/Esc 关闭。Plan Markdown 继承 `markdown.mermaid` 设置并启用 Pi 0.84 Unicode LaTeX；`/plan review` 与审批前的 Plan Review 均支持 Mermaid/LaTeX。`/plan review` 仅重新打开该 overlay，不触发审批或切换模式；即使 Agent 正在运行也可只读浏览当前已写入的 Plan。

审批选项：

- **批准并实现**：切 Build；下一次模型请求只注入一次实现 kickoff，并过滤历史 Plan reminder，模型应立即使用 `write` / `edit` 开始实现。扩展不会直接代替模型修改文件。
- **批准但暂不实现**：切 Build 并结束当前 agent loop，等待后续明确的实施指令。
- **继续编辑**：留在 Plan，继续修改同一个 `plan.md`。
- **取消计划**：切 Build 并结束当前 agent loop，不实施；Plan 文件仍保留供同 session 重入。
- 无 UI 模式默认“批准并实现”。

## Debug

Debug 用于通过运行时证据定位并修复问题：

- 与 Build 一样提供完整工具，不限制项目写入。
- 遵循 Cursor 风格的“提出可证伪假设 → 添加临时判别性插桩 → 用户复现 → 依据日志分析 → 最小修复 → 验证 → 移除插桩并清理”流程；不应在缺少证据时猜测修复。
- `/debuglog` 从其他模式进入 Debug；已在 Debug 时重新打开 `DEBUG LOGS` 实时 Overlay。
- 输入框顶边线显示主题 error 色的 `─ DEBUG ─`。

### Session 日志与采集端点

每个 session 的运行时日志固定为与 `plan.md` 同目录的：

```text
<pi-session-dir>/<session-id>/debug.jsonl
```

进入 Debug 后，collector 只监听 `127.0.0.1`（localhost）的随机端口，并生成带 256-bit 随机 secret token 路径的 HTTP 端点。它接受 `POST`，支持浏览器预检，并只向 localhost / loopback Origin 返回 CORS 许可；单次请求最多 64 KiB，collector 管理的日志总量最多 5 MiB。端点不绑定 LAN 地址，不能从局域网直接访问；secret URL 仍不应写入日志或对外泄露。

浏览器插桩可向该端点 POST 紧凑 JSON。若 CSP、自定义非 localhost Origin、容器或远程 runtime 无法访问宿主机 localhost，后端进程可直接向 session `debug.jsonl` 追加 JSONL，或由用户提供原生日志；不要为此搭建代理。

端口与 token 以权限受限的 `debug-endpoint.json` 保存在同一 session artifact 目录。普通模式切换不会停止 collector；`/reload`、session 切换或进程重启会先停止服务，恢复该 session 时再绑定原端口和 token，因此已有插桩 URL 继续有效。若原端口已被其他进程占用，collector 会明确启动失败而不会静默换地址。`finish_debug_cleanup` 会删除该元数据并使旧 URL 永久失效。

### DEBUG LOGS Overlay

Overlay 实时读取日志；Agent 完成插桩后会先用中文写入 `reproduction_steps` 结构化记录。面板把标题和每个编号步骤分别放在一个逻辑行，长步骤按终端宽度换行并显示完整内容，不使用省略号。每次 Agent 发布新一轮复现步骤时，collector 会先清除上一轮运行日志，只保留新的复现步骤。面板同时提供三个操作：

- **已复现**：仅在存在非空日志行时可用；关闭面板并向 Agent 发送分析请求，要求对照假设读取证据、定位根因、最小修复并验证。证据不足时应改进插桩并再次复现。
- **已解决**：要求 Agent 先移除本次调试加入的所有临时日志、端点引用和辅助代码，再执行最小相关验证并调用 `finish_debug_cleanup`。该工具清空日志、停止 collector，并返回 Build。
- **清除日志**：清除运行日志但保留最新复现步骤；不停止 collector、不切换模式。只有 `finish_debug_cleanup` 会清空包括复现步骤在内的全部日志。

↑/↓、PageUp/PageDown、Home/End 滚动日志，Tab / Shift+Tab 或 ←/→ 选择操作，Enter 执行，Esc 关闭。regular 模式支持鼠标滚轮；Pi 0.84 fullscreen 会先消费 wheel，因此仅支持键盘滚动。不承诺鼠标点击操作。Agent 运行时不能用 `/debuglog` 打开面板；每轮 Debug Agent settle 后会自动重开，供继续复现或确认已解决。

### Debug 命令 / 工具

| 命令 / 工具 | 作用 |
| --- | --- |
| `/debuglog` | 进入 Debug；已在 Debug 时重新打开实时日志面板 |
| `finish_debug_cleanup` | 在临时插桩已移除且修复已验证后，清日志、停 collector 并返回 Build |

## Lifecycle

用户进入时先进入 `pending`，下一次 agent prompt 注入 full/reentry reminder 后转为 `active`；模型通过工具进入时，工具结果本身是进入信号，直接 active。active 状态交替注入 full/sparse reminder。用户切换离开时下一轮注入一次 exit reminder；离开 Ask/Plan 等受限模式后，下一次 Build 请求会过滤历史 Plan reminder 并追加一次实现 kickoff，明确恢复完整工具权限，避免模型沿用历史受限状态拒绝执行。压缩后下一次恢复 full reminder。

生命周期通过 session custom entry 保存，并按当前 session branch 恢复。

TAPD 的 `/tapd analyze`、`/tapd design`、`/tapd collaboration` 会写入 `chat-mode-ensure-ask-for-docs` 标记；本扩展在下一次 `before_agent_start` 单次消费该标记，并在当前不是 Ask 时切到 Ask，以便写入项目 `.pi/docs/**`（Plan 仅允许 session `plan.md`，二者冲突）。即使该轮被取消或未产生助手回复，旧标记也不会在用户之后切到 Build 时再次生效。

## Ask

Ask 用于问答、解释、诊断和只读调研：

- 启用登记的只读工具、受路径保护的 `write` / `edit`，以及严格白名单约束的 Bash 查询。
- Bash 仅允许单条、无 shell 组合语法的查询命令：HTTP(S) GET/HEAD `curl`、stdout `defuddle parse`、只读 Git、GitHub `view`/`list`、npm/pnpm 包元数据查询。
- 禁止管道、重定向、命令串联、命令替换、变量展开、通配符、上传/请求写操作、输出文件、Git external diff/textconv、AST 替换及未登记命令；不在白名单中的 Bash 默认拒绝。
- `write` / `edit` 仍只能修改当前项目 `.pi/**`。
- 可调用 `enter_plan_mode` 升级到规划阶段（TAPD 文档工作流的 prompt 会明确禁止该调用）。
- 输入框顶边线显示主题 success 色的 `─ ASK ─`。

## 安全边界

Ask / Plan 限制的是模型通过 Pi 工具进行的文件修改，不是操作系统沙箱。Ask 的 Bash 白名单假设系统 `PATH` 中对应的 `curl`、`git` 等 CLI 本身可信；它不会阻止用户在其他终端修改文件，也无法限制恶意扩展或被替换的 CLI 直接调用系统 API。
