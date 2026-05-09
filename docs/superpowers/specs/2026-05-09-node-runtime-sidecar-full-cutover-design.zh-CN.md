# Node Runtime Sidecar Full Cutover Design

**Date:** 2026-05-09

**Status:** Proposed

## Goal

把当前 `React + Zustand + Tauri/Rust store + TS runtime orchestration` 的混合架构，一次性切换为：

1. `React Desktop UI` 只负责提交用户意图、订阅 runtime 事件、渲染投影状态
2. `Node.js Sidecar Runtime` 负责 turn orchestration、tool loop、MCP、审批、回放、恢复、session projection
3. `Tauri Shell` 只负责窗口壳、sidecar 生命周期、原生能力桥接和打包分发
4. `Shared Protocol` 作为 UI 与 runtime 的唯一契约

这次方案是整包 cutover，不是逐步对外发布的阶段性迁移。

## Assumptions

- 用户要解决的是整体架构和交互卡顿，而不是局部渲染优化。
- 新 runtime 必须使用 `Node.js`，不采用 `Bun-only` 方案。
- 可以接受一次性目录重组和模块迁移。
- 可以接受在迁移分支内保留短期兼容适配层，但最终上线版本必须只保留新边界。

## Why Node Sidecar

选择 `纯 Node.js sidecar` 的原因：

- 对当前 Tauri 桌面项目最稳，跨平台行为和调试成本最低。
- 能把大部分 TS runtime 逻辑直接迁走，不需要重写成 Rust。
- 可以天然承接流式事件、子进程、命令执行、MCP client、WebSocket。
- 最终 UI 主线程不再承担 turn loop、tool execution、session mutation，性能收益来自边界重划，而不是局部 memo。

## Current Architecture Problems

当前最核心的问题不是单个组件慢，而是运行时边界在前端：

- `src/components/workspace/AIChat.tsx` 同时承担 UI、runtime glue、streaming、审批、回放、文件提案、配置读取。
- `src/modules/ai/runtime/orchestration/*` 虽然已经抽出不少逻辑，但执行入口仍由前端组件控制。
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts` 已经建立了 projection 层，但 projection 的上游状态仍主要由前端驱动。
- `src/modules/ai/core/AIService.ts`、`executeRuntimeBuiltInAgentTurn.ts`、`runtimeChatTurnCoordinator.ts` 等核心执行逻辑仍在前端运行时内。
- Zustand store 现在既是 UI 状态，也是 runtime state sink，导致重渲染面过宽。

## Target Architecture

### Layer 1: Desktop UI

职责：

- 发送控制指令：
  - `start_session`
  - `submit_turn`
  - `approve_action`
  - `answer_question`
  - `cancel_turn`
  - `rewind_turn`
  - `load_thread`
- 订阅事件流：
  - `session_snapshot`
  - `message_delta`
  - `tool_update`
  - `approval_requested`
  - `question_requested`
  - `background_task_update`
  - `turn_finished`
  - `turn_failed`
- 将协议事件投影为 UI store
- 仅保留纯展示态和短生命周期交互态：
  - panel open/close
  - input draft
  - hover / selection
  - modal visible state

不再负责：

- tool loop
- model stream assembly
- runtime store mutation orchestration
- replay recovery state machine
- MCP invocation flow
- built-in agent execution

### Layer 2: Shared Protocol

新协议必须是唯一真边界，建议拆成独立 package：

- `packages/runtime-protocol`

协议包含：

- command schema
- event schema
- snapshot schema
- error schema
- version negotiation
- auth token and session handshake

推荐传输方式：

- 本地 `HTTP + WebSocket`
- sidecar 绑定 `127.0.0.1` 随机端口
- Tauri 生成一次性 auth token 并注入前端

原因：

- 更贴近 `cc-haha-main`
- 流式事件天然适配
- 本地浏览器调试、桌面联调、自动化测试都更方便
- 后续如果要扩展 headless / remote driver，不需要再改协议

### Layer 3: Node.js Sidecar Runtime

职责：

- session lifecycle
- turn coordinator
- model provider adapter
- tool execution
- approval queue
- MCP registry and invocation
- replay log and checkpoint
- memory extraction and persistence
- execution graph
- conversation projection
- crash recovery

建议目录：

```text
apps/runtime/
  package.json
  src/
    index.ts
    server/
      httpServer.ts
      wsHub.ts
      auth.ts
    protocol/
      commands.ts
      events.ts
      snapshots.ts
    application/
      submitTurn.ts
      approveAction.ts
      answerQuestion.ts
      rewindTurn.ts
      loadThread.ts
    domain/
      sessions/
      turns/
      approvals/
      replay/
      memory/
      mcp/
      tools/
      execution/
    adapters/
      providers/
      shell/
      filesystem/
      mcp/
      persistence/
    projection/
      conversationProjection.ts
      sessionProjection.ts
    store/
      sqlite.ts
      migrations/
```

### Layer 4: Tauri Shell

职责收缩为：

- sidecar 进程拉起、健康检查、退出回收
- app data dir / cache dir / logs dir 提供
- 原生窗口和托盘
- 原生对话框、通知、文件选择
- 应用升级
- sidecar 可执行文件打包

不再负责：

- runtime 线程存储
- approval/mcp/replay JSON store
- agent orchestration command set

## Repository Reorganization

推荐一次性切成 monorepo 形态：

```text
apps/
  desktop/
    src/
    src-tauri/
  runtime/
    src/
packages/
  runtime-protocol/
  runtime-client/
  runtime-core/
```

### apps/desktop

保留：

- React 页面
- Tauri 配置
- UI 组件
- presenter/store projection

迁出：

- `src/modules/ai/core/AIService.ts`
- `src/modules/ai/runtime/orchestration/*`
- `src/modules/ai/runtime/tools/*`
- `src/modules/ai/runtime/mcp/*` 中 runtime 执行部分
- `src/modules/ai/runtime/replay/*` 中执行与恢复状态机部分
- `src/modules/ai/runtime/session/*` 中 turn lifecycle 部分

### packages/runtime-protocol

定义：

- Zod schema
- TS types
- command/event constants
- versioning

### packages/runtime-client

给桌面端使用的轻 client：

- `connectRuntime()`
- `sendCommand()`
- `subscribeEvents()`
- `requestSnapshot()`

### packages/runtime-core

抽离纯 TS 可复用内核：

- context assembly
- tool loop
- timeline normalization
- approval policy
- prompt building
- execution graph

`apps/runtime` 依赖它，未来如果要做 CLI/headless，也只复用这里。

## Module Migration Map

### Move Into Node Runtime

- `src/modules/ai/core/AIService.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts`
- `src/modules/ai/runtime/orchestration/executeRuntimeLocalAgentTurn.ts`
- `src/modules/ai/runtime/orchestration/executeRuntimeMcpTurn.ts`
- `src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts`
- `src/modules/ai/runtime/orchestration/runtimeProjectFileExecutionFlow.ts`
- `src/modules/ai/runtime/orchestration/runtimeTurnOutcomeFlow.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`
- `src/modules/ai/runtime/tools/*`
- `src/modules/ai/runtime/teams/*`
- `src/modules/ai/runtime/context/*`
- `src/modules/ai/runtime/memory/*`
- `src/modules/ai/runtime/execution/*`
- `src/modules/ai/runtime/skills/*`

### Replace In Desktop

- `useAgentRuntimeStore` 从 runtime source of truth 改成 UI projection cache
- `useApprovalStore` 从审批真源改成 UI local view model
- `useRuntimeMcpStore` 从执行态仓库改成 settings + projection cache
- `useRuntimeConversationGateway` 改成消费 sidecar snapshot/event，不再拼本地执行态

### Remove From Tauri Rust

- `src-tauri/src/agent_runtime/*` 的 JSON store 和 runtime commands
- 大部分 runtime 相关 `invoke_handler`

### Keep In Tauri Rust

- 启动/停止/探活 Node sidecar
- 提供 sidecar auth token
- 提供 app paths
- 原生 dialog / shell / updater

## Persistence Design

推荐 sidecar 自己持久化，放弃当前“Rust JSON store + Zustand persist”双写模型。

建议使用：

- `SQLite` 作为单一持久化底座

表：

- `sessions`
- `messages`
- `runtime_events`
- `approvals`
- `questions`
- `tool_calls`
- `background_tasks`
- `checkpoints`
- `memory_entries`
- `mcp_servers`

原因：

- 一次性切换后最稳定
- 查询 thread snapshot 快
- 适合回放、恢复、diff、过滤
- 比多个 JSON store 更容易保证一致性

## Event Model

所有 UI 更新都来自事件，不允许 UI 直接拼装 runtime 真状态。

### Commands

- `runtime.connect`
- `session.create`
- `session.list`
- `session.open`
- `turn.submit`
- `turn.cancel`
- `approval.resolve`
- `question.answer`
- `checkpoint.rewind`
- `mcp.server.upsert`
- `mcp.server.delete`

### Events

- `runtime.ready`
- `runtime.disconnected`
- `session.snapshot`
- `session.created`
- `turn.started`
- `turn.delta`
- `turn.reasoning`
- `tool.started`
- `tool.updated`
- `tool.finished`
- `approval.requested`
- `approval.resolved`
- `question.requested`
- `question.answered`
- `checkpoint.saved`
- `turn.completed`
- `turn.failed`

## One-Shot Cutover Strategy

这是一次性切换方案，但内部仍需要严格顺序。原则是：

- 只发布一次新架构
- 不保留线上双系统
- 迁移分支内允许短期兼容层，正式 cutover 时删除旧边界

### Cutover Rules

1. 新 sidecar、协议、UI client 先在分支内完成。
2. 桌面 UI 切到 sidecar 协议后，旧 runtime 执行入口全部删除。
3. Rust runtime store 和命令集同步删除。
4. 数据迁移器只执行一次：
   - 从现有 session/store 恢复旧数据
   - 转写到 sidecar SQLite
5. 主分支只接受 cutover 后的新边界，不保留双写模式。

## Release Shape

单次 cutover 版本应具备：

- sidecar binary bundled
- protocol version `v1`
- migration runner
- rollback package

## Validation Gates

整包迁移完成前必须同时通过：

### Functional

- 新建会话、继续会话、删除会话
- streaming output
- tool execution
- MCP
- approval / question
- rewind / replay / recovery
- local claude/codex runtime
- team run

### Structural

- `AIChat.tsx` 不再直接 import runtime execution internals
- React 层不再直接写 runtime source stores
- Rust 不再维护 runtime JSON stores
- 协议成为唯一边界

### Performance

- 输入时 UI 不因 turn coordinator 重渲染
- streaming 期间消息区局部更新
- session switch 不触发整套 runtime 重新装配
- live timer / status 不再让整页每秒重算

## Recommended End State

最终我推荐的最优形态是：

- **架构形态**：`apps/desktop + apps/runtime + packages/runtime-protocol + packages/runtime-core`
- **sidecar runtime**：`纯 Node.js`
- **通信方式**：`本地 HTTP + WebSocket + auth token`
- **持久化**：`sidecar SQLite`
- **UI store 定位**：`projection cache only`
- **Tauri 定位**：`shell only`

这套方案比“继续在前端瘦身”更重，但它才是能从根上解决当前性能和边界问题的方案。
