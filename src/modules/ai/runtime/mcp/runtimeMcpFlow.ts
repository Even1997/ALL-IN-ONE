// 文件作用：流程适配层，位于MCP 运行时层。
// 所在链路：负责 MCP server、命令、调用结果与前端状态衔接。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';
// 这个文件负责把聊天中的 `@mcp` 输入解析成结构化命令，并执行成标准 MCP 调用结果。
// 它位于用户输入和 MCP 调用之间，解决“命令怎么识别、怎么回传结果”。
// 如果你在排查“@mcp 为什么没被当成命令处理”，先看这里。
import { buildMcpLifecycleOutcomeDescriptor } from '../dispatch/runtimeCapabilityLifecycle.ts';

export const DEFAULT_RUNTIME_MCP_SERVER_ID = 'goodnight-skills';

// 这一层负责把用户在聊天里写的 @mcp 命令解析成结构化调用，
// 再把执行结果整理成 runtime / replay / timeline 可继续消费的文本。
export type RuntimeMcpCommand = {
  serverId: string;
  toolName: string;
  argumentsText: string;
};

export type RuntimeMcpCommandFailure = {
  status: 'failed';
  message: string;
};

export type RuntimeMcpCommandSuccess = {
  status: 'completed' | 'error';
  toolCall: RuntimeMcpToolCall;
};

// 输入支持两种形态：
// 1. @mcp <tool> ...
// 2. @mcp <serverId> <tool> ...
// 如果没写 serverId，就默认走内建 goodnight-skills。
export const parseRuntimeMcpCommand = (
  input: string,
  servers: RuntimeMcpServer[],
): RuntimeMcpCommand | null => {
  const match = input.match(/^@mcp\b([\s\S]*)$/i);
  if (!match) {
    return null;
  }

  const body = match[1]?.trim() || '';
  if (!body) {
    return {
      serverId: DEFAULT_RUNTIME_MCP_SERVER_ID,
      toolName: 'list-skills',
      argumentsText: '',
    };
  }

  const parts = body.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const knownServerIds = new Set(servers.map((server) => server.id));
  if (parts.length >= 2 && knownServerIds.has(parts[0])) {
    return {
      serverId: parts[0],
      toolName: parts[1],
      argumentsText: parts.slice(2).join(' '),
    };
  }

  return {
    serverId: DEFAULT_RUNTIME_MCP_SERVER_ID,
    toolName: parts[0],
    argumentsText: parts.slice(1).join(' '),
  };
};

// toolCall 的展示文案统一复用 lifecycle descriptor，避免聊天区和 replay 说法不一致。
export const formatRuntimeMcpToolCallResult = (toolCall: RuntimeMcpToolCall) =>
  buildMcpLifecycleOutcomeDescriptor(toolCall).output;

// replay 里只需要一条轻量摘要，便于把 MCP 调用嵌进更大的回放轨迹。
export const buildRuntimeMcpReplayPayload = (toolCall: RuntimeMcpToolCall) =>
  `${toolCall.serverId}/${toolCall.toolName}: ${toolCall.summary}`;

// 这是“校验 server/tool 是否存在 -> 实际调用 -> 返回标准结果”的执行入口。
// 它只负责命令执行流，不负责把结果写入 UI store。
export const executeRuntimeMcpCommand = async (input: {
  command: RuntimeMcpCommand;
  servers: RuntimeMcpServer[];
  threadId: string;
  invokeTool: (payload: {
    threadId: string;
    serverId: string;
    toolName: string;
    argumentsText?: string;
  }) => Promise<RuntimeMcpToolCall>;
}): Promise<RuntimeMcpCommandFailure | RuntimeMcpCommandSuccess> => {
  const mcpServer = input.servers.find((server) => server.id === input.command.serverId) || null;
  if (!mcpServer) {
    return {
      status: 'failed',
      message: `MCP server 不存在：${input.command.serverId}`,
    };
  }

  if (mcpServer.toolNames.length > 0 && !mcpServer.toolNames.includes(input.command.toolName)) {
    return {
      status: 'failed',
      message: `MCP tool 不存在：${input.command.serverId}/${input.command.toolName}`,
    };
  }

  // invokeTool 由外层注入，这样这里可以保持与具体 sidecar / tauri 调用方式解耦。
  const toolCall = await input.invokeTool({
    threadId: input.threadId,
    serverId: input.command.serverId,
    toolName: input.command.toolName,
    argumentsText: input.command.argumentsText,
  });

  return {
    status: toolCall.error ? 'error' : 'completed',
    toolCall,
  };
};
