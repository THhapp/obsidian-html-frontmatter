# HTML 属性原型验证记录

初始验证日期：2026-10-15。记录覆盖本项目 0.0.1 原型的功能验证、0.1.0 试用版的安装交付检查及后续版本的针对性检查，环境为 Windows 桌面版 Obsidian 1.14.4。

## 0.1.2 类型警告修复检查（2026-10-16）

- `npm run check` 与构建通过；`npm test` 的现有 15 个测试通过。
- 本地使用启用类型信息的 typescript-eslint 检查全部 `src/**/*.ts`：`no-explicit-any`、`no-unsafe-assignment`、`no-unsafe-member-access`、`no-unsafe-argument`、`no-unsafe-call`、`no-unsafe-return`、`no-unnecessary-type-assertion` 均无警告或错误。临时检查工具在忽略的 `tmp/lint/` 下，没有新增项目依赖或关闭规则。
- 将 0.1.2 构建部署到项目独立测试库，重启独立 Obsidian 1.14.4 实例后，`npm run test:live` 的 14 项与 `npm run test:catalog` 的 13 项检查通过，覆盖原生属性编辑、精确保存、目录统计、忽略规则、全局操作保护及停用/恢复。
- 本轮没有重复扩展类型和重启持久化套件；下文相关结果属于之前记录的版本。未修改日常笔记库。社区目录是否还有其他警告，以发布后的扫描为准。

## 结论

**单文件 HTML 属性读写，以及原生全库属性目录、计数、候选值接入均已通过。** 不依赖第三方 HTML 插件，不生成辅助 Markdown，不提供 HTML 正文阅读。

验证使用项目内独立测试库与独立 Obsidian 应用配置。测试完成时保留六份合成 HTML、Markdown 对照文件，目录测试还会创建并删除临时 HTM。社区插件列表只有 `html-frontmatter`，HTML 扩展名没有注册正文视图处理器。日常笔记库未安装或修改。

## 已验证结果

`npm run check` 与构建通过；`npm test` 的 15 个测试（9 个存储、6 个目录兼容层测试）通过。实际应用的 14 项基础、9 项扩展类型、13 项目录检查，共 36 项通过；完整重启后复核属性值、类型和目录恢复。

上述完整功能验证来自前期开发阶段。0.1.0 本轮整理未改动插件功能，只重新构建并完成下述一次安装与保存检查，未重复运行全套测试。

## 0.1.0 安装交付

- `npm run release` 通过，生成包含插件文件夹的 ZIP 与 SHA-256 校验文件。
- ZIP 中只有 `main.js`、`manifest.json`、安装说明和第三方许可说明四个文件。
- 从 ZIP 解压安装到独立测试库，重启后实际加载版本为 0.1.0，四个安装文件与发布产物一致。
- 在真实原生属性面板输入新标题并保存成功；JSON 之外的源字符串保持不变，插件诊断无错误。
- 本机检查结果：`tmp/e2e/install-smoke.json`。检查脚本为 `scripts/e2e/install-smoke.mjs`，不进入发布包。

2026-10-16 的 GitHub 交付整理中，用户选定 MIT，并要求公开说明 vibe coding 开发方式。安装包增加 `LICENSE` 成为五个文件，项目与依赖许可一并嵌入 `main.js`，供原生下载方式保留许可。该轮未改动插件功能，重新构建和核对发布文件，未重复运行界面测试。

| 检查 | 实际结果 |
| --- | --- |
| 无外部 HTML 插件 | 唯一社区插件是本项目；HTML 视图处理器为空 |
| 原生控件 | 文本、数字、复选框、tags 均由原生属性编辑器提供 |
| 控件真实编辑 | 使用输入、键盘和点击事件，磁盘保存为正确的字符串、数字、布尔值与标签列表 |
| 单文件结构操作 | 点击原生添加按钮、修改属性名、Delete 删除属性均写回成功 |
| 正文完整性 | 元数据 JSON 内部之外的源字符串逐字符不变，包含样式、脚本、注释、中文和 emoji |
| 面板重开 | 关闭并重新绑定 HTML，读回已保存属性 |
| 外部修改 | 修改源文件后，面板与 `getFileCache()` 均读取新值 |
| 公开写入入口 | `processFrontMatter()` 的 HTML 转发保存成功且正文保持不变 |
| 无效数据 | 面板打开和 API 写入均拒绝无效 JSON，磁盘内容不被覆盖 |
| 全局操作保护 | 同名属性涉及 HTML 时，重命名和删除均在任何 HTML 或 Markdown 写入前拒绝 |
| 停用 | HTML 单文件缓存恢复原生空对象，原生 Markdown 控件仍可保存 |
| 重新启用 | 无需安装 HTML 阅读器即可重新读取 HTML 属性 |
| 完整应用重启 | 已保存属性恢复，插件诊断无错误，HTML 正文脚本没有执行 |

存储测试另外覆盖：没有数据块时的插入、错误类型和重复数据块、不受支持的值、`</script>` 转义、CRLF 保留、无关字段并发修改、同字段冲突拒绝、删除与 null 的区别、连续及幂等写入。

界面测试通过 CDP 连接**仅用于开发的独立实例**，没有用伪造的属性编辑器代替 Obsidian。文本、数字、tags 和属性名由真实输入事件修改；复选框和添加按钮执行原生 DOM 点击；删除由键盘事件完成。此结果证明上述具体路径，不能据此推断全部 Properties 能力均已兼容。

## 扩展类型与编辑稳定性

此前扩展类型阶段新增两份合成样例及 `scripts/e2e/extended.mjs`，当时无需修改插件主体或增加依赖。本轮目录适配后已重新执行这些检查，全部通过。

| 扩展检查 | 实际结果 |
| --- | --- |
| 普通列表 | 从原生属性菜单选择列表类型，输入第二个条目，保存为字符串列表 |
| 日期 | 原生日期控件保存 `2026-10-20`，未发生时区换算 |
| 日期时间 | 原生日期时间控件将 `2026-10-20T21:45` 规范为 `2026-10-20T21:45:00`，保留本地时间 |
| 连续输入 | 无等待逐字符发送文本输入，最终字符串完整保存 |
| 排队写入 | 同时发起 30 次 `processFrontMatter()` 调用，最终值为第 30 次写入 |
| 同名类型 | HTML 与 Markdown 的同名列表、日期、日期时间属性显示为同一显式类型 |
| 文件切换 | 在同一个原生侧栏中从 HTML 切到 Markdown，再切回 HTML，编辑均只写入当时选中的文件 |
| 源文件完整性 | 所有扩展编辑保留 JSON 之外的源字符串，HTML 正文脚本未执行 |
| 类型选择保存 | 原生菜单选择的类型写入独立测试库 `types.json` |
| 重启复核 | 完整应用重启后，属性值和列表、日期、日期时间控件类型均恢复，插件诊断无错误 |

日期和日期时间测试使用 Chromium 原生输入元素的 `value` 以及 `input/change` 事件触发原生控件保存，未调用插件写入方法代替控件；没有验证系统日期选择器弹窗、逐段键盘输入、其他语言和时区。测试中的类型菜单文字针对当前简体中文界面。

这些是当前合成样例下的稳定性结果，不代表长期高负载、待保存时切换文件或跨窗口并发均已验证。

## 全库目录与统计

本阶段增加 `src/property-catalog.ts`，在同步的属性目录重建、计数、候选值读取和类型 `changed` 事件分发期间补入 HTML。普通缓存枚举保持原行为；不向原生 hash 数据库写入虚拟数据，没有新增依赖。

原生类型管理器预先注册的重建监听器保存了原始函数引用，单独包装 `rebuildProperties()` 不会覆盖该路径。因此还适配了 `changed` 事件期间的枚举范围，并用测试覆盖预注册监听器、异常退出后的范围恢复及停用时的方法还原。

| 目录检查 | 实际结果 |
| --- | --- |
| 名称、类型和次数 | 原生目录显示 HTML 专属属性；HTML、HTM、Markdown 的共享属性合计 3 次，大小写不同的属性名按原生规则合并 |
| 候选值 | 原生候选值读取接口包含 HTML 标量与列表值，仍由原生函数排序与去重 |
| 范围隔离 | 普通 `iterateFileCache()` 调用未收到虚拟 HTML frontmatter |
| 外部改动 | 增减属性后原生目录自动刷新；过期候选值消失 |
| 改名与删除 | 文件改名后旧索引路径移除、计数不重复；删除文件后计数和候选值减少 |
| 无效 JSON | 失效文件退出目录与候选值，原文件不被覆盖；修复后重新纳入 |
| 排除规则 | 原生排除规则生效后 HTML 不参与目录、计数与候选值；清除规则后恢复 |
| 全局操作保护 | 原生目录的单属性改名、删除被阻止，HTML 和 Markdown 均未改动 |
| 混合批量选择 | 在原生树中混选 Markdown 专属与 HTML 属性，先请求删除 Markdown 项也会整批拒绝，未产生部分写入 |
| Markdown 原行为 | 清除混合选择后，Markdown 专属属性的全局改名和删除正常，HTML 未改动 |
| 全局类型菜单 | 可在原生全库目录中为 HTML 专属属性指定类型并保存 |
| 停用与重新启用 | 停用恢复 Markdown 原生目录、计数与候选值，自动推断的 HTML 专属项消失；重新启用后恢复 |
| 完整重启 | 共享属性计数为 2（一份 HTML、一份 Markdown），类型、候选值、原生目录行恢复，诊断无错误 |

目录停用后，用户显式指定过类型的名称仍可按原生规则以 0 次保留；这不是残留的 HTML 计数。候选值验证针对原生读取接口，没有逐一验证所有自动完成弹窗。

**目录项点击仍调用原生搜索。** 本阶段未接入 HTML 搜索结果，不能用点击后的搜索结果验证目录计数，也不能据此推断图谱、标签侧栏或 Bases 已支持 HTML。

## 与架构设想的差异

已实现单文件存储、内存索引、缓存查询、原生面板适配、`processFrontMatter()` 转发、属性范围内的枚举、全库目录与计数、候选值，以及全局操作保护。

全局改名和删除目前采用明确阻止的方式，没有实现跨 HTML、Markdown 的批量事务。原生全库目录的混合批量删除通过视图实例预检整批选择，单属性 FileManager 入口继续保护；单文件面板中的属性改名和删除仍可用。

aliases 等特殊属性语义、跨平台、多个库/窗口、文件移动中的编辑、长期大量文件性能和其他社区插件组合，未纳入实际界面验收。存储层能保存字符串或基础值列表不等于这些原生行为已经通过。

## 复跑步骤

先按 README 构建测试库并启动独立实例。第一次启动需在独立实例中确认测试库的信任提示，然后执行：

```powershell
node --experimental-strip-types scripts/e2e/run.mjs
node scripts/e2e/close-test-app.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-test-obsidian.ps1
node scripts/e2e/verify-restart.mjs
```

最后一步需等测试库加载完成再运行。脚本会核对库的绝对路径和插件列表，拒绝在其他库执行。`run.mjs` 会重置 `sample.html`、`control.md` 两个合成样例；不要在这些文件中存放真实内容。

结果生成在 `tmp/e2e/results.json`、`restart.json`，重启后的界面截图为 `tmp/e2e/after-restart.png`。这些是本机临时证据，不进入 Git。测试期间会故意触发无效 JSON 与全局操作拒绝提示，属于预期验证。

扩展检查可单独复跑：

```powershell
npm run test:extended
node scripts/e2e/close-test-app.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-test-obsidian.ps1
node scripts/e2e/verify-restart.mjs --extended
```

扩展脚本会重置 `types.html` 和 `types-control.md`，保留原先的基础样例；同样需要等待重启后的库加载完成。扩展结果为 `tmp/e2e/extended.json`、`extended-restart.json`，重启截图为 `tmp/e2e/extended-after-restart.png`。

目录检查可单独复跑：

```powershell
npm run test:catalog
node scripts/e2e/close-test-app.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-test-obsidian.ps1
node scripts/e2e/verify-catalog-restart.mjs
```

目录脚本重置 `catalog.html`、生成 `catalog-control.md`，并创建/移动/删除 `catalog-b.htm`、`catalog-moved.htm`。它会暂时调整测试库的排除规则并恢复，不访问日常配置。结果为 `tmp/e2e/catalog.json`、`catalog-restart.json`，截图为 `tmp/e2e/catalog-after-restart.png`。

## 版本和边界

- 原生属性视图、全局操作保护使用非公开接口；运行时严格限制为 1.14.4，并检查方法是否存在。
- 插件不修改 Obsidian 安装文件或磁盘上的原生元数据数据库，停用时撤销本插件的实例包装。
- JSON 数据块由插件解释，属于 frontmatter 语义映射，不是让 Obsidian 原生支持 HTML 顶部 YAML。
- 首次编辑没有数据块的 HTML 时会新增一个块；已有块仅重写 JSON 内容及其内部排版。
- 涉及 HTML 的单属性全局操作会阻止调用，包括同名 Markdown 属性；原生目录的混合批量删除在首项前整批阻止。单文件属性改名、删除仍可用。直接由其他程序发起的多个独立 API 调用不构成一个原生 UI 批次，不承诺跨调用事务。
- 标签编辑可用，不承诺标签侧栏、搜索、图谱、Bases 或反链已包含 HTML。
