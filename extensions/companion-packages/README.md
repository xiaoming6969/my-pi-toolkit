# Companion packages

换电脑只装一次 toolkit。第一次启动 Pi 时，若用户 settings 里还没有这两个包，会自动执行未钉版本的：

```bash
pi install npm:@dietrichgebert/ponytail
pi install npm:pi-lens
```

它们作为独立 Pi package 加载，会出现在启动面板 Extensions 列。之后用官方命令更新，不必改 toolkit 版本：

```bash
pi update --extensions
```

## 行为

- 只写入用户级 `~/.pi/agent/settings.json`，不写业务项目 `.pi/settings.json`
- 已安装（含钉死版本）则跳过，不覆盖用户的 `npm:pkg@x.y.z`
- `PI_OFFLINE=1` / `--offline` 时不安装
- 安装失败（离线、Termux 上 pi-lens 原生模块等）不阻断 toolkit
- `session_start` 上下文若提供 `reload()` 会自动重载；否则 notify 提示 `/reload`

## 与 bundled 的区别

这两个包不再进入 toolkit 的 `dependencies` / `bundledDependencies`。源码在 Pi 的 `~/.pi/agent/npm/`。

Multi Task worker 仍通过 [`../pi-lens/index.js`](../pi-lens/index.js) 从该目录软加载 Pi Lens；失败则跳过。
