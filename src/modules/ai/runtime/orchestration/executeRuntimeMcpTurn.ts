// 文件作用：执行器，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把“MCP 命令执行”收口成聊天 runtime 可消费的一次 turn 结果，是 MCP 执行适配层。
// 它位于 runtimeMcpFlow 之上，把底层 tool call 结果翻译成 content、timelineSummary、replayPayload 等聊天侧结构。
// 如果你在排查“MCP 调用了但聊天时间线没写对 / replay 内容不完整”，一般先看这里的结果封装。
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
