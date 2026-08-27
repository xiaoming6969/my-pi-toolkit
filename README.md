<div align="center">

# my-pi-toolkit

面向 [Pi](https://pi.dev/) coding-agent 的扩展包：会话模式、TAPD 工作流、Context7、主题与 Skills。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/xiaoming6969/my-pi-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaoming6969/my-pi-toolkit/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org/)
[![Pi](https://img.shields.io/badge/Pi-coding--agent-purple.svg)](https://pi.dev/)

安装后在任意项目启动 Pi 即可加载，无需按项目重复安装。

</div>

---

## Table of Contents

- [Features](#features)
- [Preview](#preview)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Components](#components)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Features

| 能力 | 说明 |
| --- | --- |
| 会话模式 | `Shift+Tab` 循环 Build → Plan → Ask → Debug；Plan 支持浏览器逐行批注与审批，Debug 以实时日志完成假设、插桩、复现、修复与清理闭环 |
| 浏览器审阅 | 内置 localhost Markdown 渲染预览/源码批注和 Git diff review；反馈自动交回 Agent，无第三方审阅依赖 |
| TAPD 工作流 | 待办 Overlay、需求分析 / 技术设计 / 协作评审及浏览器批阅、Bug 定位、子需求同步，以及关联分支 / 提交 / GitLab MR |
| Worktree 会话 | 创建独立 Git worktree，并让同一个 Pi 会话随代码切入、apply 回原目录和显式删除 |
| Context7 | 为 Agent 提供第三方库最新文档，减少对训练数据的依赖 |
| 会话与分支门禁 | 恢复会话时校验 Git 分支，降低跨分支误操作 |
| 自动格式化 | 每轮 Agent 结束后，使用项目本地 ESLint / Prettier 格式化本轮修改文件 |
| 可复用子 Agent | `/subagents` 与 `Alt+A` 查看 queued/运行/idle 时间并管理过程；相关任务可凭 `subagentId` 在同一上下文中继续执行 |
| 启动面板与主题 | M-PI Dashboard；Footer 兼容第三方扩展状态；推荐主题 `grok-build-dark` |

能力由三个扩展入口编排：`ming-core`、`tapd`、`context7`；Worktree 会话由 `ming-core` 加载。通用模块细节见 [`extensions/README.md`](extensions/README.md)。

## Preview

<div align="center">

**M-PI Dashboard** — 启动面板：Context / Skills / Extensions / Themes

<img src="assets/dashboard.png" alt="M-PI Dashboard" width="900" />

**TAPD 待办** — `/tapd` Overlay：需求与 Bug 列表、键盘导航

<img src="assets/tapd.png" alt="TAPD todo overlay" width="900" />

**主对话区** — BUILD 模式、任务耗时与 Footer 状态栏

<img src="assets/chat.png" alt="Chat session with BUILD mode" width="900" />

**Subagents** — `/subagents`：Repo Search / TAPD Review 等任务列表与可复用 turn

<img src="assets/subagents.png" alt="Subagents overlay" width="900" />

</div>

## Prerequisites

- Node.js `>= 22.19`
- 已安装 [Pi coding-agent](https://github.com/earendil-works/pi)（`pi` 可用）
- 调用 LLM 需通过 `/login` 配置 provider；外部 API（TAPD / Context7 / GitLab）按需配置，不影响扩展加载

## Install

### 从 npm（推荐）

```bash
pi install npm:@xiaoming6969/my-pi-toolkit
```

### 从源码

```bash
git clone https://github.com/xiaoming6969/my-pi-toolkit.git
cd my-pi-toolkit
npm install
pi install .
```

### 从 git

可钉分支 / commit：

```bash
pi install git:github.com/xiaoming6969/my-pi-toolkit@main
```

### 本地 packages 路径

在 `~/.pi/agent/settings.json` 中指向本地路径：

```json
{
  "packages": ["~/path/to/my-pi-toolkit"]
}
```

## Quick Start

```bash
cd /path/to/your-project
pi --no-session
```

首次启动若提示信任项目目录，选择 Trust。启动面板应列出三个扩展：`ming-core`、`tapd`、`context7`；Worktree 命令已集成在 `ming-core` 中。

| 操作 | 说明 |
| --- | --- |
| `Shift+Tab` | 循环 Build → Plan → Ask → Debug → Build |
| `/review [uncommitted\|branch]` | 在本地浏览器逐行审阅 Git 修改并把批注交给 Agent |
| `/annotate <path>` / `/annotate-last` | 批注项目 Markdown 或最近一条 Assistant 消息 |
| `/debuglog` | 进入 Debug；已在 Debug 时重新打开实时日志面板（`/debug` 为 Pi 内置诊断日志命令） |
| `/tapd` | 打开 TAPD 待办（需配置） |
| `/new-worktree` | 从已提交状态创建干净的 worktree。已有会话文件时切入同一会话；新开对话尚无会话文件时丢掉空对话、在工作夹开新会话。执行中显示 `new worktree...`。当前未提交改动留在原目录；TAPD 会话从 `origin/dev` 建分支且 `--no-track`，普通会话生成 `worktree/<timestamp>` |
| `/apply-worktree` | 应用：原项目切到 worktree 分支并迁回未提交改动，删除工作夹，会话切回原项目；原项目有未提交改动时拒绝。执行中显示 `apply worktree...` |
| `/delete-worktree` | 放弃：删除工作夹，原项目分支不变；会话在工作夹时可直接放弃；dirty 时二次确认后强制删除。执行中显示 `delete working...` |
| `/context7 <query>` | 查询第三方库文档 |
| `/subagents` | 查看、取消或终止子 Agent；列表与详情显示 queued、运行时长、idle 剩余时间及可复用 ID/turn |
| `/settings` | 切换主题等设置 |
| `/helps` | 打开 [my-pi-toolkit](https://github.com/xiaoming6969/my-pi-toolkit) 文档仓库 |
| `/reload` | 修改扩展后重新加载运行时 |

## Configuration

扩展本身可无凭证加载；下列配置仅在使用对应能力时需要：

| 能力 | 配置 |
| --- | --- |
| TAPD | `~/.pi/agent/tapd.json`（详见 [`extensions/tapd/README.md`](extensions/tapd/README.md)） |
| Context7 | `~/.pi/agent/context7.json` 或环境变量 `CONTEXT7_API_KEY` |
| GitLab（TAPD MR 等） | `tapd.json` 的 `gitlab.token` 或 `GITLAB_PERSONAL_ACCESS_TOKEN` |
| OpenAI 兼容模型自动发现 | `~/.pi/agent/models.json` 中省略 `models`（或 `[]`）；打开 `/model` 时刷新；详见 [`extensions/openai-compat-models/README.md`](extensions/openai-compat-models/README.md) |
| Agent 自动格式化 | 无 toolkit 配置；项目本地安装 `eslint` / `prettier` 并维护各自配置即可；详见 [`extensions/auto-format/README.md`](extensions/auto-format/README.md) |

## Components

### Extensions

| 扩展 | 简介 | 文档 |
| --- | --- | --- |
| ming-core | 通用能力编排：模型、浏览器审阅、Plan / Debug、自动格式化、可复用子 Agent、Worktree、Dashboard、Session Branch Guard 等 | [`extensions/ming-core/README.md`](extensions/ming-core/README.md) |
| TAPD | 待办、需求分析、选项确认式技术设计、协作评审、三文档预览、Bug 定位与子需求同步 | [`extensions/tapd/README.md`](extensions/tapd/README.md) |
| Context7 | 第三方库最新文档查询 | [`extensions/context7/README.md`](extensions/context7/README.md) |

完整模块列表见 [`extensions/README.md`](extensions/README.md)。各模块测试位于 `extensions/<module>/test/`。

### Themes

- `grok-build-dark`：推荐的 Grok Build 风格深色主题（消息、Markdown、工具状态与工作流配色）

通过 `/settings` 切换；不影响命令、快捷键或会话数据。

<details>
<summary><strong>Skills</strong></summary>

- [`skills/context7`](skills/context7/)：指导 Agent 查询第三方库最新文档
- [`.pi/skills/pi-package-bundler`](.pi/skills/pi-package-bundler/)：仅在本 toolkit 仓库内可用，将指定 Pi package 集成并随分发

给出 npm 包名、pi.dev 页面、npm 页面或 GitHub 链接即可触发 package bundler，也可执行 `/skill:pi-package-bundler`。

</details>

## Troubleshooting

<details>
<summary><strong>Git 安装后依赖缺失</strong></summary>

若 git 安装目录缺少依赖（例如 `pi install` 显示已安装但缺少 `marked`），在缓存目录强制重装：

```bash
cd ~/.pi/agent/git/github.com/xiaoming6969/my-pi-toolkit
rm -rf node_modules && npm install --omit=dev
```

或卸干净后重装：

```bash
pi remove git:github.com/xiaoming6969/my-pi-toolkit
rm -rf ~/.pi/agent/git/github.com/xiaoming6969/my-pi-toolkit
pi install git:github.com/xiaoming6969/my-pi-toolkit@main
```

</details>

## Development

修改扩展后，在 Pi 中执行 `/reload`。依赖变更后于仓库根目录执行 `npm install`。

```bash
npm test
npm run test:coverage
npm run coverage:report
```

每个模块的测试放在 `extensions/<module>/test/`，仓库级检查放在 `test/`。约定见 [`docs/testing.md`](docs/testing.md) 与 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

扩展入口与依赖版本统一维护在 [`package.json`](package.json)。

- [`AGENTS.md`](AGENTS.md)：仓库内 Agent / 扩展开发规范
- [`docs/tui-development-guidelines.md`](docs/tui-development-guidelines.md)：TUI、工具展示、Widget、Overlay、Footer 与 Theme 规范
- [`docs/tapd-api.md`](docs/tapd-api.md)：TAPD Open API 资料索引
- [`docs/testing.md`](docs/testing.md)：测试布局、分层、CI 与覆盖率

---

## License

MIT · 欢迎 [Issue](https://github.com/xiaoming6969/my-pi-toolkit/issues) 与 PR；较大行为或 API 变更请先开 Issue 讨论。
