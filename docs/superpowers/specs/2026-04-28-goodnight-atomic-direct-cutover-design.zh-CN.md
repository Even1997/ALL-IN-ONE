# GoodNight Atomic 知识区直切主模型设计

日期：2026-04-28

## 背景

当前仓库已经完成 Atomic 知识后端的第一阶段迁移：

- 根目录 Rust workspace 已建立
- `goodnight-core`、`goodnight-server`、`goodnight-mcp-bridge` 已导入
- Tauri 已能拉起本地 knowledge sidecar
- 前端已有 `knowledgeClient`、`knowledgeStore`
- 知识区已接入 `AtomicMarkdownEditor`

但当前产品路径仍处于“半迁移”状态：

- 知识区主模型仍然是 `RequirementDoc`
- sidecar `KnowledgeNote` 只是在 `ProductWorkbench` 中被映射回旧模型
- 新建、保存、删除仍然以 markdown 文件和 `RequirementDoc` 为先，再同步数据库
- `knowledgeEntries / knowledgeTree / knowledgeSearch` 仍然主导知识区读路径
- `similar / neighborhood / attachments` 等新能力虽然已有数据，但 UI 没有真正呈现
- `goodnight-mcp-bridge` 仍有明显 Atomic 残留命名和配置

这会导致知识区长期维持三套真相：

1. sidecar 数据库里的 note
2. 项目状态中的 `RequirementDoc`
3. 项目目录中的 markdown 文件

这种结构会持续阻碍 chat、wiki、graph、tag、import/export 等能力接入，因为每个新功能都必须跨过旧模型兼容层。

## 本次设计结论

本次迁移采用“直切主模型”方案：

- `KnowledgeNote` 成为知识区唯一主数据源
- `RequirementDoc` 从知识区主模型降级为兼容投影
- markdown 文件从主存储降级为导入导出和可选镜像层
- 知识区 UI 改为 note-first，而不是 RequirementDoc-first
- 旧的 knowledge modules 退出知识区主路径
- `goodnight-mcp-bridge` 要么迁干净并接入，要么至少清除 Atomic 残留并与 GoodNight 运行时约定一致

本次不是再加一层桥接，而是结束桥接。

## 目标

- 让知识区的读取、编辑、搜索、选择、关系能力直接围绕 `KnowledgeNote`
- 让数据库 note 成为唯一事实源
- 保留 markdown 导入导出能力，避免用户被数据库锁死
- 保留 GoodNight 现有产品外壳、项目流、需求流、页面结构、线框和 AI 工作台
- 为后续接入 chat、wiki、graph、tag、assets 提供干净的数据边界

## 非目标

- 不在本轮重写整个 `projectStore`
- 不把所有旧需求流一次性改成 note-native
- 不在本轮重做全局导航或整体布局
- 不在本轮引入完整的 Atomic dashboard、onboarding、mobile、extension UI
- 不强制所有项目都放弃 markdown 文件，只是不再把它作为知识区主存储

## 核心决策

### 1. 知识区唯一主模型是 `KnowledgeNote`

知识区页面内的主状态只允许直接使用以下类型：

- `KnowledgeNote`
- `KnowledgeSearchResult`
- `KnowledgeNeighborhoodGraph`
- `KnowledgeAttachment`

知识区内部不再把 `KnowledgeNote` 重新包一层回 `RequirementDoc` 再渲染。

### 2. `RequirementDoc` 降级为兼容投影

`RequirementDoc` 仍然保留，但职责收缩为：

- 给旧的 PRD / requirement / graph 生成流程提供输入
- 作为从 note 投影出来的兼容视图
- 作为旧项目快照数据的读兼容层

`RequirementDoc` 不再是知识区主读写模型，也不再是知识区 UI 的一等输入。

### 3. 数据库优先，文件次之

知识区中的新建、保存、删除行为改为：

1. 先读写 sidecar note
2. 再根据项目设置决定是否同步 markdown 镜像
3. 最后仅在旧流程消费者实际需要时刷新 `RequirementDoc` 投影

这意味着：

- note 是 source of truth
- markdown 是 derived artifact
- `RequirementDoc` 是 compatibility projection

### 4. 旧 knowledge modules 退出主路径

以下模块不再主导知识区：

- `src/modules/knowledge/knowledgeEntries.ts`
- `src/modules/knowledge/knowledgeTree.ts`
- `src/modules/knowledge/knowledgeSearch.ts`

它们可以短期保留，作为过渡期中非知识区页面的兼容工具，但不再承担知识区主渲染逻辑。

### 5. 知识区 UI 改成 note-first

知识区界面以 note 为中心，而不是以 requirement 文件为中心：

- 左侧：note 列表、目录、筛选、搜索结果
- 主区：note 编辑 / 预览
- 右侧或下方：相似内容、邻域关系、附件、图摘要

现在已经从 store 中拿到的 `similarEntries`、`neighborhoodEntries`、`graphNodeCount`、`attachments` 等数据，必须成为可见产品能力，而不是仅停留在 props 上。

## 现状问题与对应改法

### 问题 1：`ProductWorkbench` 仍然把 sidecar note 映射回 `RequirementDoc`

现状：

- `serverNotes` 先映射为 `serverBackedRequirementDocs`
- 然后继续走 `buildKnowledgeEntries`
- 然后继续走 `buildKnowledgeTree`
- 搜索仍保留旧 `FlexSearch` 路径

改法：

- `ProductWorkbench` 直接消费 `useKnowledgeStore`
- 新增 note-native 的列表、筛选、目录和当前选中逻辑
- 旧的 `serverBackedRequirementDocs` 逻辑删除

### 问题 2：写入链路仍然是文件优先

现状：

- 新建通过 `writeRequirementFile` 直接创建 markdown 文件
- 保存通过 `writeRequirementFile` 和 `updateRequirementDoc` 先写旧层
- 删除通过 `removeRequirementFile` 和 `deleteRequirementDoc` 先删旧层

改法：

- 新建：先创建 note，再按需要生成 markdown 镜像
- 保存：先更新 note 内容，再同步 markdown 镜像
- 删除：先删除 note，再处理 markdown 镜像和兼容投影

### 问题 3：知识区 props 和 UI 脱节

现状：

- 组件已接收相似内容、邻域图、附件、来源、派生项等数据
- 但主体 UI 只渲染树和编辑器

改法：

- 将这些数据转成稳定的“上下文卡片区”
- 让相似内容、关系、附件成为可点击的知识上下文面板
- 本轮 graph 能力以摘要、计数和跳转为主，不要求接入完整 canvas

### 问题 4：MCP bridge 仍带 Atomic 标识

现状：

- `goodnight-mcp-bridge` 中仍有 `Atomic MCP Bridge`
- 仍使用 `ATOMIC_TOKEN / ATOMIC_PORT / ATOMIC_HOST`
- 仍读取 `com.atomic.app` 和 `local_server_token`

改法：

- 改为 GoodNight 命名和目录约定
- token 文件名与 Tauri sidecar 约定保持一致
- 环境变量改成 `GOODNIGHT_*`
- 日志与文案统一为 GoodNight

## 目标架构

### 前端边界

`src/features/knowledge/` 下形成明确分层：

- `api/`
  - 只负责调用 sidecar
- `model/`
  - 只定义 note、search、graph、attachment 相关类型
- `store/`
  - 只保存 knowledge 运行态
- `workspace/`
  - 负责 note-first UI
- 可新增 `adapters/`
  - 负责 note -> `RequirementDoc` 的兼容投影

### `ProductWorkbench` 的新职责

`ProductWorkbench` 继续作为产品工作台容器，但在知识区范围内只做：

- 当前 project 的 knowledge scope 管理
- knowledge store 的加载与刷新
- 知识区选中状态和外层动作编排
- 与设计流、页面流的桥接

它不再负责手工拼装旧式 knowledge tree/search/doc 视图模型。

### 兼容投影边界

当旧流程仍需要 `RequirementDoc` 时，统一从 adapter 层投影：

- `KnowledgeNote -> RequirementDoc`
- `KnowledgeNote[] -> RequirementDoc[]`

投影只发生在旧流程入口处，不在知识区 UI 内部反复发生。

## 数据流设计

### 读取

新数据流：

1. 进入知识区
2. `loadNotes(projectId)`
3. 按当前交互场景加载 search、similar、neighborhood
4. UI 直接渲染 note-native 结果

旧数据流将被移除：

- `RequirementDoc[] -> knowledgeEntries -> knowledgeTree -> knowledgeSearchState`

### 写入

保存 note：

1. 编辑器更新本地 draft
2. 提交时调用 `updateProjectNote`
3. store 更新当前 note
4. 若启用 markdown 镜像，则同步到对应文件
5. 若旧流程需要，则刷新兼容投影

### 导入

Markdown 导入：

1. 读取 markdown 文件内容
2. 创建或更新 note
3. 记录 `sourceUrl` 或镜像路径
4. 刷新 note 列表

### 删除

删除 note：

1. 删除数据库 note
2. 若存在镜像文件，则按策略删除或保留
3. 清理当前选择和兼容投影

## markdown 镜像策略

本轮引入明确策略，避免再次回到“三套真相”：

- 默认：note 为主，markdown 为镜像
- 已有项目中的 markdown 文件可作为导入来源
- 用户从知识区编辑 note 时，若 note 已绑定项目内 markdown 路径，则同步覆盖镜像
- 用户新建纯数据库 note 时，可以暂不创建 markdown 文件

因此，文件系统角色变为：

- 导入来源
- 用户可见导出格式
- 对已绑定镜像路径的 note 同步镜像
- 附件路径锚点

而不是主数据库。

## UI 设计

### 左侧栏

左侧以 note 为中心，不再按 requirement 文件概念组织。

包含：

- 搜索框
- 新建 note
- 导入 markdown
- 导入 assets
- note 列表
- 轻量目录/分组
- 搜索结果态

若仍需树结构，树节点应该来自 note 元数据和镜像路径，而不是旧 `knowledgeTree` 推导结果。

### 主编辑区

主编辑区继续使用 `AtomicMarkdownEditor`。

能力要求：

- 编辑当前 note 正文
- 处理只读 artifact
- 显示更新时间和保存状态
- 支持从相似项/关系项切换到其他 note

### 上下文侧栏

侧栏或下区需要真正展示：

- 来源 note
- 派生 note
- 相似 note
- 邻域关系摘要
- 附件
- 附件分类计数

本轮不要求完整 graph canvas，但必须让已有 graph 数据对用户可见。

## `RequirementDoc` 兼容策略

旧流程仍会依赖 `RequirementDoc`，但只允许通过 adapter 获取：

- PRD 构建
- requirement graph
- 老项目快照恢复
- 旧 AI 工作流输入

需要保证：

- 投影字段规则稳定
- `filePath` 缺失时也能从 note 构造兼容对象
- 旧流程不要反向修改 note 主状态

也就是说兼容是单向投影，不是双向双写。

## `goodnight-mcp-bridge` 设计

本轮至少完成以下清理：

- 注释、日志、标题统一为 GoodNight
- 数据目录改为 GoodNight app data dir
- token 文件名与 `goodnight_local_server_token` 体系对齐
- 环境变量改为 `GOODNIGHT_TOKEN / GOODNIGHT_PORT / GOODNIGHT_HOST`

如果当前桌面产品尚未真正调用 bridge，也要保证它在仓库语义上已经完成品牌和运行时迁移，不再误指向 Atomic。

## 迁移顺序

为降低风险，本轮按以下顺序执行：

### 阶段 A：切主数据源

- 删除 `serverBackedRequirementDocs` 知识区主路径
- 知识区改为直接使用 `KnowledgeNote`
- 保留旧 requirement 流，但退到 adapter 层

### 阶段 B：切 CRUD 主链路

- 新建、保存、删除改为 note-first
- markdown 文件变成镜像层
- 旧 `updateRequirementDoc / deleteRequirementDoc / writeRequirementFile` 不再主导知识区

### 阶段 C：切知识区 UI

- 列表、搜索、选中、编辑改为 note-native
- 把相似内容、关系、附件真正渲染出来

### 阶段 D：退出旧 knowledge modules

- 让 `knowledgeEntries / tree / search` 退出知识区主路径
- 如仍被其他区域使用，暂时保留兼容，但不再作为知识区核心依赖

### 阶段 E：清理 MCP 残留

- 修正命名、配置和 token 路径
- 验证构建与运行时一致性

## 测试与验证

### 前端

至少验证：

- 进入知识区能加载 note 列表
- 搜索直接命中 note 结果
- 新建 note 成功
- 保存 note 后刷新仍可读
- 删除 note 后列表和选中态正确更新
- 相似内容、邻域、附件能在 UI 中可见
- 非知识区页面不回归

### Rust / Tauri

至少验证：

- `cargo check -p tauri-app`
- sidecar 启动与 token 读取正常
- `goodnight-mcp-bridge` 编译通过
- sidecar 配置与 bridge 命名一致

### 构建

至少验证：

- `npm run build`
- 如果增加针对 knowledge adapter 或 workspace 的测试，相关测试通过

## 风险与缓解

### 风险 1：旧需求流被一起带崩

缓解：

- 只在旧流程入口做 `KnowledgeNote -> RequirementDoc` 投影
- 不在旧流程内部大改业务语义

### 风险 2：markdown 镜像与 note 不一致

缓解：

- 明确 note 才是唯一事实源
- 所有写入先到 note，再同步镜像

### 风险 3：知识区 UI 一次改动过大

缓解：

- 保留现有外壳
- 只替换知识区内部数据和交互
- 每一步保持构建通过

### 风险 4：MCP bridge 清理后与现有脚本约定不一致

缓解：

- 把环境变量、token 文件名、数据目录一次写清楚
- 以 Tauri 侧当前约定为准，而不是桥接程序自说自话

## 成功标准

本次迁移完成后，应满足：

- 知识区内部不再以 `RequirementDoc` 为主模型
- 知识区主路径不再依赖 `knowledgeEntries / knowledgeTree / knowledgeSearch`
- 新建、保存、删除以 note 为主，不以文件为主
- `AtomicMarkdownEditor` 所在知识区真正成为 note-first 工作区
- 相似内容、关系、附件至少以摘要方式对用户可见
- `goodnight-mcp-bridge` 不再保留 Atomic 运行时残留
- `npm run build` 与 `cargo check -p tauri-app` 通过

## 实施前提

开始 implementation 前默认接受以下原则：

- 知识区可以与旧需求流短期共存，但不再共享主模型
- 兼容层是单向投影，不是长期双写
- markdown 不是知识区主真相
- 本轮优先完成“迁移真正结束”，而不是维持表面稳定
