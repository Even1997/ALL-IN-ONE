// 文件作用：前端客户端适配层，位于MCP 运行时层。
// 所在链路：负责 MCP server、命令、调用结果与前端状态衔接。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { invoke } from '@tauri-apps/api/core';
// 这个 client 负责在前端侧访问 runtime MCP 服务。
// 它会优先走 desktop sidecar，再回退到 tauri invoke，最后给出最小本地 fallback。
// 如果你在排查“为什么拉不到 MCP server/tool call 数据”，先看这里。
import { getSystemRuntimeSkillDefinitions } from '../../skills/skillLibrary';
import { isTauriRuntimeAvailable } from '../../../../utils/projectPersistence';
import { ensureDesktopRuntimeSidecar } from '../../../runtime-sidecar/desktopRuntimeSidecar.ts';
import type {
  RuntimeMcpDeleteResult,
  RuntimeMcpServer,
  RuntimeMcpToolCall,
} from './runtimeMcpTypes';

// client 层负责决定“从哪里拿 MCP 数据”：
// 优先走 desktop runtime sidecar；拿不到 sidecar 时退回 tauri invoke；
// 再不行则给前端一个最小的本地 fallback。
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

// 列出 MCP servers 是配置页和聊天命令解析的基础入口。
// 本地 fallback 只暴露内建 skills server，保证无 sidecar 时界面也不至于全空。
export const listRuntimeMcpServers = () =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.listMcpServers() : invoke<RuntimeMcpServer[]>('list_runtime_mcp_servers')))
    : Promise.resolve([DEFAULT_RUNTIME_MCP_SERVER]);

// upsert / delete 只做 transport 分发，不掺杂 store 逻辑。
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

// MCP tool call 历史按 threadId 拉取，供聊天线程侧边轨迹或回放使用。
export const listRuntimeMcpToolCalls = (threadId: string) =>
  isTauriRuntimeAvailable()
    ? ensureDesktopRuntimeSidecar()
        .then((client) => (client ? client.listMcpToolCalls(threadId) : invoke<RuntimeMcpToolCall[]>('list_runtime_mcp_tool_calls', { threadId })))
    : Promise.resolve([]);

// 真实桌面环境下这里会透传给 sidecar / tauri。
// 非桌面 fallback 只模拟 list-skills 这一类最基础场景，主要用于保持开发环境可跑通。
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
