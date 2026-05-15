# 设置字段矩阵

更新时间：2026-05-15

## 目的

这份文档不重复模块说明，只做三件事：

1. 把 8 个设置模块里的字段放到同一张表里
2. 标清楚每个字段的实现层级：`真实持久化 / 运行态只读 / 页面视图态 / 动作载荷 / 规划新增`
3. 找出跨模块里最容易混淆、重名或应该合并的字段

## 分类说明

字段层级统一按下面几类理解：

- `持久化字段`：已经有明确 store / localStorage / Tauri settings file 落盘
- `运行态只读`：运行时会产出，但不作为用户可编辑设置保存
- `页面视图态`：只服务当前设置页或子页面交互，不属于最终设置模型
- `动作载荷`：只在导入、导出、清理、重建、重置等动作里临时使用
- `规划字段`：文档先定义，当前代码里还没有真实状态源

## 跨模块字段总矩阵

| 字段 | 所属模块 | 层级 | 作用域 | 当前状态 | 真实来源 / 目标来源 | 是否应持久化 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `uiLanguage` | 常规 | 规划字段 | 全局 | 新增 | 新全局设置模型 + i18n 层 | 是 | 单字段承载语言策略；`system` 表示跟随系统，显式值表示固定语言。 |
| `startupPage` | 常规 | 规划字段 | 全局 | 部分存在 | `App.tsx` 角色页能力上提 | 是 | 需要和当前 role / page 路由模型对齐。 |
| `restoreLastSessionOnLaunch` | 常规 | 规划字段 | 全局 | 新增 | 新全局设置模型 | 是 | 产品层恢复，不是 runtime 恢复。 |
| `openRecentWorkspaceOnLaunch` | 常规 | 规划字段 | 全局 | 新增 | 新全局设置模型 | 是 | 和 `startupPage` 联动。 |
| `autoUpdateEnabled` | 常规 | 规划字段 | 全局 | 新增 | Tauri 更新层 | 是 | 需要桌面更新通道支持。 |
| `updateChannel` | 常规 | 规划字段 | 全局 | 新增 | Tauri 更新层 | 是 | 建议和发行通道系统一。 |
| `newWindowBehavior` | 常规 | 规划字段 | 全局 | 新增 | 新全局设置模型 | 是 | 多窗口行为偏好。 |
| `appVersion` | 常规 | 运行态只读 | 全局 | 部分存在 | Tauri / 包信息 | 否 | 只读信息。 |
| `buildChannel` | 常规 | 运行态只读 | 全局 | 部分存在 | 构建元信息 | 否 | 只读信息。 |
| `runtimeInfo` | 常规 | 运行态只读 | 全局 | 部分存在 | Tauri / 前端环境探测 | 否 | 只读信息。 |
| `configs[]` | AI | 持久化字段 | 全局 | 已存在 | `aiConfigState.ts` | 是 | AI 模块主设置源。 |
| `id`（AI 配置） | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 模块内主键。 |
| `name`（AI 配置） | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 与 MCP / 技能里的 `name` 同名但不冲突。 |
| `provider` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 仅 AI 模块语义。 |
| `apiKey` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 敏感字段。 |
| `baseURL` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 应和 provider 联动。 |
| `model` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 当前主模型。 |
| `savedModels` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 候选模型池。 |
| `contextWindowTokens` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 数值型运行配置。 |
| `customHeaders` | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 当前按 JSON 字符串保存。 |
| `enabled`（AI 配置） | AI | 持久化字段 | 单条配置 | 已存在 | `AIConfigEntry` | 是 | 与 MCP 的 `enabled` 同名异域。 |
| `selectedConfigId` | AI | 持久化字段 | 全局 | 已存在 | AI 设置状态 / 运行默认配置 | 是 | 控制默认运行配置。 |
| `defaultChatModel` | AI | 规划字段 | 全局 AI 偏好 | 新增 | 新 AI 偏好设置 | 是 | 建议和 `defaultExecutionModel` 一起设计。 |
| `defaultExecutionModel` | AI | 规划字段 | 全局 AI 偏好 | 新增 | 新 AI 偏好设置 | 是 | 同上。 |
| `defaultSummaryModel` | AI | 规划字段 | 全局 AI 偏好 | 新增 | 新 AI 偏好设置 | 是 | 同上。 |
| `defaultTitleModel` | AI | 规划字段 | 全局 AI 偏好 | 新增 | 新 AI 偏好设置 | 是 | 同上。 |
| `version`（AI 导入导出） | AI | 动作载荷 | 导入导出 | 部分存在 | JSON schema | 否 | 仅导入导出格式版本。 |
| `permissionMode` | 权限 | 持久化字段 | 全局 runtime | 已存在 | `agent_runtime/settings_store.rs` | 是 | 顶层审批模式。 |
| `sandboxPolicy` | 权限 | 持久化字段 | 全局 runtime | 已存在 | `agent_runtime/settings_store.rs` | 是 | 执行层安全边界。 |
| `autoResumeOnLaunch` | 权限 | 持久化字段 | 全局 runtime | 已存在 | `agent_runtime/settings_store.rs` | 是 | runtime 会话恢复。 |
| `persistResumeDrafts` | 权限 | 持久化字段 | 全局 runtime | 已存在 | `agent_runtime/settings_store.rs` | 是 | runtime 草稿持久化。 |
| `autoApproveEnabled` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 审批增强。 |
| `autoApproveScope` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 自动审批白名单。 |
| `toolApprovalMode` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 工具独立审批规则。 |
| `toolApprovalRiskThreshold` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 工具审批阈值。 |
| `highRiskConfirmationEnabled` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 不能被低风险自动审批绕过。 |
| `defaultCommandTimeoutMs` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 可被工具默认值复用。 |
| `timeoutBehavior` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 超时后的策略。 |
| `interruptBehavior` | 权限 | 规划字段 | 全局 runtime | 新增 | 新 runtime settings | 是 | 用户手动中断策略。 |
| `projectPermissionOverrideEnabled` | 权限 | 规划字段 | 全局入口 | 新增 | 新项目权限层 | 是 | 入口字段。 |
| `projectPermissionOverride` | 权限 | 规划字段 | 项目级 | 新增 | 新项目权限层 | 是 | 实际项目级配置值。 |
| `servers[]` | MCP 服务器 | 持久化字段 | 全局 runtime | 已存在 | `runtimeMcpStore.ts` / sidecar | 是 | MCP 模块主数据源。 |
| `id`（MCP Server） | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.id` | 是 | 与 AI 配置 `id` 同名异域。 |
| `name`（MCP Server） | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.name` | 是 | 同上。 |
| `description`（MCP Server） | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.description` | 是 | 描述用途。 |
| `enabled`（MCP Server） | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.enabled` | 是 | 与 AI `enabled` 同名异域。 |
| `status` | MCP 服务器 | 运行态只读 | 单个 Server | 已存在 | `RuntimeMcpServer.status` | 否 | 连接健康度。 |
| `transport` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.transport` | 是 | `stdio / http / sse`。 |
| `toolNames` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.toolNames` | 是 | 可编辑的工具名集合。 |
| `tools` | MCP 服务器 | 运行态只读 | 单个 Server | 已存在 | `RuntimeMcpServer.tools` | 否 | 完整工具定义。 |
| `command` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.command` | 是 | 仅 `stdio`。 |
| `args` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.args` | 是 | 仅 `stdio`。 |
| `env` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.env` | 是 | 仅 `stdio`。 |
| `url` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.url` | 是 | 仅远程。 |
| `headers` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.headers` | 是 | 仅远程。 |
| `headersHelper` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.headersHelper` | 是 | 仅远程辅助说明。 |
| `oauth.clientId` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.oauth` | 是 | 仅远程。 |
| `oauth.callbackPort` | MCP 服务器 | 持久化字段 | 单个 Server | 已存在 | `RuntimeMcpServer.oauth` | 是 | 仅远程。 |
| `toolCallsByThread` | MCP 服务器 | 运行态只读 | 线程级 | 已存在 | `runtimeMcpStore.ts` | 否 | 最近调用摘要。 |
| `autoConnect` | MCP 服务器 | 规划字段 | 单个 Server | 新增 | 新 MCP settings | 是 | 不等于 `enabled`。 |
| `retryCount` | MCP 服务器 | 规划字段 | 单个 Server | 新增 | 新 MCP settings | 是 | 与 `timeoutMs` 配对。 |
| `timeoutMs` | MCP 服务器 | 规划字段 | 单个 Server | 新增 | 新 MCP settings | 是 | 远程调用超时。 |
| `lastError` | MCP 服务器 | 运行态只读 | 单个 Server | 部分存在 | runtime error 状态 | 否 | 需要沉淀为稳定字段。 |
| `lastErrorAt` | MCP 服务器 | 规划字段 | 单个 Server | 新增 | runtime error 状态 | 否 | 运行态诊断字段。 |
| `skills[]` | 技能 | 运行态只读 | 全局技能视图 | 已存在 | `discoverLocalSkills()` 结果 | 否 | 更准确说是“可发现技能索引”，来源于磁盘扫描与内置技能定义。 |
| `id`（技能） | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.id` | 是 | 用于 `/skill-id`。 |
| `name`（技能） | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.name` | 是 | 同名异域字段。 |
| `category` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.category` | 是 | 分类元数据。 |
| `source` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.source` | 是 | 来源元数据。 |
| `path`（技能实体） | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.path` | 是 | 技能根路径。 |
| `manifestPath` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.manifestPath` | 是 | 清单路径。 |
| `imported` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.imported` | 是 | 是否进入全局库。 |
| `builtin` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.builtin` | 是 | 系统技能标记。 |
| `deletable` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.deletable` | 是 | 是否允许删除。 |
| `syncedToCodex` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.syncedToCodex` | 是 | 运行环境同步状态。 |
| `syncedToClaude` | 技能 | 持久化字段 | 单个技能 | 已存在 | `SkillDiscoveryEntry.syncedToClaude` | 是 | 同上。 |
| `searchQuery` | 技能 | 页面视图态 | 页面级 | 已存在 | `GNAgentSkillsPage.tsx` | 否 | 仅用于筛选。 |
| `activeFilter` | 技能 | 页面视图态 | 页面级 | 已存在 | `GNAgentSkillsPage.tsx` | 否 | 仅用于筛选。 |
| `selectedSkillKey` | 技能 | 页面视图态 | 页面级 | 已存在 | `GNAgentSkillsPage.tsx` | 否 | 当前选中项。 |
| `promptContent` | 技能 | 页面视图态 | 页面详情态 | 已存在 | `readSkillFile()` | 否 | 技能详情预览缓存。 |
| `sourcePath` | 技能 | 动作载荷 | 本地导入 | 已存在 | `importLocalSkill()` | 否 | 本地导入入参。 |
| `repo` | 技能 | 动作载荷 | GitHub 导入 | 已存在 | `importGitHubSkill()` | 否 | GitHub 仓库地址。 |
| `path`（GitHub 导入参数） | 技能 | 动作载荷 | GitHub 导入 | 已存在 | `GitHubSkillImportParams.path` | 否 | 与技能实体 `path` 同名异义。 |
| `gitRef` | 技能 | 动作载荷 | GitHub 导入 | 已存在 | `GitHubSkillImportParams.gitRef` | 否 | 导入时使用。 |
| `version`（技能版本） | 技能 | 部分持久化 | 单个技能详情 | 部分存在 | frontmatter / runtime skill 定义 | 是 | 来源存在，但列表未稳定展示。 |
| `conflictGroup` | 技能 | 规划字段 | 单个技能诊断 | 新增 | 新索引规则 | 是 | 冲突分组。 |
| `conflictReason` | 技能 | 规划字段 | 单个技能诊断 | 新增 | 新索引规则 | 是 | 冲突解释。 |
| `themeMode` | 外观 | 持久化字段 | 全局 | 已支持 `light / dark` | 部分存在 | `App.tsx` + localStorage | 是 | 后续可扩 `system`。 |
| `appStyle` | 外观 | 持久化字段 | 全局 | 当前固定 `workbench` | 部分存在 | `appTheme.ts` + localStorage | 是 | 字段真实存在但合法值目前单一。 |
| `desktopAiPaneWidth` | 外观 | 持久化字段 | 全局布局偏好 | 已存在 | `layoutPreferences.ts` | 是 | 当前最明确的布局偏好。 |
| `desktopAiPaneCollapsedByDefault` | 外观 | 规划字段 | 全局布局偏好 | 部分存在 | 当前仅运行态 `isDesktopAiCollapsed` | 是 | 需从运行态提升为设置。 |
| `uiDensity` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 密度偏好。 |
| `defaultSidebarState` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 侧栏默认展开状态。 |
| `readingWidth` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 长文宽度。 |
| `fontSize` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 默认字号。 |
| `animationsEnabled` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 动画总开关。 |
| `reducedMotion` | 外观 | 规划字段 | 全局 | 新增 | 新外观设置 | 是 | 低动态偏好。 |
| `timelineDensity` | 外观 | 规划字段 | 全局 AI 展示偏好 | 新增 | 新外观设置 | 是 | AI 时间线密度。 |
| `showThinkingByDefault` | 外观 | 规划字段 | 全局 AI 展示偏好 | 新增 | 新外观设置 | 是 | 过程信息可见性。 |
| `showToolCardsByDefault` | 外观 | 规划字段 | 全局 AI 展示偏好 | 新增 | 新外观设置 | 是 | 工具卡片可见性。 |
| `showFinalAnswerExpandedByDefault` | 外观 | 规划字段 | 全局 AI 展示偏好 | 新增 | 新外观设置 | 是 | Final 默认展开。 |
| `rootPath` | 存储 | 持久化字段 | 全局存储设置 | 已存在 | `ProjectStorageSettings` | 是 | 存储主键字段之一。 |
| `defaultPath` | 存储 | 运行态只读 | 全局存储设置 | 已存在 | `ProjectStorageSettings` | 否 | 默认根目录参考值。 |
| `isDefault` | 存储 | 运行态只读 | 全局存储设置 | 已存在 | `ProjectStorageSettings` | 否 | 实际由 `rootPath/defaultPath` 推导，响应里返回但不单独落盘。 |
| `projectStorageRoot` | 存储 | 命名别名 | 产品文案层 | 部分存在 | 应收敛到 `rootPath` | 否 | 不建议落成新真实字段。 |
| `projectId` | 存储 | 运行态只读 | 单个项目 | 已存在 | 项目系统 | 否 | 用于目录解析。 |
| `projectDir` | 存储 | 运行态只读 | 单个项目 | 已存在 | `get_project_dir()` | 否 | 单项目目录。 |
| `requirementsDir` | 存储 | 运行态只读 | 单个项目 | 部分存在 | `get_requirements_dir()` | 否 | 可做入口信息。 |
| `knowledgeIndexRoot` | 存储 | 规划字段 | 全局或项目级 | 新增 | 新索引设置 | 是 | 目录入口。 |
| `attachmentsPath` | 存储 | 规划字段 | 全局或项目级 | 新增 | 新存储设置 | 是 | 附件目录。 |
| `downloadsPath` | 存储 | 规划字段 | 全局 | 新增 | 新存储设置 | 是 | 下载目录。 |
| `cacheRoot` | 存储 | 规划字段 | 全局 | 新增 | 新存储设置 | 是 | 缓存根路径。 |
| `clearCacheScope` | 存储 | 动作载荷 | 维护动作 | 新增 | 新维护命令 | 否 | 清理缓存范围。 |
| `rebuildIndexScope` | 存储 | 动作载荷 | 维护动作 | 新增 | 新维护命令 | 否 | 重建索引范围。 |
| `projectsSize` | 存储 | 运行态只读 | 统计 | 新增 | 新统计命令 | 否 | 只读统计。 |
| `cacheSize` | 存储 | 运行态只读 | 统计 | 新增 | 新统计命令 | 否 | 只读统计。 |
| `attachmentsSize` | 存储 | 运行态只读 | 统计 | 新增 | 新统计命令 | 否 | 只读统计。 |
| `indexSize` | 存储 | 运行态只读 | 统计 | 新增 | 新统计命令 | 否 | 只读统计。 |
| `settingsBackupPath` | 存储 | 动作载荷 | 备份恢复 | 新增 | 新导出恢复命令 | 否 | 备份目标路径。 |
| `mode` | 高级 | 持久化字段 | 全局 shell | 已存在 | `agent_shell/settings_store.rs` | 是 | Shell 模式。 |
| `claudeConfigId` | 高级 | 持久化字段 | 全局 shell | 已存在 | `agent_shell/settings_store.rs` | 是 | 与 AI `selectedConfigId` 有关联但不等价。 |
| `codexConfigId` | 高级 | 持久化字段 | 全局 shell | 已存在 | `agent_shell/settings_store.rs` | 是 | 同上。 |
| `featureFlags` | 高级 | 规划字段 | 全局 | 新增 | 新 feature flag store | 是 | 高级开关集合。 |
| `runtimeHealthy` | 高级 | 运行态只读 | 诊断 | 新增 | 诊断聚合层 | 否 | 只读状态。 |
| `sidecarConnected` | 高级 | 运行态只读 | 诊断 | 新增 | sidecar bridge | 否 | 只读状态。 |
| `activeThreads` | 高级 | 运行态只读 | 诊断 | 新增 | runtime 状态 | 否 | 只读状态。 |
| `activeBackgroundTasks` | 高级 | 运行态只读 | 诊断 | 新增 | runtime 状态 | 否 | 只读状态。 |
| `logSources` | 高级 | 页面视图态 | 日志视图 | 新增 | 新日志页状态 | 否 | 日志筛选条件。 |
| `logLevel` | 高级 | 页面视图态 | 日志视图 | 新增 | 新日志页状态 | 否 | 日志筛选条件。 |
| `exportLogPath` | 高级 | 动作载荷 | 日志导出 | 新增 | 新日志导出命令 | 否 | 导出目的路径。 |
| `runtimeSettingsPath` | 高级 | 运行态只读 | 诊断 | 新增 | runtime settings store path | 否 | 只读路径。 |
| `shellSettingsPath` | 高级 | 运行态只读 | 诊断 | 新增 | shell settings store path | 否 | 只读路径。 |
| `projectStorageSettingsPath` | 高级 | 运行态只读 | 诊断 | 新增 | project storage settings path | 否 | 只读路径。 |
| `skillsLibraryPath` | 高级 | 运行态只读 | 诊断 | 新增 | skills library path | 否 | 只读路径。 |
| `gitPreferredBranchPrefix` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | Git 偏好。 |
| `gitAutoStageBehavior` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | Git 偏好。 |
| `gitDiffPreviewMode` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | Git 偏好。 |
| `defaultShell` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | 环境偏好。 |
| `preferredNodeRuntime` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | 环境偏好。 |
| `preferredPythonRuntime` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | 环境偏好。 |
| `browserOpenTarget` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | 浏览器偏好。 |
| `browserProfileBehavior` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | 浏览器偏好。 |
| `worktreeDefaultLocation` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | Worktree 偏好。 |
| `worktreeCleanupPolicy` | 高级 | 规划字段 | 全局高级偏好 | 新增 | 新高级设置 | 是 | Worktree 偏好。 |
| `resetTarget` | 高级 | 动作载荷 | 分组重置 | 新增 | 新重置命令 | 否 | 用于执行重置动作。 |
| `resetAllSettingsConfirmation` | 高级 | 动作载荷 | 全量重置 | 新增 | 新重置命令 | 否 | 危险动作确认。 |

## 重复与归并建议

### 1. 真重复但语义不同，保留模块内归属

- `id`
- `name`
- `enabled`
- `path`
- `version`

这些字段在多个模块里都出现，但它们分别属于 AI 配置、MCP Server、技能、导入载荷等不同实体，不建议做全局共享字段定义，只需要在实现层保持模块内类型清晰。

### 2. 应明确区分、避免误用

- `restoreLastSessionOnLaunch` vs `autoResumeOnLaunch`
  前者是产品层恢复最近页面 / 项目 / 上下文，后者是 runtime 层恢复未完成 agent 会话。
- `rootPath` vs `projectStorageRoot`
  建议只保留 `rootPath` 作为真实字段，`projectStorageRoot` 只作为产品文案别名。
- `selectedConfigId` vs `claudeConfigId` / `codexConfigId`
  `selectedConfigId` 是 AI 模块默认运行配置；`claudeConfigId`、`codexConfigId` 是高级模块中不同 shell mode 的绑定配置。
- `enabled`（AI） vs `enabled`（MCP）
  两者都保留，但必须分别挂在不同实体上，避免出现共享表单状态。
- `path`（技能实体） vs `path`（GitHub 导入参数）
  前者是技能目录，后者是导入时的仓库子路径，命名上建议在代码里明确区分成 `skillPath` / `repoPath` 或同等别名。

### 3. 适合统一抽象的字段族

- 路径类：`rootPath`、`defaultPath`、`attachmentsPath`、`downloadsPath`、`cacheRoot`、`runtimeSettingsPath`
  建议统一使用绝对路径字符串，并共享路径选择器与路径展示组件。
- 只读诊断类：`status`、`lastError`、`runtimeHealthy`、`sidecarConnected`、`projectsSize`
  建议统一走“只读状态卡片”模式，不混入设置保存流程。
- 动作载荷类：`sourcePath`、`repo`、`gitRef`、`clearCacheScope`、`exportLogPath`、`resetTarget`
  建议不要落进持久化 settings store，而是作为一次性 action 参数。

## 第一批应优先落成真实设置模型的字段

### P0：已有真实来源，优先按代码收敛到页面数据模型

- AI：`configs[]`、`selectedConfigId`
- 权限：`permissionMode`、`sandboxPolicy`、`autoResumeOnLaunch`、`persistResumeDrafts`
- 外观：`themeMode`、`appStyle`、`desktopAiPaneWidth`
- 存储：`rootPath`、`defaultPath`、`isDefault`
- 高级：`mode`、`claudeConfigId`、`codexConfigId`

### P1：应尽快从规划变成一等设置

- 常规：`uiLanguage`、`startupPage`
- 外观：`desktopAiPaneCollapsedByDefault`、`readingWidth`
- MCP：`autoConnect`、`timeoutMs`
- AI：场景模型覆盖字段

### P2：先保留为只读或动作参数

- About 信息
- 日志筛选与导出
- 缓存清理、索引重建、重置类动作
- 运行时诊断字段

## 开发前建议

真正开始写设置页开发计划前，建议先做下面两件事：

1. 确认哪些“规划字段”要进入统一的全局设置 store，哪些继续留在模块内 store
2. 决定路径类、只读诊断类、动作载荷类的统一 UI 组件约束
