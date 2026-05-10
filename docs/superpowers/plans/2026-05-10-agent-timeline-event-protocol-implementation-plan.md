# Agent Timeline Event Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed assistant/runtime timeline rendering path with canonical runtime events, an incremental timeline composer, and a summary-first UI timeline that works across providers.

**Architecture:** Add a provider-agnostic canonical event protocol in `@goodnight/runtime-protocol`, translate built-in runtime/provider output into canonical events, persist those events in the chat session store, and derive a stable timeline projection from them. Keep `StoredChatMessage` as the conversation unit, but move process rendering to canonical-event-driven projections instead of raw mixed assistant timeline entries.

**Tech Stack:** TypeScript, React 19, Zustand, Tauri desktop app shell, workspace packages `@goodnight/runtime-protocol` and `@goodnight/runtime-client`, Node `node:test`-style test files under `tests/`.

---

## File Structure Map

### New files

- `packages/runtime-protocol/src/canonicalEvents.ts`
  Defines canonical event types, payloads, helper constants, and small type guards.
- `packages/runtime-protocol/src/canonicalEventValidators.ts`
  Runtime validation helpers for canonical events.
- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
  Maps current built-in runtime/provider events into canonical events.
- `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
  Projection types for cards, active message state, and composer state.
- `src/modules/ai/runtime/composer/timelineComposer.ts`
  Incremental state machine that appends canonical events and updates projection.
- `src/components/workspace/timeline/TimelineView.tsx`
  Top-level timeline renderer.
- `src/components/workspace/timeline/TimelineCard.tsx`
  Summary-first card UI.
- `src/components/workspace/timeline/TimelineDetailDrawer.tsx`
  Collapsible details for commands, stderr, file changes, and raw output.
- `tests/ai/runtime-canonical-events.test.mjs`
  Protocol and validator tests.
- `tests/ai/runtime-timeline-composer.test.mjs`
  Composer behavior tests.
- `tests/ai/runtime-canonical-store.test.mjs`
  Store persistence and restore tests.
- `tests/ai/ai-chat-timeline-view.test.mjs`
  Timeline UI source/render boundary tests.

### Existing files to modify

- `packages/runtime-protocol/src/index.ts`
  Re-export canonical event modules without breaking existing consumers.
- `src/modules/ai/store/aiChatStore.ts`
  Persist canonical event logs per session and expose append/select helpers.
- `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
  Keep raw provider event types, but document their relationship to canonical events.
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
  Feed streaming output through canonical adapters and composer-friendly state.
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`
  Add append-canonical-event and projection update hooks.
- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
  Surface active canonical projections for the chat view.
- `src/components/workspace/AIChat.tsx`
  Switch the active assistant process rendering path to timeline projections.
- `src/components/workspace/AIChatConversationMessagesPane.tsx`
  Render projection-backed timeline cards instead of mixed legacy runtime cards.
- `src/components/workspace/runtimeEventRenderModel.ts`
  Keep as compatibility-only during migration, then shrink/remove from primary path.
- `src/components/workspace/assistantRenderModel.ts`
  Stop treating visible reasoning text as a first-class default lane.

### Existing files to inspect while implementing

- `src/modules/ai/runtime/dispatch/agentEvents.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- `src/modules/ai/runtime/orchestration/runtimeTurnOutcomeFlow.ts`
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- `tests/ai/runtime-provider-events.test.mjs`
- `tests/ai/assistant-timeline-events.test.mjs`

## Task 1: Add the canonical event protocol package surface

**Files:**
- Create: `packages/runtime-protocol/src/canonicalEvents.ts`
- Create: `packages/runtime-protocol/src/canonicalEventValidators.ts`
- Modify: `packages/runtime-protocol/src/index.ts`
- Test: `tests/ai/runtime-canonical-events.test.mjs`

- [ ] **Step 1: Write the failing protocol test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadProtocol = async () =>
  import(`../../packages/runtime-protocol/src/index.ts?test=${Date.now()}`);

test('canonical event protocol exports stable event types and validator', async () => {
  const {
    CANONICAL_EVENT_TYPES,
    assertCanonicalEvent,
  } = await loadProtocol();

  assert.equal(Array.isArray(CANONICAL_EVENT_TYPES), true);
  assert.equal(CANONICAL_EVENT_TYPES.includes('tool.started'), true);

  assert.doesNotThrow(() =>
    assertCanonicalEvent({
      eventId: 'evt_1',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'progress.updated',
      ts: Date.now(),
      seq: 1,
      source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
      payload: { label: '正在检查项目结构' },
    }),
  );
});

test('canonical event validator rejects malformed tool completion payloads', async () => {
  const { assertCanonicalEvent } = await loadProtocol();

  assert.throws(
    () =>
      assertCanonicalEvent({
        eventId: 'evt_2',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'tool.completed',
        ts: Date.now(),
        seq: 2,
        source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
        payload: { ok: true },
      }),
    /toolCallId/i,
  );
});
```

- [ ] **Step 2: Run the protocol test and confirm it fails**

Run:

```powershell
node --test tests/ai/runtime-canonical-events.test.mjs
```

Expected:

```text
FAIL ... Cannot find module '../../packages/runtime-protocol/src/index.ts'
```

- [ ] **Step 3: Add canonical event types**

Create `packages/runtime-protocol/src/canonicalEvents.ts`:

```ts
export const CANONICAL_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'message.started',
  'message.delta',
  'message.completed',
  'progress.updated',
  'tool.started',
  'tool.stdout',
  'tool.stderr',
  'tool.completed',
  'approval.requested',
  'approval.resolved',
  'question.requested',
  'question.answered',
  'retry.scheduled',
  'warning.raised',
  'error.raised',
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export type EventStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type EventSource = {
  kind: 'user' | 'model' | 'tool' | 'system' | 'runtime';
  provider?: string;
  name?: string;
};

export type ToolCompletedPayload = {
  toolCallId: string;
  ok: boolean;
  exitCode?: number | null;
  durationMs?: number;
  summary?: string;
  outputText?: string;
  fileChanges?: Array<{
    path: string;
    operation?: 'write' | 'edit' | 'delete';
    beforeContent: string | null;
    afterContent: string | null;
    verified?: boolean;
  }>;
};

export type CanonicalEventPayload =
  | { providerId: string; threadId?: string | null; parentRunId?: string | null; mode?: 'chat' | 'agent' | 'team' }
  | { outcome: 'success' | 'failed' | 'cancelled'; summary?: string; tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }
  | { role: 'assistant' }
  | { textChunk: string }
  | { finalText: string }
  | { label: string; detail?: string; scope?: 'system' | 'phase' | 'tool'; importance?: 'low' | 'normal' | 'high' }
  | { toolCallId: string; parentToolCallId?: string | null; toolName: string; displayName?: string; inputSummary?: string; input?: Record<string, unknown> }
  | { toolCallId: string; chunk: string }
  | ToolCompletedPayload
  | { approvalId: string; toolCallId?: string | null; actionType: string; riskLevel: 'low' | 'medium' | 'high'; summary: string; display?: Record<string, unknown> }
  | { approvalId: string; resolution: 'approved' | 'denied' }
  | { questionId: string; toolCallId?: string | null; questions: Array<{ id?: string; header?: string; question: string; options?: Array<{ label: string; description?: string }> }> }
  | { questionId: string; answers: Record<string, string> }
  | { attempt: number; reason: string; targetType?: 'tool' | 'provider' | 'run'; targetId?: string | null }
  | { code: string; summary: string }
  | { code: string; summary: string; retryable?: boolean; source?: 'runtime' | 'tool' | 'provider'; detail?: string };

export type CanonicalEvent = {
  eventId: string;
  runId: string;
  turnId: string;
  sessionId: string;
  messageId?: string | null;
  parentEventId?: string | null;
  correlationId?: string | null;
  type: CanonicalEventType;
  ts: number;
  seq: number;
  status?: EventStatus;
  source: EventSource;
  payload: CanonicalEventPayload;
  providerMeta?: Record<string, unknown>;
};

export const isCanonicalEventType = (value: string): value is CanonicalEventType =>
  CANONICAL_EVENT_TYPES.includes(value as CanonicalEventType);
```

- [ ] **Step 4: Add validator helpers and exports**

Create `packages/runtime-protocol/src/canonicalEventValidators.ts`:

```ts
import type { CanonicalEvent } from './canonicalEvents.ts';

const assertObject = (value: unknown, label: string): asserts value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

export const assertCanonicalEvent = (value: unknown): asserts value is CanonicalEvent => {
  assertObject(value, 'Canonical event');

  if (typeof value.eventId !== 'string' || !value.eventId) throw new Error('eventId is required');
  if (typeof value.runId !== 'string' || !value.runId) throw new Error('runId is required');
  if (typeof value.turnId !== 'string' || !value.turnId) throw new Error('turnId is required');
  if (typeof value.sessionId !== 'string' || !value.sessionId) throw new Error('sessionId is required');
  if (typeof value.type !== 'string' || !value.type) throw new Error('type is required');
  if (typeof value.ts !== 'number') throw new Error('ts must be a number');
  if (typeof value.seq !== 'number') throw new Error('seq must be a number');

  assertObject(value.source, 'source');
  assertObject(value.payload, 'payload');

  if (value.type === 'tool.completed' && typeof value.payload.toolCallId !== 'string') {
    throw new Error('tool.completed payload.toolCallId is required');
  }
  if (value.type === 'message.delta' && typeof value.payload.textChunk !== 'string') {
    throw new Error('message.delta payload.textChunk is required');
  }
  if (value.type === 'progress.updated' && typeof value.payload.label !== 'string') {
    throw new Error('progress.updated payload.label is required');
  }
};
```

Update `packages/runtime-protocol/src/index.ts`:

```ts
export * from './canonicalEvents.ts';
export * from './canonicalEventValidators.ts';
```

- [ ] **Step 5: Run targeted tests and package build**

Run:

```powershell
node --test tests/ai/runtime-canonical-events.test.mjs
npm run build --workspace @goodnight/runtime-protocol
```

Expected:

```text
PASS tests/ai/runtime-canonical-events.test.mjs
... @goodnight/runtime-protocol build completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add packages/runtime-protocol/src/canonicalEvents.ts packages/runtime-protocol/src/canonicalEventValidators.ts packages/runtime-protocol/src/index.ts tests/ai/runtime-canonical-events.test.mjs
git commit -m "feat: add canonical runtime event protocol"
```

## Task 2: Build the incremental timeline composer

**Files:**
- Create: `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- Create: `src/modules/ai/runtime/composer/timelineComposer.ts`
- Modify: `src/modules/ai/runtime/timeline/timelineMappers.ts`
- Test: `tests/ai/runtime-timeline-composer.test.mjs`

- [ ] **Step 1: Write the failing composer test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadComposer = async () =>
  import(`../../src/modules/ai/runtime/composer/timelineComposer.ts?test=${Date.now()}`);

test('composer groups tool work into one timeline card and keeps final text separate', async () => {
  const { createTimelineComposer } = await loadComposer();

  const composer = createTimelineComposer({ runId: 'run_1' });
  composer.append({
    eventId: '1',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'progress.updated',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { label: '正在检查项目结构' },
  });
  composer.append({
    eventId: '2',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.started',
    ts: 2,
    seq: 2,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'Get-ChildItem -Depth 2' },
  });
  composer.append({
    eventId: '3',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    type: 'tool.completed',
    ts: 3,
    seq: 3,
    source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
    payload: { toolCallId: 'call_1', ok: true, summary: 'Scanned files' },
  });
  composer.append({
    eventId: '4',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: 'session_1',
    messageId: 'msg_1',
    type: 'message.completed',
    ts: 4,
    seq: 4,
    source: { kind: 'model', provider: 'built-in', name: 'assistant' },
    payload: { finalText: '已经定位到关键文件。' },
  });

  const projection = composer.getProjection();
  assert.equal(projection.cards.length, 1);
  assert.equal(projection.cards[0].phase, 'tooling');
  assert.equal(projection.finalMessage?.text, '已经定位到关键文件。');
});
```

- [ ] **Step 2: Run the composer test and confirm it fails**

Run:

```powershell
node --test tests/ai/runtime-timeline-composer.test.mjs
```

Expected:

```text
FAIL ... Cannot find module '../../src/modules/ai/runtime/composer/timelineComposer.ts'
```

- [ ] **Step 3: Add composer types**

Create `src/modules/ai/runtime/composer/timelineComposerTypes.ts`:

```ts
import type { CanonicalEvent } from '@goodnight/runtime-protocol';

export type TimelinePhase =
  | 'intake'
  | 'analysis'
  | 'tooling'
  | 'approval'
  | 'question'
  | 'response'
  | 'error';

export type TimelineCard = {
  cardId: string;
  phase: TimelinePhase;
  title: string;
  summary: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  startedAt: number;
  endedAt?: number;
  toolCount: number;
  retryCount: number;
  warningCount: number;
  errorCount: number;
  detailRefs: string[];
  interactionRefs: string[];
  progressLabel?: string;
  longRunning?: boolean;
};

export type TimelineProjection = {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  cards: TimelineCard[];
  activeMessage: {
    messageId: string;
    text: string;
    startedAt: number;
    updatedAt: number;
    isStreaming: boolean;
  } | null;
  finalMessage: {
    messageId: string;
    text: string;
    completedAt: number;
  } | null;
};

export type TimelineComposer = {
  append: (event: CanonicalEvent) => void;
  getProjection: () => TimelineProjection;
};
```

- [ ] **Step 4: Implement the minimal composer**

Create `src/modules/ai/runtime/composer/timelineComposer.ts`:

```ts
import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { TimelineCard, TimelineComposer, TimelineProjection } from './timelineComposerTypes.ts';

const createCard = (event: CanonicalEvent, phase: TimelineCard['phase'], title: string): TimelineCard => ({
  cardId: `card_${event.eventId}`,
  phase,
  title,
  summary: title,
  status: 'running',
  startedAt: event.ts,
  toolCount: 0,
  retryCount: 0,
  warningCount: 0,
  errorCount: 0,
  detailRefs: [],
  interactionRefs: [],
});

export const createTimelineComposer = (input: { runId: string }): TimelineComposer => {
  const projection: TimelineProjection = {
    runId: input.runId,
    status: 'running',
    cards: [],
    activeMessage: null,
    finalMessage: null,
  };

  const ensureLastCard = (event: CanonicalEvent, phase: TimelineCard['phase'], title: string) => {
    const last = projection.cards.at(-1);
    if (last && last.phase === phase && last.status === 'running') {
      return last;
    }
    const next = createCard(event, phase, title);
    projection.cards.push(next);
    return next;
  };

  return {
    append(event) {
      if (event.type === 'progress.updated') {
        const card = ensureLastCard(event, 'analysis', event.payload.label);
        card.summary = event.payload.label;
        card.progressLabel = event.payload.label;
        return;
      }

      if (event.type === 'tool.started') {
        const card = ensureLastCard(event, 'tooling', '正在执行工具');
        card.toolCount += 1;
        card.summary = event.payload.inputSummary || event.payload.toolName;
        card.detailRefs.push(event.eventId);
        return;
      }

      if (event.type === 'tool.completed') {
        const card = ensureLastCard(event, event.payload.ok ? 'tooling' : 'error', event.payload.summary || '工具执行完成');
        card.summary = event.payload.summary || card.summary;
        card.status = event.payload.ok ? 'completed' : 'failed';
        card.endedAt = event.ts;
        card.detailRefs.push(event.eventId);
        if (!event.payload.ok) card.errorCount += 1;
        return;
      }

      if (event.type === 'message.started') {
        projection.activeMessage = {
          messageId: event.messageId || `msg_${event.eventId}`,
          text: '',
          startedAt: event.ts,
          updatedAt: event.ts,
          isStreaming: true,
        };
        return;
      }

      if (event.type === 'message.delta') {
        projection.activeMessage = projection.activeMessage || {
          messageId: event.messageId || `msg_${event.eventId}`,
          text: '',
          startedAt: event.ts,
          updatedAt: event.ts,
          isStreaming: true,
        };
        projection.activeMessage.text += event.payload.textChunk;
        projection.activeMessage.updatedAt = event.ts;
        return;
      }

      if (event.type === 'message.completed') {
        projection.finalMessage = {
          messageId: event.messageId || `msg_${event.eventId}`,
          text: event.payload.finalText,
          completedAt: event.ts,
        };
        projection.activeMessage = null;
        return;
      }

      if (event.type === 'run.completed') {
        projection.status = event.payload.outcome === 'success' ? 'completed' : event.payload.outcome;
      }
    },
    getProjection() {
      return projection;
    },
  };
};
```

Modify `src/modules/ai/runtime/timeline/timelineMappers.ts`:

```ts
import type { TimelineCard } from '../composer/timelineComposerTypes.ts';

export const mapTimelineCardSummary = (card: TimelineCard) =>
  card.summary.trim() || card.title.trim() || card.phase;
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test tests/ai/runtime-timeline-composer.test.mjs
npm run build
```

Expected:

```text
PASS tests/ai/runtime-timeline-composer.test.mjs
... vite build / tsc completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add src/modules/ai/runtime/composer/timelineComposerTypes.ts src/modules/ai/runtime/composer/timelineComposer.ts src/modules/ai/runtime/timeline/timelineMappers.ts tests/ai/runtime-timeline-composer.test.mjs
git commit -m "feat: add canonical timeline composer"
```

## Task 3: Adapt the built-in runtime stream into canonical events

**Files:**
- Create: `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- Modify: `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`
- Test: `tests/ai/runtime-provider-events.test.mjs`

- [ ] **Step 1: Extend the provider event test to cover canonical mapping**

Append to `tests/ai/runtime-provider-events.test.mjs`:

```js
test('built-in runtime adapter maps provider text, thinking, and tool activity into canonical events', async () => {
  const { createBuiltinRuntimeAdapter } = await import(`../../src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts?test=${Date.now()}`);

  const events = [];
  const adapter = createBuiltinRuntimeAdapter({
    sessionId: 'session_1',
    runId: 'run_1',
    turnId: 'turn_1',
  });

  adapter.onProviderEvent({ kind: 'thinking', delta: 'check files' }, (event) => events.push(event));
  adapter.onProviderEvent({ kind: 'text', delta: 'Scanning files...' }, (event) => events.push(event));
  adapter.onProviderEvent({ kind: 'tool_call', toolCall: { id: 'call_1', name: 'view', input: { path: 'README.md' } } }, (event) => events.push(event));
  adapter.onProviderEvent({ kind: 'done', finalText: 'Done.' }, (event) => events.push(event));

  assert.equal(events.some((event) => event.type === 'progress.updated'), true);
  assert.equal(events.some((event) => event.type === 'message.delta'), true);
  assert.equal(events.some((event) => event.type === 'tool.started'), true);
  assert.equal(events.some((event) => event.type === 'message.completed'), true);
});
```

- [ ] **Step 2: Run the provider event test and confirm the new assertion fails**

Run:

```powershell
node --test tests/ai/runtime-provider-events.test.mjs
```

Expected:

```text
FAIL ... Cannot find module '../../src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts'
```

- [ ] **Step 3: Add the built-in adapter**

Create `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`:

```ts
import type { CanonicalEvent, CanonicalEventType } from '@goodnight/runtime-protocol';
import type { RuntimeProviderEvent } from '../provider/runtimeProviderEvents.ts';

type BuiltinRuntimeAdapterInput = {
  sessionId: string;
  runId: string;
  turnId: string;
  providerId?: string;
};

export const createBuiltinRuntimeAdapter = (input: BuiltinRuntimeAdapterInput) => {
  let seq = 0;
  let activeMessageId: string | null = null;

  const buildEvent = (
    type: CanonicalEventType,
    payload: CanonicalEvent['payload'],
    overrides: Partial<CanonicalEvent> = {},
  ): CanonicalEvent => ({
    eventId: `evt_${input.runId}_${++seq}`,
    runId: input.runId,
    turnId: input.turnId,
    sessionId: input.sessionId,
    messageId: activeMessageId,
    type,
    ts: Date.now(),
    seq,
    source: {
      kind: type.startsWith('tool.') ? 'tool' : 'runtime',
      provider: input.providerId || 'built-in',
      name: 'built-in-runtime',
    },
    payload,
    ...overrides,
  });

  return {
    onProviderEvent(event: RuntimeProviderEvent, emit: (event: CanonicalEvent) => void) {
      if (event.kind === 'thinking') {
        emit(buildEvent('progress.updated', { label: '正在分析', detail: event.delta, scope: 'phase', importance: 'low' }));
        return;
      }
      if (event.kind === 'text') {
        if (!activeMessageId) {
          activeMessageId = `msg_${input.runId}`;
          emit(buildEvent('message.started', { role: 'assistant' }, { messageId: activeMessageId, source: { kind: 'model', provider: input.providerId || 'built-in', name: 'assistant' } }));
        }
        emit(buildEvent('message.delta', { textChunk: event.delta }, { messageId: activeMessageId, source: { kind: 'model', provider: input.providerId || 'built-in', name: 'assistant' } }));
        return;
      }
      if (event.kind === 'tool_call') {
        emit(buildEvent('tool.started', {
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.name,
          input: event.toolCall.input,
          inputSummary: JSON.stringify(event.toolCall.input),
        }, {
          correlationId: event.toolCall.id,
          source: { kind: 'tool', provider: input.providerId || 'built-in', name: event.toolCall.name },
        }));
        return;
      }
      if (event.kind === 'usage') {
        emit(buildEvent('warning.raised', { code: 'usage.update', summary: `Output tokens: ${event.outputTokens}` }));
        return;
      }
      if (event.kind === 'done') {
        if (!activeMessageId) {
          activeMessageId = `msg_${input.runId}`;
          emit(buildEvent('message.started', { role: 'assistant' }, { messageId: activeMessageId, source: { kind: 'model', provider: input.providerId || 'built-in', name: 'assistant' } }));
        }
        emit(buildEvent('message.completed', { finalText: event.finalText }, { messageId: activeMessageId, source: { kind: 'model', provider: input.providerId || 'built-in', name: 'assistant' } }));
      }
    },
  };
};
```

- [ ] **Step 4: Thread canonical append hooks into the current streaming bridge**

Modify `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`:

```ts
import type { CanonicalEvent } from '@goodnight/runtime-protocol';

export type RuntimeChatMessageBridge = {
  appendUserMessage: (content: string, runId: string) => string;
  appendAssistantMessage: (runId: string) => string;
  appendCanonicalEvent: (assistantMessageId: string, event: CanonicalEvent) => void;
  updateAssistantTimeline: (
    assistantMessageId: string,
    updater: (timeline: AssistantTimelineEvent[]) => AssistantTimelineEvent[],
  ) => void;
  failAssistantMessage: (assistantMessageId: string, message: string) => void;
};
```

Modify `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts` so provider events feed the adapter before UI draft updates:

```ts
import { createBuiltinRuntimeAdapter } from '../adapters/builtinRuntimeAdapter.ts';

const adapter = createBuiltinRuntimeAdapter({
  sessionId: input.runtimeStoreThreadId,
  runId: input.assistantMessageId,
  turnId: input.assistantMessageId,
});

// inside onModelEvent:
adapter.onProviderEvent(
  event.kind === 'thinking'
    ? { kind: 'thinking', delta: event.delta }
    : { kind: 'text', delta: event.delta },
  (canonicalEvent) => input.bridge.appendCanonicalEvent(input.assistantMessageId, canonicalEvent),
);
```

- [ ] **Step 5: Run targeted tests and build**

Run:

```powershell
node --test tests/ai/runtime-provider-events.test.mjs
npm run build
```

Expected:

```text
PASS tests/ai/runtime-provider-events.test.mjs
... build completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts src/modules/ai/runtime/provider/runtimeProviderEvents.ts src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts tests/ai/runtime-provider-events.test.mjs
git commit -m "feat: map built-in runtime output to canonical events"
```

## Task 4: Persist canonical events in the chat store and restore projections

**Files:**
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Test: `tests/ai/runtime-canonical-store.test.mjs`

- [ ] **Step 1: Write the failing store test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadChatStore = async () =>
  import(`../../src/modules/ai/store/aiChatStore.ts?test=${Date.now()}`);

test('chat store appends canonical events and restores them with the session', async () => {
  const { createChatSession, useAIChatStore } = await loadChatStore();

  const projectId = 'project_1';
  const session = createChatSession(projectId, 'Timeline test', 'built-in');

  useAIChatStore.getState().upsertSession(projectId, session);
  useAIChatStore.getState().appendCanonicalEvent(projectId, session.id, {
    eventId: 'evt_1',
    runId: 'run_1',
    turnId: 'turn_1',
    sessionId: session.id,
    type: 'progress.updated',
    ts: 1,
    seq: 1,
    source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
    payload: { label: '正在扫描目录' },
  });

  const storedSession = useAIChatStore.getState().projects[projectId].sessions[0];
  assert.equal(storedSession.canonicalEvents.length, 1);
  assert.equal(storedSession.canonicalEvents[0].type, 'progress.updated');
});
```

- [ ] **Step 2: Run the store test and confirm it fails**

Run:

```powershell
node --test tests/ai/runtime-canonical-store.test.mjs
```

Expected:

```text
FAIL ... appendCanonicalEvent is not a function
```

- [ ] **Step 3: Extend the store session model**

Modify `src/modules/ai/store/aiChatStore.ts`:

```ts
import type { CanonicalEvent } from '@goodnight/runtime-protocol';

export type ChatSession = {
  id: string;
  projectId: string;
  title: string;
  providerId: AgentProviderId;
  runtimeThreadId: string | null;
  composerPrefill?: ComposerPrefillPayload | null;
  messages: StoredChatMessage[];
  canonicalEvents: CanonicalEvent[];
  replayEvents: RuntimeReplayEvent[];
  recoveryState: AgentReplayRecoveryState | null;
  eventLog: ChatSessionEvent[];
  createdAt: number;
  updatedAt: number;
};
```

Initialize `createChatSession` with:

```ts
canonicalEvents: [],
```

Add store actions:

```ts
appendCanonicalEvent: (projectId: string, sessionId: string, event: CanonicalEvent) => void;
replaceCanonicalEvents: (projectId: string, sessionId: string, events: CanonicalEvent[]) => void;
```

Implementation sketch:

```ts
appendCanonicalEvent: (projectId, sessionId, event) =>
  set((state) => {
    const project = state.projects[projectId] || createProjectState();
    const sessions = project.sessions.map((session) =>
      session.id !== sessionId
        ? session
        : {
            ...session,
            canonicalEvents: [...(session.canonicalEvents || []), event],
            updatedAt: Math.max(session.updatedAt, event.ts),
          }
    );
    return {
      projects: {
        ...state.projects,
        [projectId]: {
          ...project,
          sessions: sortSessions(sessions),
        },
      },
    };
  }),
```

- [ ] **Step 4: Surface canonical events from the conversation gateway**

Modify `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts` to expose:

```ts
canonicalEvents: selection.activeSession?.canonicalEvents || [],
```

and add a derived projection placeholder:

```ts
timelineProjectionByRunId: {},
```

if the composer wiring lands in the next task.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test tests/ai/runtime-canonical-store.test.mjs
node --test tests/ai/ai-chat-store.test.mjs
npm run build
```

Expected:

```text
PASS tests/ai/runtime-canonical-store.test.mjs
PASS tests/ai/ai-chat-store.test.mjs
... build completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add src/modules/ai/store/aiChatStore.ts src/modules/ai/runtime/conversation/runtimeConversationGateway.ts tests/ai/runtime-canonical-store.test.mjs
git commit -m "feat: persist canonical runtime events in chat sessions"
```

## Task 5: Build the projection bridge from store events to timeline UI

**Files:**
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Modify: `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`

- [ ] **Step 1: Write the failing projection test**

Append to `tests/ai/runtime-conversation-gateway.test.mjs`:

```js
test('runtime conversation projection exposes timeline projections derived from canonical events by run id', async () => {
  const { buildRuntimeConversationProjection } = await import(`../../src/modules/ai/runtime/conversation/runtimeConversationGateway.ts?test=${Date.now()}`);

  const projection = buildRuntimeConversationProjection({
    projectChatState: null,
    sessions: [
      {
        id: 'session_1',
        projectId: 'project_1',
        title: 'Timeline',
        providerId: 'built-in',
        runtimeThreadId: null,
        composerPrefill: null,
        messages: [],
        canonicalEvents: [
          {
            eventId: 'evt_1',
            runId: 'run_1',
            turnId: 'turn_1',
            sessionId: 'session_1',
            type: 'progress.updated',
            ts: 1,
            seq: 1,
            source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
            payload: { label: '正在扫描目录' },
          },
        ],
        replayEvents: [],
        recoveryState: null,
        eventLog: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    activeSessionId: 'session_1',
    activityEntries: [],
    runtimeState: {
      latestTurnSession: null,
      replayResumeRequest: null,
      liveState: null,
      backgroundTasks: [],
      activeSkills: [],
      contextSnapshot: null,
      toolCalls: [],
      mcpToolCalls: [],
      memoryCandidates: [],
      memoryEntries: [],
    },
    pendingApprovals: [],
  });

  assert.equal(projection.timelineProjectionByRunId.run_1.cards.length, 1);
});
```

- [ ] **Step 2: Run the projection test and confirm it fails**

Run:

```powershell
node --test tests/ai/runtime-conversation-gateway.test.mjs
```

Expected:

```text
FAIL ... projection.timelineProjectionByRunId is undefined
```

- [ ] **Step 3: Wire the composer into the gateway**

Modify `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`:

```ts
import { createTimelineComposer } from '../composer/timelineComposer.ts';
import type { CanonicalEvent } from '@goodnight/runtime-protocol';

const buildTimelineProjectionByRunId = (events: CanonicalEvent[]) => {
  const composers = new Map<string, ReturnType<typeof createTimelineComposer>>();

  for (const event of events) {
    const existing = composers.get(event.runId) || createTimelineComposer({ runId: event.runId });
    existing.append(event);
    composers.set(event.runId, existing);
  }

  return Object.fromEntries(
    Array.from(composers.entries()).map(([runId, composer]) => [runId, composer.getProjection()]),
  );
};
```

Then add to the returned projection:

```ts
timelineProjectionByRunId: buildTimelineProjectionByRunId(selection.activeSession?.canonicalEvents || []),
```

Update the exported type to include:

```ts
timelineProjectionByRunId: Record<string, ReturnType<typeof createTimelineComposer>['getProjection']>;
```

- [ ] **Step 4: Consume the projection in `AIChat.tsx`**

Use `useRuntimeConversationGateway` instead of `useActiveConversationLiveState` for this data:

```ts
const { timelineProjectionByRunId } = useRuntimeConversationGateway({ projectId: currentProjectId });
```

Add a render callback keyed by `StoredChatMessage.runId`:

```ts
const renderTimelineProjection = useCallback(
  (message: StoredChatMessage) => {
    if (message.role !== 'assistant' || !message.runId) {
      return null;
    }

    const projection = timelineProjectionByRunId[message.runId] || null;
    return projection ? <TimelineView projection={projection} /> : null;
  },
  [timelineProjectionByRunId],
);
```

Pass `renderTimelineProjection` into `AIChatConversationMessagesPane`.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test tests/ai/runtime-conversation-gateway.test.mjs
node --test tests/ai/runtime-conversation-gateway-store-selector.test.mjs
npm run build
```

Expected:

```text
PASS runtime-conversation-gateway tests
... build completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add src/modules/ai/runtime/conversation/runtimeConversationGateway.ts src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts src/components/workspace/AIChat.tsx tests/ai/runtime-conversation-gateway.test.mjs
git commit -m "feat: expose timeline projections from runtime conversation gateway"
```

## Task 6: Replace the mixed runtime cards with timeline-first UI

**Files:**
- Create: `src/components/workspace/timeline/TimelineView.tsx`
- Create: `src/components/workspace/timeline/TimelineCard.tsx`
- Create: `src/components/workspace/timeline/TimelineDetailDrawer.tsx`
- Modify: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Test: `tests/ai/ai-chat-timeline-view.test.mjs`

- [ ] **Step 1: Write the failing UI boundary test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('timeline view keeps raw tool logs out of the main assistant message path', async () => {
  const source = await readFile('src/components/workspace/AIChatConversationMessagesPane.tsx', 'utf8');

  assert.match(source, /renderTimelineProjection/);
  assert.doesNotMatch(source, /buildRuntimeExecutionTimelineCards/);
});
```

- [ ] **Step 2: Run the UI test and confirm it fails**

Run:

```powershell
node --test tests/ai/ai-chat-timeline-view.test.mjs
```

Expected:

```text
FAIL ... expected source to match /renderTimelineProjection/
```

- [ ] **Step 3: Add the new timeline UI components**

Create `src/components/workspace/timeline/TimelineCard.tsx`:

```tsx
import React from 'react';
import type { TimelineCard as TimelineCardModel } from '../../../modules/ai/runtime/composer/timelineComposerTypes.ts';

export const TimelineCard: React.FC<{
  card: TimelineCardModel;
  onToggleDetails: () => void;
  detailsOpen: boolean;
}> = ({ card, onToggleDetails, detailsOpen }) => (
  <section className={`chat-timeline-card ${card.status}`}>
    <header className="chat-timeline-card-head">
      <strong>{card.title}</strong>
      <span>{card.status}</span>
    </header>
    <p className="chat-timeline-card-summary">{card.summary}</p>
    <div className="chat-timeline-card-meta">
      <span>{card.toolCount} tools</span>
      <span>{card.retryCount} retries</span>
    </div>
    {card.detailRefs.length > 0 ? (
      <button type="button" onClick={onToggleDetails}>
        {detailsOpen ? '收起详情' : '查看详情'}
      </button>
    ) : null}
  </section>
);
```

Create `src/components/workspace/timeline/TimelineDetailDrawer.tsx`:

```tsx
import React from 'react';

export const TimelineDetailDrawer: React.FC<{
  items: string[];
}> = ({ items }) => (
  <pre className="chat-timeline-detail-drawer">
    {items.join('\n')}
  </pre>
);
```

Create `src/components/workspace/timeline/TimelineView.tsx`:

```tsx
import React, { useState } from 'react';
import type { TimelineProjection } from '../../../modules/ai/runtime/composer/timelineComposerTypes.ts';
import { TimelineCard } from './TimelineCard.tsx';
import { TimelineDetailDrawer } from './TimelineDetailDrawer.tsx';

export const TimelineView: React.FC<{
  projection: TimelineProjection | null;
}> = ({ projection }) => {
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  if (!projection || projection.cards.length === 0) {
    return null;
  }

  return (
    <div className="chat-timeline-view">
      {projection.cards.map((card) => {
        const open = !!openCards[card.cardId];
        return (
          <div key={card.cardId}>
            <TimelineCard
              card={card}
              detailsOpen={open}
              onToggleDetails={() =>
                setOpenCards((state) => ({ ...state, [card.cardId]: !state[card.cardId] }))
              }
            />
            {open ? <TimelineDetailDrawer items={card.detailRefs} /> : null}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Mount the timeline and separate it from the final assistant answer**

Modify `src/components/workspace/AIChatConversationMessagesPane.tsx`:

```tsx
type AIChatConversationMessagesPaneProps = {
  projectId: string | null;
  draftContents: Record<string, AssistantDraftState>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: (content: string) => AIChatMessagePart[];
  renderMessagePart: (
    message: StoredChatMessage,
    messageId: string,
    part: AIChatMessagePart,
    index: number,
    options?: {
      content: string;
      isStreaming: boolean;
      thinkingExpanded?: boolean;
      onToggleThinking?: () => void;
    },
  ) => ReactNode;
  renderStructuredCards: (message: StoredChatMessage) => ReactNode;
  renderProjectFileProposal: (message: StoredChatMessage) => ReactNode;
  renderToolExecutionCard: (message: StoredChatMessage) => MessageBubbleCard[] | null;
  renderRunSummaryCard: (message: StoredChatMessage) => ReactNode;
  renderRuntimeQuestion: (message: StoredChatMessage) => ReactNode;
  renderTimelineProjection: (message: StoredChatMessage) => ReactNode;
  messageListRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: ReactNode;
  pendingApprovalActionsRef: MutableRefObject<Record<string, RuntimePendingApprovalAction | undefined>>;
  summarizeProjectFilePath: (path: string) => string;
  onApprove: (approvalId: string) => void | Promise<void>;
  onDeny: (approvalId: string) => void | Promise<void>;
  approvalStatusLabelMap: Record<ApprovalRecord['status'], string>;
  approvalRiskLabelMap: Record<ApprovalRecord['riskLevel'], string>;
  approvalActionLabelMap: Record<string, string>;
};
```

Render it inside the assistant message flow, before structured cards and before the final bubble text:

```tsx
<GNAgentMessageList
  messages={messages}
  draftContents={effectiveStreamingDraftContents}
  formatTimestamp={formatTimestamp}
  parseMessageParts={parseMessageParts}
  renderMessagePart={renderMessagePart}
  renderStructuredCards={renderStructuredCards}
  renderProjectFileProposal={renderProjectFileProposal}
  renderToolExecutionCard={renderToolExecutionCard}
  renderRunSummaryCard={renderRunSummaryCard}
  renderRuntimeApproval={renderRuntimeApproval}
  renderRuntimeQuestion={renderRuntimeQuestion}
  renderTimelineProjection={renderTimelineProjection}
  listRef={messageListRef}
  messagesEndRef={messagesEndRef}
  leadingContent={leadingContent}
/>
```

Modify the message item composition so each assistant message renders:

```tsx
{renderTimelineProjection(message)}
{renderStructuredCards(message)}
{renderProjectFileProposal(message)}
{renderRunSummaryCard(message)}
```

Modify `src/components/workspace/assistantRenderModel.ts` to stop promoting visible `reasoning` blocks to a default narrative lane in the primary output path:

```ts
if (event.kind === 'reasoning') {
  return null;
}
```

This keeps the summary-first timeline as the process surface and the final assistant bubble as the answer surface.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test tests/ai/ai-chat-timeline-view.test.mjs
node --test tests/ai/assistant-render-model.test.mjs
node --test tests/ai/agent-runtime-timeline.test.mjs
npm run build
```

Expected:

```text
PASS timeline view and assistant render model tests
... build completed ...
```

- [ ] **Step 6: Commit**

```powershell
git add src/components/workspace/timeline/TimelineView.tsx src/components/workspace/timeline/TimelineCard.tsx src/components/workspace/timeline/TimelineDetailDrawer.tsx src/components/workspace/AIChatConversationMessagesPane.tsx src/components/workspace/AIChat.tsx src/components/workspace/assistantRenderModel.ts tests/ai/ai-chat-timeline-view.test.mjs
git commit -m "feat: render assistant process output as timeline cards"
```

## Task 7: Remove the old mixed rendering path from the critical flow and verify restore behavior

**Files:**
- Modify: `src/components/workspace/runtimeEventRenderModel.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/store/assistantTimeline.ts`
- Test: `tests/ai/assistant-timeline-events.test.mjs`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`
- Test: `tests/ai/runtime-sidecar-replay.test.mjs`

- [ ] **Step 1: Write the failing migration safety test**

Append to `tests/ai/ai-chat-runtime-output-flow.test.mjs`:

```js
test('runtime output flow uses canonical event projection as the primary process rendering source', async () => {
  const source = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.match(source, /timelineProjectionByRunId/);
  assert.doesNotMatch(source, /buildRuntimeExecutionTimelineCards/);
});
```

- [ ] **Step 2: Run the migration safety test and confirm it fails**

Run:

```powershell
node --test tests/ai/ai-chat-runtime-output-flow.test.mjs
```

Expected:

```text
FAIL ... still references buildRuntimeExecutionTimelineCards
```

- [ ] **Step 3: Shrink compatibility code and preserve restore paths**

Modify `src/components/workspace/runtimeEventRenderModel.ts`:

```ts
// Keep this file only for compatibility consumers that have not yet moved
// to canonical timeline projections. New UI paths must not depend on it.
export const buildLegacyRuntimeEventRenderModel = buildRuntimeEventRenderModelFromOrderedEvents;
```

Modify `src/modules/ai/store/assistantTimeline.ts` to stop assuming runtime tool events are the primary render model:

```ts
export const isAssistantRuntimeTimelineEvent = (
  event: AssistantTimelineEvent
): event is StoredChatRuntimeEvent =>
  event.kind === 'tool_use' ||
  event.kind === 'tool_result' ||
  event.kind === 'approval' ||
  event.kind === 'question';
```

Keep the helper for compatibility, but stop expanding visible reasoning in the primary UI.

Modify `src/components/workspace/AIChat.tsx` so the final process rendering path reads from `timelineProjectionByRunId` first and only falls back to legacy cards behind a guarded compatibility branch.

- [ ] **Step 4: Run restore and regression tests**

Run:

```powershell
node --test tests/ai/assistant-timeline-events.test.mjs
node --test tests/ai/ai-chat-runtime-output-flow.test.mjs
node --test tests/ai/runtime-sidecar-replay.test.mjs
npm run build
```

Expected:

```text
PASS assistant timeline compatibility tests
PASS runtime output flow tests
PASS runtime replay tests
... build completed ...
```

- [ ] **Step 5: Commit**

```powershell
git add src/components/workspace/runtimeEventRenderModel.ts src/components/workspace/AIChat.tsx src/modules/ai/store/assistantTimeline.ts tests/ai/assistant-timeline-events.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/runtime-sidecar-replay.test.mjs
git commit -m "refactor: make canonical timeline projection the primary runtime output path"
```

## Final Verification Checklist

- [ ] Run the protocol tests:

```powershell
node --test tests/ai/runtime-canonical-events.test.mjs
```

- [ ] Run the composer tests:

```powershell
node --test tests/ai/runtime-timeline-composer.test.mjs
```

- [ ] Run the store/gateway/timeline UI tests:

```powershell
node --test tests/ai/runtime-canonical-store.test.mjs
node --test tests/ai/runtime-conversation-gateway.test.mjs
node --test tests/ai/ai-chat-timeline-view.test.mjs
```

- [ ] Run replay and runtime regressions:

```powershell
node --test tests/ai/ai-chat-runtime-output-flow.test.mjs
node --test tests/ai/runtime-sidecar-replay.test.mjs
node --test tests/ai/runtime-provider-events.test.mjs
```

- [ ] Run the workspace builds:

```powershell
npm run build --workspace @goodnight/runtime-protocol
npm run build --workspace @goodnight/runtime-client
npm run build
```

## Spec Coverage Self-Check

- Canonical event protocol: covered by Task 1.
- Adapter mapping across providers/runtime streams: covered by Task 3.
- Incremental composer and stable timeline cards: covered by Task 2 and Task 5.
- Persistence and replay restoration: covered by Task 4 and Task 7.
- Summary-first timeline UI and hidden raw details: covered by Task 6.
- Removal of mixed reasoning/runtime rendering from the critical path: covered by Task 6 and Task 7.

## Placeholder Scan

This plan intentionally avoids `TBD`, `TODO`, and "implement later" language. If implementation reveals a missing path, update the plan first instead of improvising hidden behavior in code.

## Type Consistency Check

- Canonical event type name: `CanonicalEvent`
- Composer output name: `TimelineProjection`
- Store session field: `canonicalEvents`
- Gateway projection field: `timelineProjectionByRunId`
- Bridge append API: `appendCanonicalEvent`

Use these names consistently. Do not introduce alternate names for the same concept.
