import type { AIWorkflowPackage, AIWorkflowRun } from '../../../../types';

type RuntimeWorkflowSnapshot = Pick<AIWorkflowRun, 'status' | 'currentStage' | 'stageSummaries'> | null;

export const buildRuntimeWorkflowCompletion = (input: {
  targetPackage: AIWorkflowPackage;
  latestRun: RuntimeWorkflowSnapshot;
}) => {
  const currentStageSummary = input.latestRun?.currentStage
    ? input.latestRun.stageSummaries[input.latestRun.currentStage] || ''
    : '';

  const finalContent = [
    `已在当前对话中执行 ${input.targetPackage} 能力链。`,
    input.latestRun?.status === 'awaiting_confirmation'
      ? '当前结果已生成，正在等待你确认后再继续下一段。'
      : null,
    currentStageSummary || null,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');

  return {
    finalContent: finalContent || '已在当前对话中开始执行对应能力链。',
    activitySummary: `AI 执行了 ${input.targetPackage} 能力链`,
    timelineSummary: `Workflow completed: ${input.targetPackage}`,
  };
};
