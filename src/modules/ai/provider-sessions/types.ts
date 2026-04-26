export type ProviderSessionRole = 'user' | 'assistant' | 'system';

export type ClaudeMessage = {
  id: string;
  role: ProviderSessionRole;
  content: string;
  createdAt: number;
};

export type ClaudeSession = {
  id: string;
  title: string;
  messages: ClaudeMessage[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CodexMessage = {
  id: string;
  role: ProviderSessionRole;
  content: string;
  createdAt: number;
};

export type CodexSession = {
  id: string;
  title: string;
  messages: CodexMessage[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
};
