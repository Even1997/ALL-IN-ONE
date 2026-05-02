# GoodNight 桌面端 Codex-like Agent 体验升级设计

## 摘要

本设计聚焦把 GoodNight 当前的 AI 聊天体验升级成更像 Codex 的桌面端 agent 体验，但明确不把 `codex cli` 兼容当作目标能力。

本轮只优先实现 3 个体验升级：

- `线程状态机 + 可恢复`
- `计划卡片 + 批准后继续`
- `高质量步骤回显`

设计原则是复用现有 GN Agent 桌面壳子、approval、replay、timeline、toolCalls、memory 等基础设施，不重做整套系统；真正要补的是一个统一的 `Agent Session Controller` 和面向用户可见的任务状态模型。

## 目标

- 让复杂任务不再表现为一次性黑箱回复，而是一个持续执行的桌面 agent 线程
- 让高风险或长任务先进入计划模式，再经批准自动继续执行
- 让线程在中断后可以恢复，并明确告诉用户停在哪、为什么停、如何继续
- 让执行过程中的工具调用、关键结果、下一步动作都可见
- 让 `Codex` 在产品语义上代表桌面 agent 模式，而不是 `Codex CLI`

## 非目标

- 不做 `codex cli` 集成增强，也不把本轮能力建立在本地 CLI 上
- 不做多 agent 并行
- 不做 provider-specific 深度模拟
- 不重写整套 AI workspace
- 不在本轮扩展复杂长期记忆策略
- 不把 scope 扩大成完整 IDE 或完整任务队列系统

## 当前现状

当前代码库已经具备不少桌面 agent 基础设施：

- `GNAgentChatPage`、`GNAgentThreadList`、`GNAgentTimelinePanel`、`GNAgentToolCallPanel`、`GNAgentMemoryPanel` 组成了桌面 agent 壳子
- `AgentRuntimeStore` 已经有 threads、timeline、turns、toolCalls、replay、recovery、runState、context、memory 等状态
- `runtimeReplayRecovery` 已经提供基于 replay 的恢复判定
- `runtimeApprovalCoordinator` 已经提供审批记录与批准/拒绝分发

但当前仍有 4 个核心问题：

1. 主任务流仍由 `AIChat.tsx` 内部多个执行分支驱动，缺少统一的 session / turn controller  
2. 用户看到的是零散状态，而不是一条有清晰阶段的任务线程  
3. 恢复能力仍偏 replay 层，尚未升格为“按任务阶段恢复”  
4. `Codex` 语义仍被旧的 `Codex CLI / local runtime` 命名残留污染

## 产品定位

本轮之后，`Codex` 在 GoodNight 里的含义应改为：

- 一种桌面端 agent 工作模式
- 一种更强调持续执行、计划、审批、恢复、回显的交互体验
- 一种运行在 GoodNight 桌面壳子中的 agent 线程

它不再优先意味着：

- 一个本地 CLI 包装器
- 一个与 `Claude CLI` 并列的本地命令入口
- 一个靠 shell 打开的外部执行器

## 设计原则

1. 先做“可预测、可见、可恢复”，再做“更聪明”
2. 复用现有 runtime 基础设施，不做大爆炸重写
3. UI 负责展示与交互，核心决策从 `AIChat.tsx` 抽离
4. 高风险和长任务必须先计划，不能直接黑箱执行
5. 恢复必须基于结构化任务状态，而不是只靠消息文本猜测
6. 每一条用户可见状态都要对应真实内部状态，避免 UI 造假

## 核心方案

### 总体方向

新增一个统一的 `Agent Session Controller`，位于：

- 上层：`AIChat` / `GNAgentChatPage`
- 下层：runtime prompt、tool loop、approval、replay、timeline、memory、project file flows

它负责把“用户一次任务”管理成一个结构化 `Agent Turn Session`，统一驱动：

- 分类
- 进入计划模式
- 等待审批
- 执行步骤
- 记录结果
- 标记阻塞
- 生成恢复快照

### 架构边界

#### 1. 展示层

主要文件：

- `src/components/workspace/AIChat.tsx`
- `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- `src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx`
- `src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx`
- 新增计划面板 / 计划卡片 / 执行状态卡片

职责：

- 渲染聊天流中的计划摘要卡、执行进度卡、阻塞卡、恢复卡
- 渲染右侧完整计划与步骤状态
- 接收批准、拒绝、恢复、重试等用户动作
- 不再持有复杂执行分支

#### 2. Session Controller

建议新增模块：

- `src/modules/ai/runtime/session/agentSessionTypes.ts`
- `src/modules/ai/runtime/session/agentSessionController.ts`
- `src/modules/ai/runtime/session/agentSessionStateMachine.ts`
- `src/modules/ai/runtime/session/agentSessionSelectors.ts`

职责：

- 接收一次用户输入
- 判定是直接答复、直接执行、还是进入计划模式
- 生成结构化 plan
- 把 plan 拆成 execution steps
- 处理审批后的继续执行
- 产出统一的 turn 状态、步骤状态、恢复快照

#### 3. Runtime 基础层

保留并复用：

- `runtimeApprovalCoordinator`
- `runtimeReplayRecovery`
- `runtimeToolLoop`
- `runtimeProjectFileFlow`
- `runtimeProjectFileExecutionFlow`
- `runtimeMcpFlow`
- `runtimeTurnOutcomeFlow`

调整方向：

- 从“被 `AIChat.tsx` 直接拼接调用”
- 转为“由 Session Controller 编排调用”

## 统一任务模型

### AgentTurnSession

建议新增一个统一结构，至少包含：

- `id`
- `threadId`
- `providerId`
- `userPrompt`
- `status`
- `mode`
- `plan`
- `executionSteps`
- `resumeSnapshot`
- `createdAt`
- `updatedAt`

### Turn Status

统一用户可见状态：

- `idle`
- `classifying`
- `planning`
- `waiting_approval`
- `executing`
- `blocked`
- `resumable`
- `completed`
- `failed`

这套状态用于驱动：

- 聊天流状态卡
- 顶部状态条
- 右侧计划与执行面板
- 线程列表里的恢复提示

### Plan

当任务进入计划模式时，保存结构化 plan：

- `summary`
- `reason`
- `riskLevel`
- `approvalStatus`
- `affectedPaths[]`
- `steps[]`

每个 `steps[]` 至少包含：

- `id`
- `title`
- `kind`
- `summary`
- `needsApproval`
- `expectedResult`

### Execution Steps

真正执行时的步骤记录：

- `id`
- `title`
- `status`
- `toolName`
- `resultSummary`
- `userVisibleDetail`
- `startedAt`
- `finishedAt`

状态统一为：

- `pending`
- `running`
- `completed`
- `failed`
- `blocked`

### Resume Snapshot

恢复只保留最小必要信息：

- `turnId`
- `resumeFromStepId`
- `resumeReason`
- `blockingRequirement`
- `resumeActionLabel`
- `lastStableOutput`

恢复快照比当前 replay-only 方案更高一层：

- replay 继续保留为事实来源
- resume snapshot 成为产品交互来源

## 三个优先能力的具体设计

### 一、线程状态机 + 可恢复

#### 用户体验

用户应始终能看到线程当前处于：

- 正在理解任务
- 正在生成计划
- 等待批准
- 正在执行
- 被阻塞
- 可恢复
- 已完成

如果线程被打断，用户回来后要直接看到：

- 停在哪一步
- 为什么停下
- 点击哪里继续

#### 实现要求

- 将现有 `runState`、`turn.status`、`recoveryState` 合并映射到统一 turn status
- 在线程列表与 timeline 面板中展示 `resumable` 明确信号
- 为计划模式和执行模式分别生成恢复快照
- 保留 replay 事件作为恢复依据，但 UI 不直接暴露 replay 术语

### 二、计划卡片 + 批准后继续

#### 用户体验

当任务命中高风险或长任务规则时：

- 聊天流插入一张计划摘要卡
- 右侧显示完整计划
- 用户批准后线程自动继续执行
- 用户拒绝后线程进入 blocked 或 cancelled 风格状态

#### 呈现方式

采用你确认的双层结构：

- 聊天流：简洁摘要卡
- 右侧：完整计划面板

计划摘要卡至少展示：

- 为什么进入计划模式
- 准备做几步
- 影响哪些文件或能力
- 当前风险级别
- 批准 / 拒绝动作

右侧完整计划至少展示：

- plan summary
- step list
- affected paths
- risk level
- approval status

#### 触发策略

采用“规则兜底 + 模型建议”：

- 高风险写操作一定进入计划模式
- 长任务、多步骤任务可由模型建议进入计划模式
- 规则优先级高于模型自由判断

### 三、高质量步骤回显

#### 用户体验

执行时不能只显示“调用了某工具”，要让用户看懂：

- 为什么做这一步
- 这一步得到了什么关键结果
- 下一步准备做什么

#### 呈现要求

聊天流中的执行卡片至少包含：

- step title
- current status
- short reason
- key result
- next action

右侧工具面板保留，但需要从单纯的 tool list 升级为“步骤视角优先，工具细节为辅”。

也就是说：

- 主体验看 `executionSteps`
- 需要更细时再看 `toolCalls`

## 与现有代码的映射

### 保留

- `GNAgentChatPage` 作为桌面壳子主入口
- `GNAgentThreadList` / `GNAgentTimelinePanel` / `GNAgentToolCallPanel` / `GNAgentMemoryPanel`
- `AgentRuntimeStore` 的 thread、timeline、replay、toolCalls、memory 基础存储
- `runtimeApprovalCoordinator`
- `runtimeReplayRecovery`
- `runtimeToolLoop`

### 需要抽离

- `AIChat.tsx` 内对运行路径、批准路径、local agent 路径、project file 路径的直接分支控制

### 需要新增

- `AgentTurnSession` 类型
- `Agent Session Controller`
- `Plan Panel`
- `Plan Summary Card`
- `Execution Progress Card`
- `Blocked / Resume Card`

### 需要降级或移除

- `runtimeRegistry.ts` 中把 `Codex` 描述成 `Codex CLI` 的产品语义
- `provider-sessions/codexSessionStore.ts` 这类旧 session 语义残留
- 任何把 `Codex` 主要解释为本地 CLI 的入口文案

## 分阶段落地建议

### Phase 1

先建立统一 turn/session 模型：

- 新增 session types
- 新增 session controller
- 把统一状态映射接进现有 UI

### Phase 2

接入计划模式：

- 建 plan data model
- 插入聊天流计划摘要卡
- 新增右侧计划面板
- 接审批后自动继续

### Phase 3

接入执行步骤回显与恢复快照：

- 用 execution steps 统一回显
- 把 toolCalls 映射成 step-level summary
- 让恢复入口基于 resume snapshot 而不是仅基于 replay summary

### Phase 4

清理 `Codex CLI` 语义残留：

- 文案
- 旧 session store
- 与主流程无关的 local-agent 假设

## 风险与约束

- 如果继续在 `AIChat.tsx` 上堆功能，这轮做完后会更难持续优化
- 如果过早重写整个 runtime，会超出本轮范围
- 如果只做底层状态不做可见交互，用户体感提升会明显打折
- 如果不清理 `Codex CLI` 语义，后续产品定位会持续摇摆

## 验收标准

本轮完成后，至少满足：

1. 一个跨 2-5 步的高风险或长任务会进入计划模式，而不是直接黑箱执行
2. 用户批准计划后，线程不需要重新发消息即可自动继续执行
3. 聊天流能展示计划摘要、执行状态、阻塞原因、恢复入口
4. 右侧面板能展示完整计划与步骤状态
5. 线程中断后，用户重新进入时能看到明确的恢复动作
6. `Codex` 主产品语义不再依赖 `Codex CLI`

## 推荐结论

推荐采用以下主线推进：

1. 保留现有 GN Agent 桌面壳子  
2. 新增统一 `Agent Session Controller`  
3. 用统一 `AgentTurnSession` 模型串起计划、执行、审批、恢复  
4. 把 `Codex` 从旧 CLI 语义迁移为桌面 agent 模式  
5. 在这套稳定壳子上持续优化后续 AI 体验

## Post-Implementation Follow-ups

- Add richer pause, retry, and user-feed controls on top of the new turn session model.
- Improve automatic complexity detection so plan mode can combine hard rules with better model suggestions.
- Keep trimming remaining Codex CLI semantics and provider-specific affordances now that the desktop agent session layer exists.
