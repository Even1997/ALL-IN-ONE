import { invoke } from '@tauri-apps/api/core';
import { getSystemRuntimeSkillDefinitions } from '../../skills/skillLibrary';
import { isTauriRuntimeAvailable } from '../../../../utils/projectPersistence';
import { ensureDesktopRuntimeSidecar } from '../../../runtime-sidecar/desktopRuntimeSidecar.ts';
import type {
  RuntimeMcpDeleteResult,
  RuntimeMcpServer,
  RuntimeMcpToolCall,
} from './runtimeMcpTypes';

const DEFAULT_RUNTIME_MCP_SERVER: RuntimeMcpServer = {
  id: 'goodnight-skills',
  name: 'GoodNight Skills',
  status: 'connected',
  transport: 'builtin',
  description: 'Expose GoodNight local skills as a built-in MCP server.',
  enabled: true,
  toolNames: ['list-skills'],
  command: null,
  args: [],
  env: {},
  url: null,
  headers: {},
  headersHelper: null,
  oauth: null,
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
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.listMcpServers() : invoke<RuntimeMcpServer[]>('list_runtime_mcp_servers')))
    : Promise.resolve([DEFAULT_RUNTIME_MCP_SERVER]);

export const upsertRuntimeMcpServer = (input: RuntimeMcpServer) =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.upsertMcpServer(input) : invoke<RuntimeMcpServer>('upsert_runtime_mcp_server', { input })))
    : Promise.resolve(input);

export const deleteRuntimeMcpServer = (id: string) =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.deleteMcpServer(id) : invoke<RuntimeMcpDeleteResult>('delete_runtime_mcp_server', { id })))
    : Promise.resolve({ id, deleted: true });

export const listRuntimeMcpToolCalls = (threadId: string) =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.listMcpToolCalls(threadId) : invoke<RuntimeMcpToolCall[]>('list_runtime_mcp_tool_calls', { threadId })))
    : Promise.resolve([]);

export const invokeRuntimeMcpTool = (input: {
  threadId: string;
  serverId: string;
  toolName: string;
  argumentsText?: string;
}): Promise<RuntimeMcpToolCall> =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.invokeMcpTool(input) : invoke<RuntimeMcpToolCall>('invoke_runtime_mcp_tool', { input })))
    : Promise.resolve({
        id: `mcp-call_${Date.now()}`,
        threadId: input.threadId,
        serverId: input.serverId,
        toolName: input.toolName,
        status: 'completed' as const,
        summary: `Listed ${getSystemRuntimeSkillDefinitions().length} runtime skills`,
        resultPreview: getSystemRuntimeSkillDefinitions()
          .map((skill) => `${skill.id} - ${skill.name}`)
          .join('\n'),
        argumentsText: input.argumentsText || '',
        startedAt: Date.now(),
        completedAt: Date.now(),
        error: null,
      });
