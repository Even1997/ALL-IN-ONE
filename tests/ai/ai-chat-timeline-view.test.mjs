import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('timeline view keeps raw tool logs out of the main assistant message path', async () => {
  const source = await readFile('src/components/workspace/AIChatConversationMessagesPane.tsx', 'utf8');

  assert.match(source, /renderTimelineProjection/);
  assert.doesNotMatch(source, /buildRuntimeExecutionTimelineCards/);
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

  assert.equal(items.some((item) => item.label === 'PowerShell' && item.value === 'npm run build'), true);
  assert.equal(items.some((item) => item.label === 'stdout' && item.mono === true), true);
  assert.equal(items.some((item) => item.label === 'stderr' && item.tone === 'warning'), true);
  assert.equal(items.some((item) => item.label === '退出码' && item.value === '0'), true);
  assert.equal(items.some((item) => item.label === '修改' && item.value?.includes('AIChat.tsx')), true);
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

test('chat surface keeps runtime question interaction cards wired for pending ask-user events', async () => {
  const chatSource = await readFile('src/components/workspace/AIChat.tsx', 'utf8');

  assert.match(chatSource, /AIChatRuntimeTimelineInteractionEvent/);
  assert.match(chatSource, /event\.kind === 'question'/);
  assert.doesNotMatch(chatSource, /const renderRuntimeQuestionCard = useCallback\(\s*\(_message: StoredChatMessage\) => null/);
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

  assert.equal(items.some((item) => item.label === 'Run' && item.value === 'built-in / agent'), true);
  assert.equal(items.some((item) => item.label === 'Response' && item.value === 'Generating assistant reply'), true);
  assert.equal(items.some((item) => item.label === 'Draft' && item.value?.includes('Working through the final answer.')), true);
  assert.equal(items.some((item) => item.label === 'Final answer' && item.value === 'Final answer ready.'), true);
  assert.equal(items.some((item) => item.label === 'Run completed' && item.value?.includes('42')), true);
});
