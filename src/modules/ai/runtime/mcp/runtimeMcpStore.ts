import { create } from 'zustand';
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

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
  setServers: (servers) => set({ servers: [...servers] }),
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
  clearThreadToolCalls: (threadId) =>
    set((state) => ({
      toolCallsByThread: Object.fromEntries(
        Object.entries(state.toolCallsByThread).filter(([key]) => key !== threadId),
      ),
    })),
  appendToolCall: (threadId, toolCall) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...(state.toolCallsByThread[threadId] || []), toolCall],
      },
    })),
}));
