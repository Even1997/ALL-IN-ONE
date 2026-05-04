import assert from 'node:assert/strict';
import test from 'node:test';

const loadProjectFileFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeProjectFileFlow.ts?test=${Date.now()}`);

test('runtime project file flow prepares proposal and approval decision from plan and sandbox policy', async () => {
  const {
    buildProjectFileApprovalActionType,
    buildProjectFileDecisionFeedback,
    executeRuntimeProjectFileRead,
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

  const stillNeedsReview = prepareProjectFileProposalFlow({
    proposalId: 'proposal-2b',
    mode: 'auto',
    plan: {
      status: 'ready',
      assistantMessage: 'edit app',
      summary: 'Edit src/app.ts',
      operations: [{ id: '2', type: 'edit_file', targetPath: 'src/app.ts', summary: 'edit app' }],
    },
    sandboxPolicy: 'allow',
  });
  assert.equal(stillNeedsReview.decision, 'approval-required');
  assert.equal(stillNeedsReview.proposal.status, 'pending');

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

test('runtime project file read carries conversation history into the prompt', async () => {
  const { executeRuntimeProjectFileRead } = await loadProjectFileFlow();

  let capturedPrompt = '';
  const result = await executeRuntimeProjectFileRead({
    userInput: '\u518d\u770b\u4e00\u4e0b\u521a\u624d\u90a3\u4e2a\u6587\u4ef6',
    conversationHistory: [
      { role: 'user', content: '\u8bfb\u4e00\u4e0b docs/prd.md' },
      { role: 'assistant', content: '\u6211\u521a\u770b\u4e86 docs/prd.md\uff0c\u4e3b\u8981\u662f\u767b\u5f55\u6d41\u7a0b\u89c4\u5212\u3002' },
    ],
    projectName: 'Demo',
    projectRoot: 'C:\\repo\\demo',
    allowedTools: ['glob', 'grep', 'ls', 'view'],
    readFiles: async ({ prompt }) => {
      capturedPrompt = prompt;
      return 'ok';
    },
  });

  assert.equal(result, 'ok');
  assert.match(capturedPrompt, /recent_conversation:/);
  assert.match(capturedPrompt, /docs\/prd\.md/);
});
