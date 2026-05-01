# GoodNight Obsidian 形态彻底重构设计
> Status: Proposed
> This document defines the one-way reset from the current mixed knowledge-workbench architecture to a vault-first Obsidian-style desktop shell.

## 结论

GoodNight 本次不再保留“内建知识后端 + 本地工作台”的混合结构，而是一次性收缩为：

- 一个绑定本地 `vault` 的桌面应用
- 一个直接操作真实文件树的工作区
- 一个以 Markdown 文件为中心的阅读/编辑界面
- 一个与仓库并列存在、但不绑定知识后端的 AI 聊天壳

产品目标明确对齐 Obsidian 的核心形态：

- 仓库本体就是普通文件夹
- 文件是唯一知识真相来源
- 应用不再维护独立知识图谱、知识索引、知识数据库或隐藏知识产物目录
- AI 只读取当前 vault 的真实内容，并在运行时自由发挥

本次是彻底重构，不保留旧知识后端的向后兼容接线。

## 背景

当前仓库同时存在两类产品心智：

1. Obsidian 风格的本地仓库工作区
2. GoodNight 内建知识后端

后者又包含多条历史能力链路：

- `goodnight-server`
- `goodnight-mcp-bridge`
- `goodnight-core` 中的 atoms / tags / wiki / semantic search / briefing / graph
- 前端 `features/knowledge/*`
- 内建 `goodnight-m-flow` / `goodnight-rag` / `goodnight-llmwiki`
- `.goodnight/m-flow/`
- `_goodnight/outputs/*`

这些能力会让产品持续停留在“知识工作台”而不是“vault 桌面壳”的方向上。

用户已经明确产品目标：

- 不保留内建知识后端
- 不保留 `_goodnight/outputs/`
- 不保留 atoms / graph / m-flow / rag / server 这一整套结构
- 只保留像 Obsidian 一样的基础能力
- AI 与知识后端解耦，归 AI 自己发挥

因此这次不是“精简一些能力”，而是一次架构级收缩。

## 设计目标

### 目标

1. 让本地 `vault` 成为唯一知识本体与唯一真相来源。
2. 让 UI 直接围绕真实文件树和 Markdown 文件组织。
3. 删除所有内建知识后端、知识引擎、知识图谱和隐藏知识产物目录。
4. 保留 AI 配置与聊天能力，但 AI 不再依赖内建知识索引。
5. 让产品整体形态尽量贴近 Obsidian：轻、直观、文件优先。

### 非目标

1. 本次不保留 atoms 体系作为隐藏兼容层。
2. 本次不保留 `m-flow`、`rag`、`llmwiki` 的运行时能力。
3. 本次不保留 `goodnight-server` sidecar 以备后续继续使用。
4. 本次不实现新的语义知识引擎替代旧后端。
5. 本次不实现复杂的自动知识关联、向量检索或图谱可视化。

## 产品形态

### 1. Vault 是唯一知识本体

应用中的“项目知识库”概念收缩为“本地 vault 文件夹”。

用户看到的就是：

- 一个仓库路径
- 一棵真实文件树
- 一组 Markdown / HTML / 设计稿 / 项目文件

应用不再生成第二套“系统知识视图”作为主心智。

### 2. 文件树直接映射真实目录

左侧工作区以真实目录结构为准，不再区分：

- knowledge backend files
- generated outputs
- hidden skill runtime state

允许继续保留普通编辑器级别的文件操作：

- 新建文件
- 新建文件夹
- 重命名
- 删除
- 打开

但这些操作都直接作用于用户仓库。

### 3. Markdown 工作区成为中心

中间主工作区收缩为：

- Markdown 阅读
- Markdown 编辑
- 打开的文件标签
- 文件切换

原来的知识图谱、知识搜索面板、知识模式切换、知识刷新操作全部退出主界面。

### 4. AI 作为旁路能力存在

AI 保留，但它不再是“知识后端入口”。

AI 只拿到运行时上下文，例如：

- 当前打开文件
- 当前文件内容
- 已打开标签列表
- 项目根目录和基础文件树信息

AI 不能再依赖：

- atoms 检索
- semantic search
- graph recall
- `_goodnight/outputs/*`
- `.goodnight/m-flow/*`

## 要保留的能力

以下能力属于 Obsidian 形态的基础壳，继续保留：

- 本地项目 / vault 绑定
- 文件树 UI
- 文件读写
- Markdown 笔记工作区
- 打开文件标签
- Tauri 本地文件系统桥接
- AI 配置面板
- AI 聊天 UI 壳

## 要删除的能力

### 前端

- `src/features/knowledge/api/*`
- `KnowledgeGraphWorkspace`
- `KnowledgeGraphCanvas`
- 所有依赖知识后端返回 atoms / graph / wiki 的前端流程
- `m-flow` / `rag` / `llmwiki` 的产品可见入口
- “刷新知识目录”“知识图谱”“知识模式”等 UI

### 技能与知识运行时

- `goodnight-skills/built-in/goodnight-m-flow`
- `goodnight-skills/built-in/goodnight-rag`
- `goodnight-skills/built-in/goodnight-llmwiki`
- 所有依赖 `_goodnight/outputs/*` 或 `.goodnight/m-flow/*` 的技能约定

### Rust / sidecar / server

- `crates/goodnight-server`
- `crates/goodnight-mcp-bridge`
- `crates/goodnight-core` 中 atoms / tags / wiki / semantic search / briefing / graph 相关知识后端
- `src-tauri` 中 sidecar 启动与健康检查接线
- Tauri 打包配置中的 sidecar binaries

### 数据与约定

- `_goodnight/outputs/*`
- `.goodnight/m-flow/*`
- atoms / tags / briefings / semantic edges / wiki articles 相关内部状态约定

## 命名与文案调整

产品中所有用户可见文案应从“知识工作台”收缩为“vault / files / notes”语义。

应删除或替换的表达包括：

- 知识库索引
- 刷新知识目录
- 知识图谱
- 知识引擎
- m-flow
- rag
- llmwiki outputs

优先改为：

- 本地仓库
- 文件
- 笔记
- 当前文件
- Vault

## AI 运行时策略

AI 不再拥有任何内建知识检索特权。

新的轻上下文策略：

1. 当前打开文件优先
2. 已打开标签页作为次级上下文
3. 必要时补充项目文件树信息
4. 不使用隐式知识后端搜索

这样做的结果是：

- AI 更像 Obsidian 中附着于 vault 的助手
- 产品不再需要独立知识索引生命周期
- 后续如果要引入新的知识引擎，可以作为全新模块插入，而不是恢复旧骨架

## 实施顺序

### 阶段 1：删除后端与 sidecar

- 删除 `goodnight-server`
- 删除 `goodnight-mcp-bridge`
- 删除 `goodnight-core` 中与知识后端相关的产品接线
- 删除 `src-tauri` 中 sidecar 启动与打包配置

验收：

- Tauri 不再打包任何知识 sidecar 二进制
- 代码中不再存在“知识后端启动”主流程

### 阶段 2：删除知识运行时与可见技能

- 删除 `goodnight-m-flow`
- 删除 `goodnight-rag`
- 删除 `goodnight-llmwiki`
- 删除 `.goodnight/m-flow/` 与 `_goodnight/outputs/*` 相关产品语义

验收：

- 产品层不再存在内建知识方法心智
- skill 安装逻辑不再种入这些知识技能

### 阶段 3：收缩前端工作区

- 删除知识图谱工作区
- 删除知识 API 适配层
- 将 UI 统一收成 `vault + file tree + markdown workspace + ai chat`

验收：

- 左侧只展示真实文件树
- 中间只展示文件工作区
- AI 仍可使用，但不依赖知识后端

### 阶段 4：测试与残留清理

- 删除旧知识后端测试
- 修复受影响的 UI / workspace / persistence 测试
- 补齐新的 vault-first 基础测试

验收：

- 不再有针对 atoms / m-flow / outputs / sidecar 的产品级测试
- 剩余测试与新架构一致

## 风险与取舍

### 风险

1. 一次性删除范围很大，短期内会导致很多测试与模块联动失效。
2. 若前端某些基础工作区隐式依赖知识层数据结构，收缩时需要重新梳理状态边界。
3. 旧的 AI 能力可能会因为失去知识后端上下文而变弱，但这是本次有意接受的结果。

### 取舍

本次明确接受以下取舍：

- 接受功能减少，换取产品形态更纯粹
- 接受一次性不兼容，换取未来演进更清晰
- 接受 AI 暂时只读文件上下文，换取彻底摆脱重知识后端

## 成功标准

本次重构完成后，GoodNight 应满足：

1. 用户面对的是一个标准本地 vault 应用，而不是知识后端工作台。
2. 真实仓库文件是唯一主要工作对象。
3. AI 仍然可用，但不依赖 atoms / graph / m-flow / rag / outputs。
4. 仓库中不再存在 sidecar 知识后端的产品接线与默认心智。
5. 后续若要重新引入 `m-flow`，必须作为新模块重建，而不是恢复本次删除的旧架构。
