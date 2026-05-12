import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const bridgePath = path.join(
  repoRoot,
  'src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts',
);

test('runtime sidecar session bridge preserves assistant timelines from snapshots', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /message\.role === 'assistant'/);
  assert.match(source, /messageTimeline/);
  assert.match(source, /timeline:\s*messageTimeline/);
});

test('runtime sidecar live bridge does not expose raw reasoning text in canonical progress events', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.doesNotMatch(source, /detail:\s*reasoning\.content/);
});

test('runtime sidecar live bridge keeps message deltas out of persisted chat messages and feeds canonical response events instead', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /type:\s*'message\.delta'/);
  assert.match(source, /ensureRuntimeAssistantMessage\(/);
  assert.doesNotMatch(
    source,
    /eventType === 'message\.delta'[\s\S]*?chatStore\.updateMessage/,
  );
});

test('runtime sidecar session bridge derives canonical timeline events from assistant snapshot messages', async () => {
  const { buildCanonicalEventsFromRuntimeMessages } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarCanonical.ts?test=${Date.now()}`
  );

  const createdAt = 100;
  const approvalResolvedAt = createdAt + 40;
  const questionAnsweredAt = createdAt + 50;
  const events = buildCanonicalEventsFromRuntimeMessages({
    sessionId: 'session-1',
    providerId: 'codex',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Final answer',
        createdAt,
        timeline: [
          {
            id: 'reasoning-1',
            kind: 'reasoning',
            content: 'Inspecting project files',
            collapsed: false,
            status: 'completed',
            createdAt: createdAt + 1,
          },
          {
            id: 'tool-use-1',
            kind: 'tool_use',
            toolCallId: 'tool-1',
            toolName: 'powershell',
            input: { command: 'npm run build' },
            status: 'completed',
            createdAt: createdAt + 2,
          },
          {
            id: 'tool-result-1',
            kind: 'tool_result',
            toolCallId: 'tool-1',
            toolName: 'powershell',
            status: 'completed',
            output: 'build ok',
            createdAt: createdAt + 3,
          },
          {
            id: 'approval-1',
            kind: 'approval',
            approvalId: 'approval-1',
            actionType: 'shell_command',
            summary: 'Need approval',
            riskLevel: 'medium',
            status: 'approved',
            createdAt: createdAt + 4,
            resolvedAt: approvalResolvedAt,
          },
          {
            id: 'question-1',
            kind: 'question',
            questionId: 'question-1',
            payload: {
              id: 'question-1',
              status: 'answered',
              questions: [{ question: 'Continue?' }],
              answers: { continue: 'yes' },
              createdAt: createdAt + 5,
              answeredAt: questionAnsweredAt,
            },
            createdAt: createdAt + 5,
          },
        ],
      },
    ],
  });

  assert.equal(events.some((event) => event.type === 'run.started' && event.runId === 'assistant-1'), true);
  const reasoningEvent = events.find((event) => event.type === 'reasoning.delta');

  assert.equal(reasoningEvent?.payload.textChunk, 'Inspecting project files');
  assert.equal(events.some((event) => event.type === 'progress.updated'), false);
  assert.equal(events.some((event) => event.type === 'tool.started' && event.payload.toolCallId === 'tool-1'), true);
  assert.equal(events.some((event) => event.type === 'tool.completed' && event.payload.toolCallId === 'tool-1'), true);
  assert.equal(events.some((event) => event.type === 'approval.requested' && event.payload.approvalId === 'approval-1'), true);
  assert.equal(events.some((event) => event.type === 'approval.resolved' && event.payload.approvalId === 'approval-1'), true);
  assert.equal(events.some((event) => event.type === 'question.requested' && event.payload.questionId === 'question-1'), true);
  assert.equal(events.some((event) => event.type === 'question.answered' && event.payload.questionId === 'question-1'), true);
  assert.equal(
    events.find((event) => event.type === 'approval.resolved' && event.payload.approvalId === 'approval-1')?.ts,
    approvalResolvedAt,
  );
  assert.equal(
    events.find((event) => event.type === 'question.answered' && event.payload.questionId === 'question-1')?.ts,
    questionAnsweredAt,
  );
  assert.equal(events.some((event) => event.type === 'message.completed' && event.messageId === 'assistant-1'), true);
  assert.equal(events.some((event) => event.type === 'run.completed' && event.runId === 'assistant-1'), true);
});

test('runtime sidecar marks recovered assistant answers successful even after a failed tool inspection', async () => {
  const { buildCanonicalEventsFromRuntimeMessages } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarCanonical.ts?test=${Date.now()}`
  );

  const events = buildCanonicalEventsFromRuntimeMessages({
    sessionId: 'session-1',
    providerId: 'built-in',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'I can still answer directly from the provided context.',
        createdAt: 100,
        timeline: [
          {
            id: 'tool-use-1',
            kind: 'tool_use',
            toolCallId: 'tool-1',
            toolName: 'ls',
            input: { path: '/' },
            status: 'failed',
            createdAt: 110,
          },
          {
            id: 'tool-result-1',
            kind: 'tool_result',
            toolCallId: 'tool-1',
            toolName: 'ls',
            status: 'failed',
            output: 'Cannot access directory outside the current project.',
            createdAt: 120,
          },
        ],
      },
    ],
    snapshotStatus: 'completed',
  });

  const runCompleted = events.find((event) => event.type === 'run.completed');

  assert.equal(runCompleted?.payload.outcome, 'success');
});

test('runtime sidecar does not complete idle snapshots that still have pending user interaction', async () => {
  const { buildCanonicalEventsFromRuntimeMessages } = await import(
    `../../src/modules/runtime-sidecar/runtimeSidecarCanonical.ts?test=${Date.now()}`
  );

  const events = buildCanonicalEventsFromRuntimeMessages({
    sessionId: 'session-1',
    providerId: 'built-in',
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: 100,
        timeline: [
          {
            id: 'approval-1',
            kind: 'approval',
            approvalId: 'approval-1',
            actionType: 'edit',
            summary: 'Approve file edit?',
            riskLevel: 'medium',
            status: 'pending',
            createdAt: 110,
          },
        ],
      },
    ],
    snapshotStatus: 'idle',
  });

  assert.equal(events.some((event) => event.type === 'approval.requested'), true);
  assert.equal(events.some((event) => event.type === 'message.completed'), false);
  assert.equal(events.some((event) => event.type === 'run.completed'), false);
});
