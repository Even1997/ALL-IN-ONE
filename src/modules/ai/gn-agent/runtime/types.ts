import type { AIConfigEntry } from '../../store/aiConfigState';
import type { LocalAgentConfigSnapshot } from '../localConfig';

export type GNAgentRuntimeProviderId = 'claude' | 'codex';

export type GNAgentRuntimeContext = {
  selectedConfig: AIConfigEntry | null;
  localSnapshot: LocalAgentConfigSnapshot | null;
};

export type GNAgentRuntimeStatus = {
  providerId: GNAgentRuntimeProviderId;
  ready: boolean;
  source: 'app-config' | 'local-config' | 'mixed' | 'missing';
  summary: string;
  details: string[];
};

