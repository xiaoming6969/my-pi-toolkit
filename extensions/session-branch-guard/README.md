# Session Branch Guard

将会话与 Git 分支关联的安全门禁：恢复会话时校验当前分支，避免「会话 A 在分支 1 编辑，却在分支 2 打开」后继续错误操作。

由 `ming-core` 注册加载。绑定数据保存在会话自身的 custom entry（`session-branch-binding`）中，**不创建额外索引文件**。

## 行为

- 会话首次在 Git 仓库中使用时，记录仓库根与当前分支（新会话 `created`，历史会话首次升级 `adopted`）。
- 恢复会话 A 时，若**会话目录所在仓库**当前不在绑定分支：
  1. **切回会话分支** —— clean 直接 `git switch`；dirty 时先询问 stash / 直接尝试 / 取消；
  2. **留在当前分支继续** —— 二次确认后把 A 重新绑定（rebind）到当前分支；
  3. **取消** —— 保持当前会话与分支不变。
- 校验基于目标会话 header 中的 cwd（resume 后 Pi 会切到该目录），而不是切换前的工作区；因此从仓库 A 恢复属于仓库 B 的会话可以正常进入 B。仅当会话目录与绑定仓库不一致时才按跨仓库取消。
- 本轮 Agent 结束后若同仓库 symbolic 分支已变（例如 Agent 按用户要求 `git switch`），自动把绑定跟随到当前分支（`source=rebound`），不进入阻塞。TAPD `/tapd branch` 与 worktree 进入仍走同一套跟随/rebind。
- 会话空闲时外部切分支：Ask / Plan 只在 Footer 给出非阻塞 `branch mismatch` 提示，输入放行；切到 Build / Debug 或在 Build / Debug 下再输入时，才强制 `/session-branch resolve`。
- 跨仓库、detached HEAD、resume / `session_start` 补偿、dirty 工作区切换、无 UI（print/json）路径**不放宽**：仍硬拦截，且不自动执行 Git 变更。
- 硬阻塞（resume 未解决、跨仓、detached）在 Ask / Plan 下同样拦截。阻塞时 Footer 显示 error 色 `✗ branch mismatch`；Ask / Plan 提示态为 warning 色 `branch mismatch`（无 error glyph）。解除后立即清除。
- `pi --session` / `pi -r` / `-c` 等无法前置拦截的路径，在 `session_start` 补偿校验。

## 安全边界

- 切分支只用普通 `git switch`，绝不使用 `--force`、`reset --hard` 或清理文件。
- stash 使用 `git stash push --include-untracked`，包含 staged/unstaged/untracked；切换成功后**不自动 pop**，避免把其他分支的改动污染会话分支。恢复方式见下方提示（`git stash apply <ref>`）。
- stash 成功但 switch 失败时保留 stash 并停留在原分支，报告 ref 供手动恢复。
- 目标分支不存在、detached HEAD、跨仓库、Git 命令失败均安全降级：取消或阻塞，不猜测、不强制。
- 空闲时外部切分支不会自动 rebind；只有本会话 Agent 轮次内的同仓切分支会跟随。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/session-branch` / `/session-branch status` | 查看会话 ID、仓库、绑定分支、当前分支、工作区 dirty 摘要与状态（正常 / 提示中 / 已阻塞） |
| `/session-branch resolve` | 重新打开「切回 / rebind / 取消」解决流程（阻塞或提示解除） |
| `/session-branch rebind` | 二次确认后将当前仓库/分支写成新绑定；跨仓库或 detached HEAD 拒绝 |

## 数据模型

```ts
interface SessionBranchBinding {
  version: 1;
  repoRoot: string;   // realpath 规范化仓库根
  gitBranch: string;  // symbolic 分支名
  head?: string;      // 记录时 commit，仅诊断
  boundAt: string;
  source: "created" | "adopted" | "rebound";
}
```

- 读取 `getEntries()` 中最后一条合法记录（`/tree` 不影响），每次 rebind 追加新 entry，不修改历史。
- 注意区分：Pi 的 `getBranch()` 是对话树分支，本模块的 Git 分支字段命名为 `gitBranch`。

## 生命周期

| 事件 | 行为 |
| --- | --- |
| `session_start` | 无绑定则创建/adopt；有绑定则比较，不匹配走解决流程（硬门禁） |
| `session_before_switch` (`resume`) | 按**目标会话自身 cwd** 读取 Git 状态并与绑定比对（Pi 恢复后会进入该目录）；同仓库分支不匹配时拦截：可切回 / 写目标会话 rebind / 取消。不用切换前的当前目录做跨仓判断，避免跨项目会话误取消 |
| `agent_settled` | 同仓库 symbolic 分支已变则自动跟随绑定，并清除提示/阻塞 |
| `input` | Ask / Plan 下同仓分支漂移仅警告；Build / Debug 或硬阻塞 / 跨仓 / detached 返回 `handled` |
| 模式从 Ask/Plan 切到 Build/Debug | 若仍不匹配，立即打开 resolve |
| `session_shutdown` | 清理 `session-branch` footer status 与内存状态 |

## 已知限制

- 不自动创建/回收 Git worktree（后续可沿 Grok Build 模式扩展）。
- 不支持跨仓库 rebind；detached HEAD 不自动创建 binding。
- 多个 Pi 进程同时写入同一 session 无跨进程事务；不要同时恢复同一会话。
- 并发、锁与 stash 恢复依赖 Git 自身行为，模块不做跨进程强制解锁。
