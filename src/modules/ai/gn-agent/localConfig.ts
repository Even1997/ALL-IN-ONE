import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence';

export type LocalConfigProbeEntry = {
  path: string;
  exists: boolean;
  content: string | null;
};

export type LocalAgentConfigSnapshot = {
  homeDir: string;
  claudeHome: LocalConfigProbeEntry;
  claudeSettings: LocalConfigProbeEntry;
  claudeCommands: LocalConfigProbeEntry;
  claudePlugins: LocalConfigProbeEntry;
  codexHome: LocalConfigProbeEntry;
  codexSkills: LocalConfigProbeEntry;
  codexAgents: LocalConfigProbeEntry;
};

export const getLocalAgentConfigSnapshot = async (): Promise<LocalAgentConfigSnapshot | null> => {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  try {
    return await invoke<LocalAgentConfigSnapshot>('get_local_agent_config_snapshot');
  } catch {
    return null;
  }
};
