import assert from 'node:assert/strict';
import test from 'node:test';

const loadProjectFileFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeProjectFileFlow.ts?test=${Date.now()}`);

test('runtime project file flow prepares proposal and approval decision from plan and sandbox policy', async () => {
  const {
    buildProjectFileApprovalActionType,
    buildProjectFileDecisionFeedback,
    prepareProjectFileProposalFlow,
  } = await loadProjectFileFlow();

  assert.equal(
    buildProjectFileApprovalActionType([
      { id: '1', type: 'create_file', targetPath: 'README.md', summary: 'create readme' },
    ]),
    'tool_write',
  );
  assert.equal(
    buildProjectFileApprovalActionType([
      { id: '1', type: 'edit_file', targetPath: 'src/app.ts', summary: 'edit app' },
    ]),
    'tool_edit',
  );
  assert.equal(
    buildProjectFileApprovalActionType([
      { id: '1', type: 'delete_file', targetPath: 'src/app.ts', summary: 'remove app' },
    ]),
    'tool_remove',
  );

  const basePlan = {
    status: 'ready',
    assistantMessage: '我已经整理好本次文件操作计划。',
    summary: '新增 README',
    operations: [{ id: '1', type: 'create_file', targetPath: 'README.md', summary: 'create readme' }],
  };

  const approvalRequired = prepareProjectFileProposalFlow({
    proposalId: 'proposal-1',
    mode: 'manual',
    plan: basePlan,
    sandboxPolicy: 'ask',
  });
  assert.equal(approvalRequired.decision, 'approval-required');
  assert.equal(approvalRequired.proposal.status, 'pending');
  assert.equal(approvalRequired.proposal.executionMessage, '需要审批后执行。');
  assert.equal(approvalRequired.approvalActionType, 'tool_write');
  assert.equal(approvalRequired.riskLevel, 'low');
  assert.deepEqual(
    buildProjectFileDecisionFeedback({
      decision: 'approval-required',
      summary: approvalRequired.proposal.summary,
    }),
    {
      timelineSummary: `Approval required: ${approvalRequired.proposal.summary}`,
      replaySummary: `Approval required: ${approvalRequired.proposal.summary}`,
    },
  );

  const autoExecute = prepareProjectFileProposalFlow({
    proposalId: 'proposal-2',
    mode: 'auto',
    plan: basePlan,
    sandboxPolicy: 'allow',
  });
  assert.equal(autoExecute.decision, 'auto-execute');
  assert.equal(autoExecute.proposal.status, 'executing');

  const blocked = prepareProjectFileProposalFlow({
    proposalId: 'proposal-3',
    mode: 'auto',
    plan: {
      status: 'ready',
      assistantMessage: '',
      summary: '',
      operations: [{ id: '2', type: 'delete_file', targetPath: 'src/app.ts', summary: 'remove app' }],
    },
    sandboxPolicy: 'deny',
  });
  assert.equal(blocked.decision, 'blocked');
  assert.equal(blocked.proposal.status, 'cancelled');
  assert.match(blocked.proposal.executionMessage || '', /sandbox policy/i);
  assert.equal(blocked.approvalActionType, 'tool_remove');
  assert.equal(blocked.riskLevel, 'high');
  assert.deepEqual(
    buildProjectFileDecisionFeedback({
      decision: 'blocked',
      summary: blocked.proposal.summary,
    }),
    {
      timelineSummary: `Sandbox denied: ${blocked.proposal.summary}`,
      replaySummary: `Sandbox denied: ${blocked.proposal.summary}`,
    },
  );
});
