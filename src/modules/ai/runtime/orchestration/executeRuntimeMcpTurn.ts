import {
  buildRuntimeMcpReplayPayload,
  executeRuntimeMcpCommand,
  formatRuntimeMcpToolCallResult,
  type RuntimeMcpCommand,
} from '../mcp/runtimeMcpFlow.ts';
import type { RuntimeMcpServer, RuntimeMcpToolCall } from '../mcp/runtimeMcpTypes.ts';
import { buildMcpLifecycleOutcomeDescriptor } from '../dispatch/runtimeCapabilityLifecycle.ts';

type ExecuteRuntimeMcpTurnFailure = {
  status: 'failed';
  message: string;
};

type ExecuteRuntimeMcpTurnSuccess = {
  status: 'completed' | 'error';
  toolCall: RuntimeMcpToolCall;
  content: string;
  timelineSummary: string;
  replaySummary: string;
  replayPayload: string;
};

export type ExecuteRuntimeMcpTurnResult =
  | ExecuteRuntimeMcpTurnFailure
  | ExecuteRuntimeMcpTurnSuccess;

export async function executeRuntimeMcpTurn(input: {
  command: RuntimeMcpCommand;
  servers: RuntimeMcpServer[];
  threadId: string;
  invokeTool: (payload: {
    threadId: string;
    serverId: string;
    toolName: string;
    argumentsText?: string;
  }) => Promise<RuntimeMcpToolCall>;
}): Promise<ExecuteRuntimeMcpTurnResult> {
  const result = await executeRuntimeMcpCommand({
    command: input.command,
    servers: input.servers,
    threadId: input.threadId,
    invokeTool: input.invokeTool,
  });

  if (result.status === 'failed') {
    return result;
  }

  const { toolCall } = result;
  const lifecycle = buildMcpLifecycleOutcomeDescriptor(toolCall);

  return {
    status: result.status,
    toolCall,
    content: formatRuntimeMcpToolCallResult(toolCall),
    timelineSummary: lifecycle.timelineSummary,
    replaySummary: lifecycle.replaySummary,
    replayPayload: buildRuntimeMcpReplayPayload(toolCall),
  };
}
