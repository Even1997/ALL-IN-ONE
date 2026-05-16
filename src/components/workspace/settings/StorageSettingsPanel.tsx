// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../../store/projectStore';
import {
  emitProjectStorageSettingsChanged,
  getProjectDir,
  getProjectsIndexPath,
  getProjectStorageSettings,
  getRequirementsDir,
  isTauriRuntimeAvailable,
  openPathInShell,
  resetProjectStorageRoot,
  setProjectStorageRoot,
  type ProjectStorageSettings,
} from '../../../utils/projectPersistence';
import { SettingsDangerAction } from './SettingsDangerAction';
import { SettingsFieldRow } from './SettingsFieldRow';
import { SettingsReadonlyCard } from './SettingsReadonlyCard';
import { SettingsSection } from './SettingsSection';

type StorageDiagnostics = {
  currentProjectDir: string | null;
  requirementsDir: string | null;
  projectsIndexPath: string | null;
};

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

export const StorageSettingsPanel: React.FC = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const desktopRuntimeAvailable = isTauriRuntimeAvailable();
  const [settings, setSettings] = useState<ProjectStorageSettings | null>(null);
  const [draftRootPath, setDraftRootPath] = useState('');
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics>({
    currentProjectDir: null,
    requirementsDir: null,
    projectsIndexPath: null,
  });
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const loadSettings = useCallback(async () => {
    setStatus('loading');
    setMessage('');

    if (!desktopRuntimeAvailable) {
      setSettings({
        rootPath: '',
        defaultPath: '',
        isDefault: true,
      });
      setDraftRootPath('');
      setDiagnostics({
        currentProjectDir: null,
        requirementsDir: null,
        projectsIndexPath: null,
      });
      setStatus('idle');
      setMessage('浏览器模式下只展示说明；项目存储路径、索引文件和目录操作需要桌面端运行时。');
      return;
    }

    try {
      const [nextSettings, projectsIndexPath] = await Promise.all([
        getProjectStorageSettings(),
        getProjectsIndexPath().catch(() => null),
      ]);
      setSettings(nextSettings);
      setDraftRootPath(nextSettings.rootPath);
      setDiagnostics((current) => ({
        ...current,
        projectsIndexPath,
      }));
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '存储设置加载失败。');
    }
  }, [desktopRuntimeAvailable]);

  const loadProjectDiagnostics = useCallback(async () => {
    if (!desktopRuntimeAvailable || !currentProject) {
      setDiagnostics((current) => ({
        ...current,
        currentProjectDir: null,
        requirementsDir: null,
      }));
      return;
    }

    try {
      const [currentProjectDir, requirementsDir] = await Promise.all([
        getProjectDir(currentProject.id),
        getRequirementsDir(currentProject.id),
      ]);
      setDiagnostics((current) => ({
        ...current,
        currentProjectDir,
        requirementsDir,
      }));
    } catch {
      setDiagnostics((current) => ({
        ...current,
        currentProjectDir: null,
        requirementsDir: null,
      }));
    }
  }, [currentProject, desktopRuntimeAvailable]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadProjectDiagnostics();
  }, [loadProjectDiagnostics]);

  const handleSaveRootPath = useCallback(async () => {
    const nextPath = draftRootPath.trim();
    if (!nextPath) {
      setStatus('error');
      setMessage('项目根目录不能为空。');
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      const nextSettings = await setProjectStorageRoot(nextPath);
      setSettings(nextSettings);
      setDraftRootPath(nextSettings.rootPath);
      setStatus('idle');
      setMessage('项目根目录已更新。');
      emitProjectStorageSettingsChanged(nextSettings);
      await loadProjectDiagnostics();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '项目根目录保存失败。');
    }
  }, [draftRootPath, loadProjectDiagnostics]);

  const handleResetRootPath = useCallback(async () => {
    setStatus('saving');
    setMessage('');

    try {
      const nextSettings = await resetProjectStorageRoot();
      setSettings(nextSettings);
      setDraftRootPath(nextSettings.rootPath);
      setStatus('idle');
      setMessage('已恢复默认项目目录。');
      emitProjectStorageSettingsChanged(nextSettings);
      await loadProjectDiagnostics();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '恢复默认目录失败。');
    }
  }, [loadProjectDiagnostics]);

  const handlePickDirectory = useCallback(async () => {
    if (!desktopRuntimeAvailable) {
      return;
    }

    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath: draftRootPath || settings?.rootPath || settings?.defaultPath,
      });

      if (typeof selectedPath !== 'string') {
        return;
      }

      setDraftRootPath(selectedPath);
      setStatus('idle');
      setMessage('目录已选择，点击保存后生效。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '目录选择失败。');
    }
  }, [desktopRuntimeAvailable, draftRootPath, settings?.defaultPath, settings?.rootPath]);

  const statusNote = useMemo(
    () => renderStatusNote(status, message, desktopRuntimeAvailable),
    [desktopRuntimeAvailable, message, status],
  );

  if (!settings) {
    return (
      <div className="chat-settings-panel-surface">
        <SettingsSection
          eyebrow="存储"
          title="存储设置"
          description={status === 'error' ? '未能读取项目存储根目录与诊断路径。' : '正在读取项目根目录与当前项目的真实落盘路径。'}
          actions={<span>{status === 'error' ? '加载失败' : '加载中'}</span>}
        >
          <section className="chat-settings-section-block">
            <div className="chat-settings-section-header">
              <strong>{status === 'error' ? '加载失败' : '正在准备'}</strong>
              <span>{message || '完成加载后，这里会显示真实的项目存储与路径诊断信息。'}</span>
            </div>
            {status === 'error' ? (
              <div className="chat-settings-note-actions">
                <button className="chat-settings-inline-btn" type="button" onClick={() => void loadSettings()}>
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
        title="项目目录"
        description="项目根目录与路径诊断。"
      >
        {statusNote}

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>项目根目录</strong>
            <span>修改后，新项目与按项目 ID 解析的目录都会一起变化。</span>
          </div>
          <SettingsFieldRow
            label="根目录"
            hint="建议保持绝对路径。恢复默认后会回到系统文档目录下的 GoodNight/projects。"
            fullWidth
          >
            <input
              type="text"
              value={draftRootPath}
              disabled={!desktopRuntimeAvailable || status === 'saving'}
              onChange={(event) => setDraftRootPath(event.target.value)}
            />
          </SettingsFieldRow>
          <div className="chat-settings-note-actions">
            <button
              className="chat-settings-inline-btn"
              type="button"
              disabled={!desktopRuntimeAvailable || status === 'saving'}
              onClick={() => void handlePickDirectory()}
            >
              选择目录
            </button>
            <button
              className="chat-settings-inline-btn"
              type="button"
              disabled={!desktopRuntimeAvailable || status === 'saving'}
              onClick={() => void handleSaveRootPath()}
            >
              保存路径
            </button>
            <button
              className="chat-settings-inline-btn"
              type="button"
              disabled={!desktopRuntimeAvailable || !settings.rootPath}
              onClick={() => void openPathInShell(settings.rootPath)}
            >
              打开目录
            </button>
          </div>
          <SettingsDangerAction
            title="恢复默认项目目录"
            description="把 rootPath 恢复到系统默认位置，适合清理测试目录或撤回实验性路径。"
            note="恢复后会同步刷新当前窗口的项目存储状态。"
            actionLabel="恢复默认"
            disabled={!desktopRuntimeAvailable || status === 'saving'}
            onAction={() => void handleResetRootPath()}
          />
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>当前项目</strong>
            <span>如果当前已经打开项目，这里会显示它的真实目录和 requirements 目录。</span>
          </div>
          {currentProject ? (
            <>
              <div className="chat-settings-static-grid">
                <SettingsReadonlyCard label="项目名" value={currentProject.name} meta={currentProject.id} />
                <SettingsReadonlyCard
                  label="项目目录"
                  value={diagnostics.currentProjectDir || (desktopRuntimeAvailable ? '加载中…' : '需要桌面端运行时')}
                  mono
                />
                <SettingsReadonlyCard
                  label="Requirements 目录"
                  value={diagnostics.requirementsDir || (desktopRuntimeAvailable ? '加载中…' : '需要桌面端运行时')}
                  mono
                />
              </div>
              <div className="chat-settings-note-actions">
                {diagnostics.currentProjectDir ? (
                  <button
                    className="chat-settings-inline-btn"
                    type="button"
                    disabled={!desktopRuntimeAvailable}
                    onClick={() => void openPathInShell(diagnostics.currentProjectDir!)}
                  >
                    打开项目目录
                  </button>
                ) : null}
                {diagnostics.requirementsDir ? (
                  <button
                    className="chat-settings-inline-btn"
                    type="button"
                    disabled={!desktopRuntimeAvailable}
                    onClick={() => void openPathInShell(diagnostics.requirementsDir!)}
                  >
                    打开 Requirements
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="chat-settings-static-grid">
              <SettingsReadonlyCard
                label="当前项目"
                value="当前没有打开项目"
                meta="打开项目后，这里会显示 projectDir 和 requirementsDir。"
                tone="warning"
              />
            </div>
          )}
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>诊断</strong>
            <span>只读展示当前根目录、默认目录与项目索引文件位置。</span>
          </div>
          <div className="chat-settings-static-grid">
            <SettingsReadonlyCard label="当前 rootPath" value={settings.rootPath || '需要桌面端运行时'} mono />
            <SettingsReadonlyCard label="默认目录" value={settings.defaultPath || '需要桌面端运行时'} mono />
            <SettingsReadonlyCard label="是否默认目录" value={settings.isDefault ? '是' : '否'} />
            <SettingsReadonlyCard label="项目索引" value={diagnostics.projectsIndexPath || '不可用'} mono />
          </div>
          <div className="chat-settings-note-actions">
            {diagnostics.projectsIndexPath ? (
              <button
                className="chat-settings-inline-btn"
                type="button"
                disabled={!desktopRuntimeAvailable}
                onClick={() => void openPathInShell(diagnostics.projectsIndexPath!)}
              >
                打开索引位置
              </button>
            ) : null}
          </div>
        </section>
      </SettingsSection>
    </div>
  );
};
