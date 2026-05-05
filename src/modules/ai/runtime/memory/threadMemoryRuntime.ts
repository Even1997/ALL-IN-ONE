import type { AgentMemoryEntry } from '../agentRuntimeTypes';

export const buildThreadMemoryEntry = (input: {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  updatedAt: number;
}): AgentMemoryEntry => ({
  id: input.id,
  threadId: input.threadId,
  label: input.kind,
  title: input.title,
  summary: input.summary,
  content: input.content,
  createdAt: input.updatedAt,
  updatedAt: input.updatedAt,
  kind: input.kind,
});
