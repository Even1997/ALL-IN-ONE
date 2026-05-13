# GoodNight 全平台 UI 统一适配方案

> 参考标准：
> - `design/workbench-unified-previews/ui-standards.html`
> - `design/workbench-unified-previews/overview-home.html`
> - `design/workbench-unified-previews/state-standards.html`
> - `design/workbench-unified-previews/workbench-preview.css`

**目标：** 将整个桌面平台统一到同一套 Notes / Finder 风格的工作台 UI 标准下，覆盖壳层、导航、列表、文档面、AI 面板、画布面、状态与交互，而不是只局部修补某几个页面。

**核心原则：**
- 不是“补几个样式”，而是完成一次平台级 UI 适配。
- 不做用户可感知的混搭过渡态，目标是主工作台统一切到同一套视觉语言。
- 尽量不改业务功能和运行时真相，优先改 UI 组合层、页面结构层、组件样式层。
- 所有 AI 表达继续遵守 `thinking / tool_execution / final_answer / confirm` 的语义边界，只重做呈现方式。

---

## 1. 目标 UI 基线

全平台统一采用以下产品语气：

- macOS 原生气质，靠近 Apple Notes / Finder，而不是 SaaS 仪表盘。
- 页面中心以文档和工作面为主，不以“卡片堆叠”或“聊天气泡”作为主视觉。
- 结构优先级固定为：`rail -> sidebar -> main stage -> companion pane`。
- 图标优先，文本收敛，减少重复标签和说明块。
- 大面积中性色，少量强调色只用于选中、焦点、AI 提示、状态反馈。
- 留白增加，边框减弱，圆角收敛到轻微原生感。
- 不使用渐变作为标准视觉语言。

---

## 2. 改造范围

这次改造不是单页优化，而是覆盖整个平台的主工作台。

### 2.1 平台级壳层

涉及：
- `src/App.tsx`
- `src/App.css`
- `src/appNavigation.ts`
- `src/appTheme.ts`
- `src/features/desktopShell/desktopShell.ts`
- `src/components/ui/*`

目标：
- 统一窗口级 topbar、模式 rail、主内容布局、状态栏、分栏尺寸策略。
- 统一按钮、输入框、面板、弹窗、图标、分段控件、标签、空态、错误态。
- 建立 light / dark 双主题一致的语义 token，而不是页面各自写颜色。

### 2.2 Agent / AI 工作台

涉及：
- `src/features/agent-shell/pages/AgentShellPage.tsx`
- `src/features/agent-shell/components/*`
- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChat.css`
- `src/components/ai/gn-agent-shell/*`
- `src/components/ai/gn-agent/*`
- `src/components/ai/provider-chat/*`
- `src/components/workspace/timeline/*`

目标：
- 让 Agent 页从“工具组合页”收敛为“Notes 风格 AI 工作台”。
- 左侧 thread / files / context 更像 source list 和目录树。
- 中央 AI 正文更像干净文档流，减少泡泡感与过重卡片感。
- 右侧 plan / memory / context / runtime 摘要更像 companion pane，而不是第二主舞台。
- thinking、tool execution、final answer、confirm 卡片统一到标准卡系和状态语言。

### 2.3 Knowledge / Wiki 工作台

涉及：
- `src/components/product/ProductWorkbench.tsx`
- `src/components/product/ProductKnowledgeWorkspacePane.tsx`
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- `src/features/knowledge/workspace/KnowledgeMarkdownViewer.tsx`
- `src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx`
- `src/components/product/GoodNightMarkdownEditor.tsx`
- `src/components/product/MilkdownEditor.tsx`

目标：
- 让知识库成为最标准的 note-first 工作面。
- 左侧目录树统一为 Finder/Notes 风格层级列表，不再出现卡片化目录。
- 中央文档阅读/编辑面收敛为真正的 note surface。
- graph 仍保留无边际画布能力，但周边 chrome 统一到平台标准。
- 临时预览、搜索结果、文件预览、冲突提示、保存状态都进入统一状态体系。

### 2.4 Product / Page / Sketch 工作台

涉及：
- `src/components/product/WorkbenchShell.tsx`
- `src/components/product/PageWorkspace.tsx`
- `src/components/product/ProductPageWorkspacePane.tsx`
- `src/components/workspace/Workspace.tsx`
- `src/components/workspace/FileExplorer.tsx`
- `src/components/workspace/Terminal.tsx`

目标：
- 将页面、文件、代码、预览、终端这些“开发/页面工作面”纳入同一桌面壳层。
- 文件树、页面树、模块树统一目录树标准。
- 页面正文、预览区、属性区统一 pane 结构和间距逻辑。
- 终端和文件视图保留功能，但外观、间距、工具栏、状态条与整个平台一致。

### 2.5 Design 工作台

涉及：
- `src/components/design/DesignWorkbenchScreen.tsx`
- `src/components/design/DesignWorkbenchView.tsx`
- `src/components/design/useDesignCanvasController.ts`
- `src/components/design/useDesignBoardState.ts`

目标：
- 设计工作台保持 canvas-first，但 chrome 要像原生桌面应用，不像网页白板。
- 左侧素材树、页面树、样式树改成更轻的 source list / inspector 风格。
- 右侧属性、样式、联动信息统一为 inspector family。
- 画布空态、选中态、框选态、聚类折叠态、缩放态进入统一状态标准。

### 2.6 Develop / Test / Ops 辅助工作台

涉及：
- `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- `src/components/workspace/Workspace.tsx`
- `src/components/workspace/FileExplorer.css`
- `src/components/workspace/Terminal.css`
- 以及 `develop / test / operations` 对应入口页

目标：
- 辅助页不再各自长成不同的小后台。
- 统一列表、设置页、详情页、日志区、执行反馈区、错误区。
- 这些页面视觉优先级低于主工作台，但必须服从同一 UI 契约。

---

## 3. 不做“分布式小修”的执行策略

这次不建议按“哪个页面最丑先修哪个页面”的方式做。

合理方式是：

1. 先定义平台唯一 UI 契约。
2. 再统一壳层和通用原语。
3. 然后四大主工作台一起适配到同一目标态。
4. 最后清理残留样式、旧组件、旧状态表现。

也就是说，开发顺序可以有先后，但发布目标必须是一套完整统一的 UI，不接受长期并存的两套风格。

---

## 4. 平台唯一 UI 契约

这是整个改造最关键的一步，后面的页面都只能复用它，不能再各自发挥。

### 4.1 Shell Contract

统一为以下布局骨架：

- `window topbar`
- `compact icon rail`
- `list/sidebar pane`
- `main stage`
- `companion/inspector pane`
- `status bar`

要求：
- 每个主页面都必须能落回这个骨架。
- 如果页面以画布为中心，main stage 放大，companion 收窄。
- 如果页面以文档为中心，main stage 采用 note column。
- 如果页面以 AI 为中心，AI 正文是主列，工具/上下文只做侧向支持。

### 4.2 Primitive Contract

全平台只认四类主原语：

- `directory tree`
- `note surface`
- `infinite canvas`
- `ai lane / ai card family`

要求：
- 左侧导航、文件、项目、知识结构全部尽量收敛到 `directory tree`。
- 阅读、编辑、总结、回复、确认尽量收敛到 `note surface` 或文档卡片。
- graph / sketch / design board / map 全部收敛到 `infinite canvas`。
- AI 输出必须统一卡片语言和 lane 顺序。

### 4.3 State Contract

全平台标准状态必须统一定义并可视化覆盖：

- `default`
- `hover`
- `pressed`
- `focused`
- `selected`
- `expanded`
- `collapsed`
- `empty`
- `loading`
- `streaming`
- `error`
- `warning`
- `disabled`
- `confirm`
- `syncing`
- `conflict`

这部分已经有 `state-standards.html`，下一步要把真实页面全部对齐。

### 4.4 Motion Contract

统一交互动效：

- hover 轻量高亮
- row / card 选中平滑过渡
- sidebar collapse / expand 平滑伸缩
- companion pane reveal / hide
- AI streaming 渐进显现
- loading skeleton / pulse
- confirm / success / error 状态切换

要求：
- 动效解释状态变化，不做装饰性动画。
- 时长和 easing 统一。
- 支持 `prefers-reduced-motion`。

---

## 5. 四个主工作台的目标态

### 5.1 Agent 工作台

目标态：
- 左侧是轻量线程与资源导航，像 Notes 侧栏。
- 中间是 AI 正文工作区，像文档阅读加批注，而不是满屏气泡。
- 右侧是计划、上下文、工具摘要、记忆、审批等 companion pane。
- 浮层类能力尽量收敛为轻量 overlay 或 inspector，不再抢主视线。

必须统一的内容：
- message lane
- tool execution cards
- thinking cards
- confirm cards
- session/sidebar rows
- inline search dialog
- runtime summary / plan summary / memory summary

### 5.2 Knowledge / Wiki 工作台

目标态：
- 最像 Notes。
- 左侧目录树成为一等公民。
- 中央文档面干净、明亮、以排版为主。
- 右侧可选 AI、元信息、引用、附件、链接关系。
- graph 视图切换时保留平台壳层，不重新发明页面。

必须统一的内容：
- note list rows
- folder/file tree
- markdown viewer/editor chrome
- file preview
- temporary preview
- save/sync/conflict banners
- empty/loading/error pages

### 5.3 Product / Page / Develop 工作台

目标态：
- 更像 Finder + 编辑器组合，而不是项目管理后台。
- 文件、页面、模块、预览、终端都在一个统一壳层里。
- 代码区和文档区可以风格不同，但 chrome、层级、控件密度一致。

必须统一的内容：
- file explorer
- page tree
- page preview
- dev terminal
- toolbars
- tab rows
- inspectors

### 5.4 Design 工作台

目标态：
- 中央是开放画布。
- 左侧是页面树、素材树、样式树。
- 右侧是属性和联动信息。
- 视觉像专业桌面设计工具，但仍保留 Notes/Finder 的静态质感和轻 chrome。

必须统一的内容：
- canvas frame
- node cards
- selection halo
- connectors
- mini inspectors
- library rows
- empty/loading/collapsed cluster states

---

## 6. 具体实施顺序

虽然目标不是“小步上线”，但工程上仍然需要合理顺序。

### Phase A: 统一基础层

先做：
- 设计 token
- light/dark theme token
- radius / border / shadow / spacing / typography scale
- icon usage rules
- button / input / dialog / panel / toolbar / list row / badge / status primitives

结果：
- 所有页面先有同一套基础砖块。

### Phase B: 统一壳层

再做：
- app topbar
- rail
- sidebar
- main stage container
- companion pane
- status bar
- split pane sizing and collapse behavior

结果：
- 所有主工作台共享相同桌面骨架。

### Phase C: 统一三大工作原语

重点做：
- `directory tree`
- `note surface`
- `infinite canvas`

结果：
- 之后所有页面只是组合原语，而不是继续发明页面级样式。

### Phase D: 统一 AI 卡片体系

重点做：
- user input
- thinking
- tool execution
- final answer
- confirm / escalation
- inline actions
- runtime status / approval / memory cards

结果：
- AI 相关页面共享同一表达系统。

### Phase E: 全工作台适配

一起收口：
- Agent
- Knowledge / Wiki
- Product / Page / Develop
- Design
- Test / Ops / Settings

结果：
- 平台主要工作流都落回统一标准。

### Phase F: 全局验收与清理

最后做：
- 删除残留旧样式
- 清理重复组件
- 清理只服务旧视觉的局部 class
- 建立新的视觉回归检查页
- 更新 `AGENTS.md` 与开发说明

---

## 7. 关键设计决策

### 7.1 不动运行时真相，只动 UI 呈现层

AI runtime、timeline、tool truth、provider protocol 不因为 UI 重构而改变。

UI 改造应主要落在：
- page composition
- render model presentation
- component structure
- CSS/tokens/motion

### 7.2 统一优先于局部最优

个别页面可以为了整体一致性牺牲一点局部“炫技感”。

这次改造优先目标不是：
- 单页最亮眼
- 某个聊天页最像新产品 demo

而是：
- 整个平台一眼看起来属于同一个桌面应用

### 7.3 Notes 优先，AI 次之，工具再次之

用户要感受到的是：
- 这是一个可以思考、写作、组织、浏览、操作的桌面工作台

而不是：
- 一个塞了很多工具模块的聊天壳

---

## 8. 验收标准

适配完成后，至少满足以下标准：

### 8.1 一致性验收

- 任意两个主工作台并排看，能明显看出属于同一产品。
- rail / sidebar / main stage / companion pane 层级一致。
- 字体、间距、边框、图标、圆角、阴影、动效同源。

### 8.2 原语验收

- 文件树、知识树、项目树都遵循统一目录树标准。
- 文档类页面都遵循统一 note surface 标准。
- 画布类页面都遵循统一 infinite canvas 标准。

### 8.3 AI 验收

- AI lane 顺序与语义一致。
- thinking / tool / final / confirm 可清楚区分。
- AI 不再以大量气泡主导界面。

### 8.4 状态验收

- default / hover / selected / collapsed / empty / loading / error 在主要页面都有真实实现。
- dark mode 完整覆盖，不是单独补色。

### 8.5 工程验收

- 旧样式残留最小化。
- 主工作台不再并存两套明显不同的设计语言。
- 新增前端开发默认以标准页和 `AGENTS.md` 为设计合同。

---

## 9. 风险与规避

### 风险 1
只改 CSS，不改结构，最后只能得到“旧页面换皮”。

规避：
- 必须同时改 shell、原语、状态、卡片家族和布局层级。

### 风险 2
先修 AI，再修 Wiki，再修 Design，最终各自又长成不同风格。

规避：
- 先做平台契约和基础原语，再做页面适配。

### 风险 3
为了更像原生应用而牺牲可用性。

规避：
- 原生感来自层级、间距、控件密度、图标和运动，不来自功能减少。

### 风险 4
Dark mode 后补，导致后期返工。

规避：
- light / dark token 从第一天一起建。

---

## 10. 建议的落地方式

建议按下面的策略推进：

1. 先把这份方案确认下来，作为平台 UI 改造的总纲。
2. 基于这份方案，再拆一份真正可执行的实施计划。
3. 实施计划按“基础层 / 壳层 / 原语 / AI 卡系 / 四大工作台 / 清理验收”分任务。
4. 所有后续前端改动都先对照标准页，不再从单页灵感出发。

---

## 11. 结论

如果这次要认真做，就应该把它定义为：

**一次以 `Notes / Finder / native desktop` 为统一方向的全平台 UI 重构。**

不是修聊天页，不是修几个卡片，不是做几个漂亮 demo，而是把：

- Agent
- Knowledge / Wiki
- Product / Page / Develop
- Design
- Test / Ops

全部纳入同一套桌面级工作台标准。

这个方向是合理的，而且和你现在已经确认下来的标准页完全一致。下一步最合适的动作，就是在这份总方案基础上，我再继续给你拆成一份可直接开工的执行计划。
