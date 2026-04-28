export const AI_CHAT_COMMAND_EVENT = 'goodnight:ai-chat-command';

export type AIChatCommandDetail = {
  prompt: string;
  autoSubmit?: boolean;
};
