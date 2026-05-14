# Platform Desktop UI Complete Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ALL-IN-ONE 整个平台桌面端 UI 完整统一到一套更接近 Apple Notes / Finder / macOS native 的工作台标准，覆盖桌面壳层、主工作区、AI 侧栏、目录树、文档面、无限画布、状态系统、动效和深色模式，同时不改现有业务功能与 AI runtime truth。

**Architecture:** 先收口平台级视觉基线与桌面壳层，再固化共享 primitives 与状态契约，随后按 Knowledge -> Agent/AI -> Page/Product -> Develop/Test/Ops -> Design 的顺序整模块迁移。所有页面都必须进入统一的 `rail -> source sidebar -> main stage -> companion pane -> status` 布局模型；所有主工作区只允许收口为 `note surface` 或 `infinite canvas` 两类中心语义。

**Tech Stack:** React 18, TypeScript, Zustand, Tauri, Allotment, CSS

---

## 0. Ground Truth

### 0.1 标准来源

- `design/workbench-unified-previews/ui-standards.html`
- `design/workbench-unified-previews/state-standards.html`
- `design/workbench-unified-previews/overview-home.html`
- `design/workbench-unified-previews/workbench-preview.css`
- `docs/superpowers/plans/2026-05-14-platform-ui-unification-execution-plan.zh-CN.md`

### 0.2 本计划补充约束

- 这不是局部换皮计划，而是桌面端整个平台统一计划。
- 不允许长期保留“新标准壳层 + 模块内部旧工具感”并存状态。
- 不改变 AI runtime truth、tool truth、approval truth、checkpoint truth。
- 不允许为追求统一而把 UI 语义下沉到 provider / runtime / canonical event 层。
- 优先消除乱码、渐变、玻璃感、重阴影、旧 demo 风格，再做细节打磨。

### 0.3 当前问题结论

- 顶层桌面壳层已经初步抽出，但尚未形成全模块统一布局入口。
- 共享 tokens / shell / primitives / states 已开始建立，但核心模块未全部迁移。
- Knowledge、Page、Agent、Design 仍保留明显局部样式岛与自定义布局语言。
- AI 区域仍保留较强工具感、气泡感、抽屉感，与 Notes-first 标准有偏差。
- 多处中文文案存在乱码，当前状态不满足可交付标准。

---

## 1. 完整交付标准

### 1.1 桌面端整体标准

- 整个产品首先像一个原生桌面应用，其次才像一组 AI / 设计 / 开发工具。
- 所有主角色页都必须从同一套 desktop shell 进入。
- 所有页面都必须遵守统一布局合同：
  - `rail`: 主模式切换，仅负责模式，不负责内容详情。
  - `source sidebar`: Notes / Finder 式来源列表、目录树、线程树、页面树。
  - `main stage`: 只允许 `note surface` 或 `infinite canvas` 成为视觉中心。
  - `companion pane`: AI、Inspector、Plan、Context 的次级辅助区。
  - `status`: 轻量状态与上下文，不成为主视觉。

### 1.2 视觉与交互标准

- 去掉大面积渐变、玻璃模糊、重阴影、厚圆角气泡。
- 保留克制的圆角、柔和层级、更多留白、图标优先。
- 所有 light / dark 表现必须同源，不允许暗色模式另起一套语言。
- 所有组件和页面状态必须覆盖：
  - `default`
  - `hover`
  - `selected`
  - `collapsed`
  - `empty`
  - `loading`
  - `error`
  - `warning`
  - `confirm`
  - `syncing`

### 1.3 AI 显示标准

- AI 是 companion，不是主舞台的替代品。
- `thinking / tool execution / final / confirm / question` 必须视觉分层清晰。
- 最终答案优先像可阅读正文，而不是聊天气泡集合。
- 工具执行和确认卡使用共享状态卡，不单独发明新卡型。

---

## 2. 文件结构与责任边界

### 2.1 平台基线与桌面壳层

- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/appNavigation.ts`
- Modify: `src/appTheme.ts`
- Modify: `src/features/desktopShell/desktopShell.ts`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/components/ui/index.ts`
- Modify: `src/components/ui/WorkbenchIcon.tsx`
- Modify: `src/components/ui/MacButton.tsx`
- Modify: `src/components/ui/MacField.tsx`
- Modify: `src/components/ui/MacPanel.tsx`
- Modify: `src/components/ui/MacDialog.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchFrame.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchRail.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchTopbar.tsx`
- Modify: `src/components/ui/workbench/InspectorPane.tsx`

### 2.2 平台样式基础

- Modify: `src/styles/workbench/tokens.css`
- Modify: `src/styles/workbench/shell.css`
- Modify: `src/styles/workbench/primitives.css`
- Modify: `src/styles/workbench/states.css`
- Modify: `src/styles/workbench/motion.css`
- Modify: `src/styles/workbench/legacy-bridge.css`

### 2.3 平台共享 primitives

- Modify: `src/components/ui/workbench/DirectoryTree.tsx`
- Modify: `src/components/ui/workbench/NoteSurface.tsx`
- Modify: `src/components/ui/workbench/StateCard.tsx`
- Modify: `src/components/ui/workbench/EmptyStateView.tsx`
- Modify: `src/components/ui/workbench/StatusBanner.tsx`

### 2.4 Knowledge / Wiki

- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx`
- Modify: `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`

### 2.5 AI / Agent

- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- Modify: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- Modify: `src/features/agent-shell/components/AgentChatStage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`

### 2.6 Product / Page / Develop / Test / Ops / Design

- Modify: `src/components/product/ProductPageWorkspacePane.tsx`
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/workspace/Workspace.css`
- Modify: `src/components/workspace/FileExplorer.tsx`
- Modify: `src/components/workspace/FileExplorer.css`
- Modify: `src/components/workspace/Terminal.tsx`
- Modify: `src/components/workspace/Terminal.css`
- Modify: `src/components/workspace/TestWorkbench.tsx`
- Modify: `src/components/workspace/OperationsWorkbench.tsx`
- Modify: `src/components/design/DesignWorkbenchScreen.tsx`
- Modify: `src/components/design/DesignWorkbenchView.tsx`
- Modify: `src/components/design/useDesignCanvasController.ts`
- Modify: `src/components/design/useDesignBoardState.ts`
- Modify: `src/components/design/designStylePackState.ts`

### 2.7 标准入口与文档

- Modify: `design/workbench-unified-previews/ui-standards.html`
- Modify: `design/workbench-unified-previews/state-standards.html`
- Modify: `design/workbench-unified-previews/overview-home.html`
- Modify: `AGENTS.md`

---

## 3. 执行顺序

### Task 0: 先把不可交付问题清掉，恢复干净基线

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/components/product/ProductPageWorkspacePane.tsx`
- Modify: `src/components/workspace/TestWorkbench.tsx`
- Modify: `src/components/workspace/OperationsWorkbench.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: 其他存在 mojibake 的用户可见文案文件

- [ ] 全仓扫描并修复所有用户可见乱码、异常符号、损坏中文文案。
- [ ] 把明显不符合标准的临时渐变、发光、玻璃模糊和重阴影列入清理清单并先移除最显眼部分。
- [ ] 确保计划文档、标准页和主应用的中文编码都正常。

**Acceptance:**
- 主应用无乱码。
- 标准页无乱码。
- 最显眼的旧工具感装饰不再出现在核心工作台首屏。

### Task 1: 固化桌面端统一壳层和整体布局合同

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/appNavigation.ts`
- Modify: `src/features/desktopShell/desktopShell.ts`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchFrame.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchRail.tsx`
- Modify: `src/components/ui/workbench/DesktopWorkbenchTopbar.tsx`
- Modify: `src/components/ui/workbench/InspectorPane.tsx`
- Modify: `src/styles/workbench/shell.css`

- [ ] 把顶层桌面端 contract 从“有一个外层 shell”升级为“所有模块必须进入同一套布局模型”。
- [ ] 统一 rail、source sidebar、main stage、companion pane、status 的尺寸和折叠规则。
- [ ] 让 `WorkbenchShell.tsx` 成为平台级布局容器，而不是 product 专用容器。
- [ ] 收口所有角色页的 chrome 密度，不允许模块自己决定顶层布局语言。

**Acceptance:**
- Agent、Knowledge、Page、Design、Develop、Test、Ops 都从同一套桌面布局语义进入。
- `App.tsx` 不再继续拼接局部布局特例。

### Task 2: 锁定平台级 tokens、primitives、states、motion

**Files:**
- Modify: `src/styles/workbench/tokens.css`
- Modify: `src/styles/workbench/primitives.css`
- Modify: `src/styles/workbench/states.css`
- Modify: `src/styles/workbench/motion.css`
- Modify: `src/styles/workbench/legacy-bridge.css`
- Modify: `src/components/ui/MacButton.tsx`
- Modify: `src/components/ui/MacField.tsx`
- Modify: `src/components/ui/MacPanel.tsx`
- Modify: `src/components/ui/MacDialog.tsx`
- Modify: `src/components/ui/WorkbenchIcon.tsx`
- Modify: `src/components/ui/workbench/StateCard.tsx`
- Modify: `src/components/ui/workbench/EmptyStateView.tsx`
- Modify: `src/components/ui/workbench/StatusBanner.tsx`
- Modify: `src/components/ui/workbench/DirectoryTree.tsx`
- Modify: `src/components/ui/workbench/NoteSurface.tsx`

- [ ] 把按钮、输入框、下拉、对话框、面板、图标、空态、提示条、状态卡收成一套标准。
- [ ] 统一 icon 尺寸、描边粗细、按钮密度、focus ring、selected state。
- [ ] 扩展状态系统，补齐 `warning / confirm / syncing / empty` 等语义。
- [ ] 补齐 light / dark 的同源定义与 hover / selected / loading / error 的完整表现。
- [ ] 动效只保留必要的原生感切换，不做装饰性炫技动画。

**Acceptance:**
- 同语义组件全平台只有一套表现。
- 所有共享 primitives 都可直接被后续模块复用。

### Task 3: 把 Knowledge / Wiki 做成平台视觉母版

**Files:**
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx`
- Modify: `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`

- [ ] 用共享 `DirectoryTree` 替换或吸收现有知识目录树表现。
- [ ] 把中间正文压成更干净的 `note surface`，增加留白，减少工具条存在感。
- [ ] 把临时预览、错误提示、保存状态、空态、附件预览全部并入共享状态系统。
- [ ] 保留 graph 的无限画布能力，但把 graph 周边 chrome、工具栏、空态改成统一语言。
- [ ] 移除知识区内残留的临时视觉 patch 和单点私有风格。

**Acceptance:**
- Knowledge 成为平台级 Notes-first 样板间。
- `tree / note / graph` 三种模式切换时，壳层语言不变。

### Task 4: 全量压平 AI 输出样式与 Agent 工作台

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- Modify: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- Modify: `src/features/agent-shell/components/AgentChatStage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`

- [ ] 把 AI 显示从大量气泡、抽屉、玻璃卡片压成“正文优先、过程次级”的布局。
- [ ] 用共享 `StateCard` 承载 tool / confirm / approval / question / summary。
- [ ] 把 Agent 左侧线程区压成 Notes / Finder 风格 source list。
- [ ] 把 Agent 中央 transcript 压成更像文档阅读面的干净舞台。
- [ ] 把 floating plan 收成 companion / inspector 风格，不再像悬浮主卡。
- [ ] 保持 AI runtime truth 与现有行为不变，只修改 render model 与 UI 组合层。

**Acceptance:**
- AI 不再主导整页视觉。
- Agent 页面整体像统一桌面应用，不像独立聊天工具。

### Task 5: Page / Product 区统一为标准桌面工作台

**Files:**
- Modify: `src/components/product/ProductPageWorkspacePane.tsx`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`

- [ ] 把 page tree、module list、canvas toolbar、属性浮层收回统一桌面语义。
- [ ] 用共享 `DirectoryTree` 替换页面树的局部实现。
- [ ] 把页面结构、模块列表、画布工具条、Markdown 编辑区全部接到统一 primitives。
- [ ] 保留 page canvas 功能和 wireframe 编辑能力，但外层 chrome 改成 Notes/Finder 风格。

**Acceptance:**
- Page / Product 不再保留临时 demo 工具感。
- 树、面板、浮层、正文、画布语言都与平台标准同源。

### Task 6: Develop / Test / Ops 全量并入统一桌面标准

**Files:**
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/workspace/Workspace.css`
- Modify: `src/components/workspace/FileExplorer.tsx`
- Modify: `src/components/workspace/FileExplorer.css`
- Modify: `src/components/workspace/Terminal.tsx`
- Modify: `src/components/workspace/Terminal.css`
- Modify: `src/components/workspace/TestWorkbench.tsx`
- Modify: `src/components/workspace/OperationsWorkbench.tsx`

- [ ] 让 develop 区进入统一 shell + tree + note/editor + terminal 的桌面布局语言。
- [ ] File Explorer 全面补齐 selected / collapsed / context menu / empty / loading / error 表现。
- [ ] 终端保留功能，但降低 IDE 工具感，去掉不必要装饰。
- [ ] Test / Ops 从“补出来的说明页”升级为真正的平台工作台页面。
- [ ] 补齐这些模块的 dark mode、状态页、空态和 companion 关系。

**Acceptance:**
- Develop、Test、Ops 虽然信息密度高，但仍属于同一套桌面产品。
- 没有明显第二套后台系统语言。

### Task 7: Design 工作台和无限画布标准收口

**Files:**
- Modify: `src/components/design/DesignWorkbenchScreen.tsx`
- Modify: `src/components/design/DesignWorkbenchView.tsx`
- Modify: `src/components/design/useDesignCanvasController.ts`
- Modify: `src/components/design/useDesignBoardState.ts`
- Modify: `src/components/design/designStylePackState.ts`

- [ ] 保留 canvas-first，但把左右栏、顶部工具、节点卡、Inspector、Context Menu 收到统一桌面标准。
- [ ] 把 design 节点、文本节点、流程节点、页面节点、样式节点统一到同一套卡片密度和状态逻辑。
- [ ] 补齐无限画布在 `default / hover / selected / collapsed / empty / loading / error` 下的整页视觉表现。
- [ ] 去掉设计区残留的高饱和 demo 感、重边框、重装饰。

**Acceptance:**
- Design 仍然专业，但不再是另一套视觉宇宙。
- 与 Knowledge Graph 一样，都属于平台定义下的 infinite canvas 变体。

### Task 8: 标准页、开发约束与真实实现对齐

**Files:**
- Modify: `design/workbench-unified-previews/ui-standards.html`
- Modify: `design/workbench-unified-previews/state-standards.html`
- Modify: `design/workbench-unified-previews/overview-home.html`
- Modify: `AGENTS.md`

- [ ] 把最终真实落地的 shell、tree、note surface、canvas、AI states、motion、dark mode 反写回标准页。
- [ ] 在 `AGENTS.md` 增加前端默认遵循这套标准的明确入口。
- [ ] 让标准页中的 light / dark / state / card / layout 与真实实现保持一一对应。

**Acceptance:**
- 标准页不再与主产品实现分叉。
- 后续前端开发有唯一标准入口。

### Task 9: 全平台清旧、验证、收尾

**Files:**
- Modify: `src/App.css`
- Modify: `src/styles/workbench/legacy-bridge.css`
- Verify: 全部已改动 UI 文件
- Verify: `design/workbench-unified-previews/*.html`

- [ ] 清理只服务旧风格的类名、渐变、玻璃感、重复 hover / selected / card 规则。
- [ ] 检查是否仍存在模块级样式岛、局部自定义 shell、重复树组件、重复状态卡。
- [ ] 对 light / dark、空态、错误态、折叠态、AI 状态页、无限画布状态页做完整核对。
- [ ] 运行构建和图谱更新，保证产物与图谱同步。

**Acceptance:**
- 仓库中不再存在明显第二套 UI 语言。
- 新功能后续可以直接复用 `desktop shell + directory tree + note surface + infinite canvas + ai state card` 五大原语。

---

## 4. 实施顺序建议

- [ ] Phase 1: Task 0 -> Task 1 -> Task 2
- [ ] Phase 2: Task 3 -> Task 4
- [ ] Phase 3: Task 5 -> Task 6 -> Task 7
- [ ] Phase 4: Task 8 -> Task 9

---

## 5. 关键验收清单

- [ ] 桌面端所有角色页都进入统一壳层与布局 contract。
- [ ] 所有目录树都来自统一 tree primitive 或与其完全同源。
- [ ] 所有主舞台都收口为 `note surface` 或 `infinite canvas`。
- [ ] AI 区域完成去气泡化、去玻璃化、去强工具感。
- [ ] 无乱码、无明显旧渐变、无重玻璃模糊残留。
- [ ] dark mode 与 light mode 完整对齐。
- [ ] 标准页、真实实现、AGENTS 入口三者一致。

---

## 6. 验证命令

- `npm run build`
- `graphify update .`
- 手动核对：
  - `design/workbench-unified-previews/ui-standards.html`
  - `design/workbench-unified-previews/state-standards.html`
  - `Knowledge / Agent / Page / Design / Develop / Test / Ops` 七个角色页

---

## 7. 结果定义

本计划完成时，ALL-IN-ONE 不应再呈现为“若干工具页面拼起来的工作区”，而应呈现为“一套统一桌面应用中的不同工作模式”。后续任何前端功能新增，都必须默认接入这套统一标准，而不是从局部页面重新发明自己的布局、卡片、状态和动效语言。
