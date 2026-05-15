# 设置页开发计划

更新时间：2026-05-15

## 目标

基于现有 `GlobalSettingsPage` 骨架，把设置页从“AI / Skills / MCP 三块已落地、其余大多为占位”的状态，推进成一套可持续扩展的完整设置体系。

这份计划不直接写实现代码，重点回答：

1. 先做哪些阶段
2. 每个阶段改哪些文件
3. 哪些字段走前端持久化，哪些走 Tauri / Rust，哪些只做只读展示
4. 每一阶段如何验证

## 开发前检查结论

本轮在开始计划前已完成以下校对：

- 8 个模块文档都补齐了字段总表
- 已补跨模块字段矩阵：`docs/settings/09-field-matrix.md`
- 已确认需要明确区分的关键字段：
  - `restoreLastSessionOnLaunch` vs `autoResumeOnLaunch`
  - `rootPath` vs `projectStorageRoot`
  - `selectedConfigId` vs `claudeConfigId` / `codexConfigId`
- 已修正文档口径：
  - `isDefault` 调整为“派生的只读状态”，不是单独落盘字段
  - `skills[]` 调整为“发现结果 / 只读索引视图”，不是统一 settings store 字段

## 计划原则

- 优先复用现有设置页骨架，不推翻 `GlobalSettingsPage.tsx`
- 先把“真实已存在的设置能力”收拢进统一设置页，再补新增字段
- 先做全局信息架构和设置基础设施，再逐模块落地
- 优先把“持久化字段”和“只读运行态字段”分层，不要混在一个 store
- 新增字段默认按最小可用版本设计，不一次性做复杂高级能力

## 范围拆分

本次设置页开发建议拆成 6 个阶段：

1. 设置页信息架构与共享基础层
2. 现有模块收口：AI / MCP / 技能
3. 新增基础模块：常规 / 外观
4. 新增运行模块：权限 / 存储 / 高级
5. 统一交互、只读状态面板与重置动作
6. 测试、迁移、文档收尾

## 关键文件地图

### 现有核心文件

- `src/components/workspace/GlobalSettingsPage.tsx`
  当前设置页主壳，已接入 `AI`、`Skills`、`MCP`
- `src/components/workspace/globalSettingsPageShared.ts`
  当前 tab 定义、AI 设置共享工具
- `src/components/workspace/useAIChatSettingsState.ts`
  AI 设置页表单逻辑
- `src/components/workspace/RuntimeMcpSettingsPage.tsx`
  MCP 设置模块
- `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
  技能页
- `src/modules/ai/store/aiConfigState.ts`
  AI 配置真实模型
- `src/modules/ai/runtime/agentRuntimeClient.ts`
  Runtime 权限设置客户端
- `src-tauri/src/agent_runtime/settings_store.rs`
  Runtime 权限设置持久化
- `src-tauri/src/agent_shell/settings_store.rs`
  Shell 模式设置持久化
- `src/utils/projectPersistence.ts`
  项目存储设置与项目目录接口
- `src-tauri/src/lib.rs`
  项目存储相关 Tauri 命令
- `src/App.tsx`
  当前主题、AI pane 宽度、项目存储状态入口
- `src/appTheme.ts`
  App Style 定义
- `src/utils/layoutPreferences.ts`
  布局尺寸持久化

### 建议新增文件

- `src/components/workspace/settings/`
  建议新建设置页子目录，按模块拆子面板，避免 `GlobalSettingsPage.tsx` 继续膨胀
- `src/components/workspace/settings/SettingsSidebar.tsx`
  左侧模块导航
- `src/components/workspace/settings/SettingsSection.tsx`
  统一设置分组容器
- `src/components/workspace/settings/GeneralSettingsPanel.tsx`
- `src/components/workspace/settings/AppearanceSettingsPanel.tsx`
- `src/components/workspace/settings/PermissionsSettingsPanel.tsx`
- `src/components/workspace/settings/StorageSettingsPanel.tsx`
- `src/components/workspace/settings/AdvancedSettingsPanel.tsx`
- `src/components/workspace/settings/settingsTypes.ts`
  新增设置相关统一类型
- `src/components/workspace/settings/settingsViewModels.ts`
  统一只读字段、动作字段、可编辑字段的前端映射

### 建议新增状态文件

- `src/modules/settings/`
  如果团队接受，建议补一层 settings 领域目录
- `src/modules/settings/generalSettingsStore.ts`
- `src/modules/settings/appearanceSettingsStore.ts`
- `src/modules/settings/storageSettingsStore.ts`
- `src/modules/settings/advancedSettingsStore.ts`

如果不想新增过多 store，也可以保守一些：

- 继续沿用现有模块 store
- 只为 `常规 / 外观 / 高级` 新增轻量 settings store
- `权限 / 存储 / AI` 直接复用现有真实来源

## 阶段计划

### 阶段 1：设置页信息架构与共享基础层

**目标**

先把设置页壳层重构到能稳定承接 8 个模块，避免后续每加一个模块就继续堆在 `GlobalSettingsPage.tsx`。

**范围**

- 调整 tab 定义，收敛到最终 IA：
  - `general`
  - `ai`
  - `permissions`
  - `mcp`
  - `skills`
  - `appearance`
  - `storage`
  - `advanced`
- 去掉当前阶段不准备独立实现的一级 tab 占位：
  - `adapters`
  - `terminal`
  - `agents`
  - `plugins`
  - `computerUse`
  - `diagnostics`
  - `about`
- 将 `about` 能力并入 `常规`
- 将 Git / 环境 / 浏览器 / worktree 偏好先并入 `高级`

**主要文件**

- 修改 `src/components/workspace/globalSettingsPageShared.ts`
- 修改 `src/components/workspace/GlobalSettingsPage.tsx`
- 新增 `src/components/workspace/settings/SettingsSidebar.tsx`
- 新增 `src/components/workspace/settings/SettingsSection.tsx`

**产出**

- 设置页左侧目录与右侧主内容区结构稳定
- 每个模块都有独立渲染入口
- `GlobalSettingsPage.tsx` 从“大而全”转成“壳层 + 分发”

**验证**

- 手动验证设置页 8 个模块切换
- 确认不再依赖右侧 companion
- 确认 AI / Skills / MCP 现有功能仍能进入

### 阶段 2：现有模块收口：AI / MCP / 技能

**目标**

先把已经真实存在的 3 个模块对齐最终 IA 和命名，减少后面新增模块时的结构分裂。

**范围**

- AI
  - 保持 `useAIChatSettingsState.ts` 逻辑
  - 补齐默认配置文案、默认模型映射预留位
  - 明确导入导出入口的位置
- MCP
  - 保持 `RuntimeMcpSettingsPage.tsx`
  - 补齐状态、错误、最近调用的只读展示分区
  - 为后续 `autoConnect / timeoutMs / retryCount` 预留 UI 占位
- 技能
  - 保持 `GNAgentSkillsPage.tsx`
  - 增加同步状态与来源信息的更清晰展示
  - 为版本、冲突提示预留详情区位置

**主要文件**

- 修改 `src/components/workspace/GlobalSettingsPage.tsx`
- 修改 `src/components/workspace/useAIChatSettingsState.ts`
- 修改 `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- 修改 `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- 视情况拆出：
  - `AISettingsPanel.tsx`
  - `McpSettingsPanel.tsx`
  - `SkillsSettingsPanel.tsx`

**产出**

- 现有 3 个模块与最终设置页 IA 一致
- “编辑设置”与“只读状态”开始分区展示
- 页面结构更适合后续扩展

**验证**

- AI：配置 CRUD、启停、连接测试、加载模型、导入导出
- MCP：Server CRUD、切换 transport、保存 draft、查看最近调用
- 技能：搜索、导入、删除、预览

### 阶段 3：新增基础模块：常规 / 外观

**目标**

优先把用户最容易理解、最接近全局偏好的设置补齐，形成“设置页第一次像个完整产品页”的感受。

**范围**

#### 常规

- 首批推荐实现：
  - `uiLanguage`
  - `startupPage`
  - `restoreLastSessionOnLaunch`
  - `openRecentWorkspaceOnLaunch`
- 第二批可跟进：
  - `autoUpdateEnabled`
  - `updateChannel`
  - `newWindowBehavior`
  - `appVersion`
  - `buildChannel`
  - `runtimeInfo`

#### 外观

- 首批推荐实现：
  - `themeMode`
  - `desktopAiPaneWidth`
  - `desktopAiPaneCollapsedByDefault`
  - `readingWidth`
- 第二批可跟进：
  - `appStyle`
  - `uiDensity`
  - `fontSize`
  - `animationsEnabled`
  - `reducedMotion`
  - `timelineDensity`
  - `showThinkingByDefault`
  - `showToolCardsByDefault`
  - `showFinalAnswerExpandedByDefault`

**主要文件**

- 新增 `src/components/workspace/settings/GeneralSettingsPanel.tsx`
- 新增 `src/components/workspace/settings/AppearanceSettingsPanel.tsx`
- 新增轻量 store：
  - `src/modules/settings/generalSettingsStore.ts`
  - `src/modules/settings/appearanceSettingsStore.ts`
- 修改 `src/App.tsx`
- 修改 `src/appTheme.ts`
- 修改 `src/utils/layoutPreferences.ts`

**产出**

- 用户可以在设置页里完成语言、启动、主题、布局这些基础偏好设置
- `App.tsx` 里零散的主题 / pane 宽度状态被设置页接管

**验证**

- 重启后语言、主题、AI pane 宽度等偏好仍生效
- 启动页设置与当前路由 / role 切换逻辑兼容
- `light / dark` 切换不破坏页面层级

### 阶段 4：新增运行模块：权限 / 存储 / 高级

**目标**

把当前已有真实后端设置的运行层能力接进设置页，再补一批必要但轻量的新增字段。

**范围**

#### 权限

- 首批直接接已有真实字段：
  - `permissionMode`
  - `sandboxPolicy`
  - `autoResumeOnLaunch`
  - `persistResumeDrafts`
- 第二批规划字段先做 UI 与接口预留：
  - `autoApproveEnabled`
  - `toolApprovalMode`
  - `highRiskConfirmationEnabled`
  - `defaultCommandTimeoutMs`
  - `interruptBehavior`

#### 存储

- 首批直接接已有真实字段与命令：
  - `rootPath`
  - `defaultPath`
  - `isDefault`
  - `projectDir`
  - `requirementsDir`
- 第二批规划字段：
  - `cacheRoot`
  - `clearCacheScope`
  - `rebuildIndexScope`
  - `attachmentsPath`
  - `downloadsPath`

#### 高级

- 首批直接接已有真实字段：
  - `mode`
  - `claudeConfigId`
  - `codexConfigId`
- 第二批做只读诊断与轻量入口：
  - `runtimeSettingsPath`
  - `shellSettingsPath`
  - `projectStorageSettingsPath`
  - `skillsLibraryPath`
  - `featureFlags`
  - `runtimeHealthy`
  - `sidecarConnected`

**主要文件**

- 新增：
  - `PermissionsSettingsPanel.tsx`
  - `StorageSettingsPanel.tsx`
  - `AdvancedSettingsPanel.tsx`
- 修改：
  - `src/modules/ai/runtime/agentRuntimeClient.ts`
  - `src-tauri/src/agent_runtime/settings_store.rs`
  - `src/utils/projectPersistence.ts`
  - `src-tauri/src/lib.rs`
  - `src/modules/ai/gn-agent/gnAgentShellStore.ts`
  - `src-tauri/src/agent_shell/settings_store.rs`

**产出**

- 权限、存储、高级三类运行层设置能正式从全局设置页进入
- 现有 Tauri 设置文件与前端 UI 建立稳定映射

**验证**

- 权限：切换后能读取并刷新真实 runtime settings
- 存储：切换项目根目录后项目创建 / 目录解析逻辑仍正确
- 高级：Shell 模式切换与 Claude / Codex 绑定不回退

### 阶段 5：统一交互、只读状态面板与重置动作

**目标**

把设置页里不同类型的信息统一成明确的交互模式，避免“可编辑设置”和“运行诊断”混在一起。

**范围**

- 统一可编辑项组件：
  - Switch
  - Select
  - 路径选择器
  - 数值输入
  - Key-Value 编辑器
- 统一只读项组件：
  - 状态 Badge
  - 诊断信息卡片
  - 路径展示卡片
- 统一危险动作组件：
  - 清理缓存
  - 重建索引
  - 删除技能
  - 分组重置
  - 恢复默认设置

**主要文件**

- 新增共享组件：
  - `settings/SettingsFieldRow.tsx`
  - `settings/SettingsReadonlyCard.tsx`
  - `settings/SettingsDangerAction.tsx`
- 修改各模块面板

**产出**

- 整个设置页的交互风格统一
- “值型设置”“状态型信息”“危险动作”分层明确

**验证**

- 键盘可达性
- 错误态、空态、加载态
- 危险动作二次确认

### 阶段 6：测试、迁移、文档收尾

**目标**

在不破坏现有 AI / MCP / 技能能力的前提下，把新增模块和设置持久化链路补上回归验证。

**范围**

- 前端测试
  - 设置页 tab 渲染
  - 关键表单交互
  - 默认值与回显
- Tauri / Rust 测试
  - runtime settings
  - shell settings
  - project storage settings
- 文档收尾
  - 更新 `docs/settings/index.md`
  - 如有必要补一份“实施状态”记录

**建议测试文件**

- 现有：
  - `tests/project-storage-settings.test.mjs`
- 建议新增：
  - `tests/settings/global-settings-tabs.test.mjs`
  - `tests/settings/general-settings-store.test.mjs`
  - `tests/settings/appearance-settings-store.test.mjs`
  - `tests/settings/permissions-settings-bridge.test.mjs`
  - `tests/settings/advanced-settings-bridge.test.mjs`

**构建验证**

- `npm run build`
- 与设置相关的 `node --test ...`
- `cargo test --manifest-path src-tauri/Cargo.toml`

## 推荐开发顺序

如果按“最稳妥、最不容易返工”的顺序推进，建议这样排：

1. 阶段 1：先收口设置页 IA 和壳层
2. 阶段 2：把 AI / MCP / 技能搬进新的壳层
3. 阶段 3：补常规 / 外观
4. 阶段 4：补权限 / 存储 / 高级
5. 阶段 5：统一只读与危险动作模式
6. 阶段 6：测试与文档收尾

## 风险与规避

### 风险 1：`GlobalSettingsPage.tsx` 继续膨胀

规避：

- 第一阶段就拆模块面板文件
- 保持 `GlobalSettingsPage.tsx` 只做壳层和分发

### 风险 2：把运行态字段误做成持久化设置

规避：

- 以 `docs/settings/09-field-matrix.md` 为唯一字段分层依据
- 只读字段统一走状态卡片，不进入保存动作

### 风险 3：常规恢复逻辑与 runtime 恢复逻辑混淆

规避：

- `常规` 和 `权限` 文案明确区分
- 状态存储分开设计

### 风险 4：路径类字段命名重复导致实现混乱

规避：

- 统一用 `rootPath` 作为真实字段
- `projectStorageRoot` 只保留为文案描述，不落新 store

### 风险 5：MCP / 技能 / AI 三块旧页面被新壳层打断

规避：

- 先做壳层，不重写内部逻辑
- 在阶段 2 之前不改动其核心行为

## 里程碑定义

### 里程碑 A：设置页结构完成

完成标准：

- 8 个模块都能进入
- AI / MCP / 技能继续可用
- 左侧目录与主内容区结构稳定

### 里程碑 B：基础设置可用

完成标准：

- 常规 / 外观模块可用
- 语言、主题、启动页、AI pane 宽度可设置并回显

### 里程碑 C：运行设置可用

完成标准：

- 权限 / 存储 / 高级模块可用
- runtime / shell / project storage 已接通真实后端

### 里程碑 D：整体可交付

完成标准：

- 所有一级模块都有稳定内容
- 主要持久化字段都能读写
- 只读诊断与危险动作有统一交互
- 构建与关键测试通过

## 下一步建议

如果按这份计划继续推进，下一份文档建议写成“实施任务拆分版”，把阶段 1 先拆成可执行任务列表，再开做代码。优先从：

1. 调整 `SETTINGS_TABS`
2. 拆 `GlobalSettingsPage.tsx`
3. 建立 `settings/` 子目录和共享壳层组件
## 阶段 1 补充

- 详细执行任务清单见：[11-phase-1-task-list.md](./11-phase-1-task-list.md)

## UI 标准约束

设置页后续所有 UI 阶段都要先对照以下标准页，再开始具体实现：

- `design/workbench-unified-previews/ui-standards.html`
- `design/workbench-unified-previews/overview-home.html`
- `design/workbench-unified-previews/state-standards.html`
- `design/workbench-unified-previews/workbench-preview.css`

这不是可选参考，而是设置页开发的默认 UI 合同。各阶段都应遵守以下方向：

- 保持原生桌面、Notes / Finder 式的安静工作台气质
- 以单主内容区为中心，不做多块同权重内容竞争
- 左侧目录优先使用列表 / 树式导航，而不是堆叠圆角卡片
- 主区优先呈现文档式设置内容，不做营销页或 KPI 仪表盘风格
- 所有新增设置面板都要覆盖 `default / hover / selected / collapsed / empty / loading / error` 中与自身相关的状态
- 动效只用于解释状态变化，且需要兼容 `prefers-reduced-motion`
