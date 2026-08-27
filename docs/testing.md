# 测试

本仓库是 Pi 扩展包，没有独立编译步骤。测试用 Node 内置 `node:test`，通过 `tsx` 加载 TypeScript（解析 `.js` → `.ts`，并支持构造函数参数属性）。运行时 Pi 仍用 jiti 加载扩展；两者都能跑同一套源码。

## 布局

每个扩展模块一个 `test/` 目录；仓库级检查放在根目录 `test/`。

```text
extensions/<module>/test/*.test.{ts,mjs,js}
test/*.test.mjs
```

| 位置 | 用途 |
| --- | --- |
| `extensions/chat-mode/test/` | 该模块的单元 / 集成测试 |
| `extensions/shared/test/` | 共享 TUI / RPC 测试；辅助文件如 `rpc-session-harness.ts` 也放这里 |
| `test/` | 包清单、入口文件是否存在等仓库级断言 |

不要把 `*.test.*` 和源码并排放。新增模块时同时建 `extensions/<新模块>/test/`。

`npm pack` 通过 `package.json` 的 `!extensions/**/test/**` 排除全部测试目录。

## 怎么跑

```bash
npm test
npm test -- extensions/tapd/test/parser.test.ts
npm test -- --test-name-pattern="Ask rejects"
npm run test:watch
npm run test:coverage
```

需要 Node `>= 22.19`。CI 在 Node 22 与 24 上跑同一套命令。

## 分层

1. **单元测试（默认）**  
   纯函数、策略、解析器、格式化：不启 Pi、不打外部 API。  
   例：Ask bash 白名单、TAPD `parseDevelopmentTasks`、模型映射、路径冲突。
2. **进程内集成测试**  
   用临时目录 / Fake child process 覆盖 Git worktree、RPC 会话、Debug HTTP。  
   不启动完整 Pi TUI，不调用 TAPD / GitLab / Context7 真接口。
3. **包完整性**  
   `test/package-integrity.test.mjs` 检查 `pi.extensions` 入口存在，且发包白名单排除 `test/`。CI 另跑 `npm pack --dry-run`。
4. **手工 TUI**  
   Overlay / Footer / 快捷键按 [`docs/tui-development-guidelines.md`](tui-development-guidelines.md) 人工核对。不把终端视觉回归塞进 `npm test`。

## 约定

- 从 `node:test` 导入 `test`，用 `node:assert/strict`。
- 相对导入指向模块源码，例如 `../policy.ts`、`../git/story-status.ts`。
- 只测已导出的公共 API；不要为了测试再导出实现细节。
- 外部服务用夹具或 `fetch` mock，不要在 CI 里打真实 TAPD / Context7 / GitLab。
- 异步测试必须 `await`；依赖 `setTimeout` 且生产代码 `unref()` 的路径，用 `t.mock.timers`（见 `extensions/shared/test/rpc-session.test.ts`）。
- 测试辅助放到该模块的 `test/`，不要命名成 `*.test.*`。

## 什么必须测

新增或修改以下内容时，在对应模块的 `test/` 里补断言：

- 模式 / 工具权限（Ask、Plan、Multi Task 路径）
- 解析与状态机（TAPD 子需求、Git 关键字、会话 binding）
- 纯格式化 / 映射（Context7 搜索结果、OpenAI 兼容模型、TUI 文本宽度）
- 会改 Git 工作区或会话文件的操作（用临时仓库）

不必测、并从覆盖率统计中排除：Pi 扩展 `index.ts` 注册样板、完整 TUI Overlay / Footer / 工具卡片渲染、Dashboard 安装发现、Working 动画、Markdown/Mermaid 预览、Pi `SessionManager` 拉起与会话目录扫描、RPC 子进程会话、fs.watch 清理、Debug HTTP 采集运行时、真实 LLM / 子 Agent 进程、系统浏览器、写 `~/.pi` 的 Windows Git 回退、以及只剩 Git CLI 错误码 / 体积上限等边沿的进程封装。排除清单在 `scripts/run-tests.mjs` 的 `coverageExcludes`。

## CI 与覆盖率

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 在 PR 和 `main` 上：

- `npm ci && npm test`（Node 24）
- `npm run test:coverage`（Node 22，打印覆盖率并写 `coverage/lcov.info`，**行 / 分支 / 函数均需 ≥ 95%**）
- `npm pack --dry-run`

发布工作流在 `npm publish` 前同样跑 `npm test`。

覆盖率只统计有必要单测的源码。`scripts/run-tests.mjs` 会排除：

- `index.ts` 扩展注册入口、`types.ts` / `*.d.ts`、demo `hello.ts`、`self-check.ts`
- 浏览器静态资源 `assets/`
- TUI Overlay / Footer / 工具卡片 / Working 动画 / Markdown 预览 / 问卷 Dialog 等交互层
- Dashboard 安装发现、会话 `fs.watch` 清理、Debug HTTP 采集运行时
- 拉起浏览器、Pi RPC 子进程、Windows Terminal、Review 子 Agent、会话目录扫描、写用户主目录的进程封装
- 主路径已有集成测试、剩余只是 Git CLI 错误码或体积上限的封装（如 `git-diff.ts`、`gitignore-guard.ts`）
- 靠 `import()` 查询串强制重载的模块单例（如 `batch-store.ts`），避免覆盖率把同一文件计两次

计入统计的公共逻辑（解析、策略、配置、HTTP mock、临时 Git 仓库、纯字符串渲染）应尽量保持在 95% 以上。新逻辑若属于应测范围，请在对应模块的 `test/` 里补断言；若确定不必单测，把文件加入 `coverageExcludes`，不要用空 import 灌覆盖率。
