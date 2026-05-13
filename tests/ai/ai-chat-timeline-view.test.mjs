import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('timeline view keeps raw tool logs out of the main assistant message path', async () => {
  const source = await readFile('src/components/workspace/AIChatConversationMessagesPane.tsx', 'utf8');

  assert.match(source, /renderTimelineCards/);
  assert.doesNotMatch(source, /buildRuntimeExecutionTimelineCards/);
});

test('timeline cards render as compact log rows with inline summary and lightweight actions', async () => {
  const source = await readFile('src/components/workspace/timeline/TimelineCard.tsx', 'utf8');

  assert.match(source, /className="chat-timeline-card-main"/);
  assert.match(source, /className="chat-timeline-card-summary-inline"/);
  assert.match(source, /className="chat-timeline-card-actions"/);
  assert.match(source, /className="chat-timeline-card-hitbox"/);
  assert.match(source, /className="chat-inline-disclosure-caret chat-timeline-card-caret"/);
  assert.doesNotMatch(source, /className="chat-timeline-card-chip"/);
  assert.doesNotMatch(source, /formatCompactTime/);
  assert.doesNotMatch(source, /chat-timeline-card-toggle/);
});

test('timeline detail formatter exposes tool IO and file changes as structured detail items', async () => {
  const { buildTimelineDetailItems } = await import(
    `../../src/components/workspace/timeline/timelineEventDetails.ts?test=${Date.now()}`
  );

  const items = buildTimelineDetailItems([
    {
      eventId: 'evt_1',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'tool.started',
      ts: 1,
      seq: 1,
      source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
      payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'npm run build' },
    },
    {
      eventId: 'evt_2',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'tool.stdout',
      ts: 2,
      seq: 2,
      source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
      payload: { toolCallId: 'call_1', chunk: 'building...' },
    },
    {
      eventId: 'evt_3',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'tool.stderr',
      ts: 3,
      seq: 3,
      source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
      payload: { toolCallId: 'call_1', chunk: 'warning: deprecated flag' },
    },
    {
      eventId: 'evt_4',
      runId: 'run_1',
      turnId: 'turn_1',
      sessionId: 'session_1',
      type: 'tool.completed',
      ts: 4,
      seq: 4,
      source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
      payload: {
        toolCallId: 'call_1',
        ok: true,
        exitCode: 0,
        summary: 'Build finished',
        outputText: 'build complete',
        fileChanges: [
          {
            path: 'src/components/workspace/AIChat.tsx',
            beforeContent: 'old',
            afterContent: 'new',
          },
        ],
      },
    },
  ]);

  assert.equal(items.some((item) => item.label === 'PowerShell' && item.value === 'Build project'), true);
  assert.equal(items.some((item) => item.label === 'stdout' && item.mono === true), true);
  assert.equal(items.some((item) => item.label === 'stderr' && item.tone === 'warning'), true);
  assert.equal(items.some((item) => item.label === 'Exit code' && item.value === '0'), true);
  assert.equal(items.some((item) => item.label === 'Edited' && item.value?.includes('AIChat.tsx')), true);
});

test('timeline migration removes the legacy runtime tool renderer files from the primary chat surface', async () => {
  const chatSource = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.doesNotMatch(chatSource, /legacyRuntimeToolHelpers/);

  for (const relativePath of [
    'src/components/workspace/AIChatRuntimeToolExecutionCard.tsx',
    'src/components/workspace/AIChatRuntimeToolBlocks.tsx',
    'src/components/workspace/AIChatRuntimeToolTypes.ts',
  ]) {
    await assert.rejects(access(path.resolve(relativePath)));
  }
});

test('AIChat removes the effectiveDraftContents wrapper and reads streamingDraftContents directly', async () => {
  const chatSource = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.doesNotMatch(chatSource, /const effectiveDraftContents = useMemo\(/);
  assert.match(chatSource, /\}, \[activeSession\?\.messages, streamingDraftContents, isLoading\]\);/);
  assert.match(chatSource, /draftContents=\{streamingDraftContents\}/);
});

test('chat surface keeps runtime question interaction cards wired for pending ask-user events', async () => {
  const chatSource = await readFile('src/components/workspace/AIChat.tsx', 'utf8');
  const renderModelSource = await readFile('src/components/workspace/runtimeInteractionRenderModel.ts', 'utf8');

  assert.match(chatSource, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(chatSource, /getRuntimeQuestionRenderEntries/);
  assert.match(renderModelSource, /event\.kind !== 'approval' && event\.kind !== 'question'/);
  assert.doesNotMatch(chatSource, /const renderRuntimeQuestionCard = useCallback\(\s*\(_message: StoredChatMessage\) => null/);
});

test('chat timeline bubble card helper filters duplicate run, response, and interaction cards while using completion time for final run summaries', async () => {
  const { buildChatTimelineBubbleCards } = await import(
    `../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`
  );

  const model = buildChatTimelineBubbleCards({
    runId: 'run_1',
    status: 'completed',
    activeMessage: null,
    finalMessage: null,
    cards: [
      {
        cardId: 'card_run',
        phase: 'intake',
        title: 'Run',
        summary: 'Run started',
        status: 'completed',
        startedAt: 1,
        endedAt: 6,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_run_started', 'evt_run_completed'],
        interactionRefs: [],
      },
      {
        cardId: 'card_reasoning',
        phase: 'analysis',
        title: 'Reasoning',
        summary: 'Inspect files',
        status: 'completed',
        startedAt: 2,
        endedAt: 2,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_reasoning'],
        interactionRefs: [],
      },
      {
        cardId: 'card_tool',
        phase: 'tooling',
        title: 'Tool run',
        summary: 'Get-ChildItem',
        status: 'completed',
        startedAt: 3,
        endedAt: 4,
        toolCount: 1,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_tool_started', 'evt_tool_completed'],
        interactionRefs: [],
      },
      {
        cardId: 'card_approval',
        phase: 'approval',
        title: 'Approval needed',
        summary: 'Need approval',
        status: 'blocked',
        startedAt: 5,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_approval'],
        interactionRefs: ['approval_1'],
      },
      {
        cardId: 'card_response',
        phase: 'response',
        title: 'Response',
        summary: 'Final answer',
        status: 'completed',
        startedAt: 6,
        endedAt: 6,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_message_completed'],
        interactionRefs: [],
      },
    ],
    events: [
      {
        eventId: 'evt_run_started',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'run.started',
        ts: 1,
        seq: 1,
        source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
        payload: { providerId: 'built-in', mode: 'agent' },
      },
      {
        eventId: 'evt_reasoning',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'progress.updated',
        ts: 2,
        seq: 2,
        source: { kind: 'runtime', provider: 'built-in', name: 'reasoning' },
        payload: { label: 'Reasoning', detail: 'Inspect files' },
      },
      {
        eventId: 'evt_tool_started',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'tool.started',
        ts: 3,
        seq: 3,
        source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
        payload: { toolCallId: 'call_1', toolName: 'powershell', inputSummary: 'Get-ChildItem' },
      },
      {
        eventId: 'evt_tool_completed',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'tool.completed',
        ts: 4,
        seq: 4,
        source: { kind: 'tool', provider: 'built-in', name: 'powershell' },
        payload: { toolCallId: 'call_1', ok: true, summary: 'done' },
      },
      {
        eventId: 'evt_approval',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'approval.requested',
        ts: 5,
        seq: 5,
        source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
        payload: { approvalId: 'approval_1', actionType: 'tool_write', riskLevel: 'low', summary: 'Need approval' },
      },
      {
        eventId: 'evt_message_completed',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        messageId: 'assistant_1',
        type: 'message.completed',
        ts: 6,
        seq: 6,
        source: { kind: 'model', provider: 'built-in', name: 'assistant' },
        payload: { finalText: 'Final answer' },
      },
      {
        eventId: 'evt_run_completed',
        runId: 'run_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        type: 'run.completed',
        ts: 6,
        seq: 7,
        source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
        payload: { outcome: 'success' },
      },
    ],
  });

  assert.deepEqual(model.descriptors.map((descriptor) => descriptor.card.phase), ['tooling']);
  assert.deepEqual(model.descriptors.map((descriptor) => descriptor.createdAt), [3]);
  assert.equal(model.completedResponseSummary?.summary, 'Final answer');
  assert.equal(model.completedResponseSummary?.completedAt, 6);
});

test('chat timeline bubble card helper hides analysis cards that only mirror reasoning events', async () => {
  const { buildChatTimelineBubbleCards } = await import(
    `../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`
  );

  const model = buildChatTimelineBubbleCards({
    runId: 'run_reasoning_1',
    status: 'completed',
    activeMessage: null,
    finalMessage: {
      messageId: 'assistant_reasoning_1',
      text: '整理好了。',
      completedAt: 8,
    },
    cards: [
      {
        cardId: 'card_reasoning_only',
        phase: 'analysis',
        title: 'Reasoning',
        summary: 'Inspect files',
        status: 'completed',
        startedAt: 2,
        endedAt: 4,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_reasoning_started', 'evt_reasoning_delta', 'evt_reasoning_completed'],
        interactionRefs: [],
      },
      {
        cardId: 'card_response',
        phase: 'response',
        title: 'Response',
        summary: '整理好了。',
        status: 'completed',
        startedAt: 4,
        endedAt: 8,
        toolCount: 0,
        retryCount: 0,
        warningCount: 0,
        errorCount: 0,
        detailRefs: ['evt_message_completed'],
        interactionRefs: [],
      },
    ],
    events: [
      {
        eventId: 'evt_reasoning_started',
        runId: 'run_reasoning_1',
        turnId: 'turn_reasoning_1',
        sessionId: 'session_reasoning_1',
        type: 'reasoning.started',
        ts: 2,
        seq: 1,
        source: { kind: 'runtime', provider: 'built-in', name: 'assistant' },
        payload: { summary: 'Inspect files' },
      },
      {
        eventId: 'evt_reasoning_delta',
        runId: 'run_reasoning_1',
        turnId: 'turn_reasoning_1',
        sessionId: 'session_reasoning_1',
        type: 'reasoning.delta',
        ts: 3,
        seq: 2,
        source: { kind: 'runtime', provider: 'built-in', name: 'assistant' },
        payload: { textChunk: 'Inspect files carefully.' },
      },
      {
        eventId: 'evt_reasoning_completed',
        runId: 'run_reasoning_1',
        turnId: 'turn_reasoning_1',
        sessionId: 'session_reasoning_1',
        type: 'reasoning.completed',
        ts: 4,
        seq: 3,
        source: { kind: 'runtime', provider: 'built-in', name: 'assistant' },
        payload: { finalText: 'Inspect files carefully.' },
      },
      {
        eventId: 'evt_message_completed',
        runId: 'run_reasoning_1',
        turnId: 'turn_reasoning_1',
        sessionId: 'session_reasoning_1',
        messageId: 'assistant_reasoning_1',
        type: 'message.completed',
        ts: 8,
        seq: 4,
        source: { kind: 'model', provider: 'built-in', name: 'assistant' },
        payload: { finalText: '整理好了。' },
      },
    ],
  });

  assert.deepEqual(model.descriptors, []);
  assert.equal(model.completedResponseSummary?.summary, '整理好了。');
});

test('chat timeline keeps one compact completed response summary card', async () => {
  const { buildChatTimelineBubbleCards } = await import(
    `../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`
  );

  const model = buildChatTimelineBubbleCards({
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

  assert.deepEqual(model.descriptors, []);
  assert.deepEqual(
    model.completedResponseSummary && [
      model.completedResponseSummary.phase,
      model.completedResponseSummary.completedAt,
      model.completedResponseSummary.elapsedSeconds,
      model.completedResponseSummary.summary,
    ],
    ['response', 60, 40, 'Final answer ready.'],
  );
});

test('completed run summary cards sort after same-timestamp work cards', async () => {
  const { buildChatTimelineBubbleCards } = await import(
    `../../src/components/workspace/timeline/chatTimelineBubbleCardModel.ts?test=${Date.now()}`
  );

  const model = buildChatTimelineBubbleCards({
    runId: 'run-1',
    status: 'completed',
    activeMessage: null,
    finalMessage: null,
    events: [],
    cards: [
      {
        cardId: 'run-card',
        phase: 'intake',
        title: 'Run',
        summary: 'Done',
        status: 'completed',
        startedAt: 1,
        endedAt: 6,
        detailRefs: [],
        interactionRefs: [],
        toolCount: 0,
        errorCount: 0,
        warningCount: 0,
        retryCount: 0,
      },
      {
        cardId: 'tool-card',
        phase: 'tooling',
        title: 'Tool run',
        summary: 'ls completed',
        status: 'completed',
        startedAt: 6,
        endedAt: 6,
        detailRefs: [],
        interactionRefs: [],
        toolCount: 1,
        errorCount: 0,
        warningCount: 0,
        retryCount: 0,
      },
    ],
  });

  const sorted = [...model.descriptors].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }

    return left.timelineOrder - right.timelineOrder;
  });

  assert.deepEqual(sorted.map((descriptor) => descriptor.cardId), ['tool-card']);
});

test('timeline detail formatter exposes run and message lifecycle items', async () => {
  const { buildTimelineDetailItems } = await import(
    `../../src/components/workspace/timeline/timelineEventDetails.ts?test=${Date.now()}`
  );

  const items = buildTimelineDetailItems([
    {
      eventId: 'evt_1',
      runId: 'run_2',
      turnId: 'turn_2',
      sessionId: 'session_2',
      type: 'run.started',
      ts: 1,
      seq: 1,
      source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
      payload: { providerId: 'built-in', mode: 'agent' },
    },
    {
      eventId: 'evt_2',
      runId: 'run_2',
      turnId: 'turn_2',
      sessionId: 'session_2',
      messageId: 'msg_2',
      type: 'message.started',
      ts: 2,
      seq: 2,
      source: { kind: 'model', provider: 'built-in', name: 'assistant' },
      payload: { role: 'assistant' },
    },
    {
      eventId: 'evt_3',
      runId: 'run_2',
      turnId: 'turn_2',
      sessionId: 'session_2',
      messageId: 'msg_2',
      type: 'message.delta',
      ts: 3,
      seq: 3,
      source: { kind: 'model', provider: 'built-in', name: 'assistant' },
      payload: { textChunk: 'Working through the final answer.' },
    },
    {
      eventId: 'evt_4',
      runId: 'run_2',
      turnId: 'turn_2',
      sessionId: 'session_2',
      messageId: 'msg_2',
      type: 'message.completed',
      ts: 4,
      seq: 4,
      source: { kind: 'model', provider: 'built-in', name: 'assistant' },
      payload: { finalText: 'Final answer ready.' },
    },
    {
      eventId: 'evt_5',
      runId: 'run_2',
      turnId: 'turn_2',
      sessionId: 'session_2',
      type: 'run.completed',
      ts: 5,
      seq: 5,
      source: { kind: 'runtime', provider: 'built-in', name: 'runtime' },
      payload: {
        outcome: 'success',
        summary: 'Run finished cleanly.',
        tokenUsage: { totalTokens: 42 },
      },
    },
  ]);

  assert.equal(items.some((item) => item.label === 'Run' && item.value === 'Built-in agent run'), true);
  assert.equal(items.some((item) => item.label === 'Response' && item.value === 'Generating assistant reply'), true);
  assert.equal(items.some((item) => item.label === 'Draft' && item.value?.includes('Working through the final answer.')), true);
  assert.equal(items.some((item) => item.label === 'Final answer' && item.value === 'Final answer ready.'), true);
  assert.equal(items.some((item) => item.label === 'Run completed' && item.value?.includes('42')), true);
});
