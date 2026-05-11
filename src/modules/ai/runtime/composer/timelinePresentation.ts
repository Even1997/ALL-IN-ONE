import type { RunStartedPayload, ToolStartedPayload } from '@goodnight/runtime-protocol';

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  view: 'Read',
  ls: 'List files',
  grep: 'Search',
  glob: 'Match files',
  memory_read: 'Load memory',
  write: 'Write file',
  edit: 'Edit file',
  bash: 'Shell',
  powershell: 'PowerShell',
  fetch: 'Fetch',
  agent: 'Agent',
  project_file_flow: 'File request',
  project_file_read: 'Read project files',
  project_file_plan: 'Plan file changes',
  project_file_apply: 'Apply file changes',
  run_local_agent: 'Local agent',
  run_agent_team: 'Agent team',
  team_phase: 'Team phase',
  team_member_task: 'Agent task',
};

const RUN_MODE_LABELS: Record<NonNullable<RunStartedPayload['mode']>, string> = {
  chat: 'chat run',
  agent: 'agent run',
  team: 'team run',
};

const COMMAND_SUMMARY_PATTERNS: Array<{ pattern: RegExp; summary: string }> = [
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?build\b/i, summary: 'Build project' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b/i, summary: 'Run tests' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?dev\b/i, summary: 'Start dev server' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?install\b/i, summary: 'Install dependencies' },
  { pattern: /\bgit\s+status\b/i, summary: 'Check git status' },
];

const summarizeText = (value: string | null | undefined, maxLength = 160) => {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized;
};

const summarizePath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 3) {
    return normalized;
  }

  return `.../${parts.slice(-3).join('/')}`;
};

const summarizePathList = (paths: string[]) => {
  const normalizedPaths = paths
    .map((value) => summarizePath(value))
    .filter((value) => value.trim().length > 0);

  if (normalizedPaths.length <= 2) {
    return normalizedPaths.join(', ');
  }

  return `${normalizedPaths.slice(0, 2).join(', ')} +${normalizedPaths.length - 2} more`;
};

const summarizeCommand = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const matchedPattern = COMMAND_SUMMARY_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return matchedPattern?.summary || summarizeText(normalized);
};

export const getTimelineToolDisplayName = (toolName: string) => TOOL_DISPLAY_NAMES[toolName] || toolName;

export const getTimelineRunStartSummary = (payload: RunStartedPayload) => {
  const providerLabel = payload.providerId === 'built-in' ? 'Built-in' : payload.providerId;
  const modeLabel = payload.mode ? RUN_MODE_LABELS[payload.mode] || payload.mode : 'run';
  return `${providerLabel} ${modeLabel}`.trim();
};

export const summarizeTimelineToolStarted = (payload: ToolStartedPayload) => {
  if (payload.inputSummary?.trim()) {
    return summarizeCommand(payload.inputSummary);
  }

  const input = payload.input || {};

  if (typeof input.command === 'string' && input.command.trim()) {
    return summarizeCommand(input.command);
  }

  const filePathInput = input.file_path ?? input.path ?? input.file;
  if (typeof filePathInput === 'string' && filePathInput.trim()) {
    return summarizePath(filePathInput);
  }

  if (typeof input.url === 'string' && input.url.trim()) {
    return summarizeText(input.url);
  }

  if (typeof input.pattern === 'string' && input.pattern.trim()) {
    return summarizeText(input.pattern);
  }

  if (Array.isArray(input.paths) && input.paths.length > 0) {
    return summarizePathList(input.paths.map((value) => String(value)));
  }

  const json = JSON.stringify(input);
  return json === '{}' ? '' : summarizeText(json, 320);
};
