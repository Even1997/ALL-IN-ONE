// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence';

export type AgentShellProviderMode = 'classic' | 'claude' | 'codex';

export type AgentShellSettingsRecord = {
  mode: AgentShellProviderMode;
  claudeConfigId: string | null;
  codexConfigId: string | null;
};

type UpdateAgentShellSettingsInput = {
  mode?: AgentShellProviderMode;
  claudeConfigId?: string | null;
  clearClaudeConfigId?: boolean;
  codexConfigId?: string | null;
  clearCodexConfigId?: boolean;
};

let localShellSettings: AgentShellSettingsRecord = {
  mode: 'classic',
  claudeConfigId: null,
  codexConfigId: null,
};

const normalizeProviderMode = (value: string | null | undefined): AgentShellProviderMode =>
  value === 'claude' || value === 'codex' ? value : 'classic';

const normalizeShellSettings = (settings: AgentShellSettingsRecord): AgentShellSettingsRecord => ({
  mode: normalizeProviderMode(settings.mode),
  claudeConfigId: settings.claudeConfigId || null,
  codexConfigId: settings.codexConfigId || null,
});

export const getAgentShellSettings = async (): Promise<AgentShellSettingsRecord> => {
  if (!isTauriRuntimeAvailable()) {
    return localShellSettings;
  }

  return normalizeShellSettings(await invoke<AgentShellSettingsRecord>('get_agent_shell_settings'));
};

export const updateAgentShellSettings = async (
  input: UpdateAgentShellSettingsInput,
): Promise<AgentShellSettingsRecord> => {
  if (!isTauriRuntimeAvailable()) {
    localShellSettings = normalizeShellSettings({
      mode: input.mode ?? localShellSettings.mode,
      claudeConfigId: input.clearClaudeConfigId ? null : input.claudeConfigId ?? localShellSettings.claudeConfigId,
      codexConfigId: input.clearCodexConfigId ? null : input.codexConfigId ?? localShellSettings.codexConfigId,
    });
    return localShellSettings;
  }

  return normalizeShellSettings(
    await invoke<AgentShellSettingsRecord>('update_agent_shell_settings', {
      input,
    }),
  );
};
