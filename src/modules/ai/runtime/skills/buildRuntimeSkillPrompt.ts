import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const buildRuntimeSkillPrompt = (skills: RuntimeSkillDefinition[]) =>
  skills
    .map((skill) => {
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
        skill.allowedTools.length > 0 ? `allowed_tools="${skill.allowedTools.join(', ')}"` : null,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ');

      return `<skill ${metadata}>\n${skill.prompt}\n</skill>`;
    })
    .join('\n\n');
