import type { ComponentProps } from 'react';
import { KnowledgeNoteWorkspace } from '../../features/knowledge/workspace/KnowledgeNoteWorkspace';

export type ProductKnowledgeWorkspacePaneProps = ComponentProps<typeof KnowledgeNoteWorkspace>;

export const ProductKnowledgeWorkspacePane = (props: ProductKnowledgeWorkspacePaneProps) => (
  <KnowledgeNoteWorkspace {...props} />
);
