# 设置页阶段 1 执行任务清单

更新时间：2026-05-15

## 目标

这份文档是 [`10-development-plan.md`](./10-development-plan.md) 里“阶段 1：设置信息架构与共享基础层”的执行拆分版，只覆盖设置页壳层、信息架构收口、旧入口归并与现有模块挂接，不进入具体字段开发。

阶段 1 的核心结果只有 4 件事：

- 把设置页一级模块稳定收口到最终 8 个：`general`、`ai`、`permissions`、`mcp`、`skills`、`appearance`、`storage`、`advanced`
- 把旧的一级占位入口从信息架构中移除，并给历史入口保留安全跳转
- 把 `GlobalSettingsPage.tsx` 从“大组件直接堆内容”收口成“壳层 + 分发”
- 保持现有 `AI / MCP / Skills` 入口可用，不在阶段 1 重写这 3 个模块内部逻辑

## 不在阶段 1 范围内

- 不新增常规、外观、权限、存储、高级模块的真实设置字段
- 不在阶段 1 修改 `useAIChatSettingsState.ts`、`RuntimeMcpSettingsPage.tsx`、`GNAgentSkillsPage.tsx` 的核心业务逻辑
- 不做右侧 companion pane
- 不引入快捷键设置
- 不实现重置、清缓存、重建索引等危险动作

## UI 标准前置要求

阶段 1 开始做 UI 前，必须先对照以下标准页：

- `design/workbench-unified-previews/ui-standards.html`
- `design/workbench-unified-previews/overview-home.html`
- `design/workbench-unified-previews/state-standards.html`
- `design/workbench-unified-previews/workbench-preview.css`

阶段 1 的设置页壳层需要显式遵守这些约束：

- 保持 `sidebar + main stage` 的单主内容结构，不做双主舞台竞争
- 整体气质偏原生桌面、Notes / Finder 风格，不做 SaaS 仪表盘式堆卡
- 左侧目录更像列表 / 树，不像成组营销卡片
- 主区是文档式设置内容面，不做浮夸 hero 和大块装饰
- 状态至少考虑 `default / hover / selected / empty / loading / error`
- 动效保持轻量、解释状态变化，不做吸睛型动画

## 完成定义

阶段 1 完成后，应同时满足下面这些条件：

- `SettingsTabId` 只保留最终 8 个模块 id
- 外部通过事件打开设置页时，旧 tab id 仍能被安全归并到新的一级模块
- 设置页左侧目录、顶部标题、主内容区都按最终 IA 输出
- `AI / MCP / Skills` 继续可进入，且行为不回退
- `general / permissions / appearance / storage / advanced` 至少有独立面板入口和占位内容
- `GlobalSettingsPage.tsx` 只负责壳层、路由分发和已有模块挂接，不再继续膨胀
- 现有与设置页相关的前端测试断言同步更新

## 受影响文件

### 必改文件

- `src/components/workspace/globalSettingsPageShared.ts`
- `src/components/workspace/GlobalSettingsPage.tsx`
- `src/components/workspace/AIChat.css`
- `src/App.tsx`

### 建议新增文件

- `src/components/workspace/settings/SettingsSidebar.tsx`
- `src/components/workspace/settings/SettingsSection.tsx`
- `src/components/workspace/settings/SettingsPlaceholderPanel.tsx`

说明：
`SettingsPlaceholderPanel.tsx` 不是强制文件，但从当前代码看，`renderSettingsPlaceholder` 已经是显式重复点，阶段 1 直接抽出会比继续内联更稳。

### 高概率受影响测试

- `tests/ai/ai-chat-settings-skills-mcp.test.mjs`
- `tests/ai/ai-chat-settings-workbench-ui.test.mjs`
- `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

### 可复用、尽量不改内部逻辑的现有模块

- `src/components/workspace/useAIChatSettingsState.ts`
- `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`

## 执行顺序

建议按“先收口合同，再拆壳层，最后补测试”的顺序推进：

1. 先改 tab 合同和旧入口映射
2. 再抽出 settings 壳层子组件
3. 再重构 `GlobalSettingsPage.tsx` 挂接新壳层
4. 再接回 AI / MCP / Skills
5. 再补剩余 5 个模块占位面板
6. 最后更新样式与测试

## 任务清单

### 任务 1：锁定阶段 1 的 IA 合同

**目标**

先把“最终有哪些一级模块、每个模块叫什么、旧 tab 怎么落到新 tab”定成代码合同，避免后面壳层和测试跟着来回改。

**涉及文件**

- 修改：`src/components/workspace/globalSettingsPageShared.ts`

**执行项**

- [ ] 删除旧的一级 tab id：`adapters`、`terminal`、`agents`、`plugins`、`computerUse`、`diagnostics`、`about`
- [ ] 把 `SettingsTabId` 收口为最终 8 个模块
- [ ] 重写 `SETTINGS_TABS`，统一每个模块的 `label / eyebrow / title / description`
- [ ] 明确文案归并关系：
  - `about` 并入 `general`
  - `Git / 环境 / 浏览器 / worktree` 先体现在 `advanced`
- [ ] 为 `resolveSettingsTabId()` 增加历史入口归并逻辑，而不是简单 fallback
- [ ] 归并建议：
  - `about -> general`
  - `adapters -> advanced`
  - `terminal -> advanced`
  - `agents -> advanced`
  - `plugins -> advanced`
  - `computerUse -> advanced`
  - `diagnostics -> advanced`

**完成标准**

- `SettingsTabId` 不再包含旧占位 tab
- 任何旧入口字符串传给 `resolveSettingsTabId()`，都能得到稳定的新模块 id
- `SETTINGS_TABS` 可以作为设置页唯一的一级导航来源

**注意点**

- 这一步不要提前改业务渲染逻辑，只改共享合同
- fallback 目标不要全部落到 `ai`，优先做语义归并，避免用户从旧入口进入时跳到明显不相关的页面

### 任务 2：建立阶段 1 的 settings 壳层组件

**目标**

把左侧目录、内容分组容器、占位面板从 `GlobalSettingsPage.tsx` 里拆出去，先搭好壳层骨架。

**涉及文件**

- 新增：`src/components/workspace/settings/SettingsSidebar.tsx`
- 新增：`src/components/workspace/settings/SettingsSection.tsx`
- 新增：`src/components/workspace/settings/SettingsPlaceholderPanel.tsx`

**执行项**

- [ ] 抽出 `SettingsSidebar.tsx`
  - 接收 `tabs`
  - 接收 `activeTab`
  - 接收 `onSelectTab`
- [ ] 抽出 `SettingsSection.tsx`
  - 统一模块面板内的分组标题、描述、主体容器
- [ ] 抽出 `SettingsPlaceholderPanel.tsx`
  - 接收当前 tab 元信息
  - 输出统一的“模块尚未接入”占位结构
- [ ] 保持类名尽量复用现有 `AIChat.css` 命名，避免阶段 1 顺手发明第二套样式语义

**完成标准**

- 新壳层组件职责边界清楚
- `GlobalSettingsPage.tsx` 不再需要内联渲染左侧目录或占位块
- 占位面板文案由 tab 元信息驱动，而不是每个模块手写一遍

**注意点**

- 不要在这一步引入真实字段行组件；`SettingsFieldRow` 这类统一交互组件属于阶段 5
- `SettingsSection.tsx` 应该是轻量布局容器，不要提前演化成“万能设置表单系统”

### 任务 3：重构 `GlobalSettingsPage.tsx` 为“壳层 + 分发”

**目标**

让 `GlobalSettingsPage.tsx` 只保留顶部头部、壳层布局、模块内容分发和现有模块挂接。

**涉及文件**

- 修改：`src/components/workspace/GlobalSettingsPage.tsx`

**执行项**

- [ ] 保留现有 `GlobalSettingsPageProps`
- [ ] 保留 `selectedSettingsTabMeta` 这类基于 `SETTINGS_TABS` 的派生元信息
- [ ] 去掉内联 sidebar 渲染，改为使用 `SettingsSidebar`
- [ ] 去掉内联 `renderSettingsPlaceholder()`，改为使用 `SettingsPlaceholderPanel`
- [ ] 把主内容渲染改成单一分发函数或清晰的条件分支区
- [ ] 保持 `LazyAIChatAISettingsTab` 的懒加载方式不变
- [ ] 保持页面头部结构不变：
  - 返回按钮
  - 当前模块 eyebrow
  - 当前模块标题
  - 当前模块描述

**完成标准**

- `GlobalSettingsPage.tsx` 的角色清晰变成 settings shell
- 模块内容入口集中在一个分发位置，后面接 `general / appearance / permissions / storage / advanced` 时不需要再次大改页面结构
- AI 设置仍保持懒加载

**注意点**

- 这一步重构应尽量保持 DOM 语义连续，避免无必要地打断现有样式和测试
- 如果要新增辅助函数，优先放在组件内部局部使用，不要把阶段 1 过早扩展成新的大 store

### 任务 4：把现有 `AI / MCP / Skills` 接回新壳层

**目标**

在不改核心逻辑的前提下，把当前已经可用的 3 个模块重新挂接到阶段 1 壳层。

**涉及文件**

- 修改：`src/components/workspace/GlobalSettingsPage.tsx`
- 只读确认：`src/components/workspace/useAIChatSettingsState.ts`
- 只读确认：`src/components/workspace/RuntimeMcpSettingsPage.tsx`
- 只读确认：`src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`

**执行项**

- [ ] AI 模块继续使用 `LazyAIChatAISettingsTab`
- [ ] Skills 模块继续直接挂 `GNAgentSkillsPage`
- [ ] MCP 模块继续直接挂 `RuntimeMcpSettingsPage`
- [ ] 这 3 个模块外层统一通过新的 stage 容器承载
- [ ] 不在阶段 1 修改以下内容：
  - AI 配置 CRUD 逻辑
  - MCP server CRUD 逻辑
  - Skills 导入、删除、预览逻辑

**完成标准**

- 原有 3 个模块仍可进入
- 新壳层不改变这 3 个模块的真实数据来源
- 阶段 1 完成后，后续阶段可以只处理新增模块，不需要再回头重接这 3 个现有模块

**注意点**

- 如果发现布局上需要额外包一层容器，优先做壳层级修复，不要把样式修补塞进模块内部

### 任务 5：补齐剩余 5 个模块的独立占位入口

**目标**

让最终 IA 里的所有一级模块都已经“出现”，即便其中 5 个还没有真实字段，也已经有独立入口和边界。

**涉及文件**

- 修改：`src/components/workspace/GlobalSettingsPage.tsx`
- 可能修改：`src/components/workspace/globalSettingsPageShared.ts`

**执行项**

- [ ] 为 `general` 输出独立占位面板，并明确后续会承接：
  - 语言
  - 启动行为
  - 关于信息
- [ ] 为 `permissions` 输出独立占位面板，并明确后续会承接：
  - 审批模式
  - sandbox
  - 恢复行为
- [ ] 为 `appearance` 输出独立占位面板，并明确后续会承接：
  - 主题
  - 阅读宽度
  - AI pane 外观偏好
- [ ] 为 `storage` 输出独立占位面板，并明确后续会承接：
  - 项目根目录
  - 默认目录
  - 存储诊断
- [ ] 为 `advanced` 输出独立占位面板，并明确后续会承接：
  - shell mode
  - Claude / Codex 绑定
  - Git / 环境 / 浏览器 / worktree 偏好

**完成标准**

- 8 个一级模块都可点击进入
- 不再存在用户能看到但无归属的旧模块入口
- 占位模块的文案能反映后续阶段的承接范围

**注意点**

- 阶段 1 的占位不是“Coming soon”式空白占位，建议最少写清楚该模块后续承接什么内容，避免结构虽完整、信息却无效

### 任务 6：收口样式与窄屏行为

**目标**

确保阶段 1 在视觉上仍然符合当前 workbench shell，且不因为拆组件破坏桌面端和窄屏布局。

**涉及文件**

- 修改：`src/components/workspace/AIChat.css`

**执行项**

- [ ] 复用当前 `.global-settings-page`、`.chat-settings-workbench-shell`、`.chat-settings-workbench-sidebar`、`.chat-settings-workbench-stage` 相关样式
- [ ] 为新抽出的壳层组件补充最少量样式类
- [ ] 对照 `ui-standards.html` 与 `workbench-preview.css`，确认设置页仍然是安静的工作台壳层，不滑向 dashboard 式卡片布局
- [ ] 保持左侧目录在桌面端是固定列、主区是单一主舞台
- [ ] 保持窄屏下目录可横向滚动，不引入右侧 companion pane
- [ ] 保持 `AI / Skills / MCP` 进入后主区域滚动行为不回退

**完成标准**

- 桌面端仍是 `sidebar + main stage`
- 移动端或窄屏下目录仍可操作
- 不出现“左侧列表不滚动、主区高度塌陷、整页双滚动条失控”这类壳层回归

**注意点**

- 阶段 1 不要顺手重写整份 `AIChat.css`
- 能复用现有类名就不要新开一套近义类名

### 任务 7：更新测试与回归检查

**目标**

把旧 tab 断言、旧占位实现断言、页面壳层断言一起收口，保证阶段 1 完成后测试描述和真实 IA 一致。

**涉及文件**

- 修改：`tests/ai/ai-chat-settings-skills-mcp.test.mjs`
- 修改：`tests/ai/ai-chat-settings-workbench-ui.test.mjs`
- 修改：`tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
- 可选新增：`tests/settings/global-settings-tabs.test.mjs`

**执行项**

- [ ] 把测试里对旧一级模块 id 的断言更新为最终 8 模块
- [ ] 把测试里对 `renderSettingsPlaceholder` 的实现细节断言，替换成对新壳层组件或新渲染结构的断言
- [ ] 保留以下现有行为断言：
  - 设置页仍是全局 workbench 页，而不是 AI 面板 overlay
  - 没有右侧 companion pane
  - AI / Skills / MCP 仍可进入
  - `resolveSettingsTabId(detail.tab)` 仍由 `App.tsx` 负责接外部事件
- [ ] 如果阶段 1 增加了旧 tab 归并逻辑，补一个专门断言旧入口映射的测试

**完成标准**

- 现有设置页测试表达的是“最终 8 模块 IA”，而不是旧的过渡态 IA
- 外部事件打开设置页的路径保持有效
- 测试命名和页面真实结构一致

## 阶段 1 验收清单

- [ ] 从 `App.tsx` 外部设置事件进入时，任意旧 tab id 都能落到正确的新一级模块
- [ ] 左侧目录只显示最终 8 个模块
- [ ] `AI / MCP / Skills` 打开后仍能看到原有功能主体
- [ ] `general / permissions / appearance / storage / advanced` 都有独立面板
- [ ] 设置页没有右侧 companion pane
- [ ] 桌面端与窄屏下滚动和布局未回退
- [ ] 相关测试断言已同步更新

## 建议验证方式

### 手动验证

1. 从应用内打开设置页，确认左侧只有 8 个模块
2. 分别切换 `ai / mcp / skills`，确认现有功能正常进入
3. 依次切换 `general / permissions / appearance / storage / advanced`，确认每个模块都有独立面板，不会跳回默认页
4. 用旧 tab id 触发外部设置事件，确认仍能进入合理的新模块
5. 缩小窗口宽度，确认目录仍可操作、主区仍可滚动
6. 对照 `ui-standards.html` 与 `state-standards.html`，确认设置页的默认、hover、selected、empty 等状态仍符合 workbench 标准

### 自动验证

- `node --test tests/ai/ai-chat-settings-skills-mcp.test.mjs`
- `node --test tests/ai/ai-chat-settings-workbench-ui.test.mjs`
- `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
- 如新增设置页专项测试，再补跑对应 `tests/settings/...`

## 阶段 1 之后再进入的内容

阶段 1 完成后，才建议进入下一层工作：

1. 阶段 2：把 AI / MCP / Skills 面板命名、分组、只读信息区再收口
2. 阶段 3：接入 `general` 与 `appearance`
3. 阶段 4：接入 `permissions / storage / advanced`
