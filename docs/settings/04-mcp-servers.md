# MCP 服务器模块

## 模块目标

`MCP 服务器` 负责管理外部工具服务的接入方式、连接配置、工具暴露情况和最近调用状态。

这部分应尽量以 `RuntimeMcpServer` 为真实字段模型，再围绕设置页补充少量尚未落地的管理字段。

## 范围边界

`MCP 服务器` 负责：

- Server 列表与编辑
- 传输协议与连接字段
- 远程鉴权与 Header
- 运行状态与最近错误
- 工具列表与最近调用记录

`MCP 服务器` 不负责：

- 技能资产管理，归 `技能`
- AI Provider 配置，归 `AI`
- 全局权限策略，归 `权限`

## 子分组

1. Server 列表
2. 基本信息
3. 传输配置
4. 鉴权与 Header
5. 状态与诊断
6. 工具与调用

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `servers[]` | MCP Server 集合 | `RuntimeMcpServer[]` | 全局 runtime | 运行时初始化 | 已存在 | `runtimeMcpStore.ts` | 列表 + 详情编辑 | 设置页主数据源。 |
| `id` | Server ID | `string` | 单个 Server | 新建为空，保存必填 | 已存在 | `RuntimeMcpServer.id` | Input | 唯一标识 Server。 |
| `name` | Server 名称 | `string` | 单个 Server | 新建为空，保存必填 | 已存在 | `RuntimeMcpServer.name` | Input | 用户识别用名称。 |
| `description` | 描述 | `string` | 单个 Server | 空字符串 | 已存在 | `RuntimeMcpServer.description` | Textarea | 用于说明用途、来源、注意事项。 |
| `enabled` | 启用状态 | `boolean` | 单个 Server | 新建默认 `true` | 已存在 | `RuntimeMcpSettingsPage.createEmptyDraft()` | Switch | 控制是否纳入运行时可用 Server 集。 |
| `status` | 连接状态 | `string` enum | 单个 Server | `connected / disconnected / error` | 已存在 | `RuntimeMcpServer.status` | Badge | 只读运行态状态。 |
| `transport` | 传输方式 | `string` enum | 单个 Server | 新建默认 `stdio`；支持 `stdio / http / sse` | 已存在 | `RuntimeMcpServer.transport` | Select | `builtin` 为内部类型，设置页 v1 不作为新建选项暴露。 |
| `toolNames` | 工具名列表 | `string[]` | 单个 Server | 空数组 | 已存在 | `RuntimeMcpServer.toolNames` | Editable List / Textarea | 用于快速声明和展示暴露工具。 |
| `tools` | 工具定义 | `RuntimeMcpToolDefinition[]` | 单个 Server | 由 `toolNames` 派生或运行时回填 | 已存在 | `RuntimeMcpServer.tools` | 只读列表 | 含 `name`、`description`、`requiresApproval`。 |
| `command` | 启动命令 | `string \| null` | 单个 Server | `null` | 已存在 | `RuntimeMcpServer.command` | Input | 仅 `stdio` 模式使用。 |
| `args` | 启动参数 | `string[]` | 单个 Server | 空数组 | 已存在 | `RuntimeMcpServer.args` | Editable List | 仅 `stdio` 模式使用。 |
| `env` | 环境变量 | `Record<string,string>` | 单个 Server | 空对象 | 已存在 | `RuntimeMcpServer.env` | Key-Value Editor | 仅 `stdio` 模式使用。 |
| `url` | 远程地址 | `string \| null` | 单个 Server | `null` | 已存在 | `RuntimeMcpServer.url` | Input | `http` / `sse` 模式必填。 |
| `headers` | 请求头 | `Record<string,string>` | 单个 Server | 空对象 | 已存在 | `RuntimeMcpServer.headers` | Key-Value Editor | 远程模式使用。 |
| `headersHelper` | Header 辅助说明 | `string \| null` | 单个 Server | `null` | 已存在 | `RuntimeMcpServer.headersHelper` | Textarea | 可放模板、提示、签名说明。 |
| `oauth.clientId` | OAuth Client ID | `string \| null` | 单个 Server | `null` | 已存在 | `RuntimeMcpServer.oauth` | Input | 仅远程模式显示。 |
| `oauth.callbackPort` | OAuth 回调端口 | `number \| null` | 单个 Server | `null` | 已存在 | `RuntimeMcpServer.oauth` | Number Input | 仅远程模式显示。 |
| `toolCallsByThread` | 按线程聚合的工具调用 | `Record<string, RuntimeMcpToolCall[]>` | 运行态 | 空对象 | 已存在 | `runtimeMcpStore.ts` | 只读列表 | 用于展示最近调用摘要，不是完整审计日志。 |
| `autoConnect` | 自动连接 | `boolean` | 单个 Server | 建议默认 `true` | 新增 | 新设置模型 | Switch | 与 `enabled` 区分，控制应用或会话启动时是否主动初始化。 |
| `retryCount` | 重试次数 | `number` | 单个 Server | 建议默认 `0` 或 `1` | 新增 | 新设置模型 | Number Input | 用于远程模式失败后的自动重试策略。 |
| `timeoutMs` | 超时时间 | `number` | 单个 Server | 建议默认 `30000` | 新增 | 新设置模型 | Number Input | 定义远程请求的默认等待上限。 |
| `lastError` | 最近错误 | `string \| null` | 单个 Server 运行态 | `null` | 部分存在 | 运行时错误消息待沉淀 | 只读信息 | 当前有错误展示，但未收敛为稳定字段。 |
| `lastErrorAt` | 最近错误时间 | `number \| null` | 单个 Server 运行态 | `null` | 新增 | 新运行时字段 | 只读信息 | 方便按时间判断状态是否已恢复。 |

## 关键行为补充

- `transport` 是这一页的主分支字段，表单需要围绕它切换，而不是把所有连接字段同时暴露。
- `enabled` 控制是否参与运行；`autoConnect` 控制是否主动连接，两者不应混为一谈。
- `toolNames` 和 `tools` 不能长期双写失真，最好以运行时定义为准，草稿侧只编辑 `toolNames`。
- `status`、`lastError`、最近调用记录都属于运行态信息，展示上要和“可编辑配置”区分开。
- v1 不建议把最近调用做成完整日志系统，只保留近几次摘要与错误线索。

## 功能清单

1. 列表与 CRUD：查看、新建、编辑、删除自定义 Server，并保护内置 Server。
2. 传输配置：按 `stdio / http / sse` 展示不同的连接表单。
3. 鉴权配置：支持 Header 与 OAuth 基础参数配置。
4. 状态诊断：展示连接状态、最近错误和独立连接测试结果。
5. 工具视图：展示工具列表、工具数量和按线程聚合的最近调用。
6. 稳定性策略：后续补充 `autoConnect`、`retryCount`、`timeoutMs`。

## 关联代码

- `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- `src/modules/ai/runtime/mcp/runtimeMcpTypes.ts`
- `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`

## 当前建议优先级

- P0：`servers[]`、`transport`、`command`、`args`、`env`、`url`、`headers`、`oauth.*`、`status`
- P1：`toolNames`、`tools`、`toolCallsByThread`、独立连接测试
- P2：`autoConnect`、`retryCount`、`timeoutMs`、`lastError`、`lastErrorAt`
