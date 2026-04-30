import { create } from 'zustand';
import type { GNAgentShellMode } from './types';

type GNAgentShellState = {
  mode: GNAgentShellMode;
  claudeConfigId: string | null;
  codexConfigId: string | null;
  setMode: (mode: GNAgentShellMode) => void;
  setProviderConfigId: (providerId: 'claude' | 'codex', configId: string | null) => void;
};

export const useGNAgentShellStore = create<GNAgentShellState>((set) => ({
  mode: 'classic',
  claudeConfigId: null,
  codexConfigId: null,
  setMode: (mode) => set({ mode }),
  setProviderConfigId: (providerId, configId) =>
    set((state) =>
      providerId === 'claude'
        ? { ...state, claudeConfigId: configId }
        : { ...state, codexConfigId: configId }
    ),
}));

