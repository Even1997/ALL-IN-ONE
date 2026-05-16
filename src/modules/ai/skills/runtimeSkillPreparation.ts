// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { invoke } from '@tauri-apps/api/core';
import type {
  RuntimeSkillDefinition,
  RuntimeSkillHookMatcher,
  RuntimeSkillHookStep,
  RuntimeSkillShell,
} from '../runtime/skills/runtimeSkillTypes.ts';
import { substituteRuntimeSkillArguments } from './runtimeSkillArguments.ts';

type SkillShellResult = {
  success: boolean;
  content: string;
  error: string | null;
};

type RunRuntimeSkillShellInput = {
  command: string;
  cwd?: string;
  shell?: RuntimeSkillShell;
  timeout?: number;
};

export type RuntimeSkillHookEvent = {
  skillId: string;
  skillName: string;
  eventName: 'PreToolUse' | 'PostToolUse';
  toolName: string;
  matcher: string;
  command: string;
  status: 'completed' | 'failed';
  error?: string | null;
};

const INLINE_SHELL_PATTERN = /!`([^`]+)`/g;
const BLOCK_SHELL_PATTERN = /```!\n([\s\S]*?)\n```/g;

const replaceSkillVariables = (content: string, skill: RuntimeSkillDefinition, sessionId: string) => {
  let nextContent = content.replace(/\$\{CLAUDE_SESSION_ID\}/g, sessionId);
  if (skill.skillRoot) {
    nextContent = nextContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skill.skillRoot.replace(/\\/g, '/'));
  }
  return nextContent;
};

const runRuntimeSkillShell = async (input: RunRuntimeSkillShellInput) => {
  const result = await invoke<SkillShellResult>('tool_bash', {
    params: {
      command: input.command,
      timeout: input.timeout || 60000,
      cwd: input.cwd,
      shell: input.shell,
    },
  });

  if (!result.success) {
    throw new Error(result.error || `Skill shell command failed: ${input.command}`);
  }

  return result.content.trim();
};

const replaceAsyncMatches = async (
  content: string,
  pattern: RegExp,
  replace: (match: string) => Promise<string>
) => {
  const matches = [...content.matchAll(pattern)];
  if (matches.length === 0) {
    return content;
  }

  let nextContent = content;
  for (const entry of matches) {
    const fullMatch = entry[0];
    const replacement = await replace(fullMatch);
    nextContent = nextContent.replace(fullMatch, replacement);
  }
  return nextContent;
};

const executePromptShellCommands = async (
  content: string,
  skill: RuntimeSkillDefinition,
  fallbackRoot?: string
) => {
  const cwd = skill.skillRoot || fallbackRoot;
  const withInlineShell = await replaceAsyncMatches(content, INLINE_SHELL_PATTERN, async (match) => {
    const command = match.slice(2, -1).trim();
    return await runRuntimeSkillShell({
      command,
      cwd,
      shell: skill.shell,
    });
  });

  return replaceAsyncMatches(withInlineShell, BLOCK_SHELL_PATTERN, async (match) => {
    const command = match.replace(/^```!\n/, '').replace(/\n```$/, '').trim();
    return await runRuntimeSkillShell({
      command,
      cwd,
      shell: skill.shell,
    });
  });
};

export const prepareRuntimeSkillForTurn = async (input: {
  skill: RuntimeSkillDefinition;
  rawArguments?: string;
  sessionId: string;
  projectRoot?: string;
}) => {
  let prompt = input.skill.prompt;
  if (typeof input.rawArguments === 'string') {
    prompt = substituteRuntimeSkillArguments(prompt, input.rawArguments, input.skill.argumentNames || []);
  }

  prompt = replaceSkillVariables(prompt, input.skill, input.sessionId);

  if (input.skill.source !== 'mcp') {
    prompt = await executePromptShellCommands(prompt, input.skill, input.projectRoot);
  }

  return {
    ...input.skill,
    prompt,
  };
};

export const prepareRuntimeSkillsForTurn = async (input: {
  skills: RuntimeSkillDefinition[];
  explicitSkillId?: string | null;
  explicitArguments?: string;
  sessionId: string;
  projectRoot?: string;
}) =>
  Promise.all(
    input.skills.map((skill) =>
      prepareRuntimeSkillForTurn({
        skill,
        rawArguments: input.explicitSkillId === skill.id ? input.explicitArguments : undefined,
        sessionId: input.sessionId,
        projectRoot: input.projectRoot,
      })
    )
  );

const matchesHookMatcher = (matcher: string, toolName: string) => {
  const normalizedMatcher = matcher.trim().toLowerCase();
  if (!normalizedMatcher || normalizedMatcher === '*') {
    return true;
  }

  return normalizedMatcher === toolName.trim().toLowerCase();
};

const buildHookKey = (skillId: string, eventName: string, matcher: string, command: string) =>
  `${skillId}:${eventName}:${matcher}:${command}`;

export const createRuntimeSkillHookRunner = (input: {
  skills: RuntimeSkillDefinition[];
  projectRoot?: string;
  onHookEvent?: (event: RuntimeSkillHookEvent) => Promise<void> | void;
}) => {
  const executedOnce = new Set<string>();

  const runHookCommands = async (
    skill: RuntimeSkillDefinition,
    eventName: 'PreToolUse' | 'PostToolUse',
    toolName: string,
    matchers: RuntimeSkillHookMatcher[] | undefined
  ) => {
    for (const matcherEntry of matchers || []) {
      if (!matchesHookMatcher(matcherEntry.matcher, toolName)) {
        continue;
      }

      for (const hook of matcherEntry.hooks || ([] as RuntimeSkillHookStep[])) {
        const hookKey = buildHookKey(skill.id, eventName, matcherEntry.matcher, hook.command);
        if (hook.once && executedOnce.has(hookKey)) {
          continue;
        }

        try {
          await runRuntimeSkillShell({
            command: hook.command,
            cwd: skill.skillRoot || input.projectRoot,
            shell: skill.shell,
          });
          await input.onHookEvent?.({
            skillId: skill.id,
            skillName: skill.name,
            eventName,
            toolName,
            matcher: matcherEntry.matcher,
            command: hook.command,
            status: 'completed',
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await input.onHookEvent?.({
            skillId: skill.id,
            skillName: skill.name,
            eventName,
            toolName,
            matcher: matcherEntry.matcher,
            command: hook.command,
            status: 'failed',
            error: message,
          });
          throw error;
        }

        if (hook.once) {
          executedOnce.add(hookKey);
        }
      }
    }
  };

  return {
    beforeToolCall: async (toolName: string) => {
      for (const skill of input.skills) {
        await runHookCommands(skill, 'PreToolUse', toolName, skill.hooks?.PreToolUse);
      }
    },
    afterToolCall: async (toolName: string) => {
      for (const skill of input.skills) {
        await runHookCommands(skill, 'PostToolUse', toolName, skill.hooks?.PostToolUse);
      }
    },
  };
};

export const resolveRuntimeSkillAllowedTools = (input: {
  defaultAllowedTools: string[];
  skills: RuntimeSkillDefinition[];
  explicitSkillId?: string | null;
}) => {
  if (!input.explicitSkillId) {
    return input.defaultAllowedTools;
  }

  const explicitSkill = input.skills.find((skill) => skill.id === input.explicitSkillId) || null;
  if (!explicitSkill || explicitSkill.allowedTools.length === 0) {
    return input.defaultAllowedTools;
  }

  return [...explicitSkill.allowedTools];
};
