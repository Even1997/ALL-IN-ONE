import assert from 'node:assert/strict';
import test from 'node:test';

const loadLocalAgentFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeLocalAgentFlow.ts?test=${Date.now()}`);

test('runtime local agent flow prepares approval decision, wraps prompt, and normalizes execution output', async () => {
  const {
    buildRuntimeLocalAgentDecisionFeedback,
    buildRuntimeLocalAgentSummary,
    buildRuntimeLocalAgentPrompt,
    prepareRuntimeLocalAgentFlow,
    executeRuntimeLocalAgentPrompt,
  } = await loadLocalAgentFlow();

  assert.equal(buildRuntimeLocalAgentSummary('codex'), '允许 codex 本地 Agent 在当前项目内执行任务');
  assert.equal(
    buildRuntimeLocalAgentPrompt({
      systemPrompt: 'You are helpful.',
      prompt: 'Fix the bug.',
    }),
    '<system>\nYou are helpful.\n</system>\n\nFix the bug.',
  );

  const blocked = prepareRuntimeLocalAgentFlow({
    agentId: 'codex',
    sandboxPolicy: 'deny',
  });
  assert.equal(blocked.decision, 'blocked');
  assert.match(blocked.denialMessage || '', /sandbox policy/i);
  assert.deepEqual(
    buildRuntimeLocalAgentDecisionFeedback({
      decision: 'blocked',
      summary: blocked.summary,
    }),
    {
      timelineSummary: `Sandbox denied: ${blocked.summary}`,
      replaySummary: `Sandbox denied: ${blocked.summary}`,
    },
  );

  const approvalRequired = prepareRuntimeLocalAgentFlow({
    agentId: 'codex',
    sandboxPolicy: 'ask',
  });
  assert.equal(approvalRequired.decision, 'approval-required');
  assert.equal(approvalRequired.pendingMessage, '需要审批后才能启动本地 Agent。');
  assert.deepEqual(
    buildRuntimeLocalAgentDecisionFeedback({
      decision: 'approval-required',
      summary: approvalRequired.summary,
    }),
    {
      timelineSummary: `Approval required: ${approvalRequired.summary}`,
      replaySummary: `Approval required: ${approvalRequired.summary}`,
    },
  );

  const autoExecute = prepareRuntimeLocalAgentFlow({
    agentId: 'codex',
    sandboxPolicy: 'allow',
  });
  assert.equal(autoExecute.decision, 'auto-execute');

  const content = await executeRuntimeLocalAgentPrompt({
    agentId: 'codex',
    projectRoot: 'C:/project',
    prompt: 'Fix the bug.',
    runPrompt: async ({ agent, projectRoot, prompt }) => ({
      success: agent === 'codex' && projectRoot === 'C:/project' && prompt === 'Fix the bug.',
      content: 'Done',
      error: null,
    }),
  });
  assert.equal(content, 'Done');

  await assert.rejects(
    executeRuntimeLocalAgentPrompt({
      agentId: 'codex',
      projectRoot: 'C:/project',
      prompt: 'Fix the bug.',
      runPrompt: async () => ({
        success: false,
        content: '',
        error: 'CLI missing',
      }),
    }),
    /CLI missing/,
  );
});
