// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export const AI_CHAT_COMMAND_EVENT = 'goodnight:ai-chat-command';
export const AI_CHAT_SETTINGS_EVENT = 'goodnight:ai-chat-settings';

export type AIChatCommandDetail = {
  prompt: string;
  autoSubmit?: boolean;
};

export type AIChatSettingsDetail = {
  tab?:
    | 'ai'
    | 'permissions'
    | 'general'
    | 'adapters'
    | 'terminal'
    | 'skills'
    | 'mcp'
    | 'agents'
    | 'plugins'
    | 'computerUse'
    | 'diagnostics'
    | 'about';
};
