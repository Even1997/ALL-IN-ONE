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

export type DesktopRoleGroup = 'primary' | 'secondary';

export type DesktopWorkbenchRole = {
  id: RoleView;
  label: string;
  summary: string;
  group: DesktopRoleGroup;
  showCompanionPane: boolean;
};

export const DESKTOP_WORKBENCH_ROLES: DesktopWorkbenchRole[] = [
  { id: 'agent', label: 'Agent', summary: 'Unified AI runtime workspace', group: 'primary', showCompanionPane: false },
  { id: 'knowledge', label: 'Wiki', summary: 'Notes and references', group: 'primary', showCompanionPane: true },
  { id: 'page', label: 'Sketch', summary: 'Pages and canvas drafts', group: 'primary', showCompanionPane: true },
  { id: 'design', label: 'UI Design', summary: 'Boards and visual system', group: 'primary', showCompanionPane: true },
  { id: 'develop', label: 'Develop', summary: 'Files and tasks', group: 'secondary', showCompanionPane: true },
  { id: 'test', label: 'Test', summary: 'Plans and defects', group: 'secondary', showCompanionPane: true },
  { id: 'operations', label: 'Ops', summary: 'Deploy and release flow', group: 'secondary', showCompanionPane: true },
];

export const DESKTOP_PRIMARY_ROLES: RoleView[] = DESKTOP_WORKBENCH_ROLES
  .filter((role) => role.group === 'primary')
  .map((role) => role.id);

export const getDesktopWorkbenchRole = (role: RoleView): DesktopWorkbenchRole | null =>
  DESKTOP_WORKBENCH_ROLES.find((item) => item.id === role) || null;
