import type { AIConfigEntry } from '../../store/aiConfigState';
import type { LocalAgentConfigSnapshot } from '../localConfig';

export type ClaudianRuntimeProviderId = 'claude' | 'codex';

export type ClaudianRuntimeContext = {
  selectedConfig: AIConfigEntry | null;
  localSnapshot: LocalAgentConfigSnapshot | null;
};

export type ClaudianRuntimeStatus = {
  providerId: ClaudianRuntimeProviderId;
  ready: boolean;
  source: 'app-config' | 'local-config' | 'mixed' | 'missing';
  summary: string;
  details: string[];
};
