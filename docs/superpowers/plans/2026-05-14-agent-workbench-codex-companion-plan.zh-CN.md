# Agent Workbench Codex Companion Plan

**Goal:** 把当前 `agent-workbench-companion` 从“右侧空白卡位”升级为平台级 `utility sidebar`，同时把 `Codex` 风格的运行信息收进主舞台内的 `floating run companion`。最终效果要更像真实桌面工具，而不是一个固定的右侧计划卡。

**Design Direction:**
- 主舞台内的悬浮运行卡，承载本轮任务的进度、分支、产物、终端和来源。
- 最右侧固定栏，承载审查、浏览器、diff、文件检查和 inspector 类能力。
- 全平台共享同一套壳层语言，不再让 Agent 页面单独发明一套右侧语义。
- 保持 Notes / Finder / macOS 原生气质，避免气泡化、卡片堆叠和重渐变。

**Non-Goals:**
- 不改 AI runtime truth、tool boundary、canonical event semantics。
- 不把审查/浏览器做成 Agent 专属功能。
- 不在右侧栏里继续堆“计划卡 + 记忆卡 + 工具卡”的拼贴式布局。

## 1. Target Shape

### 1.1 Shell Roles
- `rail`: 全局模式切换，保持窄、图标优先。
- `source sidebar`: 线程、目录、页面树、会话列表。
- `main stage`: note surface / transcript / canvas / editor。
- `floating run companion`: 只服务当前这轮工作，浮在 main stage 内。
- `utility sidebar`: 全平台通用，放审查、浏览器、diff、文件、inspector。

### 1.2 Companion Responsibilities
- 显示当前进度和步骤状态。
- 显示变更摘要、分支信息、产物列表。
- 显示后台终端、来源、最近检查点。
- 给出可继续动作，但不抢主舞台。

### 1.3 Utility Sidebar Responsibilities
- 审查面板。
- 浏览器面板。
- 文件 / diff 面板。
- Inspector / context 面板。
- 支持折叠、切换和空态，不允许空白占位。

## 2. Execution Order

### Task 1: 定义平台级壳层分区
**Files**
- Modify: `src/components/ui/workbench/DesktopWorkbenchFrame.tsx`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Work**
- 把最右栏从“agent companion”重命名为平台级 `utility sidebar`。
- 在 main stage 内预留 `floating run companion` 插槽。
- 收口所有页面对右侧区域的使用方式。

### Task 2: 建立两类新 UI 原语
**Files**
- Add: `src/components/ui/workbench/FloatingRunCompanion.tsx`
- Add: `src/components/ui/workbench/UtilitySidebar.tsx`
- Add: `src/components/ui/workbench/UtilitySidebarTab.tsx`
- Modify: `src/components/ui/workbench/index.ts`
- Modify: `src/styles/workbench/primitives.css`
- Modify: `src/styles/workbench/states.css`

**Work**
- 把运行信息做成可复用悬浮卡。
- 把最右栏做成可复用工具侧栏。
- 补齐 `default / hover / selected / collapsed / empty / loading / error` 状态。

### Task 3: Agent 页面先落地 Codex 式体验
**Files**
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- Modify: `src/features/agent-shell/components/AgentChatStage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`

**Work**
- 把现有 plan card 改成悬浮运行卡。
- 把空白 companion 改成有信息密度的运行辅助区。
- 让 Agent 页面成为新布局的首个参考实现。

### Task 4: 平台共用右侧工具栏
**Files**
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/design/DesignWorkbenchView.tsx`

**Work**
- 让 Knowledge / Product / Design / Develop 共享同一套 utility sidebar 语言。
- 右栏不再按模块各自发明面板结构。

### Task 5: 更新标准页和预览页
**Files**
- Modify: `design/workbench-unified-previews/ui-standards.html`
- Modify: `design/workbench-unified-previews/state-standards.html`
- Add: `design/workbench-unified-previews/codex-companion-preview.html`
- Modify: `AGENTS.md`

**Work**
- 把新壳层和新右栏写进标准。
- 给后续前端开发一个可直接照抄的视觉范式。

### Task 6: 验证和清理
**Checks**
- `npm run build`
- `python scripts/check_mojibake.py`
- `graphify update .`

**Acceptance**
- 最右侧不再像“空白占位区”。
- 主舞台内的运行卡像 Codex 一样悬浮、克制、可读。
- Agent / Knowledge / Product / Design 共用同一套右侧工具语义。
- 代码和标准页都没有明显乱码。

