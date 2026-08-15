# Companion packages

换电脑只装一次 toolkit。`pi install` 本 toolkit 时（git / npm 源会跑 `npm install`，从而触发 `postinstall`）自动执行未钉版本的：

```bash
pi install npm:@dietrichgebert/ponytail
pi install npm:pi-lens
```

本地路径 `pi install .` 不跑 npm 脚本；从源码安装时 `npm install` 的 postinstall 会装这两个包。若安装时跳过了脚本（例如 `ignore-scripts`），第一次 `session_start` 仍会补装。

它们作为独立 Pi package 加载，会出现在启动面板 Extensions 列。之后用官方命令更新，不必改 toolkit 版本：

```bash
pi update --extensions
```

## 行为

- 只写入用户级 `~/.pi/agent/settings.json`，不写业务项目 `.pi/settings.json`
- 已安装（含钉死版本）则跳过，不覆盖用户的 `npm:pkg@x.y.z`
- `PI_OFFLINE=1` / `--offline` 时不安装
- 安装失败（离线、Termux 上 pi-lens 原生模块等）不阻断 toolkit
- 嵌套在 `pi install git|npm:...` 里时，会等外层 Pi 进程退出再写入 settings，避免外层内存缓存覆盖刚装上的 companion
- `session_start` 上下文若提供 `reload()` 会自动重载；否则 notify 提示 `/reload`

## 与 bundled 的区别

这两个包不再进入 toolkit 的 `dependencies` / `bundledDependencies`。源码在 Pi 的 `~/.pi/agent/npm/`。

Multi Task worker 仍通过 [`../pi-lens/index.js`](../pi-lens/index.js) 从该目录软加载 Pi Lens；失败则跳过。
