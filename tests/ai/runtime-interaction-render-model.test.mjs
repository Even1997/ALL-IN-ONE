import assert from 'node:assert/strict';
import test from 'node:test';

const loadRenderModel = async () =>
  import(`../../src/components/workspace/runtimeInteractionRenderModel.ts?test=${Date.now()}`);

test('runtime interaction render model keeps all assistant approval and question events in chronological order', async () => {
  const { getRuntimeInteractionRenderEntries } = await loadRenderModel();

  const entries = getRuntimeInteractionRenderEntries({
    role: 'assistant',
    timeline: [
      {
        id: 'approval-1',
        kind: 'approval',
        approvalId: 'approval-1',
        actionType: 'tool_edit',
        summary: 'First approval',
        riskLevel: 'medium',
        status: 'pending',
        createdAt: 10,
      },
      {
        id: 'question-1',
        kind: 'question',
        questionId: 'question-1',
        payload: {
          id: 'question-1',
          status: 'pending',
          questions: [{ question: 'Continue?' }],
          createdAt: 20,
        },
        createdAt: 20,
      },
      {
        id: 'approval-2',
        kind: 'approval',
        approvalId: 'approval-2',
        actionType: 'tool_write',
        summary: 'Second approval',
        riskLevel: 'high',
        status: 'approved',
        createdAt: 30,
      },
    ],
  });

  assert.deepEqual(
    entries.map((entry) => [entry.event.kind, entry.event.kind === 'approval' ? entry.event.approvalId : entry.event.questionId]),
    [
      ['approval', 'approval-1'],
      ['question', 'question-1'],
      ['approval', 'approval-2'],
    ],
  );
  assert.deepEqual(entries.map((entry) => entry.timelineOrder), [0, 1, 2]);
});

test('runtime interaction render model ignores non-assistant messages', async () => {
  const { getRuntimeInteractionRenderEntries } = await loadRenderModel();

  assert.deepEqual(
    getRuntimeInteractionRenderEntries({
      role: 'user',
      timeline: [
        {
          id: 'approval-1',
          kind: 'approval',
          approvalId: 'approval-1',
          actionType: 'tool_edit',
          summary: 'First approval',
          riskLevel: 'medium',
          status: 'pending',
          createdAt: 10,
        },
      ],
    }),
    [],
  );
});
