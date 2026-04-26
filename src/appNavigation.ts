export type RoleView = 'product' | 'design' | 'develop' | 'test' | 'operations' | 'ai';

export type RoleTab = {
  id: RoleView;
  label: string;
};

export const VISIBLE_ROLE_TABS: RoleTab[] = [
  { id: 'product', label: '产品' },
  { id: 'design', label: '设计' },
  { id: 'ai', label: 'AI' },
];
