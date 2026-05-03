export type RuntimeSkillShell = 'bash' | 'powershell';

export type RuntimeSkillHookStep = {
  command: string;
  once?: boolean;
};

export type RuntimeSkillHookMatcher = {
  matcher: string;
  hooks: RuntimeSkillHookStep[];
};

export type RuntimeSkillHooks = Partial<
  Record<'PreToolUse' | 'PostToolUse', RuntimeSkillHookMatcher[]>
>;

export type RuntimeSkillDefinition = {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  version?: string;
  prompt: string;
  token?: string;
  aliases?: string[];
  executionContext: 'inline' | 'fork';
  argumentHint?: string;
  argumentNames?: string[];
  agent?: string;
  model?: string;
  effort?: string;
  shell?: RuntimeSkillShell;
  hooks?: RuntimeSkillHooks;
  activationPaths?: string[];
  skillRoot?: string;
  allowedTools: string[];
  userInvocable: boolean;
  modelInvocable: boolean;
  source: 'bundled' | 'local' | 'project' | 'plugin' | 'mcp';
};
