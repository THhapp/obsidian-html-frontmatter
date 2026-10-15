# Obsidian 接口与本机证据

> 历史归档：本文记录属性原型开发前的图谱调研，包含当时的第三方阅读器环境。当前产品只适配属性，见 [当前属性架构](../../frontmatter-architecture.md) 和 [验证记录](../../prototype-verification.md)。

调研日期：2026-10-15。目标版本：Obsidian 1.14.4，安装器 1.12.7。

## 1. 调研范围与证据等级

本轮完成官方 API/文档检查、本机运行时只读探查、本机应用代码只读检查，以及合成数据的离线原生函数验证。

未安装或启用本项目插件，未向正在运行的 Obsidian 注入包装或关系数据，未修改日常库笔记、课件、配置或插件。

| 等级 | 含义 | 本轮状态 |
| --- | --- | --- |
| 官方契约 | 公开类型或官方文档承诺的接口 | 已查 |
| 本机事实 | 当前版本方法与源代码行为 | 已查，只代表 1.14.4 |
| 离线验证 | 提取原生函数，用合成输入和模拟依赖执行 | 10/10 通过 |
| 真机端到端 | 安装测试插件，验证索引到图谱 UI 和点击 | 未做 |
| 跨平台与更新兼容 | Android、其他版本及升级回归 | 未做 |

## 2. 环境与来源版本

| 项目 | 记录 |
| --- | --- |
| 本机 Obsidian | 1.14.4；安装器 1.12.7 |
| 本机 Node.js / npm | v24.17.0 / 11.13.0 |
| 本机 Git | 2.54.0.windows.1 |
| HTML 阅读器 | Local Web Page Viewer 0.1.2 |
| 官方 API Git 提交 | `9abd9605ce081383674aae1ed111c456edde0688` |
| 官方样例 Git 提交 | `07ceb81d1fb3384af611ebf665a1ec42a7e5926d` |
| 官方开发文档 Git 提交 | `c56c7e770ba25dd0ea392aacf4588f9425970d36` |
| 本机 `app.js` SHA-256 | `958ce57fe22f87fdf121546e46dfccd9c8ee971ce3fd8f801d60d4ece39a2df9` |

npm 元数据在调研时返回：`obsidian 1.14.4`、`parse5 8.0.1`、`typescript 7.0.2`、`esbuild 0.28.2`。这仅是注册表查询结果，未安装，也不是依赖选型或锁定结果。官方样例当时仍使用 TypeScript 5.8 系列与 esbuild 0.25.5，不能把“最新版本”直接当成已经验证的组合。

## 3. 可依赖的公开 API

以下以固定提交的 [官方 TypeScript 定义](https://github.com/obsidianmd/obsidian-api/blob/9abd9605ce081383674aae1ed111c456edde0688/obsidian.d.ts) 为准。

| API | 本项目用途 | 边界 |
| --- | --- | --- |
| `Vault.getFiles()` | 启动扫描待适配 HTML | 不能用 `getMarkdownFiles()` 代替 |
| `Vault.read()` / `cachedRead()` | 读取源文件 | 生命周期与修订检查仍由插件处理 |
| `Vault.on(create/modify/delete/rename)` | 增量更新 | 不假设事件顺序已由官方保证 |
| `Plugin.registerEvent()` / `register()` | 事件与撤销逻辑注册 | 私有方法包装仍需自行正确撤销 |
| `Workspace.onLayoutReady()` | 初始就绪后调度工作 | 不在加载入口执行大规模同步扫描 |
| `MetadataCache.getCache()` / `getFileCache()` | 查询公开缓存 | 对 HTML 的返回行为不能按 Markdown 推定 |
| `MetadataCache.getFirstLinkpathDest()` | Obsidian 风格链接解析 | 不等于普通 HTML URL 的精确相对路径语义 |
| `MetadataCache.resolvedLinks` / `unresolvedLinks` | 原生关系映射 | 公开可读字段，不等于存在公开索引写入扩展点 |
| `MetadataCache.on(resolve/resolved)` | 观察解析完成 | 原生 `changed` 不在改名时保证触发 |
| `Workspace.openLinkText()` / `WorkspaceLeaf.openFile()` | 交由当前视图处理器打开文件 | 具体阅读器及片段支持仍需实测 |
| `Plugin.registerView()` / `registerExtensions()` | 自定义文件视图 | 本项目初期不需要注册 HTML，以免与阅读器冲突 |
| `FileManager.renameFile()` / `Vault.process()` | 将来受控改名与精确写回 | 不意味着内核已经支持 HTML 属性更新 |
| `Plugin.loadData()` / `saveData()` | 少量设置 | 不作为整库持久化索引数据库 |

`CachedMetadata` 可以表达 links、tags、headings 等数据，但类型能表达数据，不代表官方允许为任意扩展名注册解析器。本轮没有发现公开的注册非 Markdown 元数据解析器或注册原生图谱数据源接口。

## 4. 本机运行时与应用代码发现

### E1：HTML 视图已被占用

本机 `.html` 与 `.htm` 均映射到 `local-web-page-view`。运行时 `registerExtensions()` 对重复扩展名直接抛错。

现有阅读器代码只负责视图及自身阅读状态，不提供关系索引。与其并存的桥接插件不应再次注册相同扩展名。[阅读器源码](https://github.com/m1roff/obsidian-local-web-page-viewer/blob/master/src/main.ts)

### E2：原生缓存按扩展名屏蔽 HTML 元数据

本机 `MetadataCache.getCache()` 对已有索引记录的非 Markdown 路径返回 `{}`。因此，往内部 hash 元数据表塞数据并不能直接绕过该判断。

`getFileCache(file)` 会转调 `getCache(file.path)`。优先研究一个范围受限的返回值覆盖，而非同时包装两个入口或伪造持久化 hash。

原生 `computeFileMetadataAsync()` 仅对 Markdown 计算正文元数据；普通其他文件会登记文件信息，hash 为空。当前日常库没有 HTML，因此“新建 HTML 后进入原生文件列表”的端到端行为仍需测试库验证，不能把源码分支当成已完成现场实验。

### E3：图谱的数据源已经足够表达文件连线

原生图谱数据构造器读取：

- `getCachedFiles()`：候选文件。
- `resolvedLinks` 与 `unresolvedLinks`：文件连线。
- `getCache(path)` 中的 tags/frontmatter tags：文件到标签的连线。
- `getTags()`：全库标签大小写的规范显示名。

因此，优先在元数据层桥接，无须先修改图谱 renderer。

### E4：HTML 属于图谱附件

本机原生分类器将 `.md`、`.canvas`、`.base` 视为非附件；HTML 进入附件分支。“显示附件”关闭时，HTML 节点及相关文件边会被滤掉。

该判断与 [官方图谱的附件开关说明](https://obsidian.md/help/plugins/graph) 一致。桥接插件不应偷偷修改全局图谱选项或假装 HTML 已成为普通 Markdown 节点。

### E5：图谱点击可以复用原生打开流程

本机图谱的文件节点点击调用 `workspace.openLinkText(...)`；标签节点点击启动原生标签搜索。

这为复用阅读器提供了清楚的路径，但真实点击打开 HTML、局部图谱中心与选中状态仍未测试。标签搜索是否返回 HTML 与图中是否存在标签边是两件事。

### E6：关系重解析与刷新有原生通路

本机存在 `queueFileForLinkResolution()`、`resolveLinks()` 和 `linkResolver()`。队列按文件重解析，触发 `resolve`，批次结束触发 `resolved`；全局与局部图谱监听完成事件更新。

这些方法未出现在已查的公开 API 类声明中，属于需要运行时保护的私有依赖。它们的存在性不等于第三方调用在所有生命周期中都安全。

### E7：Canvas 有非 Markdown 引用适配，但接口私有

本机 Canvas 在 `metadataCache.linkUpdaters.canvas` 注册引用提供器，包含：

- `iterateReferences()`。
- `iterateReferencesForFile()`。
- `applyUpdates()`。
- `renameSubpath()`。

这证明原生体系内部存在非 Markdown 引用机制，值得后续借鉴，不代表已找到官方稳定扩展点。

`iterateAllRefs()` 从原生 hash 元数据和这些提供器枚举引用。仅覆盖 `getCache()` 不会自动让 HTML 进入全部引用枚举。因此，基础图谱接入也不会自动带来完整反向链接与改名写回支持。

### E8：原生自动链接替换不能直接复用于 HTML

本机 `qR()` 生成 Markdown / wikilink 替换文本，未匹配时会形成 Markdown 链接；`zR()` 将这些文本写回源码范围。直接把原始 HTML 引用交给默认替换链，可能把 HTML 属性改成 Markdown 语法。

未来注册 HTML 的 `linkUpdaters` 前，必须实现针对属性和 URL 的独立写回，并保证位置、目标身份、转义、修订检查都正确。初期只读索引避免进入该写入链。

### E9：不能承诺全部原生功能随图谱一起生效

标签面板依赖的全库枚举与每文件 `getCache()` 不完全相同。原生图谱过滤器对附件的匹配路径也与普通笔记不同。

图谱筛选、分组、标签搜索、悬浮预览和反向链接都需单独验证；不能将基础节点连线的成功扩展解释为这些能力已支持。

## 5. 离线验证

工具：[native-graph-contract.cjs](../../../scripts/research/native-graph-contract.cjs)。结果：[10 个契约用例](evidence/native-graph-contract-1.14.4.json)。

脚本读取本机 ASAR，提取原生图谱数据构造器和 `getCache()`，在 Node VM 中执行。所有文件名、元数据、链接、选项与辅助依赖均为合成数据，不访问笔记库。

验证结果包括：

1. HTML 即使有 hash 元数据，原生 `getCache()` 仍返回空对象。
2. Markdown 缓存保持原行为，局部覆盖可提供 HTML 元数据。
3. 开启附件后，原生构造器能消费 Markdown → HTML 与 HTML → HTML 关系。
4. 只有元数据不能自动生成文件边；只有文件关系也不能生成 HTML 标签边。
5. 同时提供 HTML 关系和元数据时，能够构造标签节点与标签连线。
6. 关闭附件隐藏 HTML；关闭标签不影响文件间连线。

**10/10 通过只证明数据消费契约，不证明真实插件接入成功。** 尚未检验事件竞争、UI、点击、重启、卸载、自动改名、筛选、其他补丁或移动端。

运行时存在性记录见 [runtime-capabilities-1.14.4.json](evidence/runtime-capabilities-1.14.4.json)，复查方式见 [调研工具说明](../../../scripts/research/README.md)。该记录只保存能力与阅读器信息，不保存个人笔记内容或文件清单。

## 6. 工具链与平台前置

- 官方样例使用 TypeScript 与 esbuild，产物为 CommonJS `main.js`，`obsidian` 作为宿主提供的 external。[固定版本构建示例](https://github.com/obsidianmd/obsidian-sample-plugin/blob/07ceb81d1fb3384af611ebf665a1ec42a7e5926d/esbuild.config.mjs)
- 编写原型时锁定依赖与 lockfile；本轮未创建 `package.json` 或安装依赖。
- 插件代码使用实例 `this.app`；本轮 CLI 中的全局 `app` 仅用于官方允许的调试场景。
- 文件访问与事件使用 Vault API，事件与包装必须可撤销。[官方插件规范](https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Releasing/Plugin%20guidelines.md)
- 开发和端到端验证使用独立测试库。[官方开发入门](https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Getting%20started/Build%20a%20plugin.md)
- 移动端没有 Node/Electron API。运行时代码应保持浏览器兼容；桌面 CLI、ASAR 调研脚本不进入插件包。[官方移动端说明](https://github.com/obsidianmd/obsidian-developer-docs/blob/c56c7e770ba25dd0ea392aacf4588f9425970d36/en/Plugins/Getting%20started/Mobile%20development.md)

## 7. 调研边界

本机应用代码只读检查不是公开 API 承诺。私有方法名、内部事件和图谱分类均可能变化。正式插件应把版本变化集中在兼容层处理，能力检查不通过时停止适配并解释原因，不自动回退成另一种笔记存储方案。

本轮没有注册测试库、修改原生缓存、打开新的图谱窗口或安装新插件；原型的端到端证据应在后续独立测试阶段建立。
