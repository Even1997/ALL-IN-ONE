import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FileExplorer.css';
import { GeneratedFile } from '../../types';
import { getDirectoryPath, joinFileSystemPath, normalizeRelativeFileSystemPath } from '../../utils/fileSystemPaths.ts';

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

const FileIcon: React.FC<{ type: 'file' | 'folder'; expanded?: boolean }> = ({ type, expanded }) => {
  if (type === 'folder') {
    return <span className="file-icon">{expanded ? 'DIR' : 'FOL'}</span>;
  }
  return <span className="file-icon">FILE</span>;
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
      if (!fileName) return;
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

  const toggleFolder = useCallback((path: string) => {
    const toggleNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((node) => {
        if (node.path === path && node.type === 'folder') {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: toggleNode(node.children) };
        }
        return node;
      });
    };
    setFileTree((prev) => toggleNode(prev));
  }, []);

  const handleClick = useCallback(async (node: FileNode) => {
    setSelectedPath(node.path);
    if (node.type === 'folder') {
      if (files.length === 0 && (node.children?.length || 0) === 0) {
        const children = await loadFolderChildren(node.path);
        setFileTree((prev) => {
          const attachChildren = (nodes: FileNode[]): FileNode[] =>
            nodes.map((item) => {
              if (item.path === node.path) {
                return { ...item, children };
              }
              if (item.children) {
                return { ...item, children: attachChildren(item.children) };
              }
              return item;
            });

          return attachChildren(prev);
        });
      }
      toggleFolder(node.path);
    }
    if (node.type === 'file') {
      onFileSelect?.(node.path);
    }
  }, [toggleFolder, onFileSelect, files.length, loadFolderChildren]);

  const handleDoubleClick = useCallback((node: FileNode) => {
    if (node.type === 'file') {
      onFileDoubleClick?.(node.path);
    }
  }, [onFileDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setSelectedPath(node.path);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
    }
  }, [contextMenu]);

  const handleRefresh = useCallback(async (targetPath?: string) => {
    if (files.length > 0) {
      setFileTree(buildTreeFromFiles(files));
      return;
    }

    const folderPath = targetPath || rootPath;
    const children = await loadFolderChildren(folderPath);
    setFileTree((prev) => updateFolderChildren(prev, folderPath, children));
  }, [buildTreeFromFiles, files, loadFolderChildren, rootPath]);

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
      window.alert(error instanceof Error ? error.message : String(error));
    });
  }, [closeContextMenu, contextMenu]);

  const renderNode = (node: FileNode, depth = 0): React.ReactNode => {
    const isSelected = selectedPath === node.path;
    const paddingLeft = depth * 14 + 8;

    return (
      <React.Fragment key={node.path}>
        <div
          className={`file-item ${node.type} ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft }}
          onClick={() => handleClick(node)}
          onDoubleClick={() => handleDoubleClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {node.type === 'folder' && (
            <button className="expand-btn" onClick={(e) => { e.stopPropagation(); toggleFolder(node.path); }} type="button">
              {node.expanded ? '-' : '+'}
            </button>
          )}
          <FileIcon type={node.type} expanded={node.expanded} />
          <span className="file-name">{node.name}</span>
        </div>
        {node.type === 'folder' && node.expanded && node.children?.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="file-explorer" onClick={closeContextMenu}>
      <div className="explorer-header">
        <span className="explorer-title">Explorer</span>
        <div className="explorer-actions">
          <button className="icon-btn" title="New File" type="button">+</button>
          <button className="icon-btn" title="New Folder" type="button">D+</button>
          <button className="icon-btn" title="Refresh" type="button">R</button>
          <button className="icon-btn" title="Collapse All" type="button">-</button>
        </div>
      </div>

      <div className="explorer-content">
        {fileTree.map((node) => renderNode(node))}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => runContextMenuAction(handleOpenNode)}>
            <span>Open</span>
          </div>
          {contextMenu.node.path !== rootPath ? (
            <div className="context-menu-item" onClick={() => runContextMenuAction(handleRenameNode)}>
              <span>Rename</span>
            </div>
          ) : null}
          {contextMenu.node.path !== rootPath ? (
            <div className="context-menu-item" onClick={() => runContextMenuAction(handleDeleteNode)}>
              <span>Delete</span>
            </div>
          ) : null}
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => runContextMenuAction(handleCopyPath)}>
            <span>Copy Path</span>
          </div>
          <div className="context-menu-item" onClick={() => runContextMenuAction(handleOpenInSystem)}>
            <span>在实际目录中打开</span>
          </div>
          <div
            className="context-menu-item"
            onClick={() =>
              runContextMenuAction((node) =>
                handleRefresh(node.type === 'folder' ? node.path : getDirectoryPath(node.path) || rootPath)
              )
            }
          >
            <span>Refresh</span>
          </div>
        </div>
      )}
    </div>
  );
};
