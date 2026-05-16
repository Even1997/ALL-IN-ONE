// 文件作用：状态仓库，位于MCP 运行时层。
// 所在链路：负责 MCP server、命令、调用结果与前端状态衔接。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import { create } from 'zustand';
// 这个 store 保存 MCP 的前端观察状态。
// 主要包括 server 列表，以及按线程分组的 MCP 工具调用历史。
// 如果你在排查“某个 MCP 调用为什么没出现在当前线程里”，先看这里。
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

// 这个 store 只保存 MCP 的前端可观察状态，不负责执行命令。
// 结构上分成两块：
// 1. servers: 当前可见的 MCP 服务端列表
// 2. toolCallsByThread: 每个聊天线程下的工具调用历史
type RuntimeMcpStoreState = {
  servers: RuntimeMcpServer[];
  toolCallsByThread: Record<string, RuntimeMcpToolCall[]>;
  setServers: (servers: RuntimeMcpServer[]) => void;
  upsertServer: (server: RuntimeMcpServer) => void;
  removeServer: (serverId: string) => void;
  setToolCalls: (threadId: string, toolCalls: RuntimeMcpToolCall[]) => void;
  clearThreadToolCalls: (threadId: string) => void;
  appendToolCall: (threadId: string, toolCall: RuntimeMcpToolCall) => void;
};

export const useRuntimeMcpStore = create<RuntimeMcpStoreState>((set) => ({
  servers: [],
  toolCallsByThread: {},
  // 全量刷新 server 列表时直接替换，常见于初始化或设置页重新拉取。
  setServers: (servers) => set({ servers: [...servers] }),
  // upsert 会把最新 server 放到最前面，方便 UI 优先展示最近被编辑或更新的项。
  upsertServer: (server) =>
    set((state) => ({
      servers: [server, ...state.servers.filter((item) => item.id !== server.id)],
    })),
  removeServer: (serverId) =>
    set((state) => ({
      servers: state.servers.filter((item) => item.id !== serverId),
    })),
  setToolCalls: (threadId, toolCalls) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...toolCalls],
      },
    })),
  // 切线程、删线程或重新同步时，需要把该线程下旧的 MCP 轨迹整段清空。
  clearThreadToolCalls: (threadId) =>
    set((state) => ({
      toolCallsByThread: Object.fromEntries(
        Object.entries(state.toolCallsByThread).filter(([key]) => key !== threadId),
      ),
    })),
  // 增量追加通常发生在单次 MCP tool 调用完成后，把结果挂到对应 thread 的尾部。
  appendToolCall: (threadId, toolCall) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...(state.toolCallsByThread[threadId] || []), toolCall],
      },
    })),
}));
