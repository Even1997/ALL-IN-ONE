// 文件作用：提供 Agent Shell 的轻量高级设置，只保留本地 CLI 模式、本地检测与诊断信息。
// 所在链路：设置页 UI composition。
// 排查入口：先看 loadPanelState / commitSettings，再看本地探测卡片与 sidecar 诊断卡片。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { appConfigDir, appDataDir, homeDir, join } from '@tauri-apps/api/path';
import {
  getAgentShellSettings,
  updateAgentShellSettings,
  type AgentShellProviderMode,
  type AgentShellSettingsRecord,
} from '../../../modules/ai/gn-agent/gnAgentShellClient';
import { useGNAgentShellStore } from '../../../modules/ai/gn-agent/gnAgentShellStore';
import { getLocalAgentConfigSnapshot, type LocalAgentConfigSnapshot } from '../../../modules/ai/gn-agent/localConfig';
import {
  ensureDesktopRuntimeSidecar,
  getDesktopRuntimeSidecarStatus,
  subscribeDesktopRuntimeSidecarStatus,
} from '../../../modules/runtime-sidecar/desktopRuntimeSidecar';
import { isTauriRuntimeAvailable, openPathInShell } from '../../../utils/projectPersistence';
import { SettingsFieldRow, SettingsSelectControl } from './SettingsFieldRow';
import { SettingsReadonlyCard } from './SettingsReadonlyCard';
import { SettingsSection } from './SettingsSection';

type AdvancedDiagnostics = {
  runtimeSettingsPath: string;
  shellSettingsPath: string;
  projectStorageSettingsPath: string;
  skillsLibraryPath: string;
  runtimeHealthy: boolean;
  sidecarConnected: boolean;
};

const PROVIDER_MODE_OPTIONS: Array<{
  value: AgentShellProviderMode;
  label: string;
  description: string;
}> = [
  { value: 'classic', label: '经典', description: '使用内置工作流，保持当前默认 Agent 体验。' },
  { value: 'claude', label: 'Claude', description: '把 Agent Shell 切到本地 Claude CLI 页签。' },
  { value: 'codex', label: 'Codex', description: '把 Agent Shell 切到本地 Codex CLI 页签。' },
];

const buildUnavailableDiagnostics = (): AdvancedDiagnostics => ({
  runtimeSettingsPath: '需要桌面端运行时',
  shellSettingsPath: '需要桌面端运行时',
  projectStorageSettingsPath: '需要桌面端运行时',
  skillsLibraryPath: '需要桌面端运行时',
  runtimeHealthy: false,
  sidecarConnected: false,
});

const renderStatusNote = (
  status: 'loading' | 'idle' | 'saving' | 'error',
  message: string,
  desktopRuntimeAvailable: boolean,
) => {
  if (!message) {
    return null;
  }

  const toneClass = status === 'error'
    ? 'is-error'
    : desktopRuntimeAvailable
      ? 'is-success'
      : 'is-warning';

  return (
    <div className={`chat-settings-status-note ${toneClass}`}>
      <strong>{status === 'error' ? '保存失败' : desktopRuntimeAvailable ? '设置已更新' : '桌面端提示'}</strong>
      <span>{message}</span>
    </div>
  );
};

export const AdvancedSettingsPanel: React.FC = () => {
  const desktopRuntimeAvailable = isTauriRuntimeAvailable();
  const hydrateProviderSettings = useGNAgentShellStore((state) => state.hydrateProviderSettings);
  const [shellSettings, setShellSettings] = useState<AgentShellSettingsRecord | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<LocalAgentConfigSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<AdvancedDiagnostics>(buildUnavailableDiagnostics());
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const loadDiagnostics = useCallback(async () => {
    if (!desktopRuntimeAvailable) {
      setDiagnostics(buildUnavailableDiagnostics());
      return;
    }

    const [nextAppDataDir, nextAppConfigDir, nextHomeDir] = await Promise.all([
      appDataDir(),
      appConfigDir(),
      homeDir(),
    ]);

    const [
      runtimeSettingsPath,
      shellSettingsPath,
      projectStorageSettingsPath,
      skillsLibraryPath,
    ] = await Promise.all([
      join(nextAppDataDir, 'agent-runtime', 'runtime-settings.json'),
      join(nextAppDataDir, 'agent-shell', 'settings.json'),
      join(nextAppConfigDir, 'project-storage.json'),
      join(nextAppDataDir, 'goodnight-skills'),
    ]);

    const sidecarStatus = getDesktopRuntimeSidecarStatus();
    setDiagnostics({
      runtimeSettingsPath,
      shellSettingsPath,
      projectStorageSettingsPath,
      skillsLibraryPath,
      runtimeHealthy: sidecarStatus.phase === 'ready',
      sidecarConnected: sidecarStatus.phase === 'ready',
    });

    setLocalSnapshot((current) => current ? {
      ...current,
      homeDir: current.homeDir || nextHomeDir,
    } : current);
  }, [desktopRuntimeAvailable]);

  const loadPanelState = useCallback(async () => {
    setStatus('loading');
    setMessage('');

    try {
      const [nextShellSettings, snapshot] = await Promise.all([
        getAgentShellSettings(),
        getLocalAgentConfigSnapshot(),
      ]);
      setShellSettings(nextShellSettings);
      setLocalSnapshot(snapshot);
      hydrateProviderSettings({
        providerMode: nextShellSettings.mode,
      });
      await loadDiagnostics();
      if (!desktopRuntimeAvailable) {
        setMessage('浏览器模式下仅保留预览；sidecar 诊断和路径打开需要桌面端运行时。');
      }
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '高级设置加载失败。');
    }
  }, [desktopRuntimeAvailable, hydrateProviderSettings, loadDiagnostics]);

  useEffect(() => {
    void loadPanelState();
  }, [loadPanelState]);

  useEffect(() => {
    const unsubscribe = subscribeDesktopRuntimeSidecarStatus((nextStatus) => {
      setDiagnostics((current) => ({
        ...current,
        runtimeHealthy: nextStatus.phase === 'ready',
        sidecarConnected: nextStatus.phase === 'ready',
      }));
    });

    void ensureDesktopRuntimeSidecar().catch(() => undefined);
    return unsubscribe;
  }, []);

  const commitSettings = useCallback(
    async (patch: { mode?: AgentShellProviderMode }) => {
      setStatus('saving');
      setMessage('');

      try {
        const nextSettings = await updateAgentShellSettings(patch);
        setShellSettings(nextSettings);
        hydrateProviderSettings({
          providerMode: nextSettings.mode,
        });
        setMessage('高级设置已保存。');
        setStatus('idle');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : '高级设置保存失败。');
      }
    },
    [hydrateProviderSettings],
  );

  const statusNote = useMemo(
    () => renderStatusNote(status, message, desktopRuntimeAvailable),
    [desktopRuntimeAvailable, message, status],
  );

  if (!shellSettings) {
    return (
      <div className="chat-settings-panel-surface">
        <SettingsSection
          eyebrow="高级"
          title="高级设置"
          description={status === 'error' ? '未能读取 shell 模式与运行诊断。' : '正在读取 Shell 模式与本地运行时路径。'}
          actions={<span>{status === 'error' ? '加载失败' : '加载中'}</span>}
        >
          <section className="chat-settings-section-block">
            <div className="chat-settings-section-header">
              <strong>{status === 'error' ? '加载失败' : '正在准备'}</strong>
              <span>{message || '完成加载后，这里会显示真实的 Shell 模式、路径和运行状态。'}</span>
            </div>
            {status === 'error' ? (
              <div className="chat-settings-note-actions">
                <button className="chat-settings-inline-btn" type="button" onClick={() => void loadPanelState()}>
                  重新加载
                </button>
              </div>
            ) : null}
          </section>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="chat-settings-panel-surface">
      <SettingsSection
        title="运行与诊断"
        description="只保留本地 CLI 模式切换与真实运行诊断，不再在这里绑定云端 AI 配置。"
      >
        {statusNote}

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>Agent 运行模式</strong>
            <span>决定 Agent Shell 当前优先展示 classic、Claude 还是 Codex 本地入口。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="Shell 模式"
              hint="切换后会同步更新 Agent Shell 的 providerMode。"
            >
              <SettingsSelectControl
                value={shellSettings.mode}
                options={PROVIDER_MODE_OPTIONS}
                disabled={status === 'saving'}
                onChange={(next) => void commitSettings({ mode: next })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>本地探测</strong>
            <span>只读信息来自本地配置探测，用于快速判断 Claude / Codex 目录是否存在。</span>
          </div>
          <div className="chat-settings-static-grid">
            <SettingsReadonlyCard
              label="Claude 主目录"
              value={localSnapshot?.claudeHome.exists ? '已发现' : '未发现'}
              meta={localSnapshot?.claudeHome.path || '不可用'}
              tone={localSnapshot?.claudeHome.exists ? 'success' : 'warning'}
            />
            <SettingsReadonlyCard
              label="Codex 主目录"
              value={localSnapshot?.codexHome.exists ? '已发现' : '未发现'}
              meta={localSnapshot?.codexHome.path || '不可用'}
              tone={localSnapshot?.codexHome.exists ? 'success' : 'warning'}
            />
            <SettingsReadonlyCard
              label="Codex 技能目录"
              value={localSnapshot?.codexSkills.path || diagnostics.skillsLibraryPath}
              mono
            />
            <SettingsReadonlyCard
              label="工作区 homeDir"
              value={localSnapshot?.homeDir || '不可用'}
              mono
            />
          </div>
          <div className="chat-settings-note-actions">
            {localSnapshot?.claudeHome.path ? (
              <button
                className="chat-settings-inline-btn"
                type="button"
                disabled={!desktopRuntimeAvailable}
                onClick={() => void openPathInShell(localSnapshot.claudeHome.path)}
              >
                打开 Claude 目录
              </button>
            ) : null}
            {localSnapshot?.codexHome.path ? (
              <button
                className="chat-settings-inline-btn"
                type="button"
                disabled={!desktopRuntimeAvailable}
                onClick={() => void openPathInShell(localSnapshot.codexHome.path)}
              >
                打开 Codex 目录
              </button>
            ) : null}
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>诊断</strong>
            <span>路径与状态都来自真实运行时信息，用于排查设置文件和 sidecar 连通性。</span>
          </div>
          <div className="chat-settings-static-grid">
            <SettingsReadonlyCard
              label="Runtime 健康状态"
              value={diagnostics.runtimeHealthy ? '正常' : '不可用'}
              tone={diagnostics.runtimeHealthy ? 'success' : 'warning'}
            />
            <SettingsReadonlyCard
              label="Sidecar 连接"
              value={diagnostics.sidecarConnected ? '已连接' : '未连接'}
              tone={diagnostics.sidecarConnected ? 'success' : 'warning'}
            />
            <SettingsReadonlyCard label="runtimeSettingsPath" value={diagnostics.runtimeSettingsPath} mono />
            <SettingsReadonlyCard label="shellSettingsPath" value={diagnostics.shellSettingsPath} mono />
            <SettingsReadonlyCard label="projectStorageSettingsPath" value={diagnostics.projectStorageSettingsPath} mono />
            <SettingsReadonlyCard label="skillsLibraryPath" value={diagnostics.skillsLibraryPath} mono />
          </div>
        </section>
      </SettingsSection>
    </div>
  );
};
