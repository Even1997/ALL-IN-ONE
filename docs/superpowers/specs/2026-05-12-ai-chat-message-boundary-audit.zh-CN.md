# AI Chat 正文 / 思考 / 工具边界审计

日期：2026-05-12

## 1. 结论摘要

当前 AI Chat 的“思考”“反馈/正文”“工具执行”三条链路都能跑通，但边界没有完全收拢成单一语义模型。

最核心的问题不是某一个组件渲染错了，而是：

1. 正文现在仍然有两套语义副本：`assistant timeline text` 和 `canonical projection message.*`。
2. 反馈和最终正文在运行时都被当成 `text` 片段保存，没有独立的“过程反馈”类型。
3. 思考和工具也都有双表示，当前主要靠 UI 层“抑制重复显示”，而不是靠数据层“只有一个真相源”。
4. 实时流式正文是 session 级 `liveState.streamingText`，但当前没有显式 `messageId` 绑定，仍然依赖 projection 来推断当前正文属于哪条消息，这就是“影响上文”的主要结构风险。

所以，用户看到的“反馈有两遍”“下一问影响上一问”“过程和结果不一致”，本质上都不是孤立 bug，而是边界定义还不够硬。

## 2. 检查范围

本次检查覆盖了当前 AI Chat 相关的主链路代码：

- `apps/runtime/src/index.ts`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`
- `src/modules/runtime-sidecar/runtimeSidecarStreamingCoalescer.ts`
- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/modules/ai/store/assistantTimeline.ts`
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- `src/components/workspace/aiChatMessageParts.ts`
- `src/components/workspace/assistantStreamingDraftProjection.ts`
- `src/components/workspace/assistantRenderModel.ts`
- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- `src/components/workspace/timeline/chatMessageTimelineRenderModel.ts`
- `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- `src/components/workspace/AIChat.tsx`
- 相关测试文件

## 3. 当前边界定义

### 3.1 思考

当前“思考”在代码里并不是一个单点对象，而是三层映射：

1. runtime/provider 层的 `thinking` 流事件
2. assistant timeline 层的 `reasoning` 事件
3. canonical timeline 层的 `progress.updated`

对应代码：

- `apps/runtime/src/index.ts:747-764`
- `src/modules/ai/store/assistantTimeline.ts:60-68`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:641-679`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts:322-338`

UI 侧当前只显示“正在思考”的瞬时状态，不显示完成后的思考正文：

- `src/components/workspace/assistantRenderModel.ts:87-111`
- `src/components/workspace/AIChatAssistantParts.tsx:71-137`

这说明“思考”现在更接近状态信号，而不是最终消息正文的一部分。

### 3.2 反馈 / 正文

当前“反馈”和“最终正文”没有硬边界，都是 `text`：

1. provider 的 `text` chunk 先进入 runtime streaming assembler
2. assembler 把这些内容积累成 `assistantParts` 里的 `text`
3. assistant timeline 再把 `text` part 变成 `timeline.text`
4. UI 流式正文优先读 `liveState.streamingText`
5. canonical projection 同时还维护 `message.delta` / `message.completed`

对应代码：

- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts:385-534`
- `src/modules/ai/store/assistantTimeline.ts:53-58`
- `src/components/workspace/assistantStreamingDraftProjection.ts:88-117`
- `src/components/workspace/assistantRenderModel.ts:72-138`
- `src/modules/ai/runtime/composer/timelineComposer.ts:352-401`

这里最重要的一点是：当前系统里“过程反馈”和“最终答案正文”都落在 `text` 上，没有单独的 `feedback` 类型。

### 3.3 工具执行

当前工具执行也有双轨：

1. runtime timeline 里的 `tool_use` / `tool_result`
2. canonical projection 里的 `tool.started` / `tool.completed`
3. legacy/raw 文本解析里的 `<tool_use>` / `<tool_result>`

对应代码：

- `src/modules/ai/store/assistantTimeline.ts:98-104`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:749-847`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts:342-407`
- `src/components/workspace/aiChatMessageParts.ts:471-546`
- `src/components/workspace/AIChat.tsx:847-855`

当前 UI 已经在尽量避免双渲染：如果 assistant timeline 里已经有 runtime tool event，就不再显示 raw tool block。

## 4. 链路是否跑通

### 4.1 思考链路

当前是通的：

`provider thinking -> streaming assembler -> assistant timeline reasoning -> sidecar turn.reasoning / progress.updated -> render model -> 思考中 pill`

但这个链路存在“双表示”：

- narrative 层有 `reasoning`
- canonical 层又有 `progress.updated`

当前只是通过 `chatTimelineBubbleCardModel.ts:31-37,103-105` 把 reasoning-only progress card 隐掉了。

这说明思考的链路是通的，但边界不是“一个定义”，而是“两个定义 + 一个 UI 抑制规则”。

### 4.2 正文链路

当前也是通的，但它是最不干净的一条链：

`provider text -> turn.delta -> liveState.streamingText -> assistantStreamingDraftProjection -> assistantRenderModel -> GNAgentMessageItem`

同时还有另一条：

`provider text -> assistant timeline text -> persisted message -> canonical message.* -> projection`

对应代码：

- `apps/runtime/src/index.ts:747-764`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:681-723`
- `src/components/workspace/AIChat.tsx:1212-1268`
- `src/components/workspace/assistantStreamingDraftProjection.ts:88-117`
- `src/components/workspace/assistantRenderModel.ts:72-138`

这条链的“显示正文”目前优先用了 `liveState.streamingText`，这是这次修正后更快的一步；但“完成后的正文”和“过程耗时/结果摘要”仍然不是同源。

### 4.3 工具链路

工具链路也通：

`tool_call / tool result -> runtime tool record -> canonical tool.* -> projection card -> process lane`

对应代码：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:749-847`
- `src/modules/ai/runtime/composer/timelineComposer.ts:236-287`
- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts:74-137`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx:221-292`

工具这条链相对正文更清晰，但仍保留 legacy 文本解析兜底，所以它也不是完全单源。

## 5. 关键问题

### 5.1 “反馈”没有独立类型，这是当前最大的边界问题

`agentTurnRunner.ts` 现在明确会把过程中的可见话术保留为多个 `text` 片段，而且相关测试是锁死这个行为的：

- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts:393-410`
- `tests/ai/runtime-streaming-assembler.test.mjs:103-177`

这意味着系统当前的真实产品语义其实是：

- “我先看一下”
- “我检查了顶层目录”
- “我又检查了配置文件”
- “这是最终结论”

这些都属于正文 `text`，只是分段而已。

如果产品目标其实是：

- 过程只显示工具和状态
- 最终只保留一份最终正文

那当前实现和测试本身就与目标契约冲突。

### 5.2 正文现在仍然有两份语义副本

当前至少同时存在：

1. `assistant timeline text`
2. `projection.activeMessage / finalMessage`

虽然 `GNAgentMessageItem` 现在只显示一次最终正文，`chatTimelineBubbleCardModel.ts` 也压掉了 response card，但语义副本仍在。

对应代码：

- `src/components/workspace/assistantRenderModel.ts:125-138`
- `src/modules/ai/runtime/composer/timelineComposer.ts:352-401`
- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts:95-120`

这会带来两个后果：

1. 任一 UI 分支如果再次把 projection response 当成可见内容，重复就会回来。
2. 刷新、回放、完成态切换时，正文和结果摘要可能短暂不一致。

### 5.3 思考也是双表示，只是现在被“藏起来了”

当前一个 reasoning 事件同时会变成：

1. assistant timeline 的 `reasoning`
2. canonical 的 `progress.updated`

对应代码：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:641-679`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts:322-338`

UI 现在靠隐藏 reasoning-only progress card 来避免重复，但这不是语义边界清晰，而是展示层补救。

### 5.4 工具边界比正文清楚，但仍然靠 suppression 规则兜底

当前 raw tool block 解析还在：

- `src/components/workspace/aiChatMessageParts.ts:471-546`

而运行时 tool event 也在：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts:749-847`

最终 UI 靠这段规则避免重复：

- `src/components/workspace/AIChat.tsx:847-855`

也就是说，工具没有真正只保留 runtime/projection 一条路，仍然保留 legacy 文本路径。

### 5.5 “影响上文”的主要结构风险仍然存在

当前流式正文的实时来源是 session 级 `liveState.streamingText`，但 `AgentRuntimeLiveState` 里没有 `activeMessageId`：

- `src/modules/ai/runtime/agentRuntimeStore.ts:47-61`

AIChat 侧现在这样把实时正文绑定到消息：

- `src/components/workspace/AIChat.tsx:1232-1243`

也就是：

1. 先拿 session 级 live text
2. 再用 `projection.activeMessage?.messageId` 去推断它属于哪条消息

这已经比以前好，但它仍然不是 runtime 直接声明“这段 live text 属于 message X”，而是 UI 用 projection 间接推断。

只要 projection 更新与 live text 到达不同步，就仍然可能出现：

- 当前 live text 被临时套到错误消息
- 下一轮启动时上一轮 draft 被重新计算

这就是“影响上文”的主要结构风险。

### 5.6 完成态正文和完成态元信息仍不是同源

当前完成后：

- 正文来自 `assistantRenderModel.finalAnswerItem`
- 过程耗时来自 `buildChatTimelineBubbleCards(projection).completedResponseSummary`

对应代码：

- `src/components/ai/gn-agent/GNAgentMessageItem.tsx:181-231`
- `src/components/workspace/AIChat.tsx:2645-2663`

这说明“最终显示结果”其实仍然由两套源拼出来：

1. 正文源
2. 过程完成摘要源

所以如果其中一条先到、一条后到，视觉上仍可能短时间不一致。

### 5.7 测试覆盖更多是局部保护，还缺一个真正的跨轮次端到端约束

当前已有测试覆盖了：

- direct live text 不泄漏到 older assistant message
- process timeline 与 final answer 分离
- tool/raw path suppression

但还缺一个更贴近用户问题的端到端约束：

1. 第 N 条 assistant 完成后，第 N+1 轮开始流式时，第 N 条的正文和过程不允许再变化
2. 有工具边界时，运行中展示和完成后展示必须来自同一正文语义
3. 若产品不要“过程反馈保留”，则完成态不允许保留 pre-tool / inter-tool feedback text

## 6. 当前代码里，什么算思考、什么算反馈、什么算工具

按当前真实实现，不按产品理想：

### 6.1 思考

当前真正的“思考”是：

- provider/native `thinking`
- `assistant timeline.reasoning`
- liveState `activeThinking`

它不是最终正文的一部分，当前 UI 只把它当状态。

### 6.2 反馈

当前真正的“反馈”并没有独立类型，它实际就是：

- 运行过程中产生、且被看作 assistant 可见叙述的 `text`

这包含：

- “我先看看”
- “我检查了顶层目录”
- “下面继续检查配置”
- 最终正式回答正文

所以今天的问题不是“反馈渲染错了”，而是“反馈根本没有被单独定义出来”。

### 6.3 工具

当前真正的“工具”是：

- runtime timeline 中的 `tool_use` / `tool_result`
- canonical 中的 `tool.started` / `tool.completed`

raw `<tool_use>` 解析只是兼容层，不该再作为主链路真相源。

## 7. 建议的目标边界

如果目标是你现在描述的体验，我建议把契约收成下面这样：

### 7.1 思考

- 思考只是一种 transient runtime status
- 运行中只显示“思考中”
- 完成后不展示思考正文，不参与最终消息正文，不保留为 answer 片段

### 7.2 反馈

二选一，必须明确：

1. 如果要保留过程反馈：
   让它成为独立的 `feedback` 类型，不能再复用 `text`
2. 如果不要保留过程反馈：
   那么所有 pre-tool / inter-tool 的可见话术都只能是 draft-only UI，不进入最终 assistant narrative

从你现在的诉求看，更适合第 2 种。

### 7.3 工具

- 工具只认 runtime/canonical event
- raw `<tool_use>` 只保留给历史兼容或导入，不进入 live path 主链路

### 7.4 最终正文

- 最终正文只认一份 narrative source
- projection 的 `message.completed/finalMessage` 只负责时间、状态、统计，不再承担可见正文语义

## 8. 建议的修改顺序

### 阶段 1：先把“反馈”从“最终正文”里拆出去

优先检查和修改：

- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- `src/components/workspace/aiChatMessageParts.ts`
- `src/modules/ai/store/assistantTimeline.ts`

目标：

- 明确 pre-tool / inter-tool 文本到底是 `feedback` 还是 `final answer`
- 不再让“过程反馈”和“最终正文”共用 `text`

### 阶段 2：给 live state 加显式 `activeMessageId`

优先检查和修改：

- `src/modules/ai/runtime/agentRuntimeStore.ts`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/assistantStreamingDraftProjection.ts`

目标：

- 让 runtime 直接声明 session 级 live text 属于哪条 message
- 不再让 UI 依赖 projection 去反推 live text 的归属

### 阶段 3：收掉正文的双语义副本

优先检查和修改：

- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- `src/components/workspace/assistantRenderModel.ts`

目标：

- projection response 只做 meta，不再承担正文语义
- 最终正文只显示 narrative source 一次

### 阶段 4：把 legacy raw tool path 降级为兼容层

优先检查和修改：

- `src/components/workspace/aiChatMessageParts.ts`
- `src/components/workspace/AIChat.tsx`

目标：

- live/runtime path 只认 tool event
- raw tool parsing 只留给历史内容回放或导入

## 9. 最终判断

这次检查后的判断是：

1. 思考、反馈、工具三条链路“能跑”，但语义边界没有硬收口。
2. 真正最乱的是“反馈”，因为它现在既承担过程话术，又承担最终正文。
3. “反馈有两遍”和“还会影响上文”不是偶发 bug，而是当前模型允许发生的结果。
4. 如果产品目标是“过程只显示状态/工具，最终只保留一份正文”，那就必须先改数据契约，再谈样式和流式节奏。

换句话说，这里下一步最该修的，不是单个组件，而是“反馈到底是什么”。
