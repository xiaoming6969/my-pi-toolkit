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

不必强求：Pi 扩展 `index.ts` 注册样板、完整 TUI 交互、真实 LLM 回合。

## CI 与覆盖率

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) 在 PR 和 `main` 上：

- `npm ci && npm test`（Node 24）
- `npm run test:coverage`（Node 22，打印覆盖率并写 `coverage/lcov.info`）
- `npm pack --dry-run`

发布工作流在 `npm publish` 前同样跑 `npm test`。

覆盖率用于观察缺口，当前不设全局百分比门禁。合并门禁是 **测试必须通过**；新逻辑应带测试。覆盖率地板以后再按稳定基线加上。
