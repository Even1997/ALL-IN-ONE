# AI Chat Paragraph Streaming Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude/Codex-like paragraph streaming apply consistently to assistant thinking and answer text, preserve chronological rendering, and finish with one stable collapsed completion state without re-showing the final answer.

**Architecture:** Keep provider adapters, canonical runtime events, persisted timeline facts, and replay semantics unchanged. Fix the behavior in the presentation path only: `conversation projection -> assistant render model -> message ordering -> UI composition`. The key rule is that runtime truth remains full-fidelity while the UI owns paragraph visibility, lane grouping, stable keys, and completion收口.

**Tech Stack:** React, TypeScript, Zustand, Node test runner (`node --test`), graphify

---

## Current Root Causes

- `GNAgentMessageItem.tsx` removes answer items from unified sorting by collecting them in `answerRenderItems`, then renders them after `timelineGroups`. This makes screenshots look time-disordered even when timeline facts are ordered.
- `AIChat.tsx` streams answer visibility from `projection.activeMessage.text`, then finalizes from `getAssistantTimelineText(message.timeline)`. The UI switches sources at completion instead of using one stable completion handoff.
- `assistantRenderModel.ts` changes the answer item key from `${message.id}-streaming-text` to `${message.id}-answer-text`, and `AssistantTextBlock` changes from plain `<span>` streaming to `ReactMarkdown` final rendering. This causes React remount/repaint behavior that reads as "draft replaced by final."
- Thinking content is rendered directly from `part.content` in `AIChatAssistantParts.tsx`; it has no paragraph visibility buffer, so reasoning still updates as raw deltas.
- Completion cards for `response` are suppressed in `chatTimelineBubbleCardModel.ts`, and there is no message-level "completed at + one-line summary + collapsed process" state.

## Delete / Replace Plan

- Delete the `answerRenderItems` array from `src/components/ai/gn-agent/GNAgentMessageItem.tsx`.
- Delete the standalone `{answerRenderItems.map(...)}` render block from `src/components/ai/gn-agent/GNAgentMessageItem.tsx`.
- Replace `sortMessageRenderItems(partRenderItems, bubbleRenderItems)` with sorting over all assistant render items plus bubble cards, so answer, thinking, tool, approval, and question cards share the same ordering pass.
- Delete or invert the source assertion test named `GN Agent message item renders the final answer lane after process groups instead of sorting it with tools` in `tests/ai/gn-agent-message-flow-source.test.mjs`.
- Replace the answer item key split in `src/components/workspace/assistantRenderModel.ts` so streaming and final answer use one stable key.
- Delete the streaming-only plain text branch in `AssistantTextBlock` or reduce it to a CSS-only state; the DOM shape should stay stable between streaming and completed display.
- Replace `finalizeParagraphStreamingState(currentParagraphState, getAssistantTimelineText(message.timeline))` in `AIChat.tsx` with a completion-source resolver that prefers `projection.finalMessage.text` when present and only falls back to persisted timeline text.
- Delete the immediate paragraph-state reset path that clears the visible completion buffer before persisted timeline catches up. Reset only after the final stable content has been rendered or after the message leaves the active session.
- Do not delete canonical `message.completed`, `message.delta`, `turn.reasoning`, timeline text events, reasoning events, or persisted timeline update code.

## File Structure

- Modify: `src/components/workspace/assistantParagraphStreaming.ts`
  Responsibility: shared pure state machine for paragraph visibility; answer and thinking both use it.
- Modify: `src/components/workspace/assistantRenderModel.ts`
  Responsibility: project timeline + UI-only streaming visibility into stable assistant render items.
- Modify: `src/components/workspace/AIChat.tsx`
  Responsibility: maintain UI-only paragraph buffers for answer and thinking; resolve stable completion source.
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`
  Responsibility: keep `AssistantTextBlock` DOM stable across streaming/completed states and render thinking previews cleanly.
- Modify: `src/components/ai/gn-agent/messageTimelineOrdering.ts`
  Responsibility: sort every visible item in one chronology-aware pass and group contiguous lanes.
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  Responsibility: remove the separate answer lane path and render unified groups.
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
  Responsibility: allow a lightweight completion summary descriptor without reopening suppressed runtime detail spam.
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
  Responsibility: show compact completed status, finished time, and one-line summary.
- Modify: existing tests in `tests/ai/*.mjs`
  Responsibility: replace source assertions that currently encode the broken split-lane behavior.

---

### Task 1: Lock Unified Timeline Ordering Before Changing UI

**Files:**
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
- Modify: `tests/ai/message-timeline-ordering.test.mjs`
- Modify: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Add an ordering unit test that includes the answer item**

Add this test to `tests/ai/gn-agent-message-item.test.mjs`:

```js
test('message item sorts answer, thinking, and runtime cards in one chronological pass', async () => {
  const { sortMessageRenderItems } = await loadMessageItem();

  const items = sortMessageRenderItems([
    { key: 'thinking-1', node: null, createdAt: 10, laneKind: 'thinking_lane' },
    { key: 'answer-1', node: null, createdAt: 30, laneKind: 'answer_lane' },
    { key: 'tool-1', node: null, createdAt: 20, laneKind: 'bubble' },
  ]);

  assert.deepEqual(
    items.map((item) => item.key),
    ['thinking-1', 'tool-1', 'answer-1'],
  );
});
```

- [ ] **Step 2: Add a grouping unit test that answer uses bubble visual grouping**

Add this test to `tests/ai/message-timeline-ordering.test.mjs`:

```js
test('message timeline grouping treats answer items as bubble items without changing order', async () => {
  const { groupMessageRenderItemsByLane } = await loadOrdering();

  const groups = groupMessageRenderItemsByLane([
    { key: 'thinking-1', node: null, createdAt: 1, laneKind: 'thinking_lane' },
    { key: 'answer-1', node: null, createdAt: 2, laneKind: 'answer_lane' },
    { key: 'tool-1', node: null, createdAt: 3, laneKind: 'bubble' },
    { key: 'thinking-2', node: null, createdAt: 4, laneKind: 'thinking_lane' },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.kind, group.items.map((item) => item.key)]),
    [
      ['thinking_lane', ['thinking-1']],
      ['bubble', ['answer-1', 'tool-1']],
      ['thinking_lane', ['thinking-2']],
    ],
  );
});
```

- [ ] **Step 3: Replace the broken source assertion test**

In `tests/ai/gn-agent-message-flow-source.test.mjs`, replace the test named:

```js
test('GN Agent message item renders the final answer lane after process groups instead of sorting it with tools', async () => {
```

with:

```js
test('GN Agent message item sorts the answer lane with process and runtime cards', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.doesNotMatch(messageItemSource, /const answerRenderItems:\s*MessageRenderItem\[\]\s*=\s*\[\];/);
  assert.doesNotMatch(messageItemSource, /answerRenderItems\.map\(\(item\) =>/);
  assert.match(messageItemSource, /const timelineRenderItems = sortMessageRenderItems\(allRenderItems\);/);
  assert.match(messageItemSource, /groupMessageRenderItemsByLane\(timelineRenderItems\)/);
});
```

- [ ] **Step 4: Run the ordering tests and confirm they fail**

Run:

```bash
node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/message-timeline-ordering.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
```

Expected: FAIL because `sortMessageRenderItems` still expects two arrays and `answerRenderItems` still exists.

### Task 2: Remove The Separate Answer Render Path

**Files:**
- Modify: `src/components/ai/gn-agent/messageTimelineOrdering.ts`
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/message-timeline-ordering.test.mjs`
- Test: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Replace the ordering function signature**

In `src/components/ai/gn-agent/messageTimelineOrdering.ts`, replace the exported type and sorting function with:

```ts
export type MessageTimelineRenderItem = {
  key: string;
  node: ReactNode;
  createdAt?: number;
  timelineOrder?: number;
  laneKind?: 'thinking_lane' | 'bubble' | 'answer_lane';
};

export type MessageTimelineRenderGroup = {
  kind: 'thinking_lane' | 'bubble';
  items: MessageTimelineRenderItem[];
};

export const sortMessageRenderItems = (renderItems: MessageTimelineRenderItem[]) =>
  renderItems
    .map((item, index) => ({
      ...item,
      timelineIndex: index,
    }))
    .sort((left, right) => {
      const leftTime = typeof left.createdAt === 'number' ? left.createdAt : Number.MAX_SAFE_INTEGER;
      const rightTime = typeof right.createdAt === 'number' ? right.createdAt : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      const leftTimelineOrder =
        typeof left.timelineOrder === 'number' ? left.timelineOrder : Number.MAX_SAFE_INTEGER;
      const rightTimelineOrder =
        typeof right.timelineOrder === 'number' ? right.timelineOrder : Number.MAX_SAFE_INTEGER;
      if (leftTimelineOrder !== rightTimelineOrder) {
        return leftTimelineOrder - rightTimelineOrder;
      }

      return left.timelineIndex - right.timelineIndex;
    });
```

- [ ] **Step 2: Treat answer lane as bubble during grouping**

In the same file, keep `groupMessageRenderItemsByLane` but make the lane decision explicit:

```ts
const getRenderGroupKind = (item: MessageTimelineRenderItem): MessageTimelineRenderGroup['kind'] =>
  item.laneKind === 'thinking_lane' ? 'thinking_lane' : 'bubble';
```

Use it inside the loop:

```ts
const kind = getRenderGroupKind(item);
```

- [ ] **Step 3: Delete `answerRenderItems` in `GNAgentMessageItem.tsx`**

Replace:

```ts
const partRenderItems: MessageRenderItem[] = [];
const answerRenderItems: MessageRenderItem[] = [];
```

with:

```ts
const allRenderItems: MessageRenderItem[] = [];
```

- [ ] **Step 4: Push answer and thinking into the same list**

Replace the assistant item handling block with:

```ts
assistantRenderModel.items.forEach((item) => {
  const thinkingKey = `${message.id}-thinking-${item.index}`;
  const thinkingExpanded =
    item.part.type === 'thinking' ? expandedThinkingKeys[thinkingKey] ?? false : undefined;
  allRenderItems.push({
    key: item.key,
    node: renderMessagePart(message, message.id, item.part, item.index, {
      content: assistantRenderModel.content,
      isStreaming,
      thinkingExpanded,
      onToggleThinking:
        item.part.type === 'thinking'
          ? () =>
              setExpandedThinkingKeys((current) => ({
                ...current,
                [thinkingKey]: !(current[thinkingKey] ?? false),
              }))
          : undefined,
    }),
    createdAt: item.part.createdAt,
    timelineOrder: item.timelineOrder,
    laneKind: item.kind === 'thinking_lane' ? 'thinking_lane' : 'answer_lane',
  });
});
```

- [ ] **Step 5: Push non-assistant parts and bubble cards into the same list**

Replace non-assistant `partRenderItems.push(...)` with `allRenderItems.push(...)`.

Replace:

```ts
const processRenderItems = sortMessageRenderItems(partRenderItems, bubbleRenderItems);
const timelineGroups = message.role === 'assistant' ? groupMessageRenderItemsByLane(processRenderItems) : [];
const hasVisibleContent = processRenderItems.length > 0 || answerRenderItems.length > 0;
```

with:

```ts
const timelineRenderItems = sortMessageRenderItems([...allRenderItems, ...bubbleRenderItems]);
const timelineGroups = message.role === 'assistant' ? groupMessageRenderItemsByLane(timelineRenderItems) : [];
const hasVisibleContent = timelineRenderItems.length > 0;
```

- [ ] **Step 6: Delete the standalone answer map**

Delete this render block entirely:

```tsx
{answerRenderItems.map((item) => (
  <div key={item.key} className="chat-message-bubble">
    <div className="chat-message-content chat-message-content-timeline">
      <React.Fragment key={item.key}>{item.node}</React.Fragment>
    </div>
  </div>
))}
```

- [ ] **Step 7: Update non-assistant rendering to use `timelineRenderItems`**

Replace:

```tsx
{processRenderItems.map((item) => (
```

with:

```tsx
{timelineRenderItems.map((item) => (
```

- [ ] **Step 8: Run ordering tests**

Run:

```bash
node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/message-timeline-ordering.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
```

Expected: PASS.

### Task 3: Stabilize Answer Completion Source And Component Identity

**Files:**
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Modify: `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChatAssistantParts.tsx`

- [ ] **Step 1: Add a stable-key render model test**

Add this test to `tests/ai/assistant-render-model.test.mjs`:

```js
test('assistant render model keeps the answer lane key stable across streaming and completion', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const message = {
    id: 'assistant_stable_key',
    role: 'assistant',
    timeline: [{ id: 'text_1', kind: 'text', content: 'Final answer.', createdAt: 20 }],
    createdAt: 1,
  };

  const streamingModel = buildAssistantRenderModel(message, undefined, 0, {
    streamingText: 'Final answer.',
    isStreaming: true,
  });
  const completedModel = buildAssistantRenderModel(message, undefined, 0, {
    streamingText: 'Final answer.',
    isStreaming: false,
  });

  assert.equal(
    streamingModel.items.find((item) => item.kind === 'answer_lane')?.key,
    completedModel.items.find((item) => item.kind === 'answer_lane')?.key,
  );
});
```

- [ ] **Step 2: Extend the source guard for final-message source preference**

Add these assertions to `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`:

```js
assert.match(source, /projection\.finalMessage\?\.text/);
assert.doesNotMatch(source, /finalizeParagraphStreamingState\(\s*currentParagraphState,\s*getAssistantTimelineText\(message\.timeline\),\s*\)/);
```

- [ ] **Step 3: Change the answer key in `assistantRenderModel.ts`**

Replace:

```ts
key: hasStreamingText ? `${message.id}-streaming-text` : `${message.id}-answer-text`,
```

with:

```ts
key: `${message.id}-answer-text`,
```

- [ ] **Step 4: Resolve final text from projection before persisted timeline**

In `src/components/workspace/AIChat.tsx`, add:

```ts
const resolveAssistantCompletionText = (
  projectionFinalText: string | undefined,
  timeline: AssistantTimelineEvent[],
) => {
  const projected = projectionFinalText?.trim();
  if (projected) {
    return projectionFinalText || '';
  }

  return getAssistantTimelineText(timeline);
};
```

Use it in the completion branch:

```ts
const finalText = resolveAssistantCompletionText(projection.finalMessage?.text, message.timeline);
const finalized = finalizeParagraphStreamingState(currentParagraphState, finalText);
nextDraft.streamingText = finalized.visibleText;
nextDraft.isStreaming = false;
```

- [ ] **Step 5: Keep final draft visible until persisted timeline catches up**

Replace completion cleanup:

```ts
resetParagraphStreamingState(message.id);
```

with:

```ts
if (getAssistantTimelineText(message.timeline) === nextDraft.streamingText) {
  resetParagraphStreamingState(message.id);
}
```

- [ ] **Step 6: Keep `AssistantTextBlock` DOM stable**

In `src/components/workspace/AIChatAssistantParts.tsx`, replace:

```tsx
{isStreaming ? (
  <div className="chat-answer-streaming-plain" aria-live="polite" aria-atomic="false">
    <span>{content}</span>
  </div>
) : (
  <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
    {content}
  </ReactMarkdown>
)}
```

with:

```tsx
<div className="chat-answer-markdown" aria-live={isStreaming ? 'polite' : undefined} aria-atomic="false">
  <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
    {content}
  </ReactMarkdown>
</div>
```

- [ ] **Step 7: Run render and source tests**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-paragraph-streaming-source.test.mjs
```

Expected: PASS.

### Task 4: Apply Paragraph Streaming To Thinking Content

**Files:**
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Create: `tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs`

- [ ] **Step 1: Extend the render model type with UI-only reasoning visibility**

In `src/components/workspace/assistantRenderModel.ts`, extend `AssistantDraftState`:

```ts
export type AssistantDraftState = {
  timeline: AssistantTimelineEvent[];
  streamingText?: string;
  isStreaming?: boolean;
  streamingReasoningTextByEventId?: Record<string, string>;
};
```

- [ ] **Step 2: Use visible reasoning text without changing timeline truth**

Replace reasoning part content:

```ts
content: event.content,
```

with:

```ts
content: draftState?.streamingReasoningTextByEventId?.[event.id] ?? event.content,
```

- [ ] **Step 3: Add a render-model test for UI-only thinking visibility**

Add this test to `tests/ai/assistant-render-model.test.mjs`:

```js
test('assistant render model can show buffered thinking text without mutating timeline content', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const timeline = [
    {
      id: 'reasoning_1',
      kind: 'reasoning',
      content: 'First thought. Hidden unfinished fragment',
      collapsed: true,
      status: 'streaming',
      createdAt: 10,
    },
  ];

  const model = buildAssistantRenderModel(
    { id: 'assistant_reasoning_buffered', role: 'assistant', timeline, createdAt: 1 },
    {
      timeline,
      isStreaming: true,
      streamingReasoningTextByEventId: {
        reasoning_1: 'First thought.',
      },
    },
  );

  assert.equal(model.items[0]?.part.content, 'First thought.');
  assert.equal(timeline[0].content, 'First thought. Hidden unfinished fragment');
});
```

- [ ] **Step 4: Add source guard for thinking paragraph buffers**

Create `tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('AIChat maintains UI-only paragraph buffers for streaming reasoning events', async () => {
  const source = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.match(source, /streamingReasoningTextByEventId/);
  assert.match(source, /reasoningParagraphStreamingStateByEventIdRef/);
  assert.match(source, /event\.kind === 'reasoning'/);
  assert.doesNotMatch(source, /event\.content\s*=\s*advanceParagraphStreamingState/);
});
```

- [ ] **Step 5: Add reasoning paragraph refs in `AIChat.tsx`**

Add near the existing paragraph refs:

```ts
const reasoningParagraphStreamingStateByEventIdRef = useRef<Record<string, ParagraphStreamingState>>({});
```

- [ ] **Step 6: Build visible reasoning text in `effectiveDraftContents`**

Inside the assistant message loop in `effectiveDraftContents`, after `nextDraft` is initialized, add:

```ts
const streamingReasoningTextByEventId: Record<string, string> = {};
nextDraft.timeline.forEach((event) => {
  if (event.kind !== 'reasoning' || event.status !== 'streaming') {
    return;
  }

  const currentReasoningState =
    reasoningParagraphStreamingStateByEventIdRef.current[event.id] ?? createParagraphStreamingState();
  const nextReasoningState = advanceParagraphStreamingState(
    currentReasoningState,
    event.content,
    Date.now(),
  );
  reasoningParagraphStreamingStateByEventIdRef.current = {
    ...reasoningParagraphStreamingStateByEventIdRef.current,
    [event.id]: nextReasoningState,
  };
  streamingReasoningTextByEventId[event.id] = nextReasoningState.visibleText;
});

if (Object.keys(streamingReasoningTextByEventId).length > 0) {
  nextDraft.streamingReasoningTextByEventId = streamingReasoningTextByEventId;
}
```

- [ ] **Step 7: Finalize reasoning paragraph buffers when reasoning completes**

Add after the streaming reasoning loop:

```ts
nextDraft.timeline.forEach((event) => {
  if (event.kind !== 'reasoning' || event.status === 'streaming') {
    return;
  }

  const currentReasoningState = reasoningParagraphStreamingStateByEventIdRef.current[event.id];
  if (!currentReasoningState) {
    return;
  }

  const finalized = finalizeParagraphStreamingState(currentReasoningState, event.content);
  streamingReasoningTextByEventId[event.id] = finalized.visibleText;
  delete reasoningParagraphStreamingStateByEventIdRef.current[event.id];
});
```

- [ ] **Step 8: Run thinking tests**

Run:

```bash
node --test tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs
```

Expected: PASS.

### Task 5: Add Completion 收口 State

**Files:**
- Modify: `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`
- Modify: `src/components/workspace/timeline/TimelineCard.tsx`
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`
- Modify: `tests/ai/gn-agent-message-flow-source.test.mjs`

- [ ] **Step 1: Add a timeline model test for response completion summary**

Add this test to `tests/ai/ai-chat-timeline-view.test.mjs`:

```js
test('chat timeline keeps one compact completed response summary card', async () => {
  const { buildChatTimelineBubbleCards } = await import(
    `../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`
  );

  const cards = buildChatTimelineBubbleCards({
    runId: 'run-1',
    status: 'completed',
    events: [],
    activeMessage: null,
    finalMessage: { messageId: 'assistant-1', text: 'Final answer ready.', completedAt: 60 },
    cards: [
      {
        cardId: 'card_response',
        phase: 'response',
        title: 'Response',
        summary: 'Final answer ready.',
        status: 'completed',
        startedAt: 20,
        endedAt: 60,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: [],
        interactionRefs: [],
      },
    ],
  });

  assert.deepEqual(
    cards.map((card) => [card.card.phase, card.createdAt, card.card.summary]),
    [['response', 60, 'Final answer ready.']],
  );
});
```

- [ ] **Step 2: Stop suppressing completed response cards**

In `src/components/workspace/timeline/chatTimelineBubbleCardModel.ts`, replace:

```ts
const SUPPRESSED_CHAT_TIMELINE_PHASES = new Set(['intake', 'approval', 'question', 'response']);
```

with:

```ts
const SUPPRESSED_CHAT_TIMELINE_PHASES = new Set(['intake', 'approval', 'question']);
```

Filter response cards so only completed cards are shown:

```ts
if (card.phase === 'response' && card.status !== 'completed') {
  return [];
}
```

Use completion time for response cards:

```ts
createdAt: card.phase === 'response' && typeof card.endedAt === 'number'
  ? card.endedAt
  : card.startedAt,
timelineOrder: card.phase === 'response' ? Number.MAX_SAFE_INTEGER : index,
```

- [ ] **Step 3: Add finished time display in `TimelineCard.tsx`**

Add this helper near the labels:

```ts
const formatCompactTime = (value: number) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
```

Add this next to the status:

```tsx
{card.status === 'completed' && typeof card.endedAt === 'number' ? (
  <>
    <span aria-hidden="true" className="chat-timeline-card-divider">
      ·
    </span>
    <span className="chat-timeline-card-meta">{formatCompactTime(card.endedAt)} 完成</span>
  </>
) : null}
```

- [ ] **Step 4: Auto-collapse process groups when assistant is completed**

In `src/components/ai/gn-agent/GNAgentMessageItem.tsx`, compute:

```ts
const hasCompletedAnswer =
  message.role === 'assistant' &&
  !isStreaming &&
  Boolean(assistantRenderModel?.content.trim());
```

Pass collapsed default for completed thinking:

```ts
const thinkingExpanded =
  item.part.type === 'thinking'
    ? expandedThinkingKeys[thinkingKey] ?? !hasCompletedAnswer
    : undefined;
```

This keeps active thinking open enough to feel alive, then folds it once the answer is completed.

- [ ] **Step 5: Add source guard for completed collapse behavior**

Add to `tests/ai/gn-agent-message-flow-source.test.mjs`:

```js
test('GN Agent message item auto-collapses thinking after the answer completes', async () => {
  const messageItemSource = await readFile(messageItemPath, 'utf8');

  assert.match(messageItemSource, /const hasCompletedAnswer =/);
  assert.match(messageItemSource, /expandedThinkingKeys\[thinkingKey\]\s*\?\?\s*!hasCompletedAnswer/);
});
```

- [ ] **Step 6: Run completion UI tests**

Run:

```bash
node --test tests/ai/ai-chat-timeline-view.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs
```

Expected: PASS.

### Task 6: Tune Paragraph Flush Behavior So It Feels Fast But Not Token-Level

**Files:**
- Modify: `src/components/workspace/assistantParagraphStreaming.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/assistant-paragraph-streaming.test.mjs`

- [ ] **Step 1: Add tests for no reset-on-every-token timeout starvation**

Add this test to `tests/ai/assistant-paragraph-streaming.test.mjs`:

```js
test('timeout flush appends pending text instead of replacing already visible text', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'First sentence. unfinished', 1000);
  state = advanceParagraphStreamingState(state, 'First sentence. unfinished chunk', 1300, {
    forceTimeoutFlush: true,
  });

  assert.equal(state.visibleText, 'First sentence. unfinished chunk');
  assert.equal(state.pendingText, '');
});
```

- [ ] **Step 2: Add `lastInputAt` to paragraph state**

In `assistantParagraphStreaming.ts`, extend the type:

```ts
lastInputAt: number | null;
```

Initialize:

```ts
lastInputAt: null,
```

Set `lastInputAt: now` in every return path from `advanceParagraphStreamingState`.

- [ ] **Step 3: Schedule timeout from first pending text, not every token**

In `AIChat.tsx`, replace unconditional timeout clearing/rescheduling with:

```ts
if (nextParagraphState.pendingText.trim().length > 0) {
  const hasExistingTimeout = paragraphStreamingTimeoutsRef.current[message.id] !== undefined;
  if (!hasExistingTimeout) {
    scheduleParagraphStreamingTimeout(message.id, projection.activeMessage.text, nextDraft.timeline);
  }
} else {
  clearParagraphStreamingTimeout(message.id);
}
```

Inside the timeout callback, read the latest raw text from a ref instead of the stale scheduled argument:

```ts
const latestRawText = paragraphStreamingLatestRawTextByMessageIdRef.current[messageId] ?? rawText;
const nextState = advanceParagraphStreamingState(currentState, latestRawText, Date.now(), {
  forceTimeoutFlush: true,
});
```

- [ ] **Step 4: Reduce the timeout to a perceptually faster paragraph reveal**

Replace:

```ts
const PARAGRAPH_STREAMING_TIMEOUT_MS = 220;
```

with:

```ts
const PARAGRAPH_STREAMING_TIMEOUT_MS = 140;
```

- [ ] **Step 5: Run paragraph tests**

Run:

```bash
node --test tests/ai/assistant-paragraph-streaming.test.mjs tests/ai/ai-chat-paragraph-streaming-source.test.mjs
```

Expected: PASS.

### Task 7: Full Targeted Verification And Graph Refresh

**Files:**
- Modify: `graphify-out/*` only if `graphify update .` succeeds.

- [ ] **Step 1: Run all touched AI chat tests**

Run:

```bash
node --test tests/ai/assistant-paragraph-streaming.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/ai-chat-thinking-paragraph-streaming-source.test.mjs tests/ai/gn-agent-message-item.test.mjs tests/ai/message-timeline-ordering.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-timeline-view.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run broader runtime/display regression tests**

Run:

```bash
node --test tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/runtime-timeline-composer.test.mjs tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-sidecar-streaming.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run build if targeted tests pass**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Refresh graphify output**

Run:

```bash
graphify update .
```

Expected: PASS. If Windows still reports `Invalid argument: 'graphify-out\\graph.json'`, record that exact blocker in the final implementation note and do not hand-edit graph output.

- [ ] **Step 5: Final review checklist**

Verify these exact properties before marking complete:

```text
1. No `answerRenderItems` remains in GNAgentMessageItem.tsx.
2. No source test expects the answer lane to render after process groups.
3. Answer lane key does not switch between streaming and completed states.
4. Completion text prefers projection.finalMessage.text before persisted timeline fallback.
5. Thinking has UI-only paragraph buffering and does not mutate timeline reasoning content.
6. Completed response summary card appears once and includes finished time.
7. Runtime adapter, canonical event protocol, and persisted timeline semantics are unchanged.
```

## Self-Review

- Spec coverage: covers paragraph streaming for body and thinking, fixes visual time ordering, removes draft/final re-display behavior, and adds completion收口 with collapse, time, and summary.
- Placeholder scan: no `TBD`, `TODO`, or unspecified "write tests" steps remain.
- Type consistency: `streamingReasoningTextByEventId`, `reasoningParagraphStreamingStateByEventIdRef`, stable answer key, and `sortMessageRenderItems(renderItems)` are named consistently across tests and implementation steps.
