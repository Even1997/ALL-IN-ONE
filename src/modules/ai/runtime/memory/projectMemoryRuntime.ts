import type { AgentMemoryEntry } from '../agentRuntimeTypes';

export const buildProjectMemoryEntry = (input: {
  id: string;
  threadId?: string | null;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  updatedAt: number;
}): AgentMemoryEntry => ({
  id: input.id,
  threadId: input.threadId || null,
  label: input.kind,
  title: input.title,
  summary: input.summary,
  content: input.content,
  createdAt: input.updatedAt,
  updatedAt: input.updatedAt,
  kind: input.kind,
});
