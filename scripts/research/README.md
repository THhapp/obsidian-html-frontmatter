# 只读调研工具

这些工具用于检查本机接口与离线数据契约，不是插件实现，不会安装插件或修改笔记库。

它们保留用于复核早期调研，不是当前开发的必跑步骤。图谱方案与对应记录已归档到 [docs/archive/graph/](../../docs/README.md#历史研究)，不属于当前属性适配范围。

## 运行时能力检查

Obsidian 已运行且 CLI 可用时，显式指定目标库：

```powershell
.\scripts\research\runtime-capabilities.ps1 -Vault '你的库名'
```

如 CLI 不在 PATH 中，可用 `-ObsidianCli` 指定可执行文件。输出只包含方法存在性、签名特征、HTML 视图类型与阅读器版本；不列出笔记文件或读取笔记内容。

脚本中的 `app` 仅用于 CLI 调试探查。未来插件必须使用实例提供的 `this.app`。

## 离线原生图谱数据契约检查

```powershell
node .\scripts\research\native-graph-contract.cjs --asar "$env:APPDATA\obsidian\obsidian-1.14.4.asar"
```

工具只读本机 ASAR 中的 `app.js`，提取两个原生函数，在隔离 VM 中使用合成文件名和模拟依赖执行。它不访问任何笔记库，也不连接正在运行的 Obsidian。

提取锚点针对已经检查的 1.14.4 版本。其他版本结构变化时会报错，不应把锚点失败当成产品接口不支持，也不能绕过检查后继续信任结果。

已验证的范围是：原生数据构造器能够消费 HTML 文件连线和标签，以及相关显示开关的影响。未验证真实插件注入、UI、生命周期、改名写回、筛选或移动端。

原生代码不随仓库分发；脚本在本机读取已安装的应用。报告保存应用内 `app.js` 的 SHA-256 和提取位置，便于复核版本差异。
