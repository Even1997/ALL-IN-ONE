# Assistant Streaming Timeline Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI chat 段落流式中的两个回归：运行中正文排序错误，以及上一轮 assistant 完成后在下一轮对话里仍被 draft 覆盖导致内容变化。

**Architecture:** 保持修复在 `projection -> draft projection -> assistant render model -> timeline UI` 这一显示链内完成，不改 provider/runtime truth。运行中的正文时间直接来自 `projection.activeMessage`，completed message 在 handoff 到 canonical timeline 后退出 UI draft 覆盖层。

**Tech Stack:** React, TypeScript, Node test runner, graphify

---

### Task 1: 锁定回归测试

**Files:**
- Modify: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Test: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Test: `tests/ai/assistant-render-model.test.mjs`

- [ ] **Step 1: 写 completed handoff 的失败测试**

```js
test('assistant streaming draft projection drops the completed draft once canonical timeline catches up', async () => {
  const { projectAssistantStreamingDraft } = await loadProjectionModule();

  const first = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_final',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Stored final answer.', createdAt: 2 }],
    },
    projection: {
      runId: 'run_final',
      status: 'completed',
      cards: [],
      events: [],
      activeMessage: null,
      finalMessage: {
        messageId: 'assistant_final',
        text: 'Visible final answer.',
        completedAt: 5,
      },
    },
    previousDraft: {
      timeline: [{ id: 'text_1', kind: 'text', content: 'Stored final answer.', createdAt: 2 }],
      streamingText: 'Visible final answer.',
      isStreaming: true,
    },
    answerState: {
      rawText: 'Visible final answer.',
      visibleText: 'Visible final answer.',
      pendingText: '',
      lastFlushAt: 4,
      lastInputAt: 4,
      isComplete: false,
    },
    reasoningStateByEventId: {},
    now: 200,
  });

  const second = projectAssistantStreamingDraft({
    message: {
      id: 'assistant_final',
      role: 'assistant',
      createdAt: 1,
      timeline: [{ id: 'text_1', kind: 'text', content: 'Visible final answer.', createdAt: 6 }],
    },
    projection: {
      runId: 'run_final',
      status: 'completed',
      cards: [],
      events: [],
      activeMessage: null,
      finalMessage: {
        messageId: 'assistant_final',
        text: 'Visible final answer.',
        completedAt: 5,
      },
    },
    previousDraft: first.draft,
    answerState: first.answerState,
    reasoningStateByEventId: first.reasoningStateByEventId,
    now: 201,
  });

  assert.equal(first.draft?.streamingText, 'Visible final answer.');
  assert.equal(second.draft, null);
});
```

- [ ] **Step 2: 写运行中正文时间源的失败测试**

```js
test('assistant render model timestamps the streaming answer from the active projection draft', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();

  const model = buildAssistantRenderModel(
    {
      id: 'assistant_streaming_ts',
      role: 'assistant',
      timeline: [{ id: 'text_1', kind: 'text', content: 'Stored answer.', createdAt: 2 }],
      createdAt: 1,
    },
    {
      streamingText: 'Visible answer.',
      isStreaming: true,
      streamingStartedAt: 20,
      streamingUpdatedAt: 30,
    },
  );

  assert.equal(model.finalAnswerItem?.part.createdAt, 30);
});
```

- [ ] **Step 3: 运行局部测试确认先失败**

Run: `node --test tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs`  
Expected: FAIL，说明 handoff/stamping 新断言尚未被实现。

### Task 2: 修复 draft projection 和 render model

**Files:**
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Test: `tests/ai/assistant-render-model.test.mjs`

- [ ] **Step 1: 给 UI draft state 增加运行中正文时间元数据**

```ts
export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
  streamingText?: string;
  isStreaming?: boolean;
  streamingReasoningTextByEventId?: Record<string, string>;
  streamingStartedAt?: number;
  streamingUpdatedAt?: number;
};
```

- [ ] **Step 2: 让 projection 在 activeMessage 期间写入 startedAt/updatedAt，并在 completed handoff 稳定后返回 null draft**

```ts
if (typeof activeAnswerText === 'string') {
  draft.isStreaming = true;
  draft.streamingText = nextAnswerState.visibleText;
  draft.streamingStartedAt = projection.activeMessage?.startedAt;
  draft.streamingUpdatedAt = projection.activeMessage?.updatedAt;
  return { ... };
}

const timelineText = getAssistantTimelineText(timeline);
const shouldKeepCompletedAnswerDraft =
  Boolean(projection?.finalMessage?.text) && finalText !== timelineText;

if (!shouldKeepCompletedAnswerDraft && Object.keys(visibleReasoningByEventId).length === 0) {
  return {
    draft: null,
    answerState: finalizedAnswerState,
    reasoningStateByEventId: nextReasoningStates,
    pendingAnswerFlush: false,
    pendingReasoningFlushEventIds,
  };
}
```

- [ ] **Step 3: 更新 draft equality，把新增时间字段纳入比较**

```ts
if (
  left.streamingText !== right.streamingText ||
  left.isStreaming !== right.isStreaming ||
  left.streamingStartedAt !== right.streamingStartedAt ||
  left.streamingUpdatedAt !== right.streamingUpdatedAt
) {
  return false;
}
```

- [ ] **Step 4: 让 render model 在运行中正文上优先使用 draft 的 streamingUpdatedAt**

```ts
const answerCreatedAt = isStreaming
  ? draftState?.streamingUpdatedAt ?? draftState?.streamingStartedAt ?? fallbackAnswerCreatedAt
  : fallbackAnswerCreatedAt;
```

- [ ] **Step 5: 确认 AIChat 的 timeout flush 不会冲掉时间元数据**

```ts
streamingDraftBufferRef.current = {
  ...streamingDraftBufferRef.current,
  [messageId]: {
    ...currentDraft,
    timeline: currentDraft?.timeline ?? timeline,
    streamingText: nextState.visibleText,
    isStreaming: true,
  },
};
```

这里保留 `...currentDraft`，确保 `streamingStartedAt/streamingUpdatedAt` 不被 timeout flush 擦掉。

- [ ] **Step 6: 重新运行局部测试确认转绿**

Run: `node --test tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs`  
Expected: PASS

### Task 3: 回归统一时间线行为

**Files:**
- Modify: `tests/ai/message-timeline-ordering.test.mjs`
- Test: `tests/ai/message-timeline-ordering.test.mjs`

- [ ] **Step 1: 补一条 process timeline 排序断言，确保运行中正文按最新时间落位**

```js
test('message timeline render model keeps the streaming answer after earlier tool cards when its timestamp is newer', async () => {
  const { buildChatMessageTimelineRenderModel } = await loadRenderModel();

  const model = buildChatMessageTimelineRenderModel({
    thinkingItems: [],
    timelineCardItems: [
      { key: 'tool-1', node: null, createdAt: 10, timelineOrder: 0, laneKind: 'bubble' },
    ],
    activeResponseItem: {
      key: 'text-1',
      node: null,
      createdAt: 30,
      timelineOrder: 1,
      laneKind: 'answer_lane',
    },
    finalAnswerItem: null,
  });

  assert.deepEqual(model.processItems.map((item) => item.key), ['tool-1', 'text-1']);
});
```

- [ ] **Step 2: 跑相关 timeline 测试**

Run: `node --test tests/ai/message-timeline-ordering.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-timeline-view.test.mjs`  
Expected: PASS

### Task 4: 完整验证和图谱更新

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

- [ ] **Step 1: 跑完整相关测试**

Run: `node --test tests/ai/assistant-render-model.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/message-timeline-ordering.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/gn-agent-message-item.test.mjs`

- [ ] **Step 2: 跑构建**

Run: `npm run build`

- [ ] **Step 3: 跑 diff 健康检查**

Run: `git diff --check`

- [ ] **Step 4: 更新知识图谱**

Run: `graphify update .`
