import type { ToolResult } from '../../../components/workspace/tools.ts';

const resolvePreferredAgent = (value: unknown) =>
  value === 'claude' || value === 'codex' ? value : null;

const resolvePrompt = (input: Record<string, unknown>) => {
  const candidate = input.prompt ?? input.task ?? input.request ?? input.summary;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

export const resolveRuntimeAgentToolInput = (input: Record<string, unknown>) => {
  const prompt = resolvePrompt(input);
  if (!prompt) {
    return null;
  }

  const preferredAgent = resolvePreferredAgent(
    input.preferred_agent ?? input.preferredAgent ?? input.agent,
  );

  if (
    'agent' in input &&
    input.agent !== undefined &&
    input.agent !== null &&
    preferredAgent === null
  ) {
    return null;
  }

  if (
    ('preferred_agent' in input && input.preferred_agent !== undefined && preferredAgent === null) ||
    ('preferredAgent' in input && input.preferredAgent !== undefined && preferredAgent === null)
  ) {
    return null;
  }

  return {
    prompt,
    preferredAgent: preferredAgent || undefined,
  };
};

export const buildRuntimeAgentToolResult = (input: {
  finalContent: string;
  changedPaths: string[];
}): ToolResult => {
  const sections = [input.finalContent.trim()].filter((value) => value.length > 0);

  if (input.changedPaths.length > 0) {
    sections.push(`Changed paths:\n${input.changedPaths.map((value) => `- ${value}`).join('\n')}`);
  }

  return {
    type: 'text',
    content: sections.join('\n\n').trim() || 'Agent tool completed with no summary.',
  };
};
