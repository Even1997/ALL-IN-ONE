# AI Chat Paragraph Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant answer area stream in sentence/paragraph-sized chunks like Claude/Codex, without re-showing a separate final answer and without changing runtime truth.

**Architecture:** Keep provider adapters, canonical events, and timeline projection unchanged. Implement paragraph streaming entirely in the UI/render path by buffering `projection.activeMessage.text`, flushing on sentence/paragraph boundaries or a short timeout, and flushing any remainder exactly once on completion. This preserves the architecture boundary documented in `docs/superpowers/specs/2026-05-10-agent-timeline-event-protocol-design.md`.

**Tech Stack:** React, TypeScript, Zustand, Node test runner (`node --test`)

---

## File Structure

- Create: `src/components/workspace/assistantParagraphStreaming.ts`
  Responsibility: pure paragraph-streaming state machine for visible assistant text.
- Create: `tests/ai/assistant-paragraph-streaming.test.mjs`
  Responsibility: lock the paragraph/timeout/code-fence rules with pure unit tests.
- Modify: `src/components/workspace/AIChat.tsx`
  Responsibility: replace direct per-chunk visible text updates with buffered paragraph streaming in the assistant answer lane.
- Modify: `tests/ai/assistant-render-model.test.mjs`
  Responsibility: keep the render-model contract explicit: one answer lane, no duplicate final answer behavior.
- Create: `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`
  Responsibility: protect the integration point so `AIChat.tsx` no longer directly mirrors raw `projection.activeMessage.text` into visible text every frame.

### Task 1: Lock The Paragraph Streaming Rules With Failing Tests

**Files:**
- Create: `tests/ai/assistant-paragraph-streaming.test.mjs`
- Create: `src/components/workspace/assistantParagraphStreaming.ts`

- [ ] **Step 1: Write the failing test file**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadModule = async () =>
  import(`../../src/components/workspace/assistantParagraphStreaming.ts?test=${Date.now()}`);

test('flushes completed sentences without waiting for final completion', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'First sentence. Half', 1000);

  assert.equal(state.visibleText, 'First sentence.');
  assert.equal(state.pendingText, ' Half');
  assert.equal(state.isComplete, false);
});

test('flushes pending content after timeout when no sentence boundary arrives', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'This is a long fragment', 1000);
  state = advanceParagraphStreamingState(state, 'This is a long fragment', 1240, { forceTimeoutFlush: true });

  assert.equal(state.visibleText, 'This is a long fragment');
  assert.equal(state.pendingText, '');
});

test('treats blank-line boundaries as paragraph flushes', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'Intro line.\n\nNext paragraph starts', 1000);

  assert.equal(state.visibleText, 'Intro line.\n\n');
  assert.equal(state.pendingText, 'Next paragraph starts');
});

test('does not flush partial fenced code blocks mid-line', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, '```ts\nconst value = 1', 1000);

  assert.equal(state.visibleText, '');
  assert.equal(state.pendingText, '```ts\nconst value = 1');
});

test('flushes all remaining content once on completion without duplicating text', async () => {
  const {
    createParagraphStreamingState,
    advanceParagraphStreamingState,
    finalizeParagraphStreamingState,
  } = await loadModule();

  let state = createParagraphStreamingState();
  state = advanceParagraphStreamingState(state, 'First sentence. Half', 1000);
  state = finalizeParagraphStreamingState(state, 'First sentence. Half finished');

  assert.equal(state.visibleText, 'First sentence. Half finished');
  assert.equal(state.pendingText, '');
  assert.equal(state.isComplete, true);
});
```

- [ ] **Step 2: Run the new test file to verify it fails**

Run: `node --test tests/ai/assistant-paragraph-streaming.test.mjs`

Expected: FAIL with an import or missing-export error for `assistantParagraphStreaming.ts`

- [ ] **Step 3: Create the minimal module surface so the tests can compile**

```ts
export type ParagraphStreamingState = {
  rawText: string;
  visibleText: string;
  pendingText: string;
  lastFlushAt: number | null;
  isComplete: boolean;
};

export const createParagraphStreamingState = (): ParagraphStreamingState => ({
  rawText: '',
  visibleText: '',
  pendingText: '',
  lastFlushAt: null,
  isComplete: false,
});

export const advanceParagraphStreamingState = (
  state: ParagraphStreamingState,
  nextRawText: string,
  now: number,
  _options?: { forceTimeoutFlush?: boolean },
): ParagraphStreamingState => ({
  ...state,
  rawText: nextRawText,
});

export const finalizeParagraphStreamingState = (
  state: ParagraphStreamingState,
  finalText: string,
): ParagraphStreamingState => ({
  ...state,
  rawText: finalText,
  visibleText: finalText,
  pendingText: '',
  isComplete: true,
});
```

- [ ] **Step 4: Run the test again to verify the behavior still fails**

Run: `node --test tests/ai/assistant-paragraph-streaming.test.mjs`

Expected: FAIL on the sentence/paragraph/code-fence assertions, proving the behavior is not implemented yet

- [ ] **Step 5: Commit the failing-test checkpoint**

```bash
git add tests/ai/assistant-paragraph-streaming.test.mjs src/components/workspace/assistantParagraphStreaming.ts
git commit -m "test: lock paragraph streaming rules"
```

### Task 2: Implement The Pure Paragraph Streaming State Machine

**Files:**
- Modify: `src/components/workspace/assistantParagraphStreaming.ts`
- Test: `tests/ai/assistant-paragraph-streaming.test.mjs`

- [ ] **Step 1: Implement sentence, paragraph, timeout, and code-fence boundary detection**

```ts
const PARAGRAPH_BOUNDARY_RE = /\n\s*\n/;
const CODE_FENCE_RE = /```/g;

const isInsideCodeFence = (text: string) => {
  const matches = text.match(CODE_FENCE_RE);
  return Boolean(matches && matches.length % 2 === 1);
};

const findFlushIndex = (buffer: string) => {
  if (!buffer) {
    return -1;
  }

  if (isInsideCodeFence(buffer)) {
    const lastNewline = buffer.lastIndexOf('\n');
    return lastNewline >= 0 ? lastNewline + 1 : -1;
  }

  const paragraphMatch = buffer.match(PARAGRAPH_BOUNDARY_RE);
  if (paragraphMatch?.index !== undefined) {
    return paragraphMatch.index + paragraphMatch[0].length;
  }

  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const char = buffer[index];
    if ('\u3002\uFF01\uFF1F!?'.includes(char)) {
      return index + 1;
    }
    if (char === '.' && /(^|\s)[A-Za-z0-9]/.test(buffer.slice(Math.max(0, index - 3), index + 2))) {
      return index + 1;
    }
  }

  return -1;
};
```

- [ ] **Step 2: Implement state advancement against the full projected raw text**

```ts
export const advanceParagraphStreamingState = (
  state: ParagraphStreamingState,
  nextRawText: string,
  now: number,
  options?: { forceTimeoutFlush?: boolean },
): ParagraphStreamingState => {
  const appended = nextRawText.startsWith(state.rawText)
    ? nextRawText.slice(state.rawText.length)
    : nextRawText;
  const nextPending = `${state.pendingText}${appended}`;
  const flushIndex = findFlushIndex(nextPending);
  const shouldTimeoutFlush = options?.forceTimeoutFlush && nextPending.trim().length > 0;

  if (flushIndex >= 0) {
    const flushed = nextPending.slice(0, flushIndex);
    const remaining = nextPending.slice(flushIndex);
    return {
      rawText: nextRawText,
      visibleText: `${state.visibleText}${flushed}`,
      pendingText: remaining,
      lastFlushAt: now,
      isComplete: false,
    };
  }

  if (shouldTimeoutFlush) {
    return {
      rawText: nextRawText,
      visibleText: `${state.visibleText}${nextPending}`,
      pendingText: '',
      lastFlushAt: now,
      isComplete: false,
    };
  }

  return {
    ...state,
    rawText: nextRawText,
    pendingText: nextPending,
  };
};
```

- [ ] **Step 3: Make completion flush the remainder exactly once**

```ts
export const finalizeParagraphStreamingState = (
  state: ParagraphStreamingState,
  finalText: string,
): ParagraphStreamingState => {
  if (state.visibleText === finalText && state.pendingText.length === 0) {
    return {
      ...state,
      rawText: finalText,
      isComplete: true,
    };
  }

  return {
    rawText: finalText,
    visibleText: finalText,
    pendingText: '',
    lastFlushAt: state.lastFlushAt,
    isComplete: true,
  };
};
```

- [ ] **Step 4: Run the paragraph-streaming test file**

Run: `node --test tests/ai/assistant-paragraph-streaming.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit the utility implementation**

```bash
git add src/components/workspace/assistantParagraphStreaming.ts tests/ai/assistant-paragraph-streaming.test.mjs
git commit -m "feat: add assistant paragraph streaming state machine"
```

### Task 3: Integrate Paragraph Streaming Into `AIChat.tsx`

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Create: `tests/ai/ai-chat-paragraph-streaming-source.test.mjs`

- [ ] **Step 1: Write the integration guard test before editing `AIChat.tsx`**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat uses paragraph streaming helpers instead of mirroring projection text directly', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /assistantParagraphStreaming/);
  assert.match(source, /finalizeParagraphStreamingState/);
  assert.doesNotMatch(source, /nextDraft\.streamingText = projection\.activeMessage\.text;/);
});
```

- [ ] **Step 2: Run the source test to verify it fails**

Run: `node --test tests/ai/ai-chat-paragraph-streaming-source.test.mjs`

Expected: FAIL because `AIChat.tsx` still assigns `projection.activeMessage.text` directly

- [ ] **Step 3: Add paragraph-streaming refs, timeout scheduling, and completion flushes inside `AIChat.tsx`**

```ts
import {
  createParagraphStreamingState,
  advanceParagraphStreamingState,
  finalizeParagraphStreamingState,
  type ParagraphStreamingState,
} from './assistantParagraphStreaming.ts';

const PARAGRAPH_STREAMING_TIMEOUT_MS = 220;

const paragraphStreamingStateByMessageIdRef = useRef<Record<string, ParagraphStreamingState>>({});
const paragraphStreamingTimeoutsRef = useRef<Record<string, number>>({});

const scheduleParagraphStreamingTimeout = useCallback((messageId: string, rawText: string) => {
  window.clearTimeout(paragraphStreamingTimeoutsRef.current[messageId]);
  paragraphStreamingTimeoutsRef.current[messageId] = window.setTimeout(() => {
    const current = paragraphStreamingStateByMessageIdRef.current[messageId] ?? createParagraphStreamingState();
    const next = advanceParagraphStreamingState(current, rawText, Date.now(), { forceTimeoutFlush: true });
    paragraphStreamingStateByMessageIdRef.current[messageId] = next;
    pushStreamingDraft(messageId, {
      ...streamingDraftBufferRef.current[messageId],
      streamingText: next.visibleText,
      isStreaming: true,
    });
    flushStreamingDraftContentsNow();
  }, PARAGRAPH_STREAMING_TIMEOUT_MS);
}, [flushStreamingDraftContentsNow, pushStreamingDraft]);
```

- [ ] **Step 4: Replace direct visible-text mirroring with buffered visible text**

```ts
if (projection.activeMessage) {
  const currentParagraphState =
    paragraphStreamingStateByMessageIdRef.current[message.id] ?? createParagraphStreamingState();
  const nextParagraphState = advanceParagraphStreamingState(
    currentParagraphState,
    projection.activeMessage.text,
    Date.now(),
  );

  paragraphStreamingStateByMessageIdRef.current[message.id] = nextParagraphState;
  nextDraft.isStreaming = true;
  nextDraft.streamingText = nextParagraphState.visibleText;

  if (nextParagraphState.pendingText.trim().length > 0) {
    scheduleParagraphStreamingTimeout(message.id, projection.activeMessage.text);
  }
} else {
  const currentParagraphState = paragraphStreamingStateByMessageIdRef.current[message.id];
  if (currentParagraphState) {
    const finalized = finalizeParagraphStreamingState(currentParagraphState, getAssistantTimelineText(message.timeline));
    paragraphStreamingStateByMessageIdRef.current[message.id] = finalized;
    nextDraft.streamingText = finalized.visibleText;
  }
  nextDraft.isStreaming = false;
}
```

- [ ] **Step 5: Flush and clear helper state on stop, error, and success cleanup**

```ts
const resetParagraphStreamingState = (messageId: string) => {
  window.clearTimeout(paragraphStreamingTimeoutsRef.current[messageId]);
  delete paragraphStreamingTimeoutsRef.current[messageId];
  delete paragraphStreamingStateByMessageIdRef.current[messageId];
};

clearStreamingDraft(assistantMessage.id);
resetParagraphStreamingState(assistantMessage.id);
```

- [ ] **Step 6: Run the new source test**

Run: `node --test tests/ai/ai-chat-paragraph-streaming-source.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit the UI integration**

```bash
git add src/components/workspace/AIChat.tsx tests/ai/ai-chat-paragraph-streaming-source.test.mjs
git commit -m "feat: stream assistant answers by paragraph"
```

### Task 4: Reconfirm The Render Contract And Prevent Final-Answer Duplication

**Files:**
- Modify: `tests/ai/assistant-render-model.test.mjs`
- Test: `tests/ai/assistant-render-model.test.mjs`

- [ ] **Step 1: Add a render-model regression test for non-duplicated completion**

```js
test('assistant render model shows the buffered answer lane once when streaming finishes', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const model = buildAssistantRenderModel({
    id: 'assistant_stream_done',
    role: 'assistant',
    timeline: [
      { id: 'text_1', kind: 'text', content: 'First sentence.', createdAt: 1 },
      { id: 'text_2', kind: 'text', content: 'Second sentence.', createdAt: 2 },
    ],
    createdAt: 1,
  }, undefined, 0, {
    streamingText: 'First sentence.\n\nSecond sentence.',
    isStreaming: false,
  });

  assert.deepEqual(
    model.items.filter((item) => item.kind === 'answer_lane').map((item) => item.part.content),
    ['First sentence.\n\nSecond sentence.'],
  );
});
```

- [ ] **Step 2: Run the render-model test file**

Run: `node --test tests/ai/assistant-render-model.test.mjs`

Expected: PASS

- [ ] **Step 3: Commit the render contract protection**

```bash
git add tests/ai/assistant-render-model.test.mjs
git commit -m "test: protect paragraph streaming render contract"
```

### Task 5: Run Targeted Verification And Update The Knowledge Graph

**Files:**
- Modify: `graphify-out/*` via graph refresh after code changes

- [ ] **Step 1: Run the targeted streaming tests together**

Run: `node --test tests/ai/assistant-paragraph-streaming.test.mjs tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/assistant-render-model.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the existing timeline/runtime regression tests that cover answer-lane behavior**

Run: `node --test tests/ai/runtime-timeline-composer.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the project graph update after the code changes are complete**

Run: `graphify update .`

Expected: output indicating the graph was incrementally refreshed

- [ ] **Step 4: Commit the final verified change**

```bash
git add src/components/workspace/AIChat.tsx src/components/workspace/assistantParagraphStreaming.ts tests/ai/assistant-paragraph-streaming.test.mjs tests/ai/ai-chat-paragraph-streaming-source.test.mjs tests/ai/assistant-render-model.test.mjs graphify-out
git commit -m "feat: add paragraph-style assistant streaming"
```

## Self-Review

- Spec coverage: the plan keeps the change in the UI/render layer, adds sentence/paragraph/code-fence rules, avoids final-answer duplication, and preserves runtime/timeline truth.
- Placeholder scan: no `TODO`/`TBD` markers remain; every task names exact files and commands.
- Type consistency: the planned helper API uses one naming scheme throughout: `createParagraphStreamingState`, `advanceParagraphStreamingState`, and `finalizeParagraphStreamingState`.
