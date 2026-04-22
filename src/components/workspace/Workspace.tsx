import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileExplorer } from './FileExplorer';
import { AIChat } from './AIChat';
import { Terminal } from './Terminal';
import { DevTask, GeneratedFile } from '../../types';
import './Workspace.css';

type WorkspaceView = 'chat' | 'terminal' | 'split';

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
  projectRoot = '/Users/apple/Documents/all-in-one',
}) => {
  const [currentView, setCurrentView] = useState<WorkspaceView>('split');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [chatHeight, setChatHeight] = useState(300);

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

  const handleInjectContext = useCallback((content: string) => {
    console.log('Inject context:', content);
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
        const absolutePath = file.path.startsWith('/')
          ? file.path
          : `${projectRoot}/${file.path.replace(/^\/+/, '')}`;

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

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = chatHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setChatHeight(Math.max(150, Math.min(600, startHeight + delta)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [chatHeight]);

  return (
    <div className={`workspace ${className || ''}`}>
      {/* Sidebar */}
      <div className="workspace-sidebar">
        <FileExplorer
          rootPath={projectRoot}
          files={files}
          onFileSelect={handleFileSelect}
          onFileDoubleClick={handleFileDoubleClick}
        />
      </div>

      {/* Main Content */}
      <div className="workspace-main">
        {/* View Toggle */}
        <div className="workspace-toolbar">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${currentView === 'chat' ? 'active' : ''}`}
              onClick={() => setCurrentView('chat')}
            >
              💬 Chat
            </button>
            <button
              className={`toggle-btn ${currentView === 'terminal' ? 'active' : ''}`}
              onClick={() => setCurrentView('terminal')}
            >
              ⌨️ Terminal
            </button>
            <button
              className={`toggle-btn ${currentView === 'split' ? 'active' : ''}`}
              onClick={() => setCurrentView('split')}
            >
              ⬜ Split
            </button>
          </div>
          {selectedFile && (
            <div className="current-file">
              <span className="file-icon-small">📄</span>
              <span className="file-path">{selectedFile}</span>
            </div>
          )}
          {files.length > 0 && (
            <button className="workspace-sync-btn" onClick={handleSyncGeneratedFiles}>
              {syncState === 'syncing'
                ? '写入中'
                : syncState === 'done'
                  ? '已写入'
                  : syncState === 'error'
                    ? '写入失败'
                    : '写入生成文件'}
            </button>
          )}
        </div>

        {tasks.length > 0 && (
          <div className="workspace-task-strip">
            {tasks.slice(0, 4).map((task) => (
              <div key={task.id} className="workspace-task-chip">
                <strong>{task.owner}</strong>
                <span>{task.title}</span>
              </div>
            ))}
          </div>
        )}

        {selectedFile && (
          <div className="workspace-file-editor">
            <div className="workspace-file-editor-header">
              <strong>真实文件编辑</strong>
              <button className="workspace-sync-btn" onClick={handleSaveFile}>
                {isSavingFile ? '保存中' : '保存'}
              </button>
            </div>
            <textarea
              className="workspace-file-textarea"
              value={selectedFileContent}
              onChange={(e) => setSelectedFileContent(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}

        {/* Content Area */}
        <div className="workspace-content">
          {currentView === 'chat' && (
            <AIChat onContextInject={handleInjectContext} />
          )}

          {currentView === 'terminal' && (
            <Terminal recommendedCommands={recommendedCommands} />
          )}

          {currentView === 'split' && (
            <>
              <div className="split-chat" style={{ height: chatHeight }}>
                <AIChat onContextInject={handleInjectContext} />
              </div>
              <div
                className="resize-handle"
                onMouseDown={handleResizeStart}
              >
                <div className="resize-bar" />
              </div>
              <div className="split-terminal" style={{ height: `calc(100% - ${chatHeight}px - 6px)` }}>
                <Terminal recommendedCommands={recommendedCommands} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Activity Bar */}
      <div className="workspace-activity">
        <button className="activity-btn active" title="Explorer">
          📁
        </button>
        <button className="activity-btn" title="Search">
          🔍
        </button>
        <button className="activity-btn" title="Git">
          🌿
        </button>
        <button className="activity-btn" title="Debug">
          🐛
        </button>
        <button className="activity-btn" title="Extensions">
          📦
        </button>
        <div className="activity-spacer" />
        <button className="activity-btn" title="Settings">
          ⚙️
        </button>
      </div>
    </div>
  );
};
