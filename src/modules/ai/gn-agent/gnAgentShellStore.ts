import { create } from 'zustand';
import type { GNAgentShellMode } from './types';
import type { AgentShellProviderMode } from './gnAgentShellClient';

type GNAgentShellState = {
  mode: GNAgentShellMode;
  providerMode: AgentShellProviderMode;
  claudeConfigId: string | null;
  codexConfigId: string | null;
  setMode: (mode: GNAgentShellMode) => void;
  setProviderMode: (mode: AgentShellProviderMode) => void;
  setProviderConfigId: (providerId: 'claude' | 'codex', configId: string | null) => void;
  hydrateProviderSettings: (settings: {
    providerMode: AgentShellProviderMode;
    claudeConfigId: string | null;
    codexConfigId: string | null;
  }) => void;
};

export const useGNAgentShellStore = create<GNAgentShellState>((set) => ({
  mode: 'classic',
  providerMode: 'classic',
  claudeConfigId: null,
  codexConfigId: null,
  setMode: (mode) => set({ mode }),
  setProviderMode: (providerMode) => set({ providerMode }),
  setProviderConfigId: (providerId, configId) =>
    set((state) =>
      providerId === 'claude'
        ? { ...state, claudeConfigId: configId }
        : { ...state, codexConfigId: configId }
    ),
  hydrateProviderSettings: ({ providerMode, claudeConfigId, codexConfigId }) =>
    set((state) => ({
      ...state,
      providerMode,
      claudeConfigId,
      codexConfigId,
    })),
}));
