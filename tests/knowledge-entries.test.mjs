import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeEntries } from '../src/modules/knowledge/knowledgeEntries.ts';

test('knowledge entries hide internal generated planning and test markdown files', () => {
  const entries = buildKnowledgeEntries([], [
    {
      path: 'src/generated/planning/features.md',
      content: '# Features',
      language: 'md',
      summary: 'Planning features',
      updatedAt: '2026-04-25T00:00:00.000Z',
    },
    {
      path: 'src/generated/tests/test-plan.md',
      content: '# Test Plan',
      language: 'md',
      summary: 'Generated test plan',
      updatedAt: '2026-04-25T00:00:00.000Z',
    },
    {
      path: 'src/generated/prototypes/home.html',
      content: '<html>Home</html>',
      language: 'html',
      summary: 'Prototype home',
      updatedAt: '2026-04-25T00:00:00.000Z',
    },
  ]);

  assert.equal(entries.some((entry) => entry.filePath === 'src/generated/planning/features.md'), false);
  assert.equal(entries.some((entry) => entry.filePath === 'src/generated/tests/test-plan.md'), false);
  assert.equal(entries.some((entry) => entry.filePath === 'src/generated/prototypes/home.html'), true);
});
