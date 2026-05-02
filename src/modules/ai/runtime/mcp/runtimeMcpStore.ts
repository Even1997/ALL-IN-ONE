import { create } from 'zustand';
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

type RuntimeMcpStoreState = {
  servers: RuntimeMcpServer[];
  toolCallsByThread: Record<string, RuntimeMcpToolCall[]>;
  setServers: (servers: RuntimeMcpServer[]) => void;
  upsertServer: (server: RuntimeMcpServer) => void;
  setToolCalls: (threadId: string, toolCalls: RuntimeMcpToolCall[]) => void;
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
  setToolCalls: (threadId, toolCalls) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...toolCalls],
      },
    })),
  appendToolCall: (threadId, toolCall) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...(state.toolCallsByThread[threadId] || []), toolCall],
      },
    })),
}));
