# Auto Format

在每轮 Agent 完全结束（`agent_settled`）后，批量格式化本轮通过 Pi `edit` / `write` 成功修改的项目文件。

## 行为

1. 收集并去重当前受信任项目内的修改路径；
2. 对 JS / TS 文件运行项目本地 ESLint `--fix`；
3. 再对全部候选文件运行项目本地 Prettier `--write --ignore-unknown`。

实现参考 Cursor `afterFileEdit` hook：从项目解析 `eslint` / `prettier` package 的真实 CLI 入口，并通过当前 Node 执行。因此不依赖全局 PATH、Windows `.cmd` 或 `npx`，也不会下载缺失的 formatter。ESLint 和 Prettier 自行读取项目配置与 ignore 文件。

无需 toolkit 配置。项目安装哪个 formatter 就运行哪个；两者均未安装时静默跳过。格式化期间，Pi 的 Working 行显示 `Formatting modified files...`，完成后恢复默认文案。

## 边界

- 只跟踪主 Pi 会话中成功的 `edit` / `write`；不监听 IDE、shell、文件 watcher 或后台子 Agent 的外部写入。
- 跳过项目外路径、`node_modules`、常见 lockfile 与 `.min.js` / `.min.css`。
- ESLint 仅接收 `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts`；Prettier 使用 `--ignore-unknown` 自行判断其他文件。
- ESLint 退出码 `1` 只表示仍有不可自动修复的 lint 问题；`--fix` 已正常执行，因此不误报为格式化失败。ESLint 配置/内部错误（退出码 `2`）或 Prettier 非零退出时才显示 warning。
- formatter 真正失败时仍 fail-open：不阻断会话、不回滚，也不自动重试旧文件；错误摘要会忽略 Browserslist 更新提示。
- `/reload`、切换会话或退出时清空尚未处理的路径；模块不持有 watcher、timer 或其他生命周期资源。
