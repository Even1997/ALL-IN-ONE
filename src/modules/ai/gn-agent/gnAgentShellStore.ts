// 文件作用：状态仓库，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { create } from 'zustand';
import type { GNAgentShellMode } from './types';
import type { AgentShellProviderMode } from './gnAgentShellClient';

type GNAgentShellState = {
  mode: GNAgentShellMode;
  providerMode: AgentShellProviderMode;
  setMode: (mode: GNAgentShellMode) => void;
  setProviderMode: (mode: AgentShellProviderMode) => void;
  hydrateProviderSettings: (settings: {
    providerMode: AgentShellProviderMode;
  }) => void;
};

export const useGNAgentShellStore = create<GNAgentShellState>((set) => ({
  mode: 'classic',
  providerMode: 'classic',
  setMode: (mode) => set({ mode }),
  setProviderMode: (providerMode) => set({ providerMode }),
  hydrateProviderSettings: ({ providerMode }) =>
    set((state) => ({
      ...state,
      providerMode,
    })),
}));
