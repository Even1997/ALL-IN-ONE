import assert from 'node:assert/strict';
import test from 'node:test';

const loadSelectors = async () =>
  import(`../../src/components/workspace/runtimeInteractionSelectors.ts?test=${Date.now()}`);

test('runtime interaction selectors return the latest pending approval event for assistant messages', async () => {
  const { getLatestPendingRuntimeApprovalEvent } = await loadSelectors();
  const approvalEvent = getLatestPendingRuntimeApprovalEvent({
    role: 'assistant',
    timeline: [
      {
        id: 'approval-approved',
        kind: 'approval',
        approvalId: 'approval-approved',
        actionType: 'tool_edit',
        summary: 'Already approved',
        riskLevel: 'medium',
        status: 'approved',
        createdAt: 10,
      },
      {
        id: 'approval-pending',
        kind: 'approval',
        approvalId: 'approval-pending',
        actionType: 'tool_edit',
        summary: 'Still waiting',
        riskLevel: 'high',
        status: 'pending',
        createdAt: 20,
      },
    ],
  });

  assert.equal(approvalEvent?.approvalId, 'approval-pending');
});

test('runtime interaction selectors ignore non-assistant messages and resolved-only approvals', async () => {
  const { getLatestPendingRuntimeApprovalEvent } = await loadSelectors();

  assert.equal(
    getLatestPendingRuntimeApprovalEvent({
      role: 'user',
      timeline: [
        {
          id: 'approval-pending',
          kind: 'approval',
          approvalId: 'approval-pending',
          actionType: 'tool_edit',
          summary: 'Still waiting',
          riskLevel: 'high',
          status: 'pending',
          createdAt: 20,
        },
      ],
    }),
    null,
  );

  assert.equal(
    getLatestPendingRuntimeApprovalEvent({
      role: 'assistant',
      timeline: [
        {
          id: 'approval-approved',
          kind: 'approval',
          approvalId: 'approval-approved',
          actionType: 'tool_edit',
          summary: 'Already approved',
          riskLevel: 'medium',
          status: 'approved',
          createdAt: 10,
        },
      ],
    }),
    null,
  );
});

test('runtime interaction selectors return the latest question event for assistant messages', async () => {
  const { getLatestRuntimeQuestionEvent } = await loadSelectors();
  const questionEvent = getLatestRuntimeQuestionEvent({
    role: 'assistant',
    timeline: [
      {
        id: 'question-1',
        kind: 'question',
        questionId: 'question-1',
        payload: {
          id: 'question-1',
          status: 'pending',
          questions: [{ question: 'First question?' }],
          createdAt: 10,
        },
        createdAt: 10,
      },
      {
        id: 'question-2',
        kind: 'question',
        questionId: 'question-2',
        payload: {
          id: 'question-2',
          status: 'answered',
          questions: [{ question: 'Latest question?' }],
          answers: { continue: 'yes' },
          createdAt: 20,
        },
        createdAt: 20,
      },
    ],
  });

  assert.equal(questionEvent?.questionId, 'question-2');
});
