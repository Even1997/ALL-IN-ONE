export type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations';

export type RoleTab = {
  id: RoleView;
  label: string;
};

export const VISIBLE_ROLE_TABS: RoleTab[] = [
  { id: 'product', label: '项目' },
  { id: 'design', label: '设计' },
];
