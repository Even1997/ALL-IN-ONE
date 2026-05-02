import assert from 'node:assert/strict';
import test from 'node:test';

const loadFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeTurnOutcomeFlow.ts?test=${Date.now()}`);

test('runtime turn outcome flow builds changed-path activity entries and branch-specific outcomes', async () => {
  const {
    buildRuntimeChangedPathActivityEntry,
    buildRuntimeProjectFileAutoExecuteSuccess,
    buildRuntimeProjectFileAutoExecuteFailure,
    buildRuntimeLocalAgentSuccessOutcome,
    buildRuntimeLocalAgentFailureOutcome,
  } = await loadFlow();

  const createId = () => 'activity-1';

  const changedPathEntry = buildRuntimeChangedPathActivityEntry({
    createId,
    runId: 'run-1',
    content: 'Updated `src/app.tsx` and `README.md`.',
    skill: 'page',
  });
  assert.deepEqual(changedPathEntry, {
    id: 'activity-1',
    runId: 'run-1',
    type: 'run-summary',
    summary: '更新了 src/app.tsx、README.md',
    changedPaths: ['src/app.tsx', 'README.md'],
    runtime: 'built-in',
    skill: 'page',
    createdAt: changedPathEntry.createdAt,
  });

  assert.equal(
    buildRuntimeChangedPathActivityEntry({
      createId,
      runId: 'run-2',
      content: 'No file references here.',
      skill: null,
    }),
    null,
  );

  const projectFileSuccess = buildRuntimeProjectFileAutoExecuteSuccess({
    createId,
    runId: 'run-3',
    result: {
      message: '已执行文件操作',
      changedPaths: ['README.md'],
    },
    preview: 'create readme',
  });
  assert.equal(projectFileSuccess.proposalStatus, 'executed');
  assert.equal(projectFileSuccess.executionMessage, '已执行文件操作');
  assert.equal(projectFileSuccess.activityEntry.runtime, 'built-in');
  assert.equal(projectFileSuccess.timelineSummary, 'File operation flow completed: create readme');
  assert.equal(projectFileSuccess.replaySummary, 'File operation flow completed: create readme');

  const projectFileFailure = buildRuntimeProjectFileAutoExecuteFailure({
    createId,
    runId: 'run-4',
    message: '写入失败',
    operationPaths: ['src/app.ts'],
    preview: 'edit app',
  });
  assert.equal(projectFileFailure.proposalStatus, 'failed');
  assert.equal(projectFileFailure.executionMessage, '写入失败');
  assert.equal(projectFileFailure.activityEntry.type, 'failed');

  const localAgentSuccess = buildRuntimeLocalAgentSuccessOutcome({
    createId,
    runId: 'run-5',
    content: 'Updated `src/app.tsx`.',
    skill: 'page',
    agentId: 'codex',
  });
  assert.equal(localAgentSuccess.activityEntry?.runtime, 'local');
  assert.equal(localAgentSuccess.timelineSummary, 'Local agent completed: codex');
  assert.equal(localAgentSuccess.replaySummary, 'Updated `src/app.tsx`.');

  const localAgentFailure = buildRuntimeLocalAgentFailureOutcome({
    createId,
    runId: 'run-6',
    message: 'CLI missing',
    skill: 'page',
    preview: 'CLI missing',
  });
  assert.equal(localAgentFailure.activityEntry.type, 'failed');
  assert.equal(localAgentFailure.timelineSummary, 'Error: CLI missing');
  assert.equal(localAgentFailure.replaySummary, 'CLI missing');
});
