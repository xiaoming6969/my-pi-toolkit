# Pi Lens

LSP、AST 搜索、诊断和代码分析。本 toolkit **不再 bundled** `pi-lens`。

第一次启动 Pi 时由 [`companion-packages`](../companion-packages/README.md) 自动执行：

```bash
pi install npm:pi-lens
```

Pi 把它当作独立 package 加载，启动面板 Extensions 列会显示 `pi-lens`。更新：

```bash
pi update --extensions
```

本目录的 `index.js` 仅供 Multi Task worker 从 `~/.pi/agent/npm/node_modules/pi-lens`（或项目 `.pi/npm/`）软加载。companion 未安装或 Termux 上原生 binary 失败时跳过，不阻断 worker。

具体工具和配置以当前安装版本的 `pi-lens` 文档为准。
