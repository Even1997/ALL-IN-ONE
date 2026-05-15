# 权限模块

## 模块目标

`权限` 负责定义本地 agent 的默认安全边界，包括“什么能直接做、什么必须确认、会话是否自动恢复、草稿是否保留”。

这部分应优先对齐现有 runtime 设置存储，而不是把审批策略散落到 UI 临时状态里。

## 范围边界

`权限` 负责：

- 沙箱策略
- 权限确认模式
- 自动恢复
- 草稿持久化
- 高风险确认
- 超时与中断策略

`权限` 不负责：

- AI Provider 配置，归 `AI`
- MCP Server 连接信息，归 `MCP 服务器`
- Shell Mode、Git、浏览器、环境偏好，归 `高级`

## 子分组

1. 默认权限
2. 批准与审批
3. 恢复与持久化
4. 超时与中断
5. 项目级覆盖

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `permissionMode` | 默认权限模式 | `string` enum | 全局 runtime | 默认 `ask`；`ask / plan / auto / bypass` | 已存在 | `src-tauri/src/agent_runtime/settings_store.rs`、`agentRuntimeClient.ts` | Select / Segmented | 用户最容易理解的顶层审批模式。 |
| `sandboxPolicy` | 沙箱策略 | `string` enum | 全局 runtime | 默认 `ask`；`deny / ask / allow / bypass` | 已存在 | 同上 | Select / Segmented | 真正控制本地动作边界的底层策略。 |
| `autoResumeOnLaunch` | 启动自动恢复 runtime 会话 | `boolean` | 全局 runtime | 默认 `false` | 已存在 | `AgentRuntimeSettings` | Switch | 恢复未完成 agent 会话，不等同于产品层“恢复上次页面”。 |
| `persistResumeDrafts` | 保留恢复草稿 | `boolean` | 全局 runtime | 默认 `true` | 已存在 | `AgentRuntimeSettings` | Switch | 控制 resume draft 等中间状态是否落盘。 |
| `autoApproveEnabled` | 自动审批开关 | `boolean` | 全局 runtime | 建议默认 `false` | 新增 | 新设置模型 | Switch | 允许对低风险动作降低确认频率。 |
| `autoApproveScope` | 自动审批范围 | `string[]` / enum | 全局 runtime | 建议默认空 | 新增 | 新设置模型 | Multi-select | 例如只允许只读命令、只读工具或工作区内低风险写入。 |
| `toolApprovalMode` | 工具调用审批策略 | `string` enum | 全局 runtime | 建议默认 `follow-permission-mode` | 新增 | 新设置模型 | Select | 为 MCP / runtime tool 提供独立审批规则。 |
| `toolApprovalRiskThreshold` | 工具风险阈值 | `string` enum | 全局 runtime | 建议默认 `medium` | 新增 | 新设置模型 | Select | 低于阈值可自动放行，高于阈值要求确认。 |
| `highRiskConfirmationEnabled` | 高风险二次确认 | `boolean` | 全局 runtime | 建议默认 `true` | 新增 | 新设置模型 | Switch | 用于删除、写文件、权限提升、外部副作用等高风险动作。 |
| `defaultCommandTimeoutMs` | 默认命令超时 | `number` | 全局 runtime | 建议默认 `600000` | 新增 | 新设置模型 | Number Input | 为 shell / tool 调用提供统一默认超时。 |
| `timeoutBehavior` | 超时后行为 | `string` enum | 全局 runtime | 建议默认 `ask` | 新增 | 新设置模型 | Select | 候选可为 `ask / stop / keep-waiting / mark-timeout`。 |
| `interruptBehavior` | 用户中断策略 | `string` enum | 全局 runtime | 建议默认 `graceful-stop` | 新增 | 新设置模型 | Select | 候选可为 `ask / graceful-stop / force-stop`。 |
| `projectPermissionOverrideEnabled` | 项目级覆盖入口 | `boolean` | 全局入口 + 项目级后续设置 | 建议默认 `false` | 新增 | 新设置模型 | Switch | 第一阶段只提供入口与解释，不展开复杂策略编辑器。 |
| `projectPermissionOverride` | 项目级权限覆盖值 | `object` | 项目级 | 默认 `null` | 新增 | 后续项目设置模型 | 跳转入口 / Drawer | 只对当前项目生效的局部权限策略。 |

## 关键行为补充

- `permissionMode` 是用户理解层；`sandboxPolicy` 是更贴近执行层的真实边界，两者要联动但不能互相覆盖得过于隐式。
- 当前代码里 `setAgentPermissionMode()` 会同步推导 sandbox policy，文档和 UI 文案要说明这种联动。
- `autoResumeOnLaunch` 和 `persistResumeDrafts` 已有真实默认值，优先直接复用。
- `autoApproveEnabled` 绝不能绕开 `highRiskConfirmationEnabled`。
- 项目级覆盖第一阶段建议做轻，不要一开始做成全量 ACL 编辑器。

## 功能清单

1. 默认权限模式：提供更用户化的审批模式切换，并同步展示风险说明。
2. 沙箱策略：提供底层安全边界控制，允许高级用户显式调整。
3. 恢复与草稿：控制 runtime 会话恢复与中间草稿保留。
4. 自动审批与工具审批：区分“普遍自动审批”和“工具调用审批”两层策略。
5. 超时与中断：给运行中的命令和任务定义统一的默认终止行为。
6. 项目级覆盖入口：为后续项目局部权限策略预留入口。

## 当前已存在字段

当前后端已明确持久化：

- `sandboxPolicy`
- `permissionMode`
- `autoResumeOnLaunch`
- `persistResumeDrafts`

来源：
`src-tauri/src/agent_runtime/settings_store.rs`

## 关联代码

- `src-tauri/src/agent_runtime/settings_store.rs`
- `src/modules/ai/runtime/agentRuntimeClient.ts`
- `src/modules/ai/runtime/approval/permissionMode.ts`

## 当前建议优先级

- P0：`permissionMode`、`sandboxPolicy`、`autoResumeOnLaunch`、`persistResumeDrafts`
- P1：`autoApproveEnabled`、`autoApproveScope`、`toolApprovalMode`、`highRiskConfirmationEnabled`
- P2：`defaultCommandTimeoutMs`、`timeoutBehavior`、`interruptBehavior`、项目级覆盖
