# Ponytail

懒惰高级工程师模式：写代码前走 YAGNI 决策梯子，优先复用、标准库和平台原生能力。

实际实现由 npm 依赖 `@dietrichgebert/ponytail` 提供。本目录只做加载入口，由 `ming-core` 注册，不复制上游源码，也不单独出现在启动面板扩展列表。安装 toolkit 后即可使用，无需在每个项目再执行 `pi install npm:@dietrichgebert/ponytail`。

## 命令

| 命令 | 说明 |
| --- | --- |
| `/ponytail [lite \| full \| ultra \| off]` | 设置强度；无参数时报告当前级别。默认 `full` |
| `/ponytail-review` | 审查当前 diff 中的过度设计 |
| `/ponytail-audit` | 扫描整个仓库的膨胀 |
| `/ponytail-debt` | 把推迟的捷径记入账本 |
| `/ponytail-gain` | 显示官方基准分数板 |
| `/ponytail-help` | 命令速查 |

也可用环境变量 `PONYTAIL_DEFAULT_MODE` 或 `~/.config/ponytail/config.json` 的 `defaultMode` 设置默认级别。

## Source

- 本地入口：`extensions/ponytail/index.ts`
- 实际实现：`node_modules/@dietrichgebert/ponytail/pi-extension/index.js`
- Skills：`node_modules/@dietrichgebert/ponytail/skills/`
- 版本：查看仓库根目录 `package.json`

上游文档：[ponytail.dev](https://ponytail.dev/) · [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)

## TUI 偏差

状态栏指示器（🐴 / 🌿 / ⚡ / 🔥）来自上游 `pi-extension`，未改写为 toolkit 共享视觉原语。行为与单独安装 ponytail 一致；不覆盖本 toolkit 的 Header / Footer。
