import React, { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileExplorer } from './FileExplorer';
import { Terminal } from './Terminal';
import type { DevTask, GeneratedFile } from '../../types';
import { isAbsoluteFilePath, joinFileSystemPath } from '../../utils/fileSystemPaths.ts';
import './Workspace.css';

type WorkspaceView = 'files' | 'terminal';

interface WorkspaceProps {
  className?: string;
  files?: GeneratedFile[];
  tasks?: DevTask[];
  recommendedCommands?: string[];
  projectRoot?: string;
}

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
      <div className="workspace-sidebar">
        <FileExplorer
          rootPath={projectRoot}
          files={files}
          onFileSelect={handleFileSelect}
          onFileDoubleClick={handleFileDoubleClick}
        />
      </div>

      <div className="workspace-main">
        <div className="workspace-toolbar">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${currentView === 'files' ? 'active' : ''}`}
              onClick={() => setCurrentView('files')}
              type="button"
            >
              文件
            </button>
            <button
              className={`toggle-btn ${currentView === 'terminal' ? 'active' : ''}`}
              onClick={() => setCurrentView('terminal')}
              type="button"
            >
              终端
            </button>
          </div>

          {selectedFile ? (
            <div className="current-file">
              <span className="file-icon-small">FILE</span>
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
          {currentView === 'terminal' ? (
            <div className="split-terminal">
              <Terminal recommendedCommands={recommendedCommands} />
            </div>
          ) : (
            <div className="workspace-inline-note">
              <strong>AI 入口已统一</strong>
              <p>需求整理、草图推进和 HTML 原型生成都已收敛到右下角悬浮智能体入口，这里只保留文件与终端工作区。</p>
              <span>如果要继续推进流程，直接在右下角输入需求、修改意见，或输入“继续”。</span>
            </div>
          )}
        </div>
      </div>

      <div className="workspace-activity">
        <button className="activity-btn active" title="Explorer" type="button">
          E
        </button>
        <button className="activity-btn" title="Search" type="button">
          S
        </button>
        <button className="activity-btn" title="Git" type="button">
          G
        </button>
        <button className="activity-btn" title="Debug" type="button">
          D
        </button>
        <button className="activity-btn" title="Extensions" type="button">
          X
        </button>
        <div className="activity-spacer" />
        <button className="activity-btn" title="Settings" type="button">
          ...
        </button>
      </div>
    </div>
  );
};
