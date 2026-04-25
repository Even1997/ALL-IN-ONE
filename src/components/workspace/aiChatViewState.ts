export type AIChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tone?: 'default' | 'error';
  createdAt: number;
};

const createMessageId = (role: AIChatMessage['role']) =>
  `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createChatMessage = (
  role: AIChatMessage['role'],
  content: string,
  tone: AIChatMessage['tone'] = 'default'
): AIChatMessage => ({
  id: createMessageId(role),
  role,
  content,
  tone,
  createdAt: Date.now(),
});

export const buildWelcomeMessage = (projectName?: string | null) =>
  createChatMessage(
    'assistant',
    projectName ? `${projectName} 已就绪。直接说需求。` : '已就绪。直接说需求。'
  );

export const getChatShellLayoutClassName = (isCollapsed: boolean) =>
  isCollapsed ? 'chat-shell is-sidebar is-collapsed' : 'chat-shell is-sidebar';

export const getChatViewportClassName = (isCollapsed: boolean) =>
  isCollapsed ? 'ai-chat-sidebar-collapsed' : 'ai-chat-sidebar-expanded';

export const getComposerPlaceholder = (isConfigured: boolean) =>
  isConfigured ? '输入消息…' : '先配置 AI';
