import type { ReactNode } from 'react';

type KnowledgeWorkspaceProps = {
  tabs?: ReactNode;
  content: ReactNode;
  toolbarActions?: ReactNode;
};

export const KnowledgeWorkspace = ({
  tabs = null,
  content,
  toolbarActions = null,
}: KnowledgeWorkspaceProps) => (
  <section className="pm-knowledge-workspace">
    {toolbarActions ? (
      <header className="pm-knowledge-workspace-toolbar">
        <div className="pm-knowledge-workspace-actions">{toolbarActions}</div>
      </header>
    ) : null}
    {tabs ? <div className="pm-knowledge-workspace-tabs">{tabs}</div> : null}
    <div className="pm-knowledge-workspace-content">{content}</div>
  </section>
);
