import type { ActivityEntry } from '../../skills/activityLog.ts';

const extractRuntimeChangedPaths = (content: string) =>
  Array.from(content.matchAll(/`([^`]+\.(?:md|json|html|tsx|ts|css))`/g)).map((match) => match[1]);

export const buildRuntimeChangedPathActivityEntry = (input: {
  createId: () => string;
  runId: string;
  content: string;
  changedPaths?: string[];
  runtime?: 'built-in' | 'local';
  skill: string | null;
  createdAt?: number;
}): ActivityEntry | null => {
  const changedPaths = Array.from(
    new Set((input.changedPaths && input.changedPaths.length > 0 ? input.changedPaths : extractRuntimeChangedPaths(input.content)))
  );
  if (changedPaths.length === 0) {
    return null;
  }

  return {
    id: input.createId(),
    runId: input.runId,
    type: 'run-summary',
    summary: `更新了 ${changedPaths.join('、')}`,
    changedPaths,
    runtime: input.runtime || 'built-in',
    skill: input.skill,
    createdAt: input.createdAt ?? Date.now(),
  };
};

export const buildRuntimeProjectFileAutoExecuteSuccess = (input: {
  createId: () => string;
  runId: string;
  result: {
    message: string;
    changedPaths: string[];
  };
  preview: string;
  createdAt?: number;
}) => ({
  proposalStatus: 'executed' as const,
  executionMessage: input.result.message,
  activityEntry: {
    id: input.createId(),
    runId: input.runId,
    type: 'run-summary' as const,
    summary: input.result.message,
    changedPaths: input.result.changedPaths,
    runtime: 'built-in' as const,
    skill: 'project-file-ops',
    createdAt: input.createdAt ?? Date.now(),
  },
  timelineSummary: `File operation flow completed: ${input.preview}`,
  replaySummary: `File operation flow completed: ${input.preview}`,
});

export const buildRuntimeProjectFileAutoExecuteFailure = (input: {
  createId: () => string;
  runId: string;
  message: string;
  operationPaths: string[];
  preview: string;
  createdAt?: number;
}) => ({
  proposalStatus: 'failed' as const,
  executionMessage: input.message,
  activityEntry: {
    id: input.createId(),
    runId: input.runId,
    type: 'failed' as const,
    summary: input.message,
    changedPaths: input.operationPaths,
    runtime: 'built-in' as const,
    skill: 'project-file-ops',
    createdAt: input.createdAt ?? Date.now(),
  },
  timelineSummary: `File operation flow completed: ${input.preview}`,
  replaySummary: `File operation flow completed: ${input.preview}`,
});

export const buildRuntimeLocalAgentSuccessOutcome = (input: {
  createId: () => string;
  runId: string;
  content: string;
  skill: string | null;
  agentId: string;
  createdAt?: number;
}) => ({
  activityEntry: buildRuntimeChangedPathActivityEntry({
    createId: input.createId,
    runId: input.runId,
    content: input.content,
    runtime: 'local',
    skill: input.skill,
    createdAt: input.createdAt,
  }),
  timelineSummary: `Local agent completed: ${input.agentId}`,
  replaySummary: input.content,
});

export const buildRuntimeLocalAgentFailureOutcome = (input: {
  createId: () => string;
  runId: string;
  message: string;
  skill: string | null;
  preview: string;
  createdAt?: number;
}) => ({
  activityEntry: {
    id: input.createId(),
    runId: input.runId,
    type: 'failed' as const,
    summary: input.message,
    changedPaths: [],
    runtime: 'local' as const,
    skill: input.skill,
    createdAt: input.createdAt ?? Date.now(),
  },
  timelineSummary: `Error: ${input.preview}`,
  replaySummary: input.message,
});

export const buildRuntimeLocalAgentExecutionCompletedStep = (
  replaySummary: string
): {
  title: string;
  status: 'completed';
  userVisibleDetail: string;
  resultSummary: string;
} => ({
  title: 'Completed turn',
  status: 'completed',
  userVisibleDetail: replaySummary,
  resultSummary: replaySummary,
});

export const buildRuntimeLocalAgentExecutionFailedStep = (
  replaySummary: string
): {
  title: string;
  status: 'failed';
  userVisibleDetail: string;
  resultSummary: string;
} => ({
  title: 'Failed turn',
  status: 'failed',
  userVisibleDetail: replaySummary,
  resultSummary: replaySummary,
});
