import assert from 'node:assert/strict';
import test from 'node:test';

const loadContextManager = async () =>
  import(`../../src/modules/ai/runtime/context/buildAgentContext.ts?test=${Date.now()}`);

test('agent context manager builds a budgeted prompt with core sections and report', async () => {
  const { buildAgentContext } = await loadContextManager();

  const context = buildAgentContext({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    userInput: 'What should we build next?',
    contextWindowTokens: 32000,
    conversationHistory: [
      { role: 'user', content: 'We need the runtime shell.' },
      { role: 'assistant', content: 'I mapped the first task.' },
    ],
    instructions: ['Follow AGENTS.md'],
    referenceFiles: [
      {
        path: 'docs/plan.md',
        summary: 'Implementation plan',
        content: 'Task 1 adds a context manager.',
      },
    ],
    memoryEntries: [
      {
        id: 'memory-1',
        threadId: null,
        label: 'projectFact',
        content: 'Keep edits surgical.',
        createdAt: 1,
      },
    ],
    activeSkills: [
      {
        id: 'requirements',
        name: 'Requirements',
        prompt: 'Clarify goals first.',
      },
    ],
  });

  const sectionKinds = context.sections.map((section) => section.kind);

  assert.equal(context.threadId, 'thread-1');
  assert.ok(sectionKinds.includes('history'));
  assert.ok(sectionKinds.includes('reference'));
  assert.ok(sectionKinds.includes('memory'));
  assert.ok(context.budget.usedTokens > 0);
  assert.match(context.prompt, /<context_report>/);
  assert.ok(
    context.budget.usedTokens >
      context.sections
        .filter((section) => section.included)
        .reduce((total, section) => total + section.estimatedTokens, 0)
  );
});

test('agent context manager keeps user input under constrained budgets', async () => {
  const { buildAgentContext } = await loadContextManager();

  const context = buildAgentContext({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    userInput: 'Current request must survive.',
    contextWindowTokens: 1,
    conversationHistory: [
      { role: 'user', content: 'Earlier request.' },
      { role: 'assistant', content: 'Earlier answer.' },
    ],
    instructions: ['Keep this instruction mandatory.'],
    referenceFiles: [
      {
        path: 'docs/plan.md',
        summary: 'Implementation plan',
        content: 'Optional reference content.',
      },
    ],
    memoryEntries: [
      {
        id: 'memory-1',
        threadId: null,
        label: 'projectFact',
        content: 'Optional memory content.',
        createdAt: 1,
      },
    ],
    activeSkills: [
      {
        id: 'requirements',
        name: 'Requirements',
        prompt: 'Optional skill prompt.',
      },
    ],
  });

  const sectionByKind = new Map(context.sections.map((section) => [section.kind, section]));

  assert.match(context.prompt, /Current request must survive\./);
  assert.equal(sectionByKind.get('user-input')?.included, true);
  assert.equal(sectionByKind.get('history')?.included, false);
  assert.equal(sectionByKind.get('reference')?.included, false);
  assert.equal(sectionByKind.get('memory')?.included, false);
});

test('agent context manager excludes optionals when rendered overhead exhausts the budget', async () => {
  const { buildAgentContext } = await loadContextManager();

  const context = buildAgentContext({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    userInput: 'Keep me.',
    contextWindowTokens: 94,
    conversationHistory: [{ role: 'user', content: 'Small optional history.' }],
    instructions: ['Required instruction.'],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
  });

  const sectionByKind = new Map(context.sections.map((section) => [section.kind, section]));

  assert.match(context.prompt, /Keep me\./);
  assert.equal(sectionByKind.get('user-input')?.included, true);
  assert.equal(sectionByKind.get('history')?.included, false);
  assert.ok(context.budget.usedTokens <= context.budget.limitTokens);
});
