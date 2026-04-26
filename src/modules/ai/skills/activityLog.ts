export type ActivityEntryType =
  | 'run-summary'
  | 'document-changed'
  | 'artifact-created'
  | 'artifact-deleted'
  | 'confirmation-required'
  | 'conflict'
  | 'failed';

export type ActivityEntry = {
  id: string;
  runId: string;
  type: ActivityEntryType;
  summary: string;
  changedPaths: string[];
  runtime?: 'built-in' | 'local';
  skill?: string | null;
  createdAt: number;
};
