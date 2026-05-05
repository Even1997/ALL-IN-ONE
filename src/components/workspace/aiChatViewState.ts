import { createStoredChatMessage, type StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';

export type AIChatMessage = StoredChatMessage;

export const createChatMessage = (
  role: StoredChatMessage['role'],
  content: string,
  tone: StoredChatMessage['tone'] = 'default'
): AIChatMessage => createStoredChatMessage(role, content, tone);

export const buildWelcomeMessage = () =>
  createChatMessage('assistant', '');

export const getChatShellLayoutClassName = (isCollapsed: boolean) =>
  isCollapsed ? 'chat-shell is-sidebar is-collapsed' : 'chat-shell is-sidebar';

export const getChatViewportClassName = (isCollapsed: boolean) =>
  isCollapsed ? 'ai-chat-sidebar-collapsed' : 'ai-chat-sidebar-expanded';

export const getComposerPlaceholder = (isConfigured: boolean) =>
  isConfigured ? '输入消息…' : '先配置 AI';
