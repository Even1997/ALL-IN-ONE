import assert from 'node:assert/strict';
import test from 'node:test';

const loadPromptBuilder = async () =>
  import(`../../src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts?test=${Date.now()}`);

test('runtime skill prompt builder concatenates active skill prompts in stable order', async () => {
  const { buildRuntimeSkillPrompt } = await loadPromptBuilder();
  const prompt = buildRuntimeSkillPrompt([
    { id: 'skill-a', name: 'Skill A', prompt: 'Prompt A' },
    { id: 'skill-b', name: 'Skill B', prompt: 'Prompt B' },
  ]);

  assert.match(prompt, /Prompt A/);
  assert.match(prompt, /Prompt B/);
});
