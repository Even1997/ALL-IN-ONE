# Platform UI Unification Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ALL-IN-ONE 全平台前端统一到一套更接近 Apple Notes / Finder / macOS native 的桌面 UI 标准，覆盖 Agent、Knowledge、Page、Design、Develop、Test、Ops，而不改变现有业务功能和 AI runtime truth。

**Architecture:** 先从 `src/App.tsx` 和 `src/App.css` 拆出平台级 token、shell、primitives、states、motion，再把各工作台回收进同一套 `rail -> sidebar -> main stage -> companion pane -> status` 契约。AI 相关改动只落在 render model、页面组合、CSS 和卡片表现层，不改 `provider adapters -> canonical runtime events -> timeline composer -> persisted truth`。

**Tech Stack:** React 18, TypeScript, Zustand, Tauri, Allotment, CSS

---

## 0. Ground Truth

### 0.1 视觉标准来源

- `design/workbench-unified-previews/ui-standards.html`
- `design/workbench-unified-previews/state-standards.html`
- `design/workbench-unified-previews/overview-home.html`
- `design/workbench-unified-previews/workbench-preview.css`

### 0.2 架构约束

- 不改变 AI runtime truth、tool 边界、canonical event 语义、checkpoint / replay / approval 语义。
- 不做“先修几个页面再长期共存两套风格”的发布策略。
- 允许工程上分阶段提交，但最终交付必须是一套统一 UI，而不是旧页面换皮。
- 现有 `AGENTS.md`、标准页、图谱文件已经有用户改动；执行时不能覆盖或回滚它们。

### 0.3 当前代码结构结论

- 顶层壳层和大量视觉规则集中在 `src/App.tsx` 与 `src/App.css`，是本次改造总入口。
- Agent、Knowledge、Workspace、Design 各自拥有局部视觉系统，且存在重复的面板、列表、卡片、空态、按钮和选中态实现。
- `AIChat.tsx` 是 AI 工作台真实中枢，`AgentShellPage.tsx` 只是其桌面包装；AI 的统一必须优先落到 `AIChat*` 家族而不是只改 Agent 页面。
- `KnowledgeNoteWorkspace.tsx` 已经拥有最接近目标的目录树 + 文档面结构，适合作为平台级 `directory tree` 和 `note surface` 的抽象来源。
- `DesignWorkbenchView.tsx` 和 `ProductPageWorkspacePane.tsx` 已经拥有“无边际画布”雏形，但当前 chrome、卡片密度、渐变、状态表达仍偏工具 demo。

---

## 1. File Structure Map

### 1.1 必改现有文件

- `src/App.tsx`
- `src/App.css`
- `src/appNavigation.ts`
- `src/appTheme.ts`
- `src/features/desktopShell/desktopShell.ts`
- `src/components/ui/index.ts`
- `src/components/ui/MacButton.tsx`
- `src/components/ui/MacField.tsx`
- `src/components/ui/MacPanel.tsx`
- `src/components/ui/MacDialog.tsx`
- `src/components/ui/WorkbenchIcon.tsx`
- `src/components/ai/AIWorkspace.tsx`
- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChat.css`
- `src/components/workspace/AIChatConversationMessagesPane.tsx`
- `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- `src/components/workspace/AIChatAssistantParts.tsx`
- `src/components/workspace/Workspace.tsx`
- `src/components/workspace/Workspace.css`
- `src/components/workspace/FileExplorer.tsx`
- `src/components/workspace/FileExplorer.css`
- `src/components/workspace/Terminal.tsx`
- `src/components/workspace/Terminal.css`
- `src/components/product/ProductWorkbench.tsx`
- `src/components/product/WorkbenchShell.tsx`
- `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- `src/components/product/ProductPageWorkspacePane.tsx`
- `src/components/product/GoodNightMarkdownEditor.tsx`
- `src/components/product/MilkdownEditor.tsx`
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- `src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx`
- `src/features/agent-shell/pages/AgentShellPage.tsx`
- `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- `src/features/agent-shell/components/AgentChatStage.tsx`
- `src/features/agent-shell/components/agentWorkbench.css`
- `src/components/design/DesignWorkbenchScreen.tsx`
- `src/components/design/DesignWorkbenchView.tsx`
- `src/components/design/useDesignCanvasController.ts`
- `src/components/design/useDesignBoardState.ts`
- `src/components/design/designStylePackState.ts`

### 1.2 建议新增文件

- `src/styles/workbench/tokens.css`
- `src/styles/workbench/shell.css`
- `src/styles/workbench/primitives.css`
- `src/styles/workbench/states.css`
- `src/styles/workbench/motion.css`
- `src/styles/workbench/legacy-bridge.css`
- `src/components/ui/workbench/DesktopWorkbenchFrame.tsx`
- `src/components/ui/workbench/DesktopWorkbenchRail.tsx`
- `src/components/ui/workbench/DesktopWorkbenchTopbar.tsx`
- `src/components/ui/workbench/DirectoryTree.tsx`
- `src/components/ui/workbench/NoteSurface.tsx`
- `src/components/ui/workbench/InspectorPane.tsx`
- `src/components/ui/workbench/StateCard.tsx`
- `src/components/ui/workbench/EmptyStateView.tsx`
- `src/components/ui/workbench/StatusBanner.tsx`
- `src/components/ui/workbench/index.ts`
- `src/components/workspace/TestWorkbench.tsx`
- `src/components/workspace/OperationsWorkbench.tsx`

### 1.3 明确不动的文件层

- `src/modules/ai/runtime/**`
- `src/modules/ai/provider*`
- `src/modules/ai/chat` 中与协议语义、tool truth、approval truth、checkpoint truth 直接相关的逻辑
- `src/modules/runtime-sidecar/**`

说明：
- 这些层可以被 UI 消费，但不应为视觉统一而调整语义。

---

## 2. Execution Order

### Task 1: 固化平台视觉契约并拆出样式基础层

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/appTheme.ts`
- Create: `src/styles/workbench/tokens.css`
- Create: `src/styles/workbench/shell.css`
- Create: `src/styles/workbench/primitives.css`
- Create: `src/styles/workbench/states.css`
- Create: `src/styles/workbench/motion.css`
- Create: `src/styles/workbench/legacy-bridge.css`

- [ ] 把 `src/App.css` 中平台级变量、桌面壳层、按钮/输入框/面板、状态、动效拆到 `src/styles/workbench/*.css`，`App.css` 只保留应用入口、兼容桥和暂未迁移模块的 fallback。
- [ ] 在 `src/App.tsx` 中统一样式导入顺序，保证 `tokens -> shell -> primitives -> states -> motion -> legacy-bridge -> App.css`。
- [ ] 在 `src/appTheme.ts` 中停用“多套视觉风格并存”的方向；保留存量存储 key 兼容，但前端只输出一套统一标准，避免 `minimal / workbench / cartoon` 再分叉。
- [ ] 删除所有新的渐变依赖作为标准视觉语言；允许极少量装饰背景继续临时保留在 `legacy-bridge.css`，但最终阶段必须清理。

**Acceptance:**
- 新的 token 系统同时覆盖 light / dark。
- 全局 radius、spacing、border、shadow、text hierarchy、icon size、focus ring、selected state 不再散落在多个页面文件里。
- `App.css` 不再继续膨胀为唯一视觉真相文件。

### Task 2: 抽出统一桌面壳层，收拢顶层布局职责

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/appNavigation.ts`
- Modify: `src/features/desktopShell/desktopShell.ts`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Create: `src/components/ui/workbench/DesktopWorkbenchFrame.tsx`
- Create: `src/components/ui/workbench/DesktopWorkbenchRail.tsx`
- Create: `src/components/ui/workbench/DesktopWorkbenchTopbar.tsx`
- Create: `src/components/ui/workbench/InspectorPane.tsx`
- Create: `src/components/ui/workbench/index.ts`

- [ ] 把 `src/App.tsx` 里现在内联的桌面 shell JSX 抽到 `DesktopWorkbenchFrame.tsx`，让 `App.tsx` 只负责 role routing 和数据装配。
- [ ] 把左侧 rail、topbar、main shell、AI companion pane、resize handle、status strip 变成稳定的壳层 API，而不是在 `App.tsx` 内部散拼。
- [ ] 在 `src/appNavigation.ts` 明确角色分组：主工作台、辅助工作台、只读/设置工作台，避免不同角色自行决定 chrome 密度。
- [ ] 将 `src/components/product/WorkbenchShell.tsx` 从简单三栏容器升级为可承载统一 shell 语义的共享布局组件，避免 product / knowledge 继续单独实现 pane 逻辑。

**Acceptance:**
- 所有角色页都从同一个 shell 组件进入。
- rail / sidebar / main stage / companion pane / resize handle 的尺寸和折叠行为在顶层统一。
- `App.tsx` 中与具体视觉细节强绑定的 JSX 大幅缩减。

### Task 3: 收敛 Mac primitives，建立共享 UI 原语

**Files:**
- Modify: `src/components/ui/index.ts`
- Modify: `src/components/ui/MacButton.tsx`
- Modify: `src/components/ui/MacField.tsx`
- Modify: `src/components/ui/MacPanel.tsx`
- Modify: `src/components/ui/MacDialog.tsx`
- Modify: `src/components/ui/WorkbenchIcon.tsx`
- Create: `src/components/ui/workbench/StateCard.tsx`
- Create: `src/components/ui/workbench/EmptyStateView.tsx`
- Create: `src/components/ui/workbench/StatusBanner.tsx`

- [ ] 把按钮、面板、field、dialog 的默认表现对齐到统一标准，减少“玻璃大圆角 + 渐变 + 浮起按钮”的旧风格残留。
- [ ] 统一 icon 规格，避免页面层自己控制图标大小、描边粗细和间距。
- [ ] 新增共享的 `StateCard`、`EmptyStateView`、`StatusBanner`，覆盖 `default / hover / selected / collapsed / empty / loading / error / warning / confirm / syncing`。
- [ ] 所有新状态原语都必须同时有 light / dark 表现，并遵循 `state-standards.html`。

**Acceptance:**
- 相同语义的按钮、面板、空态、确认卡不再在 Agent、Knowledge、Workspace、Design 分别长四套。
- 图标能用图标的地方不再依赖大段标签文本。

### Task 4: 先把目录树和文档面做成共享 primitive

**Files:**
- Create: `src/components/ui/workbench/DirectoryTree.tsx`
- Create: `src/components/ui/workbench/NoteSurface.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- Modify: `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- Modify: `src/components/product/ProductPageWorkspacePane.tsx`
- Modify: `src/components/workspace/FileExplorer.tsx`
- Modify: `src/components/workspace/FileExplorer.css`

- [ ] 从 `KnowledgeNoteWorkspace.tsx` 中提炼平台级目录树表现：row 高度、缩进、折叠态、selected 态、右键态、badge、计数、空态、loading 态。
- [ ] 从 `KnowledgeNoteWorkspace.tsx` 中提炼平台级文档面：标题区、正文区、模式切换、保存条、冲突/错误 banner、附件/预览面。
- [ ] `ProductPageWorkspacePane.tsx` 的页面树和 `FileExplorer.tsx` 的文件树改用相同的目录树表现契约，而不是继续各自实现。
- [ ] `KnowledgeMarkdownViewer.tsx` 和文档阅读态对齐 “更像 Notes，留白更多，正文更干净” 的标准。

**Acceptance:**
- Knowledge tree、Page tree、File tree 三者的选中态、hover、折叠箭头、分组标题、空态完全同源。
- 文档阅读和编辑表面变成平台级 `note surface`，不再像工具面板。

### Task 5: 统一 AI lane / 状态卡 / composer chrome，不改 runtime truth

**Files:**
- Modify: `src/components/ai/AIWorkspace.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/runtimeInteractionRenderModel.ts`

- [ ] 把 AI 输出统一成几类稳定视觉块：`user input`、`thinking`、`tool execution`、`正文 final`、`approval / confirm`、`question / need input`、`checkpoint / run summary`。
- [ ] 减少大面积聊天气泡感，正文区更像文档流或 Notes 式 transcript，process 内容作为次级 lane 或折叠卡。
- [ ] 审批卡、确认卡、问题卡从 `AIChatRuntimeInteractionCards.tsx` 开始统一到 `StateCard` 体系。
- [ ] 保持 `AIChatConversationMessagesPane.tsx` 继续消费 runtime truth，不在 UI 层重新发明 tool / approval / question 语义。
- [ ] 保留 embedded / provider / gn-agent 三种变体，但只允许一套视觉系统。

**Acceptance:**
- `thinking / tool / feedback / final` 边界仍然清楚。
- AI 区不再被“很多小圆角气泡”主导。
- 同一张 approval / confirm 卡在 Agent、右侧 AI pane、嵌入式工作台里表现一致。

### Task 6: 完整适配 Agent 工作台

**Files:**
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- Modify: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- Modify: `src/features/agent-shell/components/AgentChatStage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`
- Modify: `src/components/ai/gn-agent-shell/GNAgentThreadList.tsx` if thread row chrome still偏旧

- [ ] 左侧从“工具 rail + 大卡片列表”压成更接近 Notes/Finder 的 source list 栏。
- [ ] 中央 `AgentChatStage.tsx` 只承担干净 transcript 舞台，不再叠加重装饰背景。
- [ ] `AgentFloatingPlanCard.tsx` 收敛为 companion / inspector 风格，而不是悬浮主卡。
- [ ] 搜索弹窗、会话列表、审查 diff 卡、空态、折叠态全部切到统一 primitives。

**Acceptance:**
- Agent 页是完整的桌面应用感，而不是“聊天工具 + 几块浮层”。
- 左侧、中央、浮层三部分的层级清晰，留白更大，按钮更克制。

### Task 7: 完整适配 Knowledge / Wiki 工作台

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx`
- Modify: `src/components/product/GoodNightMarkdownEditor.tsx`
- Modify: `src/components/product/MilkdownEditor.tsx`

- [ ] 把 Knowledge 作为平台标准页先打磨成“最像 Notes”的工作台。
- [ ] 左侧目录树、中间 note surface、右侧 companion / metadata / AI 面的关系固定下来，作为其他区的参考实现。
- [ ] `KnowledgeGraphCanvas.tsx` 保留无边际画布能力，但周边面板、工具条、状态条全部使用同一套平台 chrome。
- [ ] 文档读取、临时预览、保存中、保存成功、冲突、空白页、加载态全部切到标准状态体系。

**Acceptance:**
- Knowledge 页面可以直接当作全平台 note-first 参考标准。
- graph / note / tree 三种模式切换时，壳层不换语言。

### Task 8: 适配 Product / Page / Develop 工作台

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/components/product/ProductPageWorkspacePane.tsx`
- Modify: `src/components/workspace/Workspace.tsx`
- Modify: `src/components/workspace/Workspace.css`
- Modify: `src/components/workspace/FileExplorer.tsx`
- Modify: `src/components/workspace/FileExplorer.css`
- Modify: `src/components/workspace/Terminal.tsx`
- Modify: `src/components/workspace/Terminal.css`
- Modify: `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- Create: `src/components/workspace/TestWorkbench.tsx`
- Create: `src/components/workspace/OperationsWorkbench.tsx`

- [ ] Product/Page 的页面树、画布区、模块清单浮层改成与标准目录树 / note surface / canvas inspector 一致的语言。
- [ ] `Workspace.tsx` 的 activity bar、file editor、toolbar、terminal 统一到更接近 Finder + 原生编辑器的表现。
- [ ] 终端和文件区保留现有功能，但减少“开发工具感过重”的高对比块和多层边框。
- [ ] 如果 Test / Ops 仍然内联在 `App.tsx`，先抽成 `TestWorkbench.tsx`、`OperationsWorkbench.tsx` 再统一视觉。

**Acceptance:**
- Develop、Test、Ops 虽然信息密度高，但仍属于同一桌面产品，而不是三套后台页面。
- Page 工作台的模块清单、页面树、画布属性面不再像临时工具浮窗。

### Task 9: 适配 Design 工作台和无边际画布标准

**Files:**
- Modify: `src/components/design/DesignWorkbenchScreen.tsx`
- Modify: `src/components/design/DesignWorkbenchView.tsx`
- Modify: `src/components/design/useDesignCanvasController.ts`
- Modify: `src/components/design/useDesignBoardState.ts`
- Modify: `src/components/design/designStylePackState.ts`

- [ ] 保留 `canvas-first`，但把左右栏、顶部工具、节点卡、Inspector、Context Menu 都收回统一平台语言。
- [ ] `DesignWorkbenchView.tsx` 中 page / flow / text / style 节点要降低 demo 感，增加 Notes/Finder 式留白与静态质感。
- [ ] 无边际画布必须补齐标准状态页：`default / hover / selected / collapsed / empty / loading / error`，并与 `state-standards.html` 对齐。
- [ ] 样式节点、文本节点、页面节点、流程节点的卡片头、图标、标签、连接点、选择框统一到同一套密度和 radius。

**Acceptance:**
- 设计页仍然专业，但不再是另一套高饱和、重阴影、重渐变的工具风格。
- 画布区和 Knowledge graph 一样，都是平台定义下的 `infinite canvas` 变体。

### Task 10: 全平台收尾、去旧样式、更新标准入口

**Files:**
- Modify: `src/App.css`
- Modify: `src/App.tsx`
- Modify: `AGENTS.md` only if implementation introduces新的标准入口路径
- Verify: `design/workbench-unified-previews/ui-standards.html`
- Verify: `design/workbench-unified-previews/state-standards.html`
- Verify: `design/workbench-unified-previews/overview-home.html`

- [ ] 删除只服务旧视觉的类名、重复 panel 样式、局部渐变、重复的 hover / selected / card 规则。
- [ ] 检查所有角色页是否都使用统一 shell 和 primitives，没有“漏网”的旧局部样式岛。
- [ ] 如果实施中新增了真正的源码级标准入口，补充到 `AGENTS.md`，让后续前端开发默认按这套标准做。
- [ ] 重新核对标准设计稿页和实际实现是否一致，避免标准页与真实产品再次分叉。

**Acceptance:**
- 仓库中不再存在明显的第二套 UI 语言。
- 新功能接入时可以直接复用 `shell + directory tree + note surface + infinite canvas + ai state card` 这五个大原语。

---

## 3. Recommended Commit Order

- [ ] Commit 1: `feat(ui): extract workbench tokens and shell css foundation`
- [ ] Commit 2: `feat(ui): add shared desktop shell components and mac primitives`
- [ ] Commit 3: `feat(ui): unify directory tree and note surface primitives`
- [ ] Commit 4: `feat(ai-ui): unify ai lane cards and embedded chat chrome`
- [ ] Commit 5: `feat(agent-ui): adapt agent workbench to unified shell`
- [ ] Commit 6: `feat(knowledge-ui): adapt knowledge workspace and graph chrome`
- [ ] Commit 7: `feat(workspace-ui): adapt page develop test ops workbenches`
- [ ] Commit 8: `feat(design-ui): adapt infinite canvas and inspector surfaces`
- [ ] Commit 9: `chore(ui): remove legacy styles and refresh standards references`

---

## 4. Verification Checklist

- [ ] `npm run build`
- [ ] 人工检查 `agent / knowledge / page / design / develop / test / operations`
- [ ] Light / Dark 都完整覆盖
- [ ] `default / hover / selected / collapsed / empty / loading / error / confirm / syncing` 在真实界面出现并符合标准
- [ ] AI 页中 `thinking / tool / final / approval / question` 视觉层级正确，但 runtime truth 未变
- [ ] Directory tree、note surface、infinite canvas、AI state card 四大原语都至少被两个以上工作台复用
- [ ] `graphify update .`

---

## 5. Done Definition

- 用户从任意两个主工作台切换时，不会再感觉像进入了两款不同产品。
- Agent 不再是“很多圆角气泡的聊天工具”，Knowledge 不再是“另一种卡片后台”，Design 不再是“另一套高饱和 demo 工具”。
- 后续任何前端需求都可以先判断自己属于哪一种平台原语，而不是从页面局部重新发明样式。
