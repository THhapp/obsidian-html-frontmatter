# 文档导航

当前产品是 **HTML Frontmatter**，只处理 HTML 的 frontmatter / Properties。工作目录沿用早期名称 `obsidian-html-graph`，不代表插件包含图谱功能。

## 当前文档

| 内容 | 入口 |
| --- | --- |
| 用户安装与使用 | [English](../README.md) · [简体中文](../README.zh-CN.md) |
| Agent 创建与修改笔记 | [读写约定](agent-guide.md) · [HTML 模板](../templates/note.html) |
| 当前设计与接口边界 | [属性架构](frontmatter-architecture.md) |
| 已验证结果与限制 | [原型验证记录](prototype-verification.md) |
| 开发、必要检查与发布约定 | [开发说明](development.md) |
| 开发工具用途 | [脚本导航](../scripts/README.md) |
| 版本变化 | [更新记录](../CHANGELOG.md) |

[research/frontmatter-source-1.14.4.json](research/frontmatter-source-1.14.4.json) 是当前属性适配的源码调查证据；[assets/demo.gif](assets/demo.gif) 是公开 README 使用的合成笔记演示。

## 历史研究

早期图谱路线已归档到 `archive/graph/`，只供追溯，不是当前需求、开发计划或已交付功能：

- [图谱架构建议](archive/graph/architecture.md)
- [图谱开发前置计划](archive/graph/development-plan.md)
- [早期接口调研](archive/graph/obsidian-interface-research.md)
- 证据：[离线图谱契约](archive/graph/evidence/native-graph-contract-1.14.4.json) · [运行时能力](archive/graph/evidence/runtime-capabilities-1.14.4.json)

归档保留原有结论及其验证范围；当前行为以属性架构、验证记录和源码为准。
