## 变更说明

<!-- 说明改了什么、为什么改。较大行为或 API 变更请先开 Issue。 -->

## 测试

- [ ] `npm test` 通过
- [ ] 新增或修改的纯逻辑 / 策略 / 解析已补充 `*.test.ts`（或 `.mjs` / `.js`）
- [ ] 行为变化时已更新相关 README / `docs/`（不要在本 PR 改版本号或手写 `CHANGELOG.md`）
- [ ] 标题符合 conventional commit（`feat` / `fix` / `perf` / `chore` / …，Squash 后作为 changelog 条目）
- [ ] CI 覆盖率报告：行 / 分支 / 函数均 ≥ 95%

## 检查

- [ ] 未引入循环依赖；源文件尽量不超过 300 行
- [ ] TUI 变更遵循 `docs/tui-development-guidelines.md`
- [ ] `git diff --check` 无空白错误
