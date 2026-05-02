import type { WorkbenchIconName } from './components/ui/WorkbenchIcon';

export type RoleView =
  | 'product'
  | 'knowledge'
  | 'wiki'
  | 'page'
  | 'design'
  | 'develop'
  | 'test'
  | 'operations';

export const ROLE_TAB_ICONS = {
  product: 'product',
  knowledge: 'knowledge',
  wiki: 'gitBranch',
  page: 'page',
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
  { id: 'knowledge', label: 'Knowledge', summary: 'Notes and references' },
  { id: 'page', label: 'Pages', summary: 'Structure and wireframes' },
  { id: 'design', label: 'Design', summary: 'Boards and visual system' },
  { id: 'develop', label: 'Develop', summary: 'Files and tasks' },
  { id: 'test', label: 'Test', summary: 'Plans and defects' },
  { id: 'operations', label: 'Ops', summary: 'Deploy and release flow' },
];

export const DESKTOP_PRIMARY_ROLES: RoleView[] = ['knowledge', 'page', 'design'];

export const roleShowsLegacyAiWorkspace = (role: RoleView) => role !== 'design';
