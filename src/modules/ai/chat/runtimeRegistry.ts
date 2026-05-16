// 文件作用：注册表，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ChatAgentDefinition, ChatAgentId } from './chatAgents.ts';

export type ChatRuntimePlugin = ChatAgentDefinition & {
  pluginType: 'chat-runtime';
  source: 'built-in';
};

const INTERNAL_CHAT_RUNTIME_PLUGINS: ChatRuntimePlugin[] = [
  {
    id: 'claude',
    label: 'Claude',
    title: 'Claude Agent',
    runtime: 'local',
    pluginType: 'chat-runtime',
    source: 'built-in',
  },
  {
    id: 'codex',
    label: 'Codex',
    title: 'Codex Agent',
    runtime: 'local',
    pluginType: 'chat-runtime',
    source: 'built-in',
  },
  {
    id: 'team',
    label: 'Team',
    title: 'Multi-Agent Team',
    runtime: 'local',
    pluginType: 'chat-runtime',
    source: 'built-in',
  },
  {
    id: 'built-in',
    label: 'AI',
    title: 'Built-in AI',
    runtime: 'built-in',
    pluginType: 'chat-runtime',
    source: 'built-in',
  },
];

export const BUILT_IN_CHAT_RUNTIME_PLUGINS: ChatRuntimePlugin[] = INTERNAL_CHAT_RUNTIME_PLUGINS.filter(
  (plugin) => plugin.id !== 'team'
);

export const getChatAgents = (): ChatAgentDefinition[] => BUILT_IN_CHAT_RUNTIME_PLUGINS.slice();

export const getChatAgent = (id: ChatAgentId) =>
  INTERNAL_CHAT_RUNTIME_PLUGINS.find((plugin) => plugin.id === id) || null;

export const getChatAgentIds = () => BUILT_IN_CHAT_RUNTIME_PLUGINS.map((plugin) => plugin.id);
