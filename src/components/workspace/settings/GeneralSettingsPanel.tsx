import React from 'react';
import packageInfo from '../../../../package.json';
import { useShallow } from 'zustand/react/shallow';
import {
  NEW_WINDOW_BEHAVIOR_OPTIONS,
  STARTUP_PAGE_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  UPDATE_CHANNEL_OPTIONS,
  useGeneralSettingsStore,
  type NewWindowBehavior,
  type StartupPage,
  type UiLanguage,
  type UpdateChannel,
} from '../../../modules/settings/generalSettingsStore';
import { isTauriRuntimeAvailable } from '../../../utils/projectPersistence';
import {
  SettingsFieldRow,
  SettingsSelectControl,
  SettingsToggleControl,
} from './SettingsFieldRow';
import { SettingsReadonlyCard } from './SettingsReadonlyCard';
import { SettingsSection } from './SettingsSection';

const buildRuntimeInfo = () => {
  const runtimeLabel = isTauriRuntimeAvailable() ? '桌面端运行时' : '浏览器预览运行时';
  const platformLabel = typeof navigator === 'undefined'
    ? '未知平台'
    : (
      ('userAgentData' in navigator
        ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
        : null) ||
      navigator.platform ||
      '未知平台'
    );
  const languageLabel = typeof navigator === 'undefined' ? '未知语言' : navigator.language;

  return {
    runtimeLabel,
    platformLabel,
    languageLabel,
  };
};

const getBuildChannelLabel = (buildChannel: string) => {
  switch (buildChannel) {
    case 'stable':
      return '稳定版';
    case 'preview':
      return '预览版';
    default:
      return '开发版';
  }
};

export const GeneralSettingsPanel: React.FC = () => {
  const {
    uiLanguage,
    startupPage,
    restoreLastSessionOnLaunch,
    openRecentWorkspaceOnLaunch,
    autoUpdateEnabled,
    updateChannel,
    newWindowBehavior,
    updateGeneralSettings,
  } = useGeneralSettingsStore(useShallow((state) => ({
    uiLanguage: state.uiLanguage,
    startupPage: state.startupPage,
    restoreLastSessionOnLaunch: state.restoreLastSessionOnLaunch,
    openRecentWorkspaceOnLaunch: state.openRecentWorkspaceOnLaunch,
    autoUpdateEnabled: state.autoUpdateEnabled,
    updateChannel: state.updateChannel,
    newWindowBehavior: state.newWindowBehavior,
    updateGeneralSettings: state.updateGeneralSettings,
  })));

  const runtimeInfo = buildRuntimeInfo();
  const buildChannel = import.meta.env.DEV ? 'dev' : packageInfo.version.includes('-') ? 'preview' : 'stable';
  const aboutPayload = JSON.stringify(
    {
      version: packageInfo.version,
      buildChannel,
      runtime: runtimeInfo.runtimeLabel,
      platform: runtimeInfo.platformLabel,
      locale: runtimeInfo.languageLabel,
    },
    null,
    2,
  );

  const handleCopyAbout = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(aboutPayload);
  };

  return (
    <div className="chat-settings-panel-surface">
      <SettingsSection
        title="语言与启动"
        description="语言、启动和更新。"
      >
        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>语言</strong>
            <span>设置界面语言。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="应用语言"
              hint="选择“系统”时自动跟随设备语言。"
            >
              <SettingsSelectControl
                value={uiLanguage}
                options={UI_LANGUAGE_OPTIONS}
                onChange={(next) => updateGeneralSettings({ uiLanguage: next as UiLanguage })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>启动</strong>
            <span>控制默认进入位置和恢复行为。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="启动页"
              hint="决定启动后先进入哪个一级工作区。"
            >
              <SettingsSelectControl
                value={startupPage}
                options={STARTUP_PAGE_OPTIONS}
                onChange={(next) => updateGeneralSettings({ startupPage: next as StartupPage })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="新窗口默认行为"
              hint="决定新窗口默认打开的位置。"
            >
              <SettingsSelectControl
                value={newWindowBehavior}
                options={NEW_WINDOW_BEHAVIOR_OPTIONS}
                onChange={(next) => updateGeneralSettings({ newWindowBehavior: next as NewWindowBehavior })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="启动时恢复上次会话"
              hint="恢复最近项目和工作上下文。"
            >
              <SettingsToggleControl
                checked={restoreLastSessionOnLaunch}
                onChange={(next) => updateGeneralSettings({ restoreLastSessionOnLaunch: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="优先打开最近工作区"
              hint="最近工作区仍存在时优先进入。"
            >
              <SettingsToggleControl
                checked={openRecentWorkspaceOnLaunch}
                onChange={(next) => updateGeneralSettings({ openRecentWorkspaceOnLaunch: next })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>更新</strong>
            <span>管理自动检查和更新通道。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="自动检查更新"
              hint="关闭后仍可手动检查。"
            >
              <SettingsToggleControl
                checked={autoUpdateEnabled}
                onChange={(next) => updateGeneralSettings({ autoUpdateEnabled: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="更新通道"
              hint="预览版更快，稳定版更稳。"
            >
              <SettingsSelectControl
                value={updateChannel}
                options={UPDATE_CHANNEL_OPTIONS}
                onChange={(next) => updateGeneralSettings({ updateChannel: next as UpdateChannel })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>关于</strong>
            <span>版本和运行环境信息。</span>
          </div>
          <div className="chat-settings-static-grid">
            <SettingsReadonlyCard label="版本号" value={packageInfo.version} />
            <SettingsReadonlyCard label="发布通道" value={getBuildChannelLabel(buildChannel)} />
            <SettingsReadonlyCard label="运行时" value={runtimeInfo.runtimeLabel} />
            <SettingsReadonlyCard label="平台" value={runtimeInfo.platformLabel} />
            <SettingsReadonlyCard label="系统语言" value={runtimeInfo.languageLabel} />
          </div>
          <div className="chat-settings-note-actions">
            <button className="chat-settings-inline-btn" type="button" onClick={() => void handleCopyAbout()}>
              复制诊断信息
            </button>
          </div>
        </section>
      </SettingsSection>
    </div>
  );
};
