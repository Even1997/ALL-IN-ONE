# PAG 目录树缺口补齐与一次性执行计划
- 日期：2026-05-16
- 状态：已确认，暂不零碎实现，待在 `main` 一次性执行
- 关联设计：
  - `docs/superpowers/specs/2026-05-15-pag-document-workbench-design.zh-CN.md`
  - `design/workbench-unified-previews/ui-standards.html`
  - `design/workbench-unified-previews/state-standards.html`

## 背景

`2026-05-15` 的 PAG 文档工作台设计已经把左侧目录树定义为 Phase 1 能力，要求支持：

- 真实文件系统目录树，而不是仅有页面结构树
- CRUD
- 多选
- 排序
- 搜索
- 右键菜单
- 外部拖拽导入

但当前 `PAG` 实现仍然主要是页面草图工作区：

- 左侧使用的是 `pageStructure -> filteredPageStructure -> ProductPageWorkspacePane`
- 渲染的是 `PageStructureNode` 的页面层级树
- 当前交互仅覆盖搜索、选中、展开、加页面、删页面

因此，现状与 `2026-05-15` 设计之间存在清晰缺口。这个缺口不是“目录树能力完全没有”，而是“知识区已有目录树能力，PAG 尚未接入并改造成文档工作台版本”。

## 当前实现判断

### 已经存在的基础

- `documentProjection` / `documentWorkbenchTypes` / `documentProjectionStore` 已经提供了 PAG 文档投影层基础
- `KnowledgeNoteWorkspace` 已经拥有较完整的目录树状态与交互实现：
  - 折叠状态
  - 多选
  - 右键菜单
  - 排序
  - 外部拖拽导入目标定位
  - 真实文件树构建
- `DirectoryTree` 已经提供了符合 workbench 标准的通用目录树视觉骨架

### 当前真正缺的部分

- `PAG` 左侧数据源仍然是 `pageStructure`，不是项目文件系统
- `PAG` 左侧树节点仍然是页面节点，不是文件/文件夹节点
- `PAG` 尚未接入多选、右键菜单、排序、拖拽导入、文件夹 CRUD
- `PAG` 中间主工作面仍然偏页面/线框编辑，不是文档工作台单一主工作面
- `PAG` 左树与 `DocumentProjection` 主工作流还没有形成完整闭环

## 执行决策

本次先补文档，不做零碎实现。后续采用“在 `main` 上一次性执行”的策略，原因如下：

- 这是一个跨数据源、左树交互、主工作面、AI 引用入口的联动改造，不适合拆成若干零散小补丁
- 如果先局部替换左树样式而不改数据源，会制造“看起来像目录树、实际上还是页面树”的中间态
- 现有仓库中与 PAG、AIChat、KnowledgeNoteWorkspace 相关改动较多，一次性收口更容易控边界和回归验证

执行原则：

- 不先做半套目录树 UI
- 不把文件树能力硬塞进旧的 `PageStructureNode` 语义
- 不为了左侧显示效果去改动 runtime truth
- 先把 `PAG` 明确切成“文件树 -> 文档工作面 -> AI companion”结构，再落交互

## 目标结果

一次性执行完成后，`PAG` 应满足以下状态：

- 左侧变成真实文件系统目录树，符合 Finder / Notes 风格
- 中间主区以文档工作面为主，而不是页面树驱动的草图主视图
- 用户可以在 PAG 内完成文档浏览、轻编辑、AI 引用、系统打开
- 左树与 `DocumentProjection`、`SelectionProjection`、AI 引用卡片流程打通
- 原页面草图能力如果保留，必须降为次级模式或明确从 PAG 主路径退出

## 非目标

- 不在这次执行里同时重构整个 knowledge/runtime
- 不追求首版完整 Office fidelity
- 不在 provider/runtime 层加入 UI 专用目录树策略
- 不把知识区旧实现整体复制粘贴到 PAG，而是抽取可复用能力

## 一次性执行范围

### 1. 锁定 PAG 左侧数据源

把 `PAG` 左侧从 `pageStructure` 切到真实文件系统扫描结果，至少覆盖：

- 文件夹
- 文件
- 空目录
- 文件扩展名与类型标识
- 文件更新时间
- 当前选中路径

要求：

- 左树真相来源是文件系统扫描结果
- 页面结构树不再充当 PAG 左侧主导航真相
- 如果仍需保留 `pageStructure`，只能作为草图/线框子能力的数据，不再作为 PAG 左树来源

### 2. 抽取并复用知识区目录树交互内核

优先从 `KnowledgeNoteWorkspace` 抽取或整理以下能力，而不是重新发明一套：

- 折叠/展开状态管理
- 单选、多选、`Shift` 连选、`Ctrl/Command` 多选
- 右键上下文菜单状态
- 排序状态
- 拖拽导入目标状态
- 选中路径与活动路径的区分

要求：

- 抽出的能力可以服务于 PAG
- 不把知识区特有 note 语义强耦合进 PAG 通用树状态

### 3. 把目录树视觉统一到 workbench 标准

左侧树的视觉应优先复用通用 `DirectoryTree` 或在其基础上增强，而不是继续保留 `pm-page-tree-*` 为核心主实现。

要求：

- 保持 `rail -> sidebar -> main stage -> companion pane` 结构
- 目录树是文本树，不是卡片堆叠
- 有明确的默认、hover、selected、expanded、drag-over、empty、loading、error 状态
- 支持 light/dark 主题一致性

### 4. 补齐目录树交互能力

PAG 左树至少补齐以下能力：

- 新建文件
- 新建文件夹
- 重命名
- 删除
- 刷新
- 复制路径
- 系统打开
- 导入到此处
- 多选批量删除
- 搜索过滤
- 名称排序
- 更新时间排序
- 创建时间排序

要求：

- 所有文件操作都走真实文件系统接口
- 操作失败时保留原树状态并给出明确反馈
- 不伪造磁盘上不存在的节点

### 5. 补齐外部拖拽导入

复用知识区现有导入策略，接入 PAG 左树：

- 外部拖入文件到文件夹节点
- 外部拖入文件夹到文件夹节点
- 拖到空白区时导入当前目录或项目根目录
- 冲突时支持覆盖 / 跳过 / 自动重命名
- 单文件导入后自动打开
- 批量导入后显示结果摘要

### 6. 接通 PAG 文档工作面

目录树选中文件后，中间主区必须进入统一文档工作面，而不是继续默认进入页面草图主路径。

要求：

- 选中文件时加载 `FileWorkbenchViewModel`
- 基于 `DocumentProjection` 渲染文档内容
- 顶部提供整文 `加入 AI`
- 选区提供片段 `加入 AI`
- 右键提供 `加入 AI`
- 右上角提供系统打开

### 7. 明确旧页面树的去留

执行时必须做一个明确决定，不能维持 PAG 里两套同级左树：

方案 A：
- PAG 主路径切到文档工作台
- 页面结构树退出 PAG 主左栏，迁到次级模式或独立草图入口

方案 B：
- PAG 保留页面能力，但页面树降为文档工作台内部的一个次级面板，不再与文件树竞争主导航

默认推荐方案 A。

## 推荐改动文件范围

预计会涉及但不限于：

- `src/components/product/ProductWorkbench.tsx`
- `src/components/product/ProductPageWorkspacePane.tsx`
- `src/components/ui/workbench/DirectoryTree.tsx`
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- `src/features/knowledge/workspace/documentProjection.ts`
- `src/features/knowledge/workspace/documentProjectionStore.ts`
- `src/features/knowledge/workspace/documentWorkbenchTypes.ts`

如果执行时需要新增文件，优先考虑：

- PAG 专用目录树 view model / controller
- 可复用的文件树状态 hook
- PAG 文档工作面组件

## 实施顺序

推荐按以下顺序在 `main` 一次性完成：

1. 锁定 PAG 左树真相来源，切到文件系统扫描结果
2. 抽取知识区目录树状态机与交互逻辑
3. 接入 PAG 左侧目录树并统一视觉
4. 打通 CRUD / 多选 / 排序 / 右键菜单 / 拖拽导入
5. 让选中文件进入统一文档工作面
6. 接通 `DocumentProjection` 与 AI 引用入口
7. 处理旧页面树迁移或降级
8. 完成 PAG 回归测试与图谱更新

## 验收标准

### 目录树

- PAG 左侧显示真实项目文件树
- 支持单选、多选、`Shift` 连选、`Ctrl/Command` 多选
- 支持展开/收起并记住状态
- 支持排序、搜索、右键菜单、批量删除
- 支持空目录、加载中、错误态

### 拖拽导入

- 可从系统资源管理器拖入文件和文件夹
- 可识别导入目标目录
- 可处理重名冲突
- 导入后自动刷新

### 文档工作面

- 选中文件后主区打开统一文档工作面
- 常见文档类型能预览或轻编辑
- `加入 AI` 入口覆盖整文、选区、右键三种路径
- 系统打开按钮可用

### 架构边界

- 不把目录树显示逻辑塞进 provider/runtime truth
- `DocumentProjection` 继续作为 AI 的读取真相
- `thinking / tool / feedback / final` 语义边界不被这次改造破坏

## 风险与约束

- 如果先保留 `pageStructure` 作为 PAG 主左树，后续会继续拖住文档工作台切换
- 如果只改视觉不改数据源，会形成伪目录树
- 如果把知识区组件整块搬过来，容易把 note 语义和 PAG 文档语义缠死
- 如果同时大改 PAG、AIChat、knowledge 主路径，回归面会显著扩大

因此，本次执行必须坚持：

- 目录树真相优先
- 文档工作面主路径优先
- 复用交互内核，而不是复用整页语义

## 默认执行备注

后续真正开始实现时，默认按本计划在 `main` 上一次性收口，不再先做一版过渡性的“半目录树 PAG”。
