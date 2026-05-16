// 文件作用：Prompt 编码器，位于runtime 技能层。
// 所在链路：负责 skill 注册、类型约束和 prompt 注入结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责把 runtime skill definitions 编码成注入模型的 `<skill ...>...</skill>` 片段。
// 它是“技能元数据 -> 模型可读提示词结构”的转换层。
// 如果你在排查“技能为什么没进 prompt 或进 prompt 后长什么样”，先看这里。
import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

// 这里把 runtime skill definitions 编码成注入给模型的 `<skill ...>...</skill>` 片段。
// 如果你在查“某个技能为什么没有被带进 prompt”或“带进 prompt 时有哪些元数据”，先看这里。
export const buildRuntimeSkillPrompt = (skills: RuntimeSkillDefinition[]) =>
  skills
    .map((skill) => {
      const allowedTools = Array.isArray(skill.allowedTools) ? skill.allowedTools : [];
      // metadata 尽量压成属性，方便模型用统一结构读取，而不是把解释散在自然语言里。
      const metadata = [
        `id="${skill.id}"`,
        `name="${skill.name}"`,
        skill.whenToUse ? `when="${skill.whenToUse}"` : null,
        skill.version ? `version="${skill.version}"` : null,
        `context="${skill.executionContext}"`,
        `source="${skill.source}"`,
        `model_invocable="${skill.modelInvocable ? 'true' : 'false'}"`,
        skill.argumentHint ? `argument_hint="${skill.argumentHint}"` : null,
        skill.argumentNames && skill.argumentNames.length > 0
          ? `arguments="${skill.argumentNames.join(', ')}"`
          : null,
        skill.agent ? `agent="${skill.agent}"` : null,
        skill.model ? `model="${skill.model}"` : null,
        skill.effort ? `effort="${skill.effort}"` : null,
        skill.shell ? `shell="${skill.shell}"` : null,
        skill.activationPaths && skill.activationPaths.length > 0
          ? `paths="${skill.activationPaths.join(', ')}"`
          : null,
        allowedTools.length > 0 ? `allowed_tools="${allowedTools.join(', ')}"` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ');

      return `<skill ${metadata}>\n${skill.prompt}\n</skill>`;
    })
    .join('\n\n');
