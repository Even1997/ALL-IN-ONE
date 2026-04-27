# GoodNight 知识区 Atomic 化迁移设计

日期：2026-04-27

## 背景

当前 GoodNight 的知识区本质上是“项目目录中的 Markdown 文件树 + 前端全文检索 + 本地编辑器”。

现状的核心特征：

- 知识主数据依赖 `RequirementDoc[]`
- 持久化主路径是 `project/*.md`
- 检索依赖 `FlexSearch`
- 编辑器依赖 `Milkdown`
- 知识区与项目工作台、线框、需求流、AI workflow 紧耦合

这个模型适合“轻量笔记区”，但不适合继续演进为：

- 语义搜索
- 自动切块与 embedding
- chat / wiki / graph
- 附件与外部知识源关联
- MCP 暴露

本次设计的目标，是把知识区迁移为“数据库中心、Markdown 可导入导出”的 Atomic 风格内核，同时保留 GoodNight 现有的产品工作台外壳。

## 目标

- 将知识区升级为数据库中心模型，而不是文件系统中心模型
- 迁入并改名 `atomic-core`、`atomic-server`、`mcp-bridge`
- 让知识区逐步获得语义搜索、chat、wiki、graph 能力
- 将知识区编辑器从 `Milkdown` 切换为 Atomic 使用的 `CodeMirror`
- 保留现有 GoodNight 的项目流、需求流、页面结构、线框和工作台外壳
- 保留 Markdown 导入导出，避免数据被锁死在数据库中

## 非目标

- 不将整个 GoodNight 应用改造成 Atomic 的信息架构
- 不首轮引入 Atomic 的 iOS、mobile、extension、自托管部署能力
- 不首轮重写整个全局布局
- 不首轮处理 `pdf/docx/xlsx/pptx` 的原生编辑
- 不首轮强制把 Atomic 内核中的所有 `Atom` 内部命名全部重命名为 `Note`

## 方案选择

本次采用的方案是：

- 只将“知识区”整体 Atomic 化
- 保留 `项目 / 需求 / 线框 / 工作台 / AI workflow` 外壳
- 后端采用 `goodnight-core + goodnight-server + Tauri shell`
- 前端在知识区范围内复用 Atomic 的编辑器和页面模式

未采用的方案：

- 只迁 Atomic 内核，不迁编辑器与知识区前端
  原因：无法达到“知识区整体升级”的目标，用户仍然会停留在旧交互里
- 整仓并入 Atomic 并反向改造成 GoodNight
  原因：会让主产品变成两套应用拼接，信息架构冲突过大

## 架构总览

新架构分为四层：

1. `goodnight-core`
   知识区业务核心，负责 note、chunk、embedding、search、tag、link、wiki、chat、import/export。

2. `goodnight-server`
   本地 sidecar 服务，负责把 `goodnight-core` 暴露为 REST / WebSocket / MCP。

3. `src-tauri`
   GoodNight 桌面壳，负责启动 sidecar、提供文件对话框、本地路径、桌面集成能力。

4. `src/features/knowledge/*`
   GoodNight 知识区前端壳，保留 GoodNight 的产品语义，但内部复用 Atomic 的 editor、search、chat、wiki、graph 页面模式。

## 系统边界

### 保留的 GoodNight 外壳

- `App.tsx`
- 项目切换和项目索引
- 需求输入与 Requirement 工作流
- 页面结构编辑
- 线框与画布
- AI workflow workbench
- `.goodnight/*.json` 项目状态

### 被替换的知识区子系统

- `knowledgeEntries`
- `knowledgeTree`
- `knowledgeSearch`
- `MilkdownEditor`
- 基于扫描 `project/*.md` 的知识主读取路径

### 新知识区职责

- note CRUD
- Markdown 编辑
- 语义搜索
- tag / link / relation
- chat / wiki / graph
- Markdown 导入导出
- 附件与外部知识源关联

## 目录与命名方案

### Rust workspace

在仓库根目录新增 Rust workspace，统一挂载桌面壳与知识核心：

- `Cargo.toml`
- `crates/goodnight-core/`
- `crates/goodnight-server/`
- `crates/goodnight-mcp-bridge/`
- `src-tauri/`

### 前端目录

保留现有 `src/`，新增知识区分层：

- `src/features/knowledge/api/`
- `src/features/knowledge/model/`
- `src/features/knowledge/store/`
- `src/features/knowledge/workspace/`
- `src/features/knowledge/editor/`
- `src/features/knowledge/search/`
- `src/features/knowledge/chat/`
- `src/features/knowledge/wiki/`
- `src/features/knowledge/graph/`

### 改名规则

- `atomic-core` -> `goodnight-core`
- `atomic-server` -> `goodnight-server`
- `mcp-bridge` -> `goodnight-mcp-bridge`
- `atomic_lib` -> `goodnight_lib`
- sidecar 二进制名改为 `goodnight-server`
- 对外 UI 文案中的 `Atomic` 全部改为 `GoodNight`

### 命名折中

首轮允许：

- 内核内部仍保留部分 `Atom` 类型命名
- 对外 UI 和业务层统一使用 `Note`

这样可以减少首轮 rename 噪音，把风险集中在架构和功能迁移上。

## 数据模型

### 新知识主模型

知识区主模型从 `RequirementDoc[]` 切换为数据库中的 `Note`。

最小核心实体：

- `notes`
  - `id`
  - `project_id`
  - `title`
  - `body_markdown`
  - `kind`
  - `source_path`
  - `status`
  - `created_at`
  - `updated_at`
- `note_tags`
- `note_links`
- `note_chunks`
- `chunk_embeddings`
- `note_metadata`

### 兼容层

旧工作流短期仍依赖 `RequirementDoc[]`，因此需要保留一层投影：

- `Note -> RequirementDoc`
- `RequirementDoc -> Markdown export`

原则：

- `RequirementDoc` 不再是知识主数据
- `RequirementDoc` 只是旧工作流的兼容视图

## 存储与数据流

### 旧数据流

- 前端扫描磁盘 Markdown
- 前端建立知识树
- 前端全文搜索
- 前端编辑后写回文件

### 新数据流

1. 打开项目
2. `src-tauri` 启动本地 `goodnight-server`
3. 前端获取 `baseUrl + token`
4. 知识区通过 HTTP / WS 与 `goodnight-server` 通信
5. `goodnight-core` 负责 note、chunk、embedding、search、chat、wiki、graph
6. Markdown 文件仅作为导入导出或兼容来源

### 文件系统角色

迁移后文件系统不再是知识主存储，但仍然保留三个角色：

- 旧项目 Markdown 导入来源
- 用户可导出的 Markdown 归档
- 附件与外部文件的 source/asset 路径引用

## 前端替换范围

### 直接接入或强复用的 Atomic 能力

- `CodeMirror` 编辑器
- 语义搜索与搜索面板
- tag selector / filter
- chat 视图
- wiki synthesis 阅读视图
- graph / canvas 视图

### 借结构但不原封搬的部分

- `Layout`
- `LeftPanel`
- `MainView`
- `TabStrip`

原因：

GoodNight 已经有自己的工作台壳，这些全局布局组件如果整块接入，会与主产品结构冲突。

### 不首轮接入的部分

- onboarding wizard
- mobile / iOS 相关页面
- browser extension 配套 UI
- dashboard 首页
- multi-database 管理页
- 远程自托管实例管理页

## 现有模块保留与替换

### 保留

- `src/App.tsx`
- `src/store/projectStore.ts`
- 项目切换和项目索引
- 页面结构、线框、设计板、AI workflow
- `.goodnight/*.json` 状态文件

### 逐步退出主路径

- `src/modules/knowledge/knowledgeSearch.ts`
- `src/modules/knowledge/knowledgeEntries.ts`
- `src/modules/knowledge/knowledgeTree.ts`
- `src/components/product/MilkdownEditor.tsx`
- `src/utils/projectPersistence.ts` 中知识主存储职责

## 四阶段实施方案

### 阶段 1：并入内核与 sidecar

目标：

- 迁入并改名 `goodnight-core / goodnight-server / goodnight-mcp-bridge`
- 建立 Rust workspace
- 让 `src-tauri` 启动本地 sidecar
- 前端拿到 `baseUrl + token`
- 跑通最小 note CRUD

涉及目录：

- `Cargo.toml`
- `crates/goodnight-core`
- `crates/goodnight-server`
- `crates/goodnight-mcp-bridge`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src/features/knowledge/api/*`

明确不做：

- 不换编辑器
- 不接 chat / wiki / graph
- 不删旧 Markdown 流
- 不改全局布局

验收标准：

- 应用启动时能带起本地 `goodnight-server`
- 当前项目能创建或打开 knowledge database
- 可以创建、读取、更新、删除 note

### 阶段 2：知识区切到新存储

目标：

- 知识区主数据源切到 `goodnight-server`
- 导入当前项目中的 `project/*.md`、`sketch/pages/*.md`、`design/*.md`
- 保留 Markdown 导出
- 用新的知识工作区替换旧知识数据入口

涉及目录：

- `src/features/knowledge/model/*`
- `src/features/knowledge/store/*`
- `src/features/knowledge/workspace/*`
- `src/components/product/ProductWorkbench.tsx`
- `src/utils/projectPersistence.ts`

明确不做：

- 不接完整 chat/wiki/graph 页面
- 不一次性移除所有旧知识类型

验收标准：

- 旧 Markdown 可导入为 notes
- 知识列表从数据库读取
- 新建/更新 note 走数据库
- 用户仍可导出 Markdown

### 阶段 3：替换编辑器与知识区交互

目标：

- 用 `CodeMirror` 替换 `Milkdown`
- 接语义搜索、命令搜索、tag 过滤
- 知识区 UI 变为 note-first 体验

涉及目录：

- `src/features/knowledge/editor/*`
- `src/features/knowledge/search/*`
- `src/components/product/MilkdownEditor.tsx`
- `src/components/product/KnowledgeWorkspace.tsx`

明确不做：

- 不替换全局工作台结构
- 不首轮迁整个 Atomic layout

验收标准：

- Markdown 编辑稳定
- 语义搜索可用
- note 打开、切换、过滤顺畅
- GoodNight 其他区域不受影响

### 阶段 4：补齐 AI 能力层与附件关联

目标：

- 接 chat
- 接 wiki synthesis
- 接 graph / canvas
- 引入附件与外部知识源关联

首轮支持的关联资产类型：

- `pdf`
- `docx`
- `xlsx / csv`
- `pptx`

这些类型首轮只做：

- 导入
- 预览或摘要
- 文本提取
- 与 notes 建立关系
- 进入检索链路

不做：

- 原生复杂编辑器

验收标准：

- notes 能参与 chat context
- wiki 能带引用生成
- graph 能显示 note/link/tag 关系
- 外部文件能挂到知识区并进入检索

## 风险与缓解

### 风险 1：一次改动过大

表现：

- Rust workspace
- sidecar server
- 数据模型
- 编辑器
- 前端知识区

都在同一时期爆发。

缓解：

- 严格分四期
- 每期都定义明确的“不做什么”

### 风险 2：旧工作流依赖 `RequirementDoc`

表现：

- 需求流和 AI workflow 仍依赖旧类型

缓解：

- 保留 `Note -> RequirementDoc` 投影层
- 旧逻辑先通过适配层读取

### 风险 3：直接并 Atomic 前端造成产品割裂

表现：

- 两套 layout
- 两套路由
- 两套信息架构

缓解：

- Atomic 前端只作为知识区模块复用
- 不接管 GoodNight 全局壳

### 风险 4：用户担心数据库锁定

表现：

- 数据可见性下降
- 外部编辑器兼容性下降

缓解：

- 持续保留 Markdown 导入导出
- 明确 source_path 与导出能力

## 测试与验证策略

每期至少覆盖：

- 启动与关闭流程
- 项目切换
- 数据迁移
- 编辑与保存
- 搜索与筛选
- 回归：项目壳、需求流、线框、AI workflow 不被破坏

建议验证方式：

- Rust：对 `goodnight-core` 和 `goodnight-server` 做单元与集成测试
- 前端：先做知识客户端和状态层测试，再做关键交互回归
- 桌面：验证 sidecar 生命周期、本地路径与导出流程

## 成功标准

迁移成功时，GoodNight 应满足：

- 知识区由数据库中心模型驱动
- Markdown 仍然可导入导出
- 现有 GoodNight 工作台仍保持完整
- 编辑器、搜索、chat、wiki、graph 能力逐步上线
- 旧 `RequirementDoc` 逻辑逐步退为兼容层，而不是继续充当知识主模型

## 实施前置条件

开始 implementation plan 前，需要先确认：

- 接受本地 sidecar 架构
- 接受知识区主模型由 `RequirementDoc` 切换为 `Note`
- 接受编辑器由 `Milkdown` 切换为 `CodeMirror`
- 接受阶段性过渡中同时存在“兼容层”和“新内核”
