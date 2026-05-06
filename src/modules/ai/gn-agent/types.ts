export type GNAgentShellMode = 'classic' | 'config' | 'skills';

export type GNAgentProviderId = Exclude<GNAgentShellMode, 'config' | 'skills'>;
