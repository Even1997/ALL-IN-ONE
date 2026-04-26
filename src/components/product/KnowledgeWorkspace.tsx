import type { ReactNode } from 'react';

type KnowledgeWorkspaceProps = {
  content: ReactNode;
};

export const KnowledgeWorkspace = ({ content }: KnowledgeWorkspaceProps) => (
  <section className="pm-knowledge-workspace">{content}</section>
);
