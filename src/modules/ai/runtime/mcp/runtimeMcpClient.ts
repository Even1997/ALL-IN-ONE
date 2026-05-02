import { invoke } from '@tauri-apps/api/core';
import { getDefaultRuntimeSkillDefinitions } from '../../skills/skillLibrary';
import { isTauriRuntimeAvailable } from '../../../../utils/projectPersistence';
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

const DEFAULT_RUNTIME_MCP_SERVER: RuntimeMcpServer = {
  id: 'goodnight-skills',
  name: 'GoodNight Skills',
  status: 'connected',
  transport: 'builtin',
  description: 'Expose GoodNight local skills as a built-in MCP server.',
  enabled: true,
  toolNames: ['list-skills'],
  tools: [
    {
      name: 'list-skills',
      description: 'List the currently discoverable GoodNight skills.',
      requiresApproval: false,
    },
  ],
};

export const listRuntimeMcpServers = () =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeMcpServer[]>('list_runtime_mcp_servers')
    : Promise.resolve([DEFAULT_RUNTIME_MCP_SERVER]);

export const upsertRuntimeMcpServer = (input: RuntimeMcpServer) =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeMcpServer>('upsert_runtime_mcp_server', { input })
    : Promise.resolve(input);

export const listRuntimeMcpToolCalls = (threadId: string) =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeMcpToolCall[]>('list_runtime_mcp_tool_calls', { threadId })
    : Promise.resolve([]);

export const invokeRuntimeMcpTool = (input: {
  threadId: string;
  serverId: string;
  toolName: string;
  argumentsText?: string;
}): Promise<RuntimeMcpToolCall> =>
  isTauriRuntimeAvailable()
    ? invoke<RuntimeMcpToolCall>('invoke_runtime_mcp_tool', { input })
    : Promise.resolve({
        id: `mcp-call_${Date.now()}`,
        threadId: input.threadId,
        serverId: input.serverId,
        toolName: input.toolName,
        status: 'completed' as const,
        summary: `Listed ${getDefaultRuntimeSkillDefinitions().length} runtime skills`,
        resultPreview: getDefaultRuntimeSkillDefinitions()
          .map((skill) => `${skill.id} - ${skill.name}`)
          .join('\n'),
        argumentsText: input.argumentsText || '',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: null,
      });
