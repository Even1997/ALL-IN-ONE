# GoodNight Agent Shell 高保真复刻 cc-haha 设计

Date: 2026-05-02

## 摘要

本设计定义一个新的 `Agent` 一级导航页签，在 GoodNight 内并行落地一套高保真复刻 `cc-haha` 的 Agent Shell 子系统。第一期目标不是修补现有 `AIWorkspace`，而是在现有系统旁边新建一条完整链路：新的页面壳、新的 settings、新的 runtime 通道、新的 local server / sidecar、新的多会话状态模型，以及尽量完整对齐 `cc-haha` 的工具体系、审批流、diff 预览和消息 contract。

该子系统第一期与现有 GoodNight AI 系统并存。旧 AI 面板不删除、不替换、不承担试跑责任。新 Agent 子系统先作为“高保真复刻版”独立跑通，后续再分阶段接入 GoodNight 自己的项目、知识、设计和交付能力，最终逐步演化成 GoodNight 的正式 Agent 平台。

## 目标

- 在 GoodNight 中新增一个一级导航 `Agent` 页签，承载新的高保真 Agent Shell。
- 尽量复刻 `cc-haha` 的产品形态、页面结构、settings 信息架构、runtime 分层、消息 contract、审批流和工具面。
- 第一阶段即支持多会话，不做单会话特化版。
- 第一阶段将 runtime 链路硬对齐 `cc-haha` 风格：
  - `AgentShellPage -> chat store -> ws/http bridge -> local server -> session runtime -> tool execution -> permission flow -> persistence`
- 工具体系第一期尽量完整对齐 `cc-haha`，包括文件、终端、MCP、任务、搜索、web 等工具入口。
- 保持旧系统可用，允许新旧 AI 系统并存一段时间。
- 为后续接入 GoodNight 自有能力预留清晰的上下文注入和产物回流接口。

## 非目标

- 第一阶段不替换现有 `AIWorkspace`、`AIChat`、现有 workflow 或现有 runtime。
- 第一阶段不要求把 GoodNight 所有上下文能力立即深度接入新 Agent 子系统。
- 第一阶段不追求视觉风格完全改造成 GoodNight 品牌语言，允许先高保真复刻后再修改。
- 第一阶段不要求所有对齐工具都达到生产级能力，但工具面、contract 和入口要尽量完整。
- 第一阶段不做“只保留少量核心工具”的精简版方案。

## 假设

- 当前最紧迫问题是“AI 基础能力没有稳定跑通”，不是局部页面 polish。
- 用户接受新旧双系统并存一段时间，以换取更快落地。
- 用户更看重“尽快得到一套能跑的新 Agent 系统”，而不是一开始就做到完美融合。
- 第一阶段优先搭建一套新的 Agent 子系统，再决定如何回收或整合旧 AI 面板。
- 复刻对象是 `cc-haha` 的产品行为、信息架构和 runtime 形态，不将其代码直接作为 GoodNight 的正式底座。

## 产品模型

新 `Agent` 页签应被理解为 GoodNight 内的一套独立 Agent 工作台，而不是旧 AI 面板的增强版。

用户进入路径：

1. 在 GoodNight 一级导航中点击 `Agent`
2. 进入新的 `AgentShellPage`
3. 看到会话列表、当前会话消息区、工具执行结果、审批卡片、diff 预览和 settings 入口
4. 使用方式尽量贴近 `cc-haha`

并存期的用户心智：

- `旧 AI 面板`：继续承载当前已有 AI 工作流和历史功能
- `新 Agent 页签`：作为 `cc-haha` 风格的新系统试跑区

## 信息架构

### 一级导航

在现有一级导航中新增一个新的 `Agent` 角色页签，和 `knowledge / page / design / develop / test / operations` 同级。

### Agent 页签内的页面

第一期建议落以下页面或页面分区：

- `AgentShellPage`
  - 新页签主页面
  - 左侧会话列表
  - 中间当前会话消息区
  - 右侧或浮层承载审批、workspace preview、diff、tool inspection
- `ActiveSession`
  - 当前会话工作区
  - 展示用户消息、assistant 流式输出、thinking、tool use、tool result
- `Settings`
  - 新 Agent 子系统自己的设置入口和设置页群
- `Workspace Preview / Diff Preview`
  - 查看文件内容、workspace diff、turn checkpoint diff
- `Permission Dialog / Permission Panel`
  - 展示结构化审批信息
- `Tool Inspection`
  - 检查某次工具调用的输入、输出和结果

### Settings 第一阶段信息架构

不做精简版，尽量整体复刻 `cc-haha` 的 settings 分区：

- Provider / API / Model
- Permission Mode
- Effort / Thinking / Runtime
- MCP
- Plugins
- Skills
- Adapters / Remote Control 相关设置占位
- Theme / General / About

## 前端结构

建议新增独立子系统目录：

```text
src/features/agent-shell/
  pages/
    AgentShellPage.tsx
    ActiveSession.tsx
    SettingsPage.tsx
    ToolInspectionPage.tsx
  components/
    chat/
    session/
    settings/
    permission/
    preview/
  stores/
    chatStore.ts
    sessionStore.ts
    settingsStore.ts
    workspacePanelStore.ts
  api/
    client.ts
    sessions.ts
    settings.ts
    websocket.ts
  types/
    chat.ts
    session.ts
    settings.ts
    runtime.ts
```

关键原则：

- 新 `Agent` 页签不复用现有 `AIWorkspace` 的主壳
- 第一阶段不让现有 `modules/ai/*` 成为新子系统的核心依赖
- 哪怕有重复代码，也优先保证新子系统形成独立闭环

## Runtime 总体架构

第一阶段 runtime 链路硬对齐 `cc-haha` 风格：

```text
AgentShellPage
  -> Agent chat store
  -> HTTP / WebSocket bridge
  -> Local server
  -> Per-session runtime
  -> Tool layer / model call
  -> Permission flow
  -> Tool result / content stream
  -> Session persistence
```

### 分层

#### 1. Tauri 壳层

职责：

- 启动和停止新的 Agent local server / sidecar
- 暴露新 Agent 子系统所需的 Tauri commands
- 返回 server URL、runtime 状态和必要系统能力
- 不承载 AI 业务逻辑

建议新增：

```text
src-tauri/src/agent_shell/
  mod.rs
  server/
  session/
  settings/
  commands/
```

#### 2. Local Server / Bridge 层

职责：

- 创建、恢复、删除会话
- 管理会话列表
- 提供 HTTP API
- 按 `sessionId` 提供 WebSocket 实时通道
- 统一转发 status、content、tool、permission、error 事件
- 读写 settings 与会话持久化
- 管理 runtime 生命周期

原则：

- 前端永远不直接驱动工具执行
- 前端只通过 HTTP / WebSocket 和 local server 通信

#### 3. Per-session Runtime 层

职责：

- 每个会话一个独立 runtime 实例
- 维护该会话上下文、消息、工具状态、审批状态
- 发起模型请求
- 在需要时发出 `permission_request`
- 接收 `permission_response` 后继续执行
- 回推统一事件流

虽然第一阶段会话数有限，但内部模型不允许做单会话硬编码。

#### 4. Tool Execution 层

将工具实现为带元信息的运行单元，而不是零散函数。每个工具应具备：

- `input schema`
- `output schema`
- `permission check`
- `call`
- `user-facing name`
- `search hint`
- `render metadata`

## 多会话模型

第一阶段直接支持多会话，结构从第一天开始按 `sessions: Record<sessionId, SessionState>` 设计。

每个会话至少维护：

- `sessionId`
- `title`
- `messages`
- `connectionState`
- `chatState`
- `streamingText`
- `activeToolUseId`
- `activeToolName`
- `pendingPermission`
- `tokenUsage`
- `sessionSettings`
- `workspace preview state`

关键原则：

- 会话状态互不污染
- 审批状态互不污染
- WebSocket 按 `sessionId` 隔离
- 工具执行结果按 `sessionId` 归属

## 消息 Contract

第一阶段建议尽量采用 `cc-haha` 风格消息 contract，而不是复用旧 AI 面板的消息模型。

### 实时消息类型

- `connected`
- `status`
- `user_message`
- `content_start`
- `content_delta`
- `message_complete`
- `thinking`
- `tool_use`
- `tool_result`
- `permission_request`
- `permission_response`
- `error`

### 状态语义

建议的 `chatState` 至少包括：

- `idle`
- `thinking`
- `generating`
- `permission_pending`
- `error`

### 原则

- 消息是事实，UI 是投影
- 尽量保存“发生了什么”，而不是只保存“当前画面”
- 所有消息和状态都带 `sessionId` 语义

## 审批流

写文件、删文件、危险命令等操作必须走显式审批流，不得隐藏在工具内部。

流程：

1. assistant 触发工具
2. runtime 判断该工具需要审批
3. 发出 `permission_request`
4. UI 展示结构化审批卡片或弹层
5. 用户点击：
   - `Allow`
   - `Allow for session`
   - `Deny`
6. 前端发 `permission_response`
7. runtime 再继续执行并发出 `tool_result`

第一阶段必须优先支持的审批预览：

- `Edit / Write`
  - diff 预览
- `Bash`
  - 命令预览
- `Remove`
  - 明确目标路径和删除类型

审批 UI 目标不是做成普通确认框，而是让用户能读懂“这次操作到底要干什么”。

## 工具体系

### 第一阶段目标

第一阶段工具面尽量完整对齐 `cc-haha`。

### P0 工具

- `Glob`
- `Grep`
- `Read / View`
- `Edit`
- `Write`
- `Remove`
- `Bash`

### P1 工具

- `MCP`
- `Task*`
- `TodoWrite`
- `ToolSearch`

### P2 工具

- `WebSearch`
- `WebFetch`
- `Sleep`
- `Agent`
- 其他外围扩展工具

### 实施原则

第一阶段允许：

- 工具入口、contract、settings、审批面先完整对齐
- 个别次要工具先占位、降级实现、或走兼容适配

不允许：

- 工具体系被缩减成只有少数核心工具的另一套“迷你协议”

## 持久化

第一阶段按会话持久化，先用本地 JSON / app data 形式即可，不必一开始上复杂数据库。

至少保存：

- 会话基础信息
  - `sessionId`
  - 标题
  - 创建时间
  - 最近更新时间
  - 工作目录
- 消息历史
  - 用户消息
  - assistant 输出
  - tool_use
  - tool_result
  - permission 事件
- 会话设置
  - 模型
  - provider
  - permission mode
  - runtime selection
- 最近项目与最近会话列表
- 可恢复状态
  - 最近 preview / diff / workspace 相关状态

## 与 GoodNight 能力的接入路线

第一阶段先允许新 Agent 子系统独立运行。第二阶段起再分层接入 GoodNight 能力。

### 第一层：项目上下文

- 当前项目根目录
- 当前项目名称、描述、类型
- 当前打开页面 / 文件 / 模块
- 最近生成文件

### 第二层：知识与需求上下文

- requirement docs
- knowledge notes
- page structure
- feature tree
- design system 文档摘要
- 交付物摘要

### 第三层：设计与产物上下文

- wireframes
- design board 节点
- style pack / design token
- generated files
- test / deploy artifacts

### 第四层：能力回流

- 更新 requirement docs
- 更新 feature tree
- 更新 page structure
- 更新设计节点
- 更新 generated files

### 接入原则

- 先读后写
- 先摘要后全量
- 将上下文来源设计为可插拔 provider

## 实施阶段

### 阶段 1：壳与入口

- 一级导航新增 `Agent`
- 建立 `src/features/agent-shell/` 骨架
- 建立 `src-tauri/src/agent_shell/` 骨架
- 新 settings 页面骨架

验收：

- 可进入新页签
- 旧 AI 面板仍可用

### 阶段 2：server 与多会话基础

- 启动新 local server
- 创建 / 列出 / 恢复会话
- WebSocket 按 `sessionId` 连接
- 多会话 chat store 跑通

验收：

- 可创建多个会话
- 切换会话不串状态
- 基础流式文本可用

### 阶段 3：工具与审批闭环

- `Glob / Grep / Read`
- `Edit / Write / Remove`
- `Bash`
- diff / command 审批

验收：

- Agent 能找文件、读文件、改文件
- 审批后才落盘
- 拒绝后不执行

### 阶段 4：settings 与工具面补全

- Provider / API / Model
- Permission mode
- Effort / Thinking / Runtime
- MCP / Plugins / Skills 骨架
- Tool inspection / workspace preview / diff preview

验收：

- settings 能真实驱动 runtime 行为
- 工具面与 inspection 页可用

### 阶段 5：接入 GoodNight 上下文

- 项目上下文注入
- 知识与需求摘要接入
- 手动引用 GoodNight 文档
- 产物回流

验收：

- Agent 开始理解 GoodNight 语境

## 风险

- 新旧双系统会在一段时间内并存，带来双状态、双设置、双入口的复杂度。
- 第一阶段如果强行同时补齐全部工具真实能力，落地节奏可能变慢。
- 高保真复刻会天然引入一段“像别人的系统”的中间态，需要后续逐步品牌化与本地化。
- 如果新子系统过早依赖现有旧 AI 模块，会再次回到“补丁式演进”而不是独立闭环。

## 成功标准

- GoodNight 中出现新的一级导航 `Agent` 页签。
- 新 `Agent` 页签拥有独立页面壳、settings、store、runtime 通道和 local server。
- 第一阶段支持多会话。
- 新 Agent 子系统具备高保真 `cc-haha` 风格的：
  - 会话列表
  - 流式聊天
  - tool use / tool result
  - 审批流
  - diff 预览
  - settings 信息架构
- P0 工具闭环可运行：
  - 找文件
  - 读文件
  - 改文件
  - 写文件
  - 删除文件
  - 终端命令
- 旧 AI 面板仍保持可用，不因新子系统而失效。
