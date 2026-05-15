# 高级模块

## 模块目标

`高级` 承载不适合放在基础设置里的专业项、运行模式绑定、诊断信息、日志和重置操作。

它既要覆盖当前已经存在的 shell mode 设置，也要为后续 Git / 环境 / 浏览器 / worktree 这类工具域偏好预留位置。

## 范围边界

`高级` 负责：

- Shell Mode
- Claude / Codex 配置绑定
- Feature Flags
- 诊断与日志
- 工具域偏好
- 配置路径展示
- 分组重置与恢复默认

`高级` 不负责：

- 基础 AI 配置，归 `AI`
- 常规语言、启动与更新，归 `常规`

## 子分组

1. Shell 与运行模式
2. 实验功能
3. 诊断与日志
4. 工具域设置
5. 重置

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mode` | 工作模式 | `string` enum | 全局 shell | 默认 `classic`；`classic / claude / codex` | 已存在 | `src-tauri/src/agent_shell/settings_store.rs`、`gnAgentShellStore.ts` | Select / Segmented | 定义 GN Agent Shell 采用哪种运行模式。 |
| `claudeConfigId` | Claude 绑定配置 ID | `string \| null` | 全局 shell | 默认 `null` | 已存在 | `AgentShellSettingsRecord` | Select | 仅在 `claude` 模式或绑定编辑场景下有意义。 |
| `codexConfigId` | Codex 绑定配置 ID | `string \| null` | 全局 shell | 默认 `null` | 已存在 | `AgentShellSettingsRecord` | Select | 仅在 `codex` 模式或绑定编辑场景下有意义。 |
| `featureFlags` | 实验功能开关集 | `Record<string, boolean>` | 全局 | 默认空对象 | 新增 | 新 feature flag store | Switch 列表 | 统一收拢实验开关，不再散落各处。 |
| `runtimeHealthy` | Runtime 健康状态 | `boolean` | 只读诊断 | 运行时计算 | 新增 | 诊断聚合层 | 只读状态 | 判断 runtime 是否整体可用。 |
| `sidecarConnected` | Sidecar 连接状态 | `boolean` | 只读诊断 | 运行时计算 | 新增 | `desktopRuntimeSidecar` / sidecar bridge | 只读状态 | 用于快速判断桌面 sidecar 是否连通。 |
| `activeThreads` | 活跃线程数 | `number` | 只读诊断 | 运行时计算 | 新增 | Runtime 状态聚合 | 只读信息 | 反映当前线程负载。 |
| `activeBackgroundTasks` | 活跃后台任务数 | `number` | 只读诊断 | 运行时计算 | 新增 | Runtime 状态聚合 | 只读信息 | 反映后台执行负载。 |
| `logSources` | 日志来源过滤 | `string[]` | 日志视图态 | 建议默认全部 | 新增 | 新日志视图模型 | Multi-select | 可按 runtime、sidecar、shell、mcp 等筛选。 |
| `logLevel` | 日志级别过滤 | `string` enum | 日志视图态 | 建议默认 `info` | 新增 | 新日志视图模型 | Select | 过滤 `debug / info / warn / error`。 |
| `exportLogPath` | 日志导出路径 | `string` | 导出动作载荷 | 无默认值 | 新增 | 新日志导出命令 | 路径选择器 | 把当前筛选后的日志导出到文件。 |
| `runtimeSettingsPath` | Runtime 设置文件路径 | `string` | 只读诊断 | 运行时解析 | 新增 | `agent_runtime/settings_store.rs` | 只读信息 | 对应 `runtime-settings.json`。 |
| `shellSettingsPath` | Shell 设置文件路径 | `string` | 只读诊断 | 运行时解析 | 新增 | `agent_shell/settings_store.rs` | 只读信息 | 对应 shell 设置落盘位置。 |
| `projectStorageSettingsPath` | 项目存储设置文件路径 | `string` | 只读诊断 | 运行时解析 | 新增 | `src-tauri/src/lib.rs` | 只读信息 | 对应 `project-storage.json`。 |
| `skillsLibraryPath` | 全局技能库路径 | `string` | 只读诊断 | 运行时解析 | 新增 | 技能库运行时 | 只读信息 | 便于排查导入、删除、同步问题。 |
| `gitPreferredBranchPrefix` | Git 分支前缀偏好 | `string` | 全局高级偏好 | 建议默认 `codex/` | 新增 | 新设置模型 | Input | 统一 Git 相关默认分支前缀。 |
| `gitAutoStageBehavior` | Git 自动暂存策略 | `string` enum | 全局高级偏好 | 建议默认 `manual` | 新增 | 新设置模型 | Select | 控制是否默认手动、提示或自动暂存。 |
| `gitDiffPreviewMode` | Git Diff 预览方式 | `string` enum | 全局高级偏好 | 建议默认 `inline` | 新增 | 新设置模型 | Select | 控制偏好的 diff 查看方式。 |
| `defaultShell` | 默认 Shell | `string` | 全局高级偏好 | 建议默认跟随系统 | 新增 | 新设置模型 | Select | 控制执行命令使用的首选 shell。 |
| `preferredNodeRuntime` | 首选 Node 运行时 | `string \| null` | 全局高级偏好 | 默认 `null` | 新增 | 新设置模型 | Input / Select | 用于脚本运行环境偏好。 |
| `preferredPythonRuntime` | 首选 Python 运行时 | `string \| null` | 全局高级偏好 | 默认 `null` | 新增 | 新设置模型 | Input / Select | 用于脚本运行环境偏好。 |
| `browserOpenTarget` | 浏览器打开目标 | `string` enum | 全局高级偏好 | 建议默认 `in-app` | 新增 | 新设置模型 | Select | 控制链接默认在内置还是外部浏览器打开。 |
| `browserProfileBehavior` | 浏览器配置策略 | `string` enum | 全局高级偏好 | 建议默认 `reuse-default` | 新增 | 新设置模型 | Select | 控制是否复用默认 profile。 |
| `worktreeDefaultLocation` | Worktree 默认位置 | `string` | 全局高级偏好 | 待定 | 新增 | 新设置模型 | 路径选择器 | 为隔离工作目录预留默认路径。 |
| `worktreeCleanupPolicy` | Worktree 清理策略 | `string` enum | 全局高级偏好 | 建议默认 `manual` | 新增 | 新设置模型 | Select | 控制 worktree 何时自动回收。 |
| `resetTarget` | 分组重置目标 | `string` enum | 重置动作载荷 | 无默认值 | 新增 | 新重置命令 | Action Select | 单独重置某一设置模块。 |
| `resetAllSettingsConfirmation` | 全量恢复默认确认 | `boolean` / action flag | 全局危险动作 | 默认 `false` | 新增 | 新重置命令 | Danger Button + Confirm | 恢复默认前必须二次确认。 |

## 关键行为补充

- `mode`、`claudeConfigId`、`codexConfigId` 已有明确后端持久化，优先按真实字段设计 UI。
- 诊断类字段大多是只读运行态，不应该和可编辑配置混在同一个保存流。
- `featureFlags` 最好统一走一套注册表，避免不同模块各自定义布尔值。
- `runtimeSettingsPath`、`shellSettingsPath` 等路径信息对调试很有帮助，建议先做只读展示。
- Git / 环境 / 浏览器 / worktree 第一阶段应以“入口式收纳”为主，不建议做过深的二级配置体系。

## 功能清单

1. Shell 模式：切换 `classic / claude / codex` 并绑定对应 AI 配置。
2. 实验功能：集中展示和管理 feature flags。
3. 诊断与日志：查看 runtime 状态、日志来源和日志级别，并支持导出。
4. 配置路径：展示各关键设置文件与库目录的真实落盘路径。
5. 工具域偏好：承接 Git、环境、浏览器、worktree 这类暂不拆一级分组的专业项。
6. 重置：支持分组重置和全量恢复默认设置。

## 当前已存在字段

当前后端已明确持久化：

- `mode`
- `claudeConfigId`
- `codexConfigId`

来源：
`src-tauri/src/agent_shell/settings_store.rs`

## 关联代码

- `src-tauri/src/agent_shell/settings_store.rs`
- `src/modules/ai/gn-agent/gnAgentShellStore.ts`
- `src/components/workspace/globalSettingsPageShared.ts`

## 当前建议优先级

- P0：`mode`、`claudeConfigId`、`codexConfigId`、配置文件路径、重置入口
- P1：`featureFlags`、诊断状态、日志查看 / 导出
- P2：Git / 环境 / 浏览器 / worktree 偏好
