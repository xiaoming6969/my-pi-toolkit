# 贡献指南

感谢对 [my-pi-toolkit](https://github.com/xiaoming6969/my-pi-toolkit) 的贡献。较大行为或 API 变更请先开 Issue 讨论。

## 环境

- Node.js `>= 22.19`
- 仓库根目录执行 `npm install`
- 本地加载：`pi install .`，改扩展后在 Pi 里 `/reload`。仓库 `package.json` 始终指向 TypeScript 入口，本地不必也不应编译 `dist/`。
- 发布：`npm pack` / `npm publish` 经 `prepack` 编译三个入口；不要把 `dist/` 提交进 git，也不要加 `prepare` / `postinstall` 编译。

## 开发

- 源文件尽量不超过 300 行；优先按职责拆模块，而不是按行数硬切。
- 只导出实际被其他文件使用的符号。
- TUI 变更必须遵循 [`docs/tui-development-guidelines.md`](docs/tui-development-guidelines.md)，复用 `extensions/shared/tui/`。
- 行为变化时同步更新相关 README 和本仓库文档。不要在功能 PR 里改 `package.json` 版本或手写 `CHANGELOG.md`（见下方「提交与发版」）。

## 测试

每个模块把测试放在自己的 `test/` 目录，不要和源码并排：

```text
extensions/<module>/test/*.test.ts
```

```bash
npm test
npm run test:coverage
npm run coverage:report
```

写测试的约定、分层和 CI 说明见 [`docs/testing.md`](docs/testing.md)。提交 PR 前 `npm test` 应通过；新增纯逻辑 / 策略 / 解析请补测试。PR 会自动跑测试并评论覆盖率报告；行 / 分支 / 函数任一低于 95% 时 `测试` 检查失败。请在仓库规则中将 `测试` 设为合入 `main` 的必填检查。

## 提交与发版

采用 [Conventional Commits](https://www.conventionalcommits.org/)。建议 Squash merge，**PR 标题**即合入 `main` 后的 changelog 条目：

```text
feat(subagent): 增加 spawn_subagent 后台等待与取消
fix(tapd): cursor 模型下 lean 子 Agent 加载 pi-cursor
```

`feat` → changelog「新增」、minor；`fix` →「修复」、patch；`perf` →「改进」、patch。`docs` / `test` / `chore` / `ci` / `refactor` 不进 changelog、不升版本。破坏性变更用 `BREAKING CHANGE:` footer 或 `feat!:`。

日常 PR 合入 `main` 只会更新（或创建）一条发版 PR，**不会**打 tag 或发布 npm。要发版时审阅该 PR 的 changelog（可直接改），再合入；Release Please 会打 `vX.Y.Z`、创建 GitHub Release，并在同一条 workflow 里 `npm publish`。仓库设置需打开 **Allow GitHub Actions to create and approve pull requests**。发版 PR 由 `GITHUB_TOKEN` 创建，不会单独跑 CI；它只改版本与 changelog，合入前人工看一眼即可。

## Pull Request

- 使用默认 PR 模板中的测试清单。
- PR 标题符合 conventional commit（Squash 合入后作为 changelog 条目）。
- 不要把 `extensions/**/test/**` 打进 npm 包（`package.json` 的 `files` 已排除）。
- `dist/` 只出现在 npm tarball 里；提交前确认工作区 `pi.extensions` 仍是三个 `.ts` 路径。
