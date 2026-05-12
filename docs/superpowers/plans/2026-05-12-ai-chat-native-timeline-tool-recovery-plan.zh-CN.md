# AI Chat Native 时间线工具恢复与单源收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留当前“正文/思考时间线顺序正确”的前提下，把工具执行、审批、提问恢复到同一条消息时间线里，并去掉前端两套展示源并存的问题。

**Architecture:** 不改 provider、canonical event、runtime truth，只在展示层收口。目标不是“再加一层系统”，而是把当前分散在 `assistantNativeMessageOutputModel.ts`、`AIChat.tsx`、`GNAgentEmbeddedPieces.tsx` 里的两套拼接逻辑收成一个唯一的消息展示入口。

**Tech Stack:** React、TypeScript、Zustand、GoodNight runtime timeline / conversation projection、Node test、Vite build

---

## 先用中文说清楚：这些模块现在都是做什么的

- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
  作用：把 runtime 里的 canonical events 按 `runId` / `messageId` 组装成 `timelineProjection`，这是工具、response card、run summary 的来源。

- `src/modules/ai/store/assistantTimeline.ts`
  作用：保存 assistant 自己的 narrative 时间线，也就是“思考”和“正文”的消息级事实。它不是工具卡片渲染器。

- `src/components/workspace/assistantNativeMessageOutputModel.ts`
  作用：当前新的 native 模式消息输出模型，只把 `assistantTimeline` 里的 `reasoning + text` 转成可渲染 item。
  问题：它目前不吃工具、审批、提问，所以切到 native 后工具会消失。

- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
  作用：把 `timelineProjection.cards` 转成旧的气泡卡片模型，主要负责工具过程卡、response summary、部分 suppress 规则。
  问题：它属于另一套展示链，会和 native narrative 链并存。

- `src/components/workspace/AIChat.tsx`
  作用：当前主入口。这里同时准备了两类消息展示材料：
  1. native narrative 相关输入
  2. `renderTimelineCards / renderToolExecutionCard / renderRuntimeQuestion` 这些旧卡片入口

- `src/components/workspace/AIChatConversationMessagesPane.tsx`
  作用：把 approval/question 渲染也接进消息列表，属于旧卡片链的一部分。

- `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
  作用：把历史上的 `timelineCardsByMessage`、`supplementalCardsByMessage`、`processSummaryByMessageId` 装配点收束为单一 message 输入。
  问题：这里本质上还在维护“外挂补充卡片”机制。

- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  作用：最终消息渲染器。当前已经支持 `composed` 和 `native` 两种显示模式。
  问题：native 模式直接绕开了旧卡片链，所以顺序对了，但工具丢了。

## 核心判断

- 当前不是“层太少”，而是“同一展示层里有两套真相源”。
- 正确方向不是把旧卡片硬塞回 native。
- 正确方向是把 native narrative 和 runtime interaction 在**同一个展示入口**里统一排序。
- 这个统一动作只能发生在展示层，不能把 UI 需求反推到 runtime truth。

## 这次改动的目标边界

### 保留

- 保留 `runtimeConversationGateway.ts` 作为 runtime projection 来源
- 保留 `assistantTimeline.ts` 作为 narrative 来源
- 保留 `GNAgentMessageItem.tsx` 作为最终单条消息渲染入口
- 保留当前 native 模式已经修好的“正文/思考顺序正确”

### 修改

- 修改 `assistantNativeMessageOutputModel.ts`
- 修改 `AIChat.tsx`
- 修改 `AIChatConversationMessagesPane.tsx`
- 修改 `GNAgentEmbeddedPieces.tsx`
- 修改 `GNAgentMessageItem.tsx`

### 删除或退役

- 退役旧路线里的 `supplementalCards` 主入口
- 退役 native 模式下对 `renderTimelineCards / renderToolExecutionCard / renderRuntimeApproval / renderRuntimeQuestion` 的并列主导地位
- 不再让 `chatTimelineBubbleCardModel.ts` 决定 assistant 消息主时间线排序

## 文件结构与职责收口

- 新增或强化一个“统一消息展示源”模块
  建议直接复用并扩展：`src/components/workspace/assistantNativeMessageOutputModel.ts`
  职责：输入 narrative timeline + projection/interaction 数据，输出一条 `orderedItems`

- `GNAgentMessageItem.tsx`
  职责：只负责渲染 `orderedItems`
  不再自己决定“哪部分是主时间线，哪部分是外挂卡片”

- `GNAgentEmbeddedPieces.tsx`
  职责：只传 message 级所需原始输入，不再提前分叉为多套 message 级卡片集合

## 实施任务

### Task 1: 先锁定现状与目标，防止再次回退成双轨展示

**Files:**
- Modify: `tests/ai/assistant-message-output-model.test.mjs`
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] 补一组 source / model 测试，明确 native 模式最终目标是“同一条 ordered items”
- [ ] 断言旧路线里的工具、审批、提问入口不会再依赖 `supplementalCards`
- [ ] 断言 assistant 最终正文不会再次被重复渲染
- [ ] 运行相关测试，确认先红后绿

### Task 2: 扩展 native 消息输出模型，让它能吃到 runtime 交互项

**Files:**
- Modify: `src/components/workspace/assistantNativeMessageOutputModel.ts`
- Reference: `src/modules/ai/store/assistantTimeline.ts`
- Reference: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Reference: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`

- [ ] 给 native 输出模型补齐输入项：projection、approval entries、question entries、team/tool execution entries
- [ ] 在同一个函数里统一产出 item 类型：
  - `thinking`
  - `tool`
  - `approval`
  - `question`
  - `text`
- [ ] 用 `createdAt + timelineOrder` 做稳定排序
- [ ] 保持 streaming 正文仍来自 shared draft timeline，而不是额外 live bypass

### Task 3: 把旧的卡片生成逻辑从“主渲染链”降级成“数据适配器”

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`

- [ ] `AIChat.tsx` 不再向 native 模式并列下发 `renderTimelineCards / renderToolExecutionCard / renderRuntimeQuestion`
- [ ] `AIChatConversationMessagesPane.tsx` 只负责取 active messages 和必要的 interaction 数据，不再承担消息主排序职责
- [ ] `GNAgentEmbeddedPieces.tsx` 删除旧路线里的 `timelineCardsByMessage / supplementalCardsByMessage` 主装配逻辑
- [ ] 保留 composed 模式兼容，避免一次性把所有旧链全删坏

### Task 4: 让消息项只认一份 ordered items

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`

- [ ] native 模式下只渲染 `assistantNativeMessageOutputModel.items`
- [ ] 工具、审批、提问、思考、正文全部走同一渲染顺序
- [ ] 保持 copy text 只复制最终正文，不把工具输出和思考混进去
- [ ] 保持当前“正文不重复渲染两次”

### Task 5: 收掉明显的旧入口，避免后面继续绕回去

**Files:**
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`

- [ ] 给旧的 bubble card 模型降级定位：只作为旧 composed 模式兼容工具，不再定义 native 主时间线
- [ ] 删除 native 模式下已经不再使用的 props / map / adapter
- [ ] 删除会继续制造“双真相源”的无效分支

### Task 6: 验证回归

**Files:**
- Test: `tests/ai/assistant-message-output-model.test.mjs`
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`
- Test: `tests/ai/ai-chat-direct-streaming-display-source.test.mjs`

- [ ] 验证运行中顺序：思考 → 工具 → 工具结果 / 审批 / 提问 → 正文
- [ ] 验证完成后顺序不变，只是状态变化
- [ ] 验证下一个对话不会影响上一个对话内容
- [ ] 运行 `node --test` 相关测试
- [ ] 运行 `npm run build`
- [ ] 运行 `graphify update .`

## 风险与处理

- 风险 1：native 和 composed 共存时间过长，逻辑继续分叉
  处理：本次只允许 composed 作为兼容分支，native 必须收敛为唯一主链

- 风险 2：把 UI 排序规则塞回 runtime 或 canonical event
  处理：严禁改底层 truth，只在展示层统一

- 风险 3：copy、summary、状态文案混进正文
  处理：正文复制与正文显示都只从 final text item 提取

- 风险 4：工具事件时间戳不稳定，导致同毫秒顺序漂移
  处理：统一使用 `createdAt + timelineOrder + fallback index`

## 完成标准

- native 模式下，工具执行恢复可见
- native 模式下，assistant 消息只存在一条主时间线
- 正文、思考、工具、审批、提问顺序一致
- 完成态与过程态不再来自两套展示源
- 上一个对话不会因为下一个对话的 draft/projection 更新而变化

## 这次计划的本质

这不是“再加一层架构”，而是：

1. 保留已有两类事实源
   - `assistantTimeline`
   - `runtimeConversationProjection`

2. 删除它们在前端被两套 UI 链并列消费的现状

3. 收成一个唯一的消息显示入口

也就是“减分叉”，不是“加系统”。
