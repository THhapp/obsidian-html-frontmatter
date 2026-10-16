# 项目协作约定

## 产品范围

HTML Frontmatter 为 HTML 文件提供原生 Properties 编辑，以及属性目录、计数和候选值适配。当前支持桌面 Obsidian 1.14.4；实际验证范围见 `docs/prototype-verification.md`。

- 元数据存储在 HTML 内的 JSON 数据块中，读写规则以 `src/metadata.ts` 为准。
- 不依赖第三方 HTML 插件，不提供 HTML 正文阅读、搜索或图谱功能。
- tags 属性可编辑，不据此宣称标签侧栏、反链或完整原生标签索引已经支持 HTML。
- 涉及 HTML 的全局属性改名与删除继续阻止，具体边界以文档和实现为准。

## 工作方式

- 文档以简体中文为主，明确区分目标、假设、已验证结果和限制。
- 面向 Obsidian 社区目录的根 README 使用英文；中文说明保留在 `README.zh-CN.md`，继续保留 vibe coding 声明和实际功能限制。
- 公开文档只记录产品通用信息，不加入个人笔记分工、私有目录、私人流程或会话中的操作授权。
- 当前文档从 `docs/README.md` 进入，脚本用途见 `scripts/README.md`。
- 面向笔记 Agent 的格式约定在 `docs/agent-guide.md`，最小 HTML 模板在 `templates/note.html`；修改它们时对照 `src/metadata.ts`，不将文档约定描述为新增运行时功能。
- 先检查实际 Obsidian 版本、接口与现有插件行为，再决定实现。
- 仅在设计需要时引入工具链与依赖，保持结构轻量。
- 常规实现直接推进，以功能和实际体验为主；测试只覆盖改动涉及的必要行为，不为规范补测试或重复回归。
- 开发与验证使用独立合成测试库，不将个人笔记库用作默认测试环境。
- 不提交个人笔记、测试库状态、凭据或本机临时文件。
