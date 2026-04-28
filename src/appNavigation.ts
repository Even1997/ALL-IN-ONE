export type RoleView = 'product' | 'knowledge' | 'page' | 'design' | 'develop' | 'test' | 'operations';

export type RoleTab = {
  id: RoleView;
  label: string;
};

export const VISIBLE_ROLE_TABS: RoleTab[] = [
  { id: 'knowledge', label: '知识库' },
  { id: 'page', label: '页面' },
  { id: 'design', label: '设计' },
  { id: 'develop', label: '开发' },
  { id: 'test', label: '测试' },
  { id: 'operations', label: '发布' },
];
