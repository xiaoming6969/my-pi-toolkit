# Session Branch Guard

将会话与 Git 分支关联：第一条用户消息后记录当前分支；从其他对话 resume，或新终端打开旧会话时，若分支不一致则提醒，避免在错误分支上继续操作。

由 [`ming-core`](../ming-core/README.md) 注册加载。绑定保存在会话 custom entry（`session-branch-binding`）中，兼容旧会话里已有的同名记录。

## 行为

- 对话发出第一条用户消息后，记录仓库根与当前命名分支（slash 命令不会触发 `input`，扩展内部 `sendUserMessage` 也不写绑定）。detached HEAD 不绑定。
- 恢复会话时，若会话目录所在仓库不在绑定分支：
  1. **切换到会话分支** —— 普通 `git switch`，不用 `--force` / `reset` / `clean`。
  2. **继续** —— 不改 Git，把该会话重新绑定到当前分支。
- 同一会话里 Agent 或用户自己切分支当场不弹窗，也不拦截输入。
- `/reload`、`/new` 不检查。`pi -r` / `--session` 走 `session_start` 补偿。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/session-branch` | 查看会话 ID、仓库、绑定分支、当前分支与是否一致；不一致时再弹出上面的二选一 |

## 交互

使用 Pi 的 `ctx.ui.select`（不是 Overlay）。选项前缀复用共享 `›`。Esc 表示暂不处理：resume 路径取消进入目标会话；新终端已打开的会话保持原绑定。无 UI（print/json）只提示，不自动执行 Git 变更。

工作区 dirty 时仍尝试普通 `git switch`；失败则显示 Git 原文。resume 失败会取消进入，可清理后再试，或选「继续」改绑。

## 数据模型

```ts
interface SessionBranchBinding {
  version: 1;
  repoRoot: string;
  gitBranch: string;
  head?: string;
  gitCommonDir?: string;
  boundAt: string;
  source: "created" | "adopted" | "rebound";
}
```

读取 `getEntries()` 中最后一条合法记录。每次改绑追加新 entry。Pi 的 `getBranch()` 是对话树；本模块 Git 分支字段为 `gitBranch`。

同一仓库的 worktree 通过 `git-common-dir` 视为同一仓库，只比较分支。

## 已知限制

- 不拦截会话进行中的输入，也不在 Footer 显示持续 mismatch。
- TAPD / worktree 切分支后不自动改绑；下次 resume 若仍不一致会再提醒，选「继续」即可。
- 不自动 stash；切分支失败时工作区保持原样。
- 无 UI 环境不自动 `git switch`。
