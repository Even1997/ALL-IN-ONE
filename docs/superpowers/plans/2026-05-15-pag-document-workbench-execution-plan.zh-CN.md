# PAG 文档工作台改造执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PAG 从知识/文件侧边页升级为统一的文档工作台，让用户可以在页内完成目录管理、多格式文档读取、轻编辑、AI 引用和系统打开，同时保持复杂内容可通过系统应用兜底。

**Architecture:** 保持现有 `ProductWorkbench -> KnowledgeNoteWorkspace` 的 PAG 入口关系不变，新增统一文件工作台状态模型与 `DocumentProjection` 投影层，在 `左树 -> 主区 -> AI companion` 契约内逐步接入目录树增强、拖拽导入、多格式预览、轻编辑、AI 引用和系统打开。不改变 runtime truth，不把文档显示策略下沉到 provider/runtime 层。

**Tech Stack:** React, TypeScript, Tauri invoke, existing workbench UI, project filesystem persistence, AI reference card flow

---

## 0. Ground Truth

### 0.1 当前入口与核心工作区

- `ProductWorkbench.tsx` 仍是 PAG 主入口编排层。
- `KnowledgeNoteWorkspace.tsx` 已具备目录树、文件打开、预览骨架，是本次主工作区演进基础。
- 当前文件预览模型主要停留在 `markdown | code` 两类，需要扩展为统一文件工作台状态模型。
- 当前已有 `open_path_in_shell`，可直接作为系统打开动作底座。

### 0.2 架构约束

- 不新开第二套 PAG 工作台入口。
- 不为了页内展示需求修改 AI runtime truth。
- 不把“已加入 AI”状态条放回文档区。
- 复杂文档格式首版允许轻编辑与只读混合，不追求一次性完整 fidelity。

---

## 1. File Map

### 1.1 主要触达层

- `src/components/product/ProductWorkbench.tsx`
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- `src/utils/projectPersistence.ts`
- 相关文件类型投影、引用与主区视图模型模块

### 1.2 允许新增的工作台级模块

- 文件工作台状态模型
- `DocumentProjection` 与 `SelectionProjection` 类型/桥接
- 多格式读取与投影适配器
- 系统图标与系统打开动作桥接

---

## 2. Execution Order

### Task 1: 固化 PAG 壳层与入口边界

**涉及层级：**
- `ProductWorkbench` 编排层
- `KnowledgeNoteWorkspace` 主工作区层

- [ ] 确认 PAG 主入口继续由 `ProductWorkbench` 编排，不新开第二套工作台入口。
- [ ] 确认主工作区继续以 `KnowledgeNoteWorkspace` 为核心承载，不把新能力散落到多个页面。
- [ ] 固化 `左树 -> 主区 -> AI companion` 的布局契约，后续能力都在该契约内扩展。

**Acceptance:**
- PAG 壳层仍保持 `左树 -> 主区 -> AI companion`。
- 新能力的实现边界清晰，不形成平行入口。

### Task 2: 目录树升级为文件管理器

**涉及层级：**
- 目录树 UI
- 文件操作与选择态

- [ ] 增加多选、连选、排序、搜索、右键菜单、空态、错误态。
- [ ] 打通新建笔记、新建文件、新建文件夹、重命名、删除、批量删除、复制路径、系统打开。
- [ ] 保持 Finder/Notes 风格目录树，不引入卡片式文件管理器。

**Acceptance:**
- 目录树达到“可管理文件”的程度，而不是只读导航。
- 树节点的操作覆盖创建、查找、选择、删除、定位、系统打开。

### Task 3: 外部拖拽导入

**涉及层级：**
- 目录树 drag/drop 状态
- 文件复制与导入流程

- [ ] 为目录树增加 `drag-over`、`drop target` 与落点高亮。
- [ ] 支持文件和文件夹递归复制进入当前目录或目标文件夹。
- [ ] 支持重名处理策略：覆盖、跳过、自动重命名。
- [ ] 导入完成后执行刷新与自动打开规则：单文件自动打开，批量导入显示结果摘要。

**Acceptance:**
- 外部拖拽进入 PAG 后可稳定导入。
- 落点反馈、重名策略、自动刷新行为完整可用。

### Task 4: 统一文件工作台状态模型

**涉及层级：**
- 主区文件状态
- 预览/编辑能力分类

- [ ] 将当前 `markdown | code` 预览模型扩展为统一文件工作台状态模型。
- [ ] 新增 capability 分类：`preview`、`edit`、`reference`、`system-open`。
- [ ] 让不同文件类型都走同一套主区状态流，而不是各自拼局部分支。

**Acceptance:**
- 后续任何格式都走统一主区状态模型。
- capability 能决定文件在 PAG 内可预览、可轻编辑、可引用、可系统打开。

### Task 5: 构建 DocumentProjection 与引用桥

**涉及层级：**
- 文档读取与投影层
- AI 引用层

- [ ] 定义整文投影、块级投影、选区投影、AI 引用载荷。
- [ ] 实现顶部 `加入 AI`。
- [ ] 实现选中后 `加入 AI`。
- [ ] 实现右键 `加入 AI`。
- [ ] 让引用结果进入聊天窗口上方引用卡片，而非文档状态区。
- [ ] 同步产出 `projection.json` 与 `projection.md`。

**Acceptance:**
- 整文和片段两级引用全打通。
- 文档区不新增“已加入 AI”状态条。

### Task 6: Word 轻编辑

**涉及层级：**
- Word 文档块编辑视图
- Word 投影与回写

- [ ] 先做标题、段落、列表、简单表格块编辑。
- [ ] 将复杂样式、分页、脚注等降级为只读或系统打开建议。
- [ ] 打通整文引用与段落/片段引用。
- [ ] 轻编辑内容可保存回源文件或源投影对应落盘流程。

**Acceptance:**
- 常见文档内容可修改、可保存、可引用到 AI。
- 复杂样式文档不会因未覆盖能力而崩溃。

### Task 7: Excel 轻编辑

**涉及层级：**
- 表格主区视图
- Sheet / 区域交互与回写

- [ ] 支持 Sheet 切换。
- [ ] 支持单元格编辑、行列增删、区域选择。
- [ ] 支持区域 `加入 AI`。
- [ ] 将复杂公式、图表、透视表、宏降级。

**Acceptance:**
- 表格可改、区域可引用、AI 可读区域数据。
- Sheet 与区域交互不依赖外部打开才能完成基础工作流。

### Task 8: PPT 轻编辑

**涉及层级：**
- Slide 列表
- 当前页结构化编辑

- [ ] 支持 slide 列表、标题、正文、bullet、notes 编辑。
- [ ] 支持 slide 整页引用与局部文本引用。
- [ ] 将复杂布局、动画、母版、图表降级。

**Acceptance:**
- 内容结构可改、slide 可引用、复杂场景可系统打开。

### Task 9: PDF 与图片主区预览

**涉及层级：**
- PDF 主区预览
- 图片主区预览

- [ ] PDF 做分页预览与文本抽取。
- [ ] 图片做原生预览与元信息展示。
- [ ] PDF 和图片都支持顶部 `加入 AI`。

**Acceptance:**
- PDF / 图片不再只走外部打开。
- 用户能在 PAG 内完成预览、引用、再决定是否系统打开。

### Task 10: 右上角系统打开图标

**涉及层级：**
- 主区顶部动作
- 系统打开桥接

- [ ] 增加统一位置的系统打开动作。
- [ ] 优先取系统默认关联应用图标，失败时降级为统一图标。
- [ ] 点击直接调用 `open_path_in_shell`。
- [ ] 文件未落盘或路径不存在时按钮置灰。

**Acceptance:**
- 所有已落盘文件都可一键交给系统应用。
- 系统打开按钮与 PAG 轻编辑并存，不打断主工作流。

### Task 11: 回归与文档同步

**涉及层级：**
- PAG 文档工作流全链路
- 设计稿与实现一致性

- [ ] 验证 PAG 文档工作流、AI 引用、系统打开、拖拽导入、多格式打开与轻编辑。
- [ ] 如实现边界与设计稿有偏差，回写设计稿。
- [ ] 运行 `graphify update .`。

**Acceptance:**
- 设计稿与实现不分叉。
- PAG 的目录管理、预览、轻编辑、AI 引用和系统打开形成闭环。

---

## 3. Recommended Commit Order

- [ ] Commit 1: `docs(pag): add pag document workbench design`
- [ ] Commit 2: `docs(pag): add pag document workbench execution plan`
- [ ] Commit 3: `feat(pag-tree): upgrade pag tree to file manager`
- [ ] Commit 4: `feat(pag-import): add external drag and drop import`
- [ ] Commit 5: `feat(pag-projection): add document projection and ai reference bridge`
- [ ] Commit 6: `feat(pag-word): add word light editing`
- [ ] Commit 7: `feat(pag-sheet): add excel light editing`
- [ ] Commit 8: `feat(pag-slide): add ppt light editing`
- [ ] Commit 9: `feat(pag-preview): add pdf and image preview`
- [ ] Commit 10: `feat(pag): add system-open action`

---

## 4. Verification Checklist

- [ ] 目录树支持单选、多选、`Shift` 连选、右键菜单、拖拽导入、重名处理、批量删除。
- [ ] 顶部整文 `加入 AI`、选区 `加入 AI`、右键 `加入 AI` 全部可用。
- [ ] 聊天窗口上方出现引用卡片，不出现额外状态条。
- [ ] Word 标题/段落/列表/简单表格编辑保存可用。
- [ ] 复杂样式 Word 文档降级不崩溃。
- [ ] Excel Sheet 切换、单元格修改、区域引用可用。
- [ ] PPT slide 标题/正文/notes 编辑与引用可用。
- [ ] PDF / 图片支持页内预览与顶部 `加入 AI`。
- [ ] 右上角系统打开按钮能打开系统默认程序，文件不存在或未落盘时按钮置灰。
- [ ] `npm run build`
- [ ] 与现有 PAG / knowledge 流程不冲突。
- [ ] `graphify update .`

---

## 5. Done Definition

- 用户能把 PAG 当作文档工作台使用，而不仅是知识/文件侧边页。
- 目录树已具备文件管理器能力，多格式文档可在页内读取与轻编辑。
- `加入 AI` 已统一为顶部/选区/右键三种入口，并以聊天引用卡片为唯一反馈。
- 右上角系统打开动作稳定存在，成为复杂场景的标准兜底出口。
- PAG 的后续文档工作流迭代可以直接在统一状态模型与 `DocumentProjection` 上继续增强，而不是重新开第二套实现。
