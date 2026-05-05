import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeEventId,
  syncRuntimeEventsWithToolCalls,
  syncTeamRunRuntimeEvents,
  createAgentEventState,
  mapRuntimeEvents,
  reduceAgentEvent,
  sanitizeAgentVisibleText,
  upsertRuntimeApprovalEvent,
  upsertRuntimeQuestionEvent,
  upsertRuntimeToolResultEvent,
  upsertRuntimeToolUseEvent,
} from '../../src/modules/ai/runtime/dispatch/agentEvents.ts';

test('agent event reducer keeps visible text, reasoning, tools, and results separate', () => {
  let state = createAgentEventState();

  state = reduceAgentEvent(state, { type: 'reasoning_delta', text: 'Check files first. ' });
  state = reduceAgentEvent(state, { type: 'text_delta', text: 'I will inspect the project.' });
  state = reduceAgentEvent(state, {
    type: 'tool_call_started',
    toolCall: {
      id: 'call-1',
      name: 'ls',
      input: { path: '.' },
      status: 'running',
      resultPreview: '',
    },
  });
  state = reduceAgentEvent(state, {
    type: 'tool_result',
    toolCallId: 'call-1',
    name: 'ls',
    status: 'completed',
    content: 'src\npackage.json',
  });
  state = reduceAgentEvent(state, { type: 'final_text', text: 'The project contains src and package.json.' });

  assert.equal(state.visibleText, 'I will inspect the project.\n\nThe project contains src and package.json.');
  assert.equal(state.reasoningText, 'Check files first.');
  assert.equal(state.toolCalls.length, 1);
  assert.equal(state.toolCalls[0].status, 'completed');
  assert.equal(state.toolCalls[0].resultPreview, 'src\npackage.json');
  assert.equal(state.toolResultsByCallId['call-1'].content, 'src\npackage.json');
});

test('agent visible text sanitizer removes legacy tool protocol and transcript echoes', () => {
  const raw = [
    '好的，我先看一下。',
    '<tool_use>',
    '</tool_use>',
    'user:',
    'Tool ls result:',
    '<tool_result name="ls" status="success">',
    'src',
    '</tool_result>',
    '可以继续了。',
  ].join('\n');

  const cleaned = sanitizeAgentVisibleText(raw);

  assert.equal(cleaned, '好的，我先看一下。\n\n可以继续了。');
  assert.doesNotMatch(cleaned, /tool_use|tool_result|Tool ls result|^user:/m);
});

test('agent visible text sanitizer strips standalone xml declaration lines', () => {
  const raw = [
    'I checked the asset file.',
    '<?xml version="1.0" encoding="UTF-8"?>',
    'The SVG header should not show in chat.',
  ].join('\n');

  const cleaned = sanitizeAgentVisibleText(raw);

  assert.equal(cleaned, 'I checked the asset file.\n\nThe SVG header should not show in chat.');
  assert.doesNotMatch(cleaned, /<\?xml version=/i);
});

test('agent runtime event helpers upsert tool use and result records', () => {
  const started = upsertRuntimeToolUseEvent(undefined, {
    toolCallId: 'call-1',
    parentToolCallId: 'parent-1',
    toolName: 'view',
    toolInput: { file_path: 'src/app.ts' },
    status: 'running',
  });

  assert.equal(started.length, 1);
  assert.equal(started[0].id, buildRuntimeEventId('tool_use', 'call-1'));
  assert.equal(started[0].kind, 'tool_use');
  assert.equal(started[0].createdAt > 0, true);

  const createdAt = started[0].createdAt;
  const completed = upsertRuntimeToolUseEvent(started, {
    toolCallId: 'call-1',
    parentToolCallId: 'parent-1',
    toolName: 'view',
    toolInput: { file_path: 'src/app.ts', limit: 20 },
    status: 'completed',
  });

  assert.equal(completed.length, 1);
  assert.equal(completed[0].createdAt, createdAt);
  assert.deepEqual(completed[0].input, { file_path: 'src/app.ts', limit: 20 });

  const withResult = upsertRuntimeToolResultEvent(completed, {
    toolCallId: 'call-1',
    parentToolCallId: 'parent-1',
    toolName: 'view',
    status: 'completed',
    output: 'file content',
  });

  assert.equal(withResult.length, 2);
  assert.equal(withResult[1].id, buildRuntimeEventId('tool_result', 'call-1'));
  assert.equal(withResult[1].kind, 'tool_result');
  assert.equal(withResult[1].output, 'file content');
});

test('agent runtime event helpers upsert approval and question records with stable timestamps', () => {
  const withApproval = upsertRuntimeApprovalEvent(undefined, {
    id: 'approval-event-1',
    kind: 'approval',
    approvalId: 'approval-1',
    toolCallId: 'call-1',
    actionType: 'bash',
    summary: 'Run command',
    riskLevel: 'high',
    status: 'pending',
    createdAt: 10,
  });
  const withApprovalUpdate = upsertRuntimeApprovalEvent(withApproval, {
    ...withApproval[0],
    status: 'approved',
    createdAt: 99,
  });
  const withQuestion = upsertRuntimeQuestionEvent(withApprovalUpdate, {
    id: 'question-event-1',
    kind: 'question',
    questionId: 'question-1',
    payload: {
      id: 'question-1',
      toolCallId: 'call-2',
      status: 'pending',
      questions: [{ question: 'Continue?' }],
      createdAt: 11,
    },
    createdAt: 11,
  });

  assert.equal(withApprovalUpdate[0].createdAt, 10);
  assert.equal(withApprovalUpdate[0].status, 'approved');
  assert.equal(withQuestion[1].kind, 'question');
  assert.equal(withQuestion[1].createdAt, 11);
});

test('agent runtime event helpers map matching events in place', () => {
  const updated = mapRuntimeEvents(
    [
      {
        id: 'approval-event-1',
        kind: 'approval',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        actionType: 'edit',
        summary: 'Edit file',
        riskLevel: 'medium',
        status: 'pending',
        createdAt: 1,
      },
      {
        id: 'question-event-1',
        kind: 'question',
        questionId: 'question-1',
        payload: {
          id: 'question-1',
          toolCallId: 'call-2',
          status: 'pending',
          questions: [{ question: 'Path?' }],
          createdAt: 2,
        },
        createdAt: 2,
      },
    ],
    (event) => event.kind === 'approval' && event.approvalId === 'approval-1',
    (event) => (event.kind === 'approval' ? { ...event, status: 'denied' } : event)
  );

  assert.equal(updated[0].status, 'denied');
  assert.equal(updated[1].kind, 'question');
});

test('agent runtime event helpers sync tool call snapshots into ordered runtime events', () => {
  const events = syncRuntimeEventsWithToolCalls(undefined, [
    {
      id: 'call-1',
      name: 'ls',
      input: { path: '.' },
      status: 'completed',
      resultPreview: 'src',
      resultContent: 'src\npackage.json',
    },
  ]);

  assert.deepEqual(
    events.map((event) => event.kind),
    ['tool_use', 'tool_result'],
  );
  assert.equal(events[0].toolCallId, 'call-1');
  assert.equal(events[1].output, 'src\npackage.json');
});

test('agent runtime event helpers project team runs into parented runtime events', () => {
  const events = syncTeamRunRuntimeEvents(undefined, 'team-root', {
    id: 'team-1',
    phases: [
      {
        id: 'phase-1',
        title: 'Inspect',
        summary: 'Read files',
        goal: 'Understand project',
        status: 'completed',
        startedAt: 1,
        completedAt: 2,
      },
    ],
    members: [
      {
        id: 'member-1',
        phaseId: 'phase-1',
        title: 'Read package',
        agentId: 'codex',
        role: 'reader',
        status: 'completed',
        result: 'package read',
        error: null,
        startedAt: 1,
        completedAt: 2,
      },
    ],
  });

  assert.deepEqual(
    events.map((event) => `${event.kind}:${event.toolName}:${event.parentToolCallId}`),
    [
      'tool_use:team_phase:team-root',
      'tool_result:team_phase:team-root',
      'tool_use:team_member_task:team-phase:team-1:phase-1',
      'tool_result:team_member_task:team-phase:team-1:phase-1',
    ],
  );
});
