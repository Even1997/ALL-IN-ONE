export type ClaudianShellMode = 'classic' | 'config' | 'claude' | 'codex';

export type ClaudianProviderId = Exclude<ClaudianShellMode, 'config'>;
