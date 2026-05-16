// 文件作用：Prompt 构造器，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { AgentContextBundle } from '../agentRuntimeTypes';
import { buildRuntimeSkillPrompt } from '../skills/buildRuntimeSkillPrompt.ts';

const buildMemorySection = (context: AgentContextBundle) => {
  if (context.memoryEntries.length === 0) {
    return null;
  }

  return `<memory>\n${context.memoryEntries
    .map((item) => `${item.label}: ${item.content}`)
    .join('\n')}\n</memory>`;
};

const buildReferenceSection = (context: AgentContextBundle) => {
  if (context.referenceFiles.length === 0) {
    return null;
  }

  return `<references>\n${context.referenceFiles
    .map((item) => `${item.path}\n${item.content}`)
    .join('\n\n')}\n</references>`;
};

const buildSkillSection = (context: AgentContextBundle) => {
  if (context.activeSkills.length === 0) {
    return null;
  }

  return `<skills>\n${buildRuntimeSkillPrompt(context.activeSkills)}\n</skills>`;
};

export const buildThreadPrompt = (context: AgentContextBundle, userInput: string) =>
  [
    context.instructions.length > 0
      ? `<instructions>\n${context.instructions.join('\n\n')}\n</instructions>`
      : null,
    buildSkillSection(context),
    buildMemorySection(context),
    buildReferenceSection(context),
    userInput.trim(),
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');
