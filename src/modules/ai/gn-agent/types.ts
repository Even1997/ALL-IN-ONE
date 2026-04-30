export type GNAgentShellMode = 'classic' | 'config' | 'skills' | 'claude' | 'codex';

export type GNAgentProviderId = Exclude<GNAgentShellMode, 'config' | 'skills'>;

