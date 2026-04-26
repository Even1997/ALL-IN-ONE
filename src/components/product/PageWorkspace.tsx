import type { ReactNode } from 'react';

type PageWorkspaceProps = {
  content: ReactNode;
};

export const PageWorkspace = ({ content }: PageWorkspaceProps) => (
  <section className="pm-page-workspace-shell">{content}</section>
);
