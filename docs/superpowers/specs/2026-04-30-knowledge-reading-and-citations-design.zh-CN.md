# 知识库阅读态与 Obsidian 引用规则设计
日期：2026-04-30

## 摘要

本设计为 GoodNight 当前知识库工作台补齐两项核心能力：

- 文档阅读态：让 Markdown 在右侧以接近 Obsidian Reading view 的方式展示，不再把 `#`、`##`、脚注定义等源码符号直接暴露给用户。
- 通用引用规则：统一采用 Obsidian 兼容写法，内部知识用 `[[笔记名]]` / `[[笔记名#小节]]`，外部来源用脚注 `[^1]` 与 Markdown 链接 `[标题](URL)`。

目标不是做完整的知识图谱或学术引用系统，而是以最小改动把“能读、能写、AI 能遵守、系统页能复用”的基础打稳。

## 背景

当前知识库正文区在 [src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx](C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\KnowledgeNoteWorkspace.tsx) 中始终使用 `GoodNightMarkdownEditor` 承载内容。即使是只读场景，本质上也还是编辑器视图，因此会暴露 Markdown 源码结构，阅读体验偏“源码感”。

同时，现有来源机制主要依赖 [src/features/knowledge/workspace/knowledgeNoteMarkdown.ts](C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\knowledgeNoteMarkdown.ts) 中的 `## 引用来源` 标题列表。它能保留一部分来源标题，但不满足以下需求：

- 外部来源没有 URL
- 正文里没有对应引用点
- 内部笔记不能使用 Obsidian 双链直接跳转
- AI 整理知识时缺少统一可执行的引用语法

## 目标

- 为知识笔记和系统索引页提供“阅读 / 代码”双模式切换
- 阅读态使用成熟 Markdown 渲染链路，默认不展示 Markdown 语法符号
- 内部引用统一采用 `[[笔记名]]` / `[[笔记名#小节]]`
- 外部引用统一采用 `[^1]` 脚注和 `[标题](URL)` 链接
- 将同一套规则提供给 AI 整理知识、生成系统索引页、变更同步摘要等链路
- 对旧的 `## 引用来源` 保持兼容读取，但停止继续扩散这一旧格式

## 非目标

- 本轮不做完整的学术文献管理或 citekey 体系
- 本轮不做悬浮预览、反向链接面板、图谱反查
- 本轮不做全库批量自动迁移旧文档格式
- 本轮不做额外的数据库 schema 改造来保存结构化 citation 表

## 设计原则

### 1. 阅读优先，源码可切换

普通阅读场景默认应该看到文章，而不是 Markdown 源码。需要精确编辑时，再切到“代码”模式。

### 2. 采用通用规则，不发明新语法

引用规则直接贴近 Obsidian 核心能力：

- 内部知识：`[[笔记名]]`、`[[笔记名#小节]]`
- 外部来源：`[^1]` 与 `[^1]: [标题](URL)`

### 3. AI 与人类使用同一套格式

编辑器、阅读器、AI 整理知识、系统索引页都遵守相同语法，避免“人一种写法，AI 一种写法，系统又一种写法”。

### 4. 兼容旧内容，停止制造旧内容

已有 `## 引用来源` 文档继续可读，但新写入内容不再自动生成该结构。

## 用户体验设计

### 阅读 / 代码切换

在知识笔记正文区域增加两个视图模式：

- `阅读`
- `代码`

默认行为：

- 选中笔记后默认进入 `阅读`
- 用户手动切到 `代码` 后，使用现有 `GoodNightMarkdownEditor`
- 重新切换笔记时重置到 `阅读`

### 阅读态展示

阅读态展示完整 Markdown 文档的渲染结果，包括标题、段落、列表、表格、代码块、脚注等。重点是：

- 不显示 `#`、`##`
- 让正文具有文章排版感
- 外链可点击
- 内部双链可点击并打开对应知识笔记

### 代码态展示

代码态保留当前编辑器能力：

- 继续使用 `GoodNightMarkdownEditor`
- 保留 Markdown 原文编辑
- 保存逻辑继续沿用现有序列化流程

## 引用规则

### 内部引用

内部知识库引用统一为：

```md
[[登录方案]]
[[登录方案#错误处理]]
```

含义：

- `[[登录方案]]` 指向另一篇知识笔记
- `[[登录方案#错误处理]]` 指向另一篇知识笔记中的小节

阅读态中，这类链接渲染为可点击链接；点击后优先打开对应笔记。当前迭代允许跨笔记打开但不强求精确滚动到目标小节。

### 外部引用

外部来源统一为脚注格式：

```md
这是一个结论[^1]

[^1]: [OpenAI API docs](https://platform.openai.com/docs)
```

约束：

- 脚注编号必须在正文中出现引用点
- 文末必须给出对应脚注定义
- 链接必须是真实 URL，不能伪造

### 系统页和索引页

系统维护页也使用相同规则：

- 引用内部知识时使用 `[[...]]`
- 引用外部来源时使用 `[^n]` + `[标题](URL)`

如果系统页只有内部依据而没有外部 URL，可在正文内直接放 `[[...]]`，或在文末使用 `## Related notes` 列出 `- [[...]]` 作为兜底。

## AI 规则

AI 在整理知识、生成系统索引页、总结变更时必须遵守以下规则：

- 内部知识引用必须使用 `[[笔记名]]` 或 `[[笔记名#小节]]`
- 外部来源必须使用脚注 `[^n]`
- 文末脚注定义必须使用 `[标题](URL)`
- 没有可靠 URL 时，不能伪造外部链接
- 不能只在文末堆一组来源标题而正文没有引用点

为了兼容当前 proposal 结构中只有 `referenceTitles` 的情况，执行层允许把缺失的内部来源兜底追加为 `## Related notes` + `- [[标题]]` 列表，但这是兜底，不是主要写法。

## 落地范围

### 前端

- 在 [src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx](C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\KnowledgeNoteWorkspace.tsx) 中引入阅读 / 代码模式
- 新增 Markdown 阅读组件，负责：
  - GFM 渲染
  - 脚注显示
  - Obsidian 双链转换和点击处理
- 在 [src/App.css](C:\Users\Even\Documents\ALL-IN-ONE\src\App.css) 中补齐阅读态文章样式

### Markdown 规则辅助

- 在 [src/features/knowledge/workspace/knowledgeNoteMarkdown.ts](C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\knowledgeNoteMarkdown.ts) 中增加：
  - Obsidian 双链相关工具
  - 新式引用/旧式引用兼容解析
  - 提案执行时的内部来源兜底附加逻辑

### AI 链路

- 在 [src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts](C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\knowledge\runKnowledgeOrganizeLane.ts) 里把引用规则写进提示词
- 在 proposal 执行层继续接受 `referenceTitles`，但输出改为 `[[...]]` 兼容内容，而不是旧的 `## 引用来源`

## 风险与控制

### 风险 1：引入 Markdown 渲染后前端依赖变重

控制方式：

- 只引入成熟且轻量的渲染链路
- 不一次性接入复杂插件生态

### 风险 2：双链转换误伤代码块中的文本

控制方式：

- 预处理时跳过 fenced code block
- 先覆盖常见文档正文场景，保留后续补强空间

### 风险 3：老文档来源信息丢失

控制方式：

- 保留旧 `## 引用来源` 的兼容解析
- 新写法启用后，不强制批量迁移旧文档

## 验证标准

- 选中任意知识笔记后，默认能以阅读态正常显示正文
- 切到代码模式后，仍能编辑原始 Markdown
- 阅读态中 `[[笔记名]]` 可点击并切换到对应笔记
- 阅读态中脚注和外链可正确展示
- AI 整理知识提示词中明确要求使用 Obsidian 兼容引用规则
- proposal 执行后不再自动写入旧式 `## 引用来源` 标题列表
