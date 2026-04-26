import type { WorkspaceSnapshot } from './types';

export interface WorkspaceBridge {
  getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
}
