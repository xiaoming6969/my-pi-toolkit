# 贡献指南

感谢对 [my-pi-toolkit](https://github.com/xiaoming6969/my-pi-toolkit) 的贡献。较大行为或 API 变更请先开 Issue 讨论。

## 环境

- Node.js `>= 22.19`
- 仓库根目录执行 `npm install`
- 本地加载：`pi install .`，改扩展后在 Pi 里 `/reload`

## 开发

- 源文件尽量不超过 300 行；优先按职责拆模块，而不是按行数硬切。
- 只导出实际被其他文件使用的符号。
- TUI 变更必须遵循 [`docs/tui-development-guidelines.md`](docs/tui-development-guidelines.md)，复用 `extensions/shared/tui/`。
- 行为变化时同步更新相关 README、`CHANGELOG.md` 和本仓库文档。

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

## Pull Request

- 使用默认 PR 模板中的测试清单。
- 不要把 `extensions/**/test/**` 打进 npm 包（`package.json` 的 `files` 已排除）。
- 提交信息说明做了什么、为什么做。
