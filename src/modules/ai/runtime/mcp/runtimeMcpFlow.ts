import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

export const DEFAULT_RUNTIME_MCP_SERVER_ID = 'goodnight-skills';

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

export const formatRuntimeMcpToolCallResult = (toolCall: RuntimeMcpToolCall) => {
  if (toolCall.error) {
    return `MCP ${toolCall.serverId}/${toolCall.toolName} 调用失败。\n\n${toolCall.error}`;
  }

  const preview = toolCall.resultPreview.trim();
  if (!preview) {
    return `MCP ${toolCall.serverId}/${toolCall.toolName} 已完成。\n\n${toolCall.summary}`;
  }

  return `MCP ${toolCall.serverId}/${toolCall.toolName}\n\n${toolCall.summary}\n\n${preview}`;
};

export const buildRuntimeMcpReplayPayload = (toolCall: RuntimeMcpToolCall) =>
  `${toolCall.serverId}/${toolCall.toolName}: ${toolCall.summary}`;

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
