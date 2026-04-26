import { create } from 'zustand';
import type { ClaudianShellMode } from './types';

type ClaudianShellState = {
  mode: ClaudianShellMode;
  claudeConfigId: string | null;
  codexConfigId: string | null;
  setMode: (mode: ClaudianShellMode) => void;
  setProviderConfigId: (providerId: 'claude' | 'codex', configId: string | null) => void;
};

export const useClaudianShellStore = create<ClaudianShellState>((set) => ({
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
