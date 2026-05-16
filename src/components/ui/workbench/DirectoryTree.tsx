// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { MouseEvent, ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';

export type DirectoryTreeItem = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: WorkbenchIconName;
  badge?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  expanded?: boolean;
  children?: DirectoryTreeItem[];
};

type DirectoryTreeProps = {
  items: DirectoryTreeItem[];
  className?: string;
  emptyState?: ReactNode;
  onSelect?: (item: DirectoryTreeItem) => void;
  onToggle?: (item: DirectoryTreeItem) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>, item: DirectoryTreeItem) => void;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

const renderItems = (
  items: DirectoryTreeItem[],
  depth: number,
  handlers: Pick<DirectoryTreeProps, 'onSelect' | 'onToggle' | 'onContextMenu'>,
) =>
  items.map((item) => {
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const isExpanded = item.expanded ?? true;

    return (
      <div key={item.id} className="wb-directory-tree-group">
        <button
          type="button"
          className={joinClasses('wb-directory-tree-row', item.selected && 'is-selected')}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handlers.onSelect?.(item)}
          onContextMenu={(event) => handlers.onContextMenu?.(event, item)}
        >
          <span
            className={joinClasses('wb-directory-tree-caret', hasChildren && 'is-visible', isExpanded && 'is-expanded')}
            onClick={(event) => {
              if (!hasChildren) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              handlers.onToggle?.(item);
            }}
            aria-hidden="true"
          >
            {hasChildren ? <WorkbenchIcon name="chevronRight" /> : null}
          </span>
          <span className="wb-directory-tree-icon" aria-hidden="true">
            <WorkbenchIcon name={item.icon ?? (hasChildren ? 'folder' : 'document')} />
          </span>
          <span className="wb-directory-tree-copy">
            <strong>{item.label}</strong>
            {item.description ? <span>{item.description}</span> : null}
          </span>
          {item.badge ? <span className="wb-directory-tree-badge">{item.badge}</span> : null}
          {item.trailing ? <span className="wb-directory-tree-trailing">{item.trailing}</span> : null}
        </button>
        {hasChildren && isExpanded ? renderItems(item.children!, depth + 1, handlers) : null}
      </div>
    );
  });

export const DirectoryTree = ({
  items,
  className,
  emptyState,
  onSelect,
  onToggle,
  onContextMenu,
}: DirectoryTreeProps) => (
  <div className={joinClasses('wb-directory-tree', className)}>
    {items.length > 0 ? renderItems(items, 0, { onSelect, onToggle, onContextMenu }) : emptyState}
  </div>
);
