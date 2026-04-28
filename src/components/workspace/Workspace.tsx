import React, { useCallback, useState } from 'react';
import { Allotment } from 'allotment';
import { invoke } from '@tauri-apps/api/core';
import { FileExplorer } from './FileExplorer';
import { Terminal } from './Terminal';
import type { DevTask, GeneratedFile } from '../../types';
import { isAbsoluteFilePath, joinFileSystemPath } from '../../utils/fileSystemPaths.ts';
import { WorkbenchIcon } from '../ui/WorkbenchIcon';
import {
  LAYOUT_PREFERENCE_KEYS,
  readLayoutSize,
  writeLayoutSize,
} from '../../utils/layoutPreferences';
import './Workspace.css';

type WorkspaceView = 'files' | 'terminal';

interface WorkspaceProps {
  className?: string;
  files?: GeneratedFile[];
  tasks?: DevTask[];
  recommendedCommands?: string[];
  projectRoot?: string;
}

const WORKSPACE_SIDEBAR_WIDTH_BOUNDS = { min: 200, max: 420 };
const WORKSPACE_ACTIVITY_WIDTH_BOUNDS = { min: 48, max: 220 };
const WORKSPACE_TERMINAL_HEIGHT_BOUNDS = { min: 120, max: 420 };

export const Workspace: React.FC<WorkspaceProps> = ({
  className,
  files = [],
  tasks = [],
  recommendedCommands = [],
  projectRoot = '.',
}) => {
  const [currentView, setCurrentView] = useState<WorkspaceView>('files');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.workspaceSidebarWidth,
      252,
      WORKSPACE_SIDEBAR_WIDTH_BOUNDS
    )
  );
  const [activityWidth, setActivityWidth] = useState(() =>
    readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.workspaceActivityWidth,
      52,
      WORKSPACE_ACTIVITY_WIDTH_BOUNDS
    )
  );
  const [terminalHeight, setTerminalHeight] = useState(() =>
    readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.workspaceTerminalHeight,
      220,
      WORKSPACE_TERMINAL_HEIGHT_BOUNDS
    )
  );

  const handleOuterLayoutChange = useCallback((sizes: number[]) => {
    const [nextSidebarWidth, , nextActivityWidth] = sizes;

    if (Number.isFinite(nextSidebarWidth)) {
      setSidebarWidth(
        writeLayoutSize(
          LAYOUT_PREFERENCE_KEYS.workspaceSidebarWidth,
          nextSidebarWidth,
          WORKSPACE_SIDEBAR_WIDTH_BOUNDS
        )
      );
    }

    if (Number.isFinite(nextActivityWidth)) {
      setActivityWidth(
        writeLayoutSize(
          LAYOUT_PREFERENCE_KEYS.workspaceActivityWidth,
          nextActivityWidth,
          WORKSPACE_ACTIVITY_WIDTH_BOUNDS
        )
      );
    }
  }, []);

  const handleInnerLayoutChange = useCallback((sizes: number[]) => {
    const nextTerminalHeight = sizes[1];
    if (!Number.isFinite(nextTerminalHeight)) {
      return;
    }

    setTerminalHeight(
      writeLayoutSize(
        LAYOUT_PREFERENCE_KEYS.workspaceTerminalHeight,
        nextTerminalHeight,
        WORKSPACE_TERMINAL_HEIGHT_BOUNDS
      )
    );
  }, []);

  const handleFileSelect = useCallback(async (path: string) => {
    setSelectedFile(path);

    try {
      const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_view', {
        params: {
          file_path: path,
          offset: 0,
          limit: 2000,
        },
      });

      setSelectedFileContent(
        result.success
          ? result.content
              .replace(/^<file>\n/, '')
              .replace(/\n<\/file>\n?$/, '')
              .split('\n')
              .map((line) => line.replace(/^\s*\d+\|/, ''))
              .join('\n')
          : result.error || ''
      );
    } catch (error) {
      setSelectedFileContent(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleFileDoubleClick = useCallback((path: string) => {
    setSelectedFile(path);
    console.log('Open file:', path);
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!selectedFile) {
      return;
    }

    try {
      setIsSavingFile(true);
      await invoke('tool_write', {
        params: {
          file_path: selectedFile,
          content: selectedFileContent,
        },
      });
    } finally {
      setIsSavingFile(false);
    }
  }, [selectedFile, selectedFileContent]);

  const handleSyncGeneratedFiles = useCallback(async () => {
    if (files.length === 0) {
      return;
    }

    try {
      setSyncState('syncing');

      for (const file of files) {
        const absolutePath = isAbsoluteFilePath(file.path) ? file.path : joinFileSystemPath(projectRoot, file.path);

        await invoke('tool_write', {
          params: {
            file_path: absolutePath,
            content: file.content,
          },
        });
      }

      setSyncState('done');
    } catch {
      setSyncState('error');
    }
  }, [files, projectRoot]);

  return (
    <div className={`workspace ${className || ''}`}>
      <Allotment className="workspace-allotment" onChange={handleOuterLayoutChange}>
        <Allotment.Pane
          minSize={WORKSPACE_SIDEBAR_WIDTH_BOUNDS.min}
          maxSize={WORKSPACE_SIDEBAR_WIDTH_BOUNDS.max}
          preferredSize={sidebarWidth}
        >
          <div className="workspace-pane">
            <div className="workspace-sidebar">
              <FileExplorer
                rootPath={projectRoot}
                files={files}
                onFileSelect={handleFileSelect}
                onFileDoubleClick={handleFileDoubleClick}
              />
            </div>
          </div>
        </Allotment.Pane>

        <Allotment.Pane minSize={480}>
          <div className="workspace-pane workspace-center-pane">
            <Allotment vertical className="workspace-center-allotment" onChange={handleInnerLayoutChange}>
              <Allotment.Pane minSize={280}>
                <div className="workspace-main-pane">
                  <div className="workspace-main">
                    <div className="workspace-toolbar">
                      <div className="view-toggle">
                        <button
                          className={`toggle-btn ${currentView === 'files' ? 'active' : ''}`}
                          onClick={() => setCurrentView('files')}
                          type="button"
                          aria-label="文件视图"
                        >
                          <WorkbenchIcon name="files" />
                          <span>文件</span>
                        </button>
                        <button
                          className={`toggle-btn ${currentView === 'terminal' ? 'active' : ''}`}
                          onClick={() => setCurrentView('terminal')}
                          type="button"
                          aria-label="终端视图"
                        >
                          <WorkbenchIcon name="terminal" />
                          <span>终端</span>
                        </button>
                      </div>

                      {selectedFile ? (
                        <div className="current-file">
                          <span className="file-icon-small">
                            <WorkbenchIcon name="document" />
                          </span>
                          <span className="file-path">{selectedFile}</span>
                        </div>
                      ) : null}

                      {files.length > 0 ? (
                        <button className="workspace-sync-btn" onClick={handleSyncGeneratedFiles} type="button">
                          {syncState === 'syncing'
                            ? '写入中...'
                            : syncState === 'done'
                              ? '已写入'
                              : syncState === 'error'
                                ? '写入失败'
                                : '写入生成文件'}
                        </button>
                      ) : null}
                    </div>

                    {tasks.length > 0 ? (
                      <div className="workspace-task-strip">
                        {tasks.slice(0, 4).map((task) => (
                          <div key={task.id} className="workspace-task-chip">
                            <strong>{task.owner}</strong>
                            <span>{task.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {selectedFile ? (
                      <div className="workspace-file-editor">
                        <div className="workspace-file-editor-header">
                          <strong>文件编辑器</strong>
                          <button className="workspace-sync-btn" onClick={handleSaveFile} type="button">
                            {isSavingFile ? '保存中...' : '保存'}
                          </button>
                        </div>
                        <textarea
                          className="workspace-file-textarea"
                          value={selectedFileContent}
                          onChange={(event) => setSelectedFileContent(event.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    ) : null}

                    <div className="workspace-content">
                      <div className="workspace-inline-note">
                        <strong>{currentView === 'terminal' ? '终端已固定在底部' : '桌面工作区'}</strong>
                        <p>文件区、主工作区、活动栏和底部终端都可以通过分隔条调整大小。</p>
                        <span>右侧 AI 活动窗已停靠到桌面工作台，不再使用右下角浮窗。</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Allotment.Pane>

              <Allotment.Pane
                minSize={WORKSPACE_TERMINAL_HEIGHT_BOUNDS.min}
                maxSize={WORKSPACE_TERMINAL_HEIGHT_BOUNDS.max}
                preferredSize={terminalHeight}
              >
                <div className="workspace-bottom">
                  <Terminal recommendedCommands={recommendedCommands} />
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={WORKSPACE_ACTIVITY_WIDTH_BOUNDS.min}
          maxSize={WORKSPACE_ACTIVITY_WIDTH_BOUNDS.max}
          preferredSize={activityWidth}
        >
          <div className="workspace-pane">
            <div className="workspace-activity">
              <button className="activity-btn active" title="资源管理器" type="button" aria-label="资源管理器">
                <WorkbenchIcon name="folder" />
              </button>
              <button className="activity-btn" title="搜索" type="button" aria-label="搜索">
                <WorkbenchIcon name="search" />
              </button>
              <button className="activity-btn" title="Git" type="button" aria-label="Git">
                <WorkbenchIcon name="gitBranch" />
              </button>
              <button className="activity-btn" title="调试" type="button" aria-label="调试">
                <WorkbenchIcon name="bug" />
              </button>
              <button className="activity-btn" title="扩展" type="button" aria-label="扩展">
                <WorkbenchIcon name="puzzle" />
              </button>
              <div className="activity-spacer" />
              <button className="activity-btn" title="设置" type="button" aria-label="设置">
                <WorkbenchIcon name="settings" />
              </button>
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
};
