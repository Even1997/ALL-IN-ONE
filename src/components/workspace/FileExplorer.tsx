import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FileExplorer.css';
import { GeneratedFile } from '../../types';
import { joinFileSystemPath, normalizeRelativeFileSystemPath } from '../../utils/fileSystemPaths.ts';

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

const FileIcon: React.FC<{ type: 'file' | 'folder'; expanded?: boolean }> = ({ type, expanded }) => {
  if (type === 'folder') {
    return <span className="file-icon">{expanded ? 'DIR' : 'FOL'}</span>;
  }
  return <span className="file-icon">FILE</span>;
};

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

  useEffect(() => {
    setFileTree(buildTreeFromFiles(files));
  }, [buildTreeFromFiles, files]);

  const loadFolderChildren = useCallback(async (path: string): Promise<FileNode[]> => {
    const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_ls', {
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
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => { closeContextMenu(); }}>
            <span>Open</span>
          </div>
          <div className="context-menu-item" onClick={() => { closeContextMenu(); }}>
            <span>Rename</span>
          </div>
          <div className="context-menu-item" onClick={() => { closeContextMenu(); }}>
            <span>Delete</span>
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => { closeContextMenu(); }}>
            <span>Copy Path</span>
          </div>
        </div>
      )}
    </div>
  );
};
