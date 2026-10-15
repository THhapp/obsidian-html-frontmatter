# 开发脚本导航

以下命令从项目根目录执行。脚本用于构建、独立测试或只读调研，不随插件安装。

| 入口 | 用途 |
| --- | --- |
| `npm run build` | 类型检查并构建根目录 `main.js` |
| `npm run release` | 构建后运行 `package-release.ps1`，生成本地插件目录、ZIP 与校验文件 |
| `npm run test-vault` | 构建后运行 `setup-test-vault.mjs`，准备项目内合成测试库 |
| `launch-test-obsidian.ps1` | 启动使用独立应用配置的 Obsidian 测试实例 |
| `e2e/` | 基础、扩展、目录、重启及安装验证，共用 `cdp.mjs` 连接独立实例 |
| [research/](research/README.md) | 早期接口和图谱契约的只读调研工具 |

按改动选择必要检查，具体命令和前提见 [开发说明](../docs/development.md)。不要将测试脚本指向日常笔记库。

`tmp/` 中的本机发布辅助脚本、截图和调试记录不属于公共工具接口，不进入 Git；可复用脚本放入此目录时，应去除个人账户、凭据和本机路径依赖。
