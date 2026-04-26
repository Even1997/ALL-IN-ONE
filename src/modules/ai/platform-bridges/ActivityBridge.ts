import type { ActivityRecord } from './types';

export interface ActivityBridge {
  record(entry: Omit<ActivityRecord, 'id' | 'createdAt'>): Promise<ActivityRecord>;
  list(providerId: 'claude' | 'codex'): Promise<ActivityRecord[]>;
}
