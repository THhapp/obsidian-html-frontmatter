# 开发与打包

插件运行时代码使用 TypeScript，esbuild 输出宿主加载的 CommonJS `main.js`；`obsidian` 由宿主提供。安装成品不需要 Node.js。

## 常用命令

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run release
```

`build` 包含类型检查；`release` 构建并生成插件目录、ZIP、SHA-256 和依赖许可说明。`package.json` 与 `manifest.json` 的版本需要一致。不随发布包分发开发工具、测试状态或 Obsidian 程序文件。

## 独立开发实例

```powershell
npm run test-vault
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-test-obsidian.ps1
```

脚本通过 PATH 或常见安装位置寻找 Obsidian，也可传入 `-ObsidianExe '<你的安装位置>'`。当前验证环境需要本机缓存的 `obsidian-1.14.4.asar`。独立应用配置位于项目内 `tmp/obsidian-profile`，只登记 `test-vault`；首次启动时确认这个合成测试库的信任提示。

调试端口仅用于独立开发实例，默认 `127.0.0.1:19327`，不属于发布插件。端口已占用时启动脚本会拒绝重复启动。重新构建测试插件后，在测试实例中重新启用插件或重启实例。

## 必要检查

按改动选择已有检查，不要求每次全量运行：

| 命令 | 适用改动 |
| --- | --- |
| `npm test` | HTML 元数据存储、冲突处理或目录兼容层 |
| `npm run test:live` | 单文件面板的加载、编辑、保存、停用 |
| `npm run test:extended` | 属性类型、输入和文件切换 |
| `npm run test:catalog` | 全库目录、计数、候选值与全局操作保护 |

真实界面脚本会核对独立库路径，并重置各自的合成样例。只修改文档或目录布局时，检查链接与引用即可；调整构建或打包时，再构建并检查安装包，必要时做一次属性保存检查。具体证据与重启命令见 [验证记录](prototype-verification.md)。

从 ZIP 安装到独立测试库并重启该实例后，可运行 `node --experimental-strip-types scripts/e2e/install-smoke.mjs` 检查版本、安装文件一致性和一次原生属性保存。该检查只修改测试样例的标题。

## 目录与生成文件

| 路径 | 内容 | 是否进入 Git |
| --- | --- | --- |
| `src/` | 插件运行时代码 | 是 |
| `tests/` | 存储与兼容层测试、合成样例 | 是 |
| `scripts/` | 构建打包与独立测试 | 是 |
| `docs/` | 使用约定、架构、验证记录和合成演示 | 是 |
| `main.js`、`dist/` | 构建产物、手动安装包及校验文件 | 否 |
| `node_modules/` | 本地依赖 | 否 |
| `test-vault/` | 合成测试库及其 Obsidian 状态 | 否 |
| `tmp/` | 独立应用配置、本机辅助脚本、截图和临时结果 | 否 |

根目录保留 README、许可证、版本清单及构建配置，便于 GitHub 与 Obsidian 识别。`THIRD_PARTY_NOTICES.md` 也保留在根目录，由构建配置读取并嵌入 `main.js`，不能因整理目录而移除。

## 源码入口

- `src/metadata.ts`：JSON 数据块解析、校验和精确写回。
- `src/main.ts`：插件生命周期、面板适配、索引与操作保护。
- `src/property-catalog.ts`：限定在属性功能中的原生枚举适配。
- `src/compat.ts`：非公开接口边界与可撤销包装。
- `tests/fixtures/`：可公开的合成样例，不含个人笔记。

当前文档入口见 [文档导航](README.md)，工具入口见 [脚本导航](../scripts/README.md)。属性接口的初始源码检查记录在 `docs/research/`，不打入发布包。

## 发布附件

发布使用本地构建和上传。附件包含 `main.js`、`manifest.json`、手动安装 ZIP、SHA-256 与许可文件；Obsidian 自动安装只下载支持的插件文件，ZIP 和独立许可供手动安装使用。许可证同时嵌入 `main.js`。

SHA-256 用于校验内容，不能替代构建来源证明。目前没有生成 GitHub artifact attestations 的工作流。后续若调整附件或构建方式，需同步手动安装说明并保留许可证，不追溯修改已发布附件。
