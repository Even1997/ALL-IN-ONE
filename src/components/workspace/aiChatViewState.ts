// 文件作用：状态模型，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
