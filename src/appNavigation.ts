import type { WorkbenchIconName } from './components/ui/WorkbenchIcon';

export type RoleView =
  | 'product'
  | 'knowledge'
  | 'page'
  | 'agent'
  | 'design'
  | 'develop'
  | 'test'
  | 'operations';

export const ROLE_TAB_ICONS = {
  product: 'product',
  knowledge: 'knowledge',
  page: 'page',
  agent: 'terminal',
  design: 'design',
  develop: 'files',
  test: 'bug',
  operations: 'settings',
} satisfies Record<RoleView, WorkbenchIconName>;

export const DESKTOP_WORKBENCH_ROLES: Array<{
  id: RoleView;
  label: string;
  summary: string;
}> = [
  { id: 'knowledge', label: 'Wiki', summary: 'Notes and references' },
  { id: 'page', label: 'Sketch', summary: 'Pages and canvas drafts' },
  { id: 'agent', label: 'Agent', summary: 'Unified AI runtime workspace' },
  { id: 'design', label: 'UI Design', summary: 'Boards and visual system' },
  { id: 'develop', label: 'Develop', summary: 'Files and tasks' },
  { id: 'test', label: 'Test', summary: 'Plans and defects' },
  { id: 'operations', label: 'Ops', summary: 'Deploy and release flow' },
];

export const DESKTOP_PRIMARY_ROLES: RoleView[] = ['knowledge', 'page', 'agent', 'design'];
