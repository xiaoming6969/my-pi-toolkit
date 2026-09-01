---
name: herdr
description: 操作 Herdr 终端多路复用器。用户明确提到 Herdr，或要求用 Herdr 检查/控制 pane、tab、workspace、分屏、在 pane 里跑命令、调度其他 agent 时使用。不要仅因任务适合后台终端、委派或并行就加载。
---

# Herdr

Herdr 把终端组织成 workspace、tab 和 pane。操作指令随安装的二进制版本变化，本技能只负责拉取当前版本手册。

## 何时使用

- 用户明确提到 Herdr
- 要求用 Herdr 检查或控制 pane、tab、workspace
- 要求分屏、在 pane 里跑命令、读输出、等待输出
- 要求在 Herdr 里启动或协调其他 agent

不要仅因任务“适合后台终端 / 委派 / 并行”就使用本技能。

## 流程

1. 立刻执行 `herdr --skill`，把 stdout 当作本轮操作手册。
2. 完整遵守该输出（含 `HERDR_ENV=1` 检查）。检查失败则按输出说明停止，不要从 Herdr 外部控制会话。
3. 不要凭记忆或本文件发明 herdr 子命令。不要为了探索跑无参数的 `herdr`（会拉起或附着 TUI）。

## 失败

`herdr` 不在 PATH 或命令失败时，告知用户未安装或无法获取技能并停止。不要去 GitHub 抄一份过期副本当替代，也不要猜测 CLI。
