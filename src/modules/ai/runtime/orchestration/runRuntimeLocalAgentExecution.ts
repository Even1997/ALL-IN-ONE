// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import {
  buildRuntimeLocalAgentExecutionCompletedStep,
  buildRuntimeLocalAgentExecutionFailedStep,
  buildRuntimeLocalAgentFailureOutcome,
  buildRuntimeLocalAgentSuccessOutcome,
} from './runtimeTurnOutcomeFlow.ts';
import { executeRuntimeLocalAgentTurn } from './executeRuntimeLocalAgentTurn.ts';

export type RunRuntimeLocalAgentExecutionInput = Parameters<typeof executeRuntimeLocalAgentTurn>[0] & {
  createActivityId: () => string;
  runId: string;
  skill: string | null;
  normalizeErrorMessage: (error: unknown) => string;
  buildErrorPreview: (message: string) => string;
};

export type RunRuntimeLocalAgentExecutionResult =
  | {
      status: 'completed';
      finalContent: string;
      successOutcome: ReturnType<typeof buildRuntimeLocalAgentSuccessOutcome>;
      completedStep: ReturnType<typeof buildRuntimeLocalAgentExecutionCompletedStep>;
    }
  | {
      status: 'failed';
      message: string;
      failureOutcome: ReturnType<typeof buildRuntimeLocalAgentFailureOutcome>;
      failedStep: ReturnType<typeof buildRuntimeLocalAgentExecutionFailedStep>;
    };

export async function runRuntimeLocalAgentExecution(
  input: RunRuntimeLocalAgentExecutionInput
): Promise<RunRuntimeLocalAgentExecutionResult> {
  try {
    const executionResult = await executeRuntimeLocalAgentTurn(input);

    return {
      status: 'completed',
      finalContent: executionResult.finalContent,
      successOutcome: buildRuntimeLocalAgentSuccessOutcome({
        createId: input.createActivityId,
        runId: input.runId,
        content: executionResult.finalContent,
        changedPaths: executionResult.changedPaths,
        skill: input.skill,
        agentId: input.agentId,
      }),
      completedStep: buildRuntimeLocalAgentExecutionCompletedStep(executionResult.finalContent),
    };
  } catch (error) {
    const message = input.normalizeErrorMessage(error);

    return {
      status: 'failed',
      message,
      failureOutcome: buildRuntimeLocalAgentFailureOutcome({
        createId: input.createActivityId,
        runId: input.runId,
        message,
        skill: input.skill,
        preview: input.buildErrorPreview(message),
      }),
      failedStep: buildRuntimeLocalAgentExecutionFailedStep(message),
    };
  }
}
