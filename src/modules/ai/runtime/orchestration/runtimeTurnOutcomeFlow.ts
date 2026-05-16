// 文件作用：流程适配层，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把一轮 runtime 执行结果沉淀成活动记录，是“执行完成后置处理层”。
// 它不参与 turn 如何执行，只负责在结束后提炼 changed paths、activity entry 和供 replay / timeline 使用的摘要。
// 如果你在排查“本轮明明改了文件但活动流没显示”或“结果摘要里缺少改动文件”，通常先看这里。
import type { ActivityEntry } from '../../skills/activityLog.ts';

// 这一层负责把 turn 结果翻译成“活动记录 + replay/timeline 摘要”。
// 它不决定如何执行 turn，只负责 turn 结束后如何沉淀结果。
const extractRuntimeChangedPaths = (content: string) =>
  Array.from(content.matchAll(/`([^`]+\.(?:md|json|html|tsx|ts|css))`/g)).map((match) => match[1]);

// 没有显式 changedPaths 时，会从结果正文里尝试提取被反引号包住的文件路径，
// 让活动流至少能展示出本轮涉及了哪些文件。
export const buildRuntimeChangedPathActivityEntry = (input: {
  createId: () => string;
  runId: string;
  content: string;
  changedPaths?: string[];
  runtime?: 'built-in' | 'local';
  skill: string | null;
  createdAt?: number;
}): ActivityEntry | null => {
  const sourceChangedPaths =
    input.changedPaths !== undefined ? input.changedPaths : extractRuntimeChangedPaths(input.content);
  const changedPaths = Array.from(
    new Set(sourceChangedPaths)
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

// project file flow 和 local agent flow 都会在这里把成功/失败结果转成统一摘要，
// 方便 activity log、timeline summary、replay 复用同一套结果描述。
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
  activityEntry:
    input.result.changedPaths.length > 0
      ? {
          id: input.createId(),
          runId: input.runId,
          type: 'run-summary' as const,
          summary: input.result.message,
          changedPaths: input.result.changedPaths,
          runtime: 'built-in' as const,
          skill: 'project-file-ops',
          createdAt: input.createdAt ?? Date.now(),
        }
      : null,
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
  changedPaths: string[];
  skill: string | null;
  agentId: string;
  createdAt?: number;
}) => ({
  activityEntry: buildRuntimeChangedPathActivityEntry({
    createId: input.createId,
    runId: input.runId,
    content: input.content,
    changedPaths: input.changedPaths,
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
