import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
import { parseSkillMarkdown } from './parseSkillMarkdown.ts';
import {
  sketchSkillMarkdown,
  uiDesignSkillMarkdown,
  wikiSkillMarkdown,
} from './bundledSkillMarkdown.ts';

export type RuntimeSystemSkillId = 'wiki' | 'sketch' | 'ui-design';

export type RuntimeSystemSkillDefinition = RuntimeSkillDefinition & {
  aliases: string[];
  token: string;
};

const buildSystemSkillDefinition = (
  markdown: string,
  fallbackId: RuntimeSystemSkillId
): RuntimeSystemSkillDefinition => {
  const { frontmatter, body } = parseSkillMarkdown(markdown);
  const skillId = (frontmatter.skill as RuntimeSystemSkillId | undefined) || fallbackId;

  return {
    id: skillId,
    name: frontmatter.name || skillId,
    description: frontmatter.description || body.split('\n')[0] || skillId,
    whenToUse: frontmatter.when_to_use || '',
    version: frontmatter.version,
    prompt: body,
    executionContext: frontmatter.context === 'fork' ? 'fork' : 'inline',
    argumentHint: frontmatter['argument-hint'],
    argumentNames: Array.isArray(frontmatter.arguments) ? frontmatter.arguments : undefined,
    agent: frontmatter.agent,
    model: frontmatter.model,
    effort: frontmatter.effort,
    shell: frontmatter.shell,
    hooks:
      frontmatter.hooks && typeof frontmatter.hooks === 'object' && !Array.isArray(frontmatter.hooks)
        ? frontmatter.hooks
        : undefined,
    activationPaths: Array.isArray(frontmatter.paths) ? frontmatter.paths : undefined,
    allowedTools: Array.isArray(frontmatter['allowed-tools']) ? frontmatter['allowed-tools'] : [],
    userInvocable: frontmatter['user-invocable'] !== false,
    userTagInvocable: frontmatter['user-tag-invocable'] !== false,
    modelInvocable: frontmatter['disable-model-invocation'] !== true,
    source: 'system',
    aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
    token: frontmatter.token || `@${skillId}`,
  };
};

const SYSTEM_SKILLS: RuntimeSystemSkillDefinition[] = [
  buildSystemSkillDefinition(wikiSkillMarkdown, 'wiki'),
  buildSystemSkillDefinition(sketchSkillMarkdown, 'sketch'),
  buildSystemSkillDefinition(uiDesignSkillMarkdown, 'ui-design'),
];

export const getSystemSkillDefinitions = () => SYSTEM_SKILLS;

export const getSystemSkillDefinitionById = (skillId: string) =>
  SYSTEM_SKILLS.find((skill) => skill.id === skillId) || null;
