import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';

export type RuntimeChatTurnContextInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  contextWindowTokens: number;
  activeSkills: RuntimeSkillDefinition[];
};

export const buildRuntimeChatTurnContext = (input: RuntimeChatTurnContextInput) => input;
