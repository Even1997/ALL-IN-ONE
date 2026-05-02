import assert from 'node:assert/strict';
import test from 'node:test';

const loadAssembler = async () =>
  import(`../../src/modules/ai/runtime/context/assembleAgentContext.ts?test=${Date.now()}`);
const loadPromptBuilder = async () =>
  import(`../../src/modules/ai/runtime/context/buildThreadPrompt.ts?test=${Date.now()}`);

test('context assembler merges rules, references, thread facts, and memory entries', async () => {
  const { assembleAgentContext } = await loadAssembler();
  const context = assembleAgentContext({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    agentsInstructions: ['Follow AGENTS.md', 'Answer in Chinese'],
    referenceFiles: [
      {
        path: 'docs/plan.md',
        summary: 'Implementation plan',
        content: 'Phase 1 and Phase 2 tasks',
      },
    ],
    memoryEntries: [
      {
        id: 'memory-1',
        threadId: null,
        label: 'projectFact',
        content: 'Frontend UI must stay on the existing shell',
        createdAt: 1,
      },
    ],
    activeSkills: [
      {
        id: 'requirements',
        name: 'Requirements',
        prompt: 'Clarify goals first',
      },
    ],
  });

  assert.equal(context.projectId, 'project-1');
  assert.equal(context.projectName, 'GoodNight');
  assert.equal(context.threadId, 'thread-1');
  assert.equal(context.labels[0], 'AGENTS.md');
  assert.equal(context.referenceFiles[0].path, 'docs/plan.md');
  assert.equal(context.memoryEntries[0].label, 'projectFact');
  assert.equal(context.activeSkills[0].id, 'requirements');
});

test('thread prompt builder includes instructions, memory, references, and user input', async () => {
  const { buildThreadPrompt } = await loadPromptBuilder();
  const prompt = buildThreadPrompt(
    {
      projectId: 'project-1',
      projectName: 'GoodNight',
      threadId: 'thread-1',
      labels: ['AGENTS.md', 'docs/plan.md'],
      memoryLabels: ['projectFact'],
      content: '',
      instructions: ['Respect AGENTS.md'],
      referenceFiles: [
        {
          path: 'docs/plan.md',
          summary: 'Implementation plan',
          content: 'Ship runtime in phases',
        },
      ],
      memoryEntries: [
        {
          id: 'memory-1',
          threadId: null,
          label: 'projectFact',
          content: 'Existing UI stays in place',
          createdAt: 1,
        },
      ],
      activeSkills: [
        {
          id: 'requirements',
          name: 'Requirements',
          prompt: 'Clarify goals first',
        },
      ],
    },
    'What should we build next?'
  );

  assert.match(prompt, /Respect AGENTS\.md/);
  assert.match(prompt, /Clarify goals first/);
  assert.match(prompt, /Existing UI stays in place/);
  assert.match(prompt, /docs\/plan\.md/);
  assert.match(prompt, /What should we build next\?/);
});
