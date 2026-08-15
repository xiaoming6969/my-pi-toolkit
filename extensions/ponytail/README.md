# Ponytail

懒惰高级工程师模式：写代码前走 YAGNI 决策梯子，优先复用、标准库和平台原生能力。

本 toolkit **不再 bundled** 该包。`pi install` 本 toolkit 时由 [`companion-packages`](../companion-packages/README.md) 自动执行：

```bash
pi install npm:@dietrichgebert/ponytail
```

Pi 把它当作独立 package 加载，启动面板 Extensions 列会显示 `ponytail`。更新：

```bash
pi update --extensions
```

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

上游文档：[ponytail.dev](https://ponytail.dev/) · [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)

## TUI 偏差

状态栏指示器（🐴 / 🌿 / ⚡ / 🔥）来自上游 `pi-extension`，未改写为 toolkit 共享视觉原语。
