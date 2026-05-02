import assert from 'node:assert/strict';
import test from 'node:test';

const loadWorkflowFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeWorkflowFlow.ts?test=${Date.now()}`);

test('runtime workflow flow builds chat-facing completion content from latest run state', async () => {
  const { buildRuntimeWorkflowCompletion } = await loadWorkflowFlow();

  const awaiting = buildRuntimeWorkflowCompletion({
    targetPackage: 'requirements',
    latestRun: {
      status: 'awaiting_confirmation',
      currentStage: 'requirements_spec',
      stageSummaries: {
        requirements_spec: '需求说明已生成',
      },
    },
  });

  assert.equal(
    awaiting.finalContent,
    '已在当前对话中执行 requirements 能力链。\n当前结果已生成，正在等待你确认后再继续下一段。\n需求说明已生成',
  );
  assert.equal(awaiting.activitySummary, 'AI 执行了 requirements 能力链');
  assert.equal(awaiting.timelineSummary, 'Workflow completed: requirements');

  const fallback = buildRuntimeWorkflowCompletion({
    targetPackage: 'page',
    latestRun: null,
  });
  assert.equal(fallback.finalContent, '已在当前对话中执行 page 能力链。');
  assert.equal(fallback.activitySummary, 'AI 执行了 page 能力链');
  assert.equal(fallback.timelineSummary, 'Workflow completed: page');
});
