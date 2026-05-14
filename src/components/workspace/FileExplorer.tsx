import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FileExplorer.css';
import { GeneratedFile } from '../../types';
import { getDirectoryPath, joinFileSystemPath, normalizeRelativeFileSystemPath } from '../../utils/fileSystemPaths.ts';
import { DirectoryTree, EmptyStateView, MacIconButton, StatusBanner, WorkbenchIcon, type DirectoryTreeItem } from '../ui';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  expanded?: boolean;
}

interface FileExplorerProps {
  onFileSelect?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  files?: GeneratedFile[];
  rootPath?: string;
}

type ToolResult = {
  success: boolean;
  content: string;
  error: string | null;
};

const updateFolderChildren = (nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] =>
  nodes.map((node) => {
    if (node.path === targetPath && node.type === 'folder') {
      return { ...node, children, expanded: true };
    }
    if (node.children) {
      return { ...node, children: updateFolderChildren(node.children, targetPath, children) };
    }
    return node;
  });

const updateFolderExpanded = (nodes: FileNode[], targetPath: string): FileNode[] =>
  nodes.map((node) => {
    if (node.path === targetPath && node.type === 'folder') {
      return { ...node, expanded: !node.expanded };
    }
    if (node.children) {
      return { ...node, children: updateFolderExpanded(node.children, targetPath) };
    }
    return node;
  });

const collapseAllFolders = (nodes: FileNode[]): FileNode[] =>
  nodes.map((node) => ({
    ...node,
    expanded: node.type === 'folder' ? false : node.expanded,
    children: node.children ? collapseAllFolders(node.children) : node.children,
  }));

const isSameOrNestedPath = (path: string, targetPath: string) =>
  path === targetPath || path.startsWith(`${targetPath}/`) || path.startsWith(`${targetPath}\\`);

const replacePathPrefix = (path: string, fromPath: string, toPath: string) => {
  if (path === fromPath) {
    return toPath;
  }
  if (!isSameOrNestedPath(path, fromPath)) {
    return path;
  }
  return `${toPath}${path.slice(fromPath.length)}`;
};

const renameNodeInTree = (nodes: FileNode[], fromPath: string, toPath: string, nextName: string): FileNode[] =>
  nodes.map((node) => {
    if (isSameOrNestedPath(node.path, fromPath)) {
      const nextPath = replacePathPrefix(node.path, fromPath, toPath);
      return {
        ...node,
        name: node.path === fromPath ? nextName : node.name,
        path: nextPath,
        children: node.children ? renameNodeInTree(node.children, fromPath, toPath, nextName) : node.children,
      };
    }
    if (node.children) {
      return { ...node, children: renameNodeInTree(node.children, fromPath, toPath, nextName) };
    }
    return node;
  });

const removeNodeFromTree = (nodes: FileNode[], targetPath: string): FileNode[] =>
  nodes
    .filter((node) => node.path !== targetPath)
    .map((node) =>
      node.children ? { ...node, children: removeNodeFromTree(node.children, targetPath) } : node
    );

const getFileNodeIcon = (node: FileNode) => {
  if (node.type === 'folder') {
    return 'folder';
  }

  const extension = node.name.split('.').pop()?.toLowerCase();
  if (extension === 'md' || extension === 'markdown') {
    return 'note';
  }

  if (['ts', 'tsx', 'js', 'jsx', 'css', 'json', 'html', 'yml', 'yaml', 'sh'].includes(extension || '')) {
    return 'code';
  }

  return 'document';
};

const toTreeItems = (nodes: FileNode[], selectedPath: string | null): DirectoryTreeItem[] =>
  nodes.map((node) => ({
    id: node.path,
    label: node.name,
    icon: getFileNodeIcon(node),
    selected: selectedPath === node.path,
    expanded: node.expanded,
    children: node.children ? toTreeItems(node.children, selectedPath) : undefined,
  }));

export const FileExplorer: React.FC<FileExplorerProps> = ({
  onFileSelect,
  onFileDoubleClick,
  files = [],
  rootPath = '.',
}) => {
  const buildTreeFromFiles = useCallback((generatedFiles: GeneratedFile[]): FileNode[] => {
    if (generatedFiles.length === 0) {
      return [
        {
          name: normalizeRelativeFileSystemPath(rootPath).split('/').pop() || rootPath || 'project',
          type: 'folder',
          path: rootPath,
          expanded: true,
          children: [],
        },
      ];
    }

    const root: FileNode[] = [];

    const ensureFolder = (segments: string[]) => {
      let current = root;
      let currentPath = rootPath;

      segments.forEach((segment) => {
        currentPath = joinFileSystemPath(currentPath, segment);
        let folder = current.find((item) => item.path === currentPath && item.type === 'folder');

        if (!folder) {
          folder = {
            name: segment,
            type: 'folder',
            path: currentPath,
            expanded: currentPath.split('/').length <= 3,
            children: [],
          };
          current.push(folder);
        }

        current = folder.children || [];
        folder.children = current;
      });

      return current;
    };

    generatedFiles.forEach((file) => {
      const cleanPath = normalizeRelativeFileSystemPath(file.path);
      const segments = cleanPath.split('/');
      const fileName = segments.pop();
      if (!fileName) {
        return;
      }
      const folders = ensureFolder(segments);
      folders.push({
        name: fileName,
        type: 'file',
        path: joinFileSystemPath(rootPath, cleanPath),
      });
    });

    return root;
  }, [rootPath]);

  const [fileTree, setFileTree] = useState<FileNode[]>(buildTreeFromFiles(files));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFileTree(buildTreeFromFiles(files));
  }, [buildTreeFromFiles, files]);

  const loadFolderChildren = useCallback(async (path: string): Promise<FileNode[]> => {
    const result = await invoke<ToolResult>('tool_ls', {
      params: { path },
    });

    if (!result.success) {
      return [];
    }

    return result.content
      .split('\n')
      .filter(Boolean)
      .map((entry) => {
        const isFolder = entry.endsWith('/');
        const name = isFolder ? entry.slice(0, -1) : entry;
        return {
          name,
          type: isFolder ? 'folder' : 'file',
          path: joinFileSystemPath(path, name),
          expanded: false,
          children: isFolder ? [] : undefined,
        };
      });
  }, []);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!menu) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
    }
  }, [contextMenu]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setFileTree((prev) => updateFolderExpanded(prev, path));
  }, []);

  const handleRefresh = useCallback(async (targetPath?: string) => {
    setErrorMessage(null);

    if (files.length > 0) {
      setFileTree(buildTreeFromFiles(files));
      return;
    }

    const folderPath = targetPath || rootPath;
    const children = await loadFolderChildren(folderPath);
    setFileTree((prev) => updateFolderChildren(prev, folderPath, children));
  }, [buildTreeFromFiles, files, loadFolderChildren, rootPath]);

  const handleClick = useCallback(async (node: FileNode) => {
    setSelectedPath(node.path);
    setErrorMessage(null);

    if (node.type === 'folder') {
      if (files.length === 0 && (node.children?.length || 0) === 0) {
        const children = await loadFolderChildren(node.path);
        setFileTree((prev) => updateFolderChildren(prev, node.path, children));
      }
      toggleFolder(node.path);
      return;
    }

    onFileSelect?.(node.path);
  }, [files.length, loadFolderChildren, onFileSelect, toggleFolder]);

  const handleOpenNode = useCallback(async (node: FileNode) => {
    setSelectedPath(node.path);
    if (node.type === 'folder') {
      await handleClick(node);
      return;
    }

    if (onFileDoubleClick) {
      onFileDoubleClick(node.path);
      return;
    }

    onFileSelect?.(node.path);
  }, [handleClick, onFileDoubleClick, onFileSelect]);

  const handleCopyPath = useCallback(async (node: FileNode) => {
    await navigator.clipboard.writeText(node.path);
  }, []);

  const handleOpenInSystem = useCallback(async (node: FileNode) => {
    const targetPath = node.type === 'folder' ? node.path : getDirectoryPath(node.path) || node.path;
    await invoke('open_path_in_shell', { path: targetPath });
  }, []);

  const handleRenameNode = useCallback(async (node: FileNode) => {
    if (node.path === rootPath) {
      throw new Error('不能重命名当前项目根目录。');
    }

    const nextName = window.prompt('重命名', node.name)?.trim();
    if (!nextName || nextName === node.name) {
      return;
    }

    const parentPath = getDirectoryPath(node.path);
    const nextPath = parentPath ? joinFileSystemPath(parentPath, nextName) : nextName;
    const result = await invoke<ToolResult>('tool_rename', {
      params: {
        from_path: node.path,
        to_path: nextPath,
      },
    });

    if (!result.success) {
      throw new Error(result.error || '重命名失败。');
    }

    setFileTree((prev) => renameNodeInTree(prev, node.path, nextPath, nextName));
    setSelectedPath((current) => (current && isSameOrNestedPath(current, node.path) ? replacePathPrefix(current, node.path, nextPath) : current));
  }, [rootPath]);

  const handleDeleteNode = useCallback(async (node: FileNode) => {
    if (node.path === rootPath) {
      throw new Error('不能删除当前项目根目录。');
    }

    const confirmed = window.confirm(`确定删除${node.type === 'folder' ? '文件夹' : '文件'}“${node.name}”吗？`);
    if (!confirmed) {
      return;
    }

    const result = await invoke<ToolResult>('tool_remove', {
      params: {
        file_path: node.path,
      },
    });

    if (!result.success) {
      throw new Error(result.error || '删除失败。');
    }

    setFileTree((prev) => removeNodeFromTree(prev, node.path));
    setSelectedPath((current) => (current && isSameOrNestedPath(current, node.path) ? null : current));
  }, [rootPath]);

  const runContextMenuAction = useCallback((action: (node: FileNode) => Promise<void> | void) => {
    const node = contextMenu?.node;
    closeContextMenu();
    if (!node) {
      return;
    }

    void Promise.resolve(action(node)).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  }, [closeContextMenu, contextMenu?.node]);

  const resolveNodeByPath = useCallback((path: string, nodes: FileNode[]): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) {
        return node;
      }

      if (node.children) {
        const match = resolveNodeByPath(path, node.children);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }, []);

  const treeItems = useMemo(() => toTreeItems(fileTree, selectedPath), [fileTree, selectedPath]);

  return (
    <div className="file-explorer" onClick={closeContextMenu}>
      <div className="explorer-header">
        <div className="explorer-title-group">
          <span className="explorer-title-icon" aria-hidden="true">
            <WorkbenchIcon name="files" />
          </span>
          <div>
            <strong className="explorer-title">文件</strong>
            <span className="explorer-subtitle">{rootPath}</span>
          </div>
        </div>
        <div className="explorer-actions">
          <MacIconButton title="刷新" aria-label="刷新" onClick={() => void handleRefresh()}>
            <WorkbenchIcon name="refresh" />
          </MacIconButton>
          <MacIconButton
            title="全部折叠"
            aria-label="全部折叠"
            onClick={() => setFileTree((prev) => collapseAllFolders(prev))}
          >
            <WorkbenchIcon name="chevronDown" />
          </MacIconButton>
        </div>
      </div>

      {errorMessage ? (
        <StatusBanner
          tone="danger"
          icon="alertTriangle"
          title="文件树操作失败"
          message={errorMessage}
          className="explorer-banner"
        />
      ) : null}

      <div className="explorer-content">
        {treeItems.length > 0 ? (
          <DirectoryTree
            items={treeItems}
            onSelect={(item) => {
              const node = resolveNodeByPath(item.id, fileTree);
              if (node) {
                void handleClick(node);
              }
            }}
            onToggle={(item) => toggleFolder(item.id)}
            onContextMenu={(event, item) => {
              event.preventDefault();
              const node = resolveNodeByPath(item.id, fileTree);
              if (!node) {
                return;
              }
              setSelectedPath(node.path);
              setContextMenu({ x: event.clientX, y: event.clientY, node });
            }}
          />
        ) : (
          <EmptyStateView
            icon="folder"
            title="这里还没有文件"
            description="生成代码后，文件会按统一的目录树样式出现在这里。"
          />
        )}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button className="context-menu-item" type="button" onClick={() => runContextMenuAction(handleOpenNode)}>
            打开
          </button>
          {contextMenu.node.path !== rootPath ? (
            <button className="context-menu-item" type="button" onClick={() => runContextMenuAction(handleRenameNode)}>
              重命名
            </button>
          ) : null}
          {contextMenu.node.path !== rootPath ? (
            <button className="context-menu-item danger" type="button" onClick={() => runContextMenuAction(handleDeleteNode)}>
              删除
            </button>
          ) : null}
          <div className="context-menu-divider" />
          <button className="context-menu-item" type="button" onClick={() => runContextMenuAction(handleCopyPath)}>
            复制路径
          </button>
          <button className="context-menu-item" type="button" onClick={() => runContextMenuAction(handleOpenInSystem)}>
            在系统中打开
          </button>
          <button
            className="context-menu-item"
            type="button"
            onClick={() =>
              runContextMenuAction((node) =>
                handleRefresh(node.type === 'folder' ? node.path : getDirectoryPath(node.path) || rootPath)
              )
            }
          >
            刷新
          </button>
        </div>
      )}
    </div>
  );
};
