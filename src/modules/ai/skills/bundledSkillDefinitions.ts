import type { AIWorkflowPackage } from '../../../types';
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
import { parseSkillMarkdown } from './parseSkillMarkdown.ts';
import changeSyncSkillMarkdown from './bundled/change-sync/SKILL.md?raw';
import knowledgeOrganizeSkillMarkdown from './bundled/knowledge-organize/SKILL.md?raw';
import requirementsSkillMarkdown from './bundled/requirements/SKILL.md?raw';
import sketchSkillMarkdown from './bundled/sketch/SKILL.md?raw';
import uiDesignSkillMarkdown from './bundled/ui-design/SKILL.md?raw';

export type RuntimeChatSkillId =
  | 'knowledge-organize'
  | 'requirements'
  | 'sketch'
  | 'ui-design'
  | 'change-sync';

export type RuntimeChatSkillDefinition = RuntimeSkillDefinition & {
  packageId: AIWorkflowPackage | 'knowledge-organize' | 'change-sync';
  aliases: string[];
  token: string;
};

const DEFAULT_PACKAGE_BY_SKILL: Record<
  RuntimeChatSkillId,
  RuntimeChatSkillDefinition['packageId']
> = {
  'knowledge-organize': 'knowledge-organize',
  requirements: 'requirements',
  sketch: 'prototype',
  'ui-design': 'page',
  'change-sync': 'change-sync',
};

const buildBundledSkillDefinition = (markdown: string, fallbackId: RuntimeChatSkillId): RuntimeChatSkillDefinition => {
  const { frontmatter, body } = parseSkillMarkdown(markdown);
  const skillId = (frontmatter.skill as RuntimeChatSkillId | undefined) || fallbackId;

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
    modelInvocable: frontmatter['disable-model-invocation'] !== true,
    source: 'bundled',
    packageId:
      (frontmatter.package as RuntimeChatSkillDefinition['packageId'] | undefined) ||
      DEFAULT_PACKAGE_BY_SKILL[skillId],
    aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
    token: frontmatter.token || `@${skillId}`,
  };
};

const BUNDLED_CHAT_SKILLS: RuntimeChatSkillDefinition[] = [
  buildBundledSkillDefinition(knowledgeOrganizeSkillMarkdown, 'knowledge-organize'),
  buildBundledSkillDefinition(requirementsSkillMarkdown, 'requirements'),
  buildBundledSkillDefinition(sketchSkillMarkdown, 'sketch'),
  buildBundledSkillDefinition(uiDesignSkillMarkdown, 'ui-design'),
  buildBundledSkillDefinition(changeSyncSkillMarkdown, 'change-sync'),
];

export const getBundledChatSkills = () => BUNDLED_CHAT_SKILLS;

export const getBundledChatSkillById = (skillId: string) =>
  BUNDLED_CHAT_SKILLS.find((skill) => skill.id === skillId) || null;
