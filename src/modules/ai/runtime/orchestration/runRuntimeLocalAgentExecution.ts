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
