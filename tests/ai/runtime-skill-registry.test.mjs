import assert from 'node:assert/strict';
import test from 'node:test';

const loadRegistry = async () =>
  import(`../../src/modules/ai/runtime/skills/runtimeSkillRegistry.ts?test=${Date.now()}`);

test('runtime skill registry lists skills and supports thread activation state', async () => {
  const { createRuntimeSkillRegistry } = await loadRegistry();
  const registry = createRuntimeSkillRegistry([
    { id: 'skill-a', name: 'Skill A', prompt: 'Prompt A' },
    { id: 'skill-b', name: 'Skill B', prompt: 'Prompt B' },
  ]);

  registry.activateSkill('thread-1', 'skill-a');

  assert.equal(registry.listSkills().length, 2);
  assert.deepEqual(registry.listActiveSkills('thread-1').map((item) => item.id), ['skill-a']);
});
