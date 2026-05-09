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
