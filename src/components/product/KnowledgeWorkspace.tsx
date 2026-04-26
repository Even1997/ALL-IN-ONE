import type { ReactNode } from 'react';

type KnowledgeWorkspaceProps = {
  tabs: ReactNode;
  content: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  toolbarActions?: ReactNode;
};

export const KnowledgeWorkspace = ({
  tabs,
  content,
  searchValue,
  onSearchChange,
  toolbarActions = null,
}: KnowledgeWorkspaceProps) => (
  <section className="pm-knowledge-workspace">
    <header className="pm-knowledge-workspace-toolbar">
      <input
        className="product-input pm-knowledge-workspace-search"
        type="search"
        placeholder="搜索知识库"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      {toolbarActions ? <div className="pm-knowledge-workspace-actions">{toolbarActions}</div> : null}
    </header>
    <div className="pm-knowledge-workspace-tabs">{tabs}</div>
    <div className="pm-knowledge-workspace-content">{content}</div>
  </section>
);
