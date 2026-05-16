// 文件作用：内建技能定义装配层，位于技能库与发现层。
// 所在链路：负责技能文件解析、目录发现和展示派生。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { RuntimeSkillDefinition } from '../runtime/skills/runtimeSkillTypes.ts';
// 这个文件负责把内建技能 markdown 预编译成系统技能定义。
// 它是 bundled SKILL.md 文本进入 runtime skill 世界的入口。
// 如果你在排查“某个内建技能默认为什么会存在”，先看这里。
import { parseSkillMarkdown } from './parseSkillMarkdown.ts';
import {
  sketchSkillMarkdown,
  uiDesignSkillMarkdown,
  wikiSkillMarkdown,
} from './bundledSkillMarkdown.ts';

// 这份文件把仓库内建的几份技能 markdown 预编译成 runtime 可直接使用的系统技能定义。
export type RuntimeSystemSkillId = 'wiki' | 'sketch' | 'ui-design';

export type RuntimeSystemSkillDefinition = RuntimeSkillDefinition & {
  aliases: string[];
  token: string;
};

// 内建技能和外部发现技能最终都要落到同一份 RuntimeSkillDefinition 合同上，
// 这样 runtime 后续就不必区分“这是不是 bundled skill”。
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

// 这里定义了当前默认随产品发行的系统技能集合。
const SYSTEM_SKILLS: RuntimeSystemSkillDefinition[] = [
  buildSystemSkillDefinition(wikiSkillMarkdown, 'wiki'),
  buildSystemSkillDefinition(sketchSkillMarkdown, 'sketch'),
  buildSystemSkillDefinition(uiDesignSkillMarkdown, 'ui-design'),
];

export const getSystemSkillDefinitions = () => SYSTEM_SKILLS;

export const getSystemSkillDefinitionById = (skillId: string) =>
  SYSTEM_SKILLS.find((skill) => skill.id === skillId) || null;
