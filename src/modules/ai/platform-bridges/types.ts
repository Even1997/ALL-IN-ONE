export type PlatformSkillSummary = {
  id: string;
  name: string;
};

export type PlatformSkillExecutionResult = {
  summary: string;
};

export type PlatformPromptContext = {
  labels: string[];
  content: string;
};

export type WorkspaceSnapshot = {
  projectId: string | null;
  projectName: string | null;
  selectedFilePath: string | null;
};

export type ActivityRecord = {
  id: string;
  providerId: 'claude' | 'codex';
  summary: string;
  createdAt: number;
};
