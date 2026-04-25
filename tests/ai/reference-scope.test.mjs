import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveReferenceScopeSelection } from '../../src/modules/ai/chat/chatContext.ts';

test('resolveReferenceScopeSelection returns current file ids for current mode', () => {
  const files = [
    { id: 'a', path: 'docs/a.md', readableByAI: true },
    { id: 'b', path: 'docs/b.md', readableByAI: true },
  ];

  const result = resolveReferenceScopeSelection({
    mode: 'current',
    currentFileIds: ['b'],
    directoryPath: null,
    allFiles: files,
  });

  assert.deepEqual(result, ['b']);
});

test('resolveReferenceScopeSelection expands directory prefixes without per-file filtering', () => {
  const files = [
    { id: 'a', path: 'sketch/pages/a.md', readableByAI: true },
    { id: 'b', path: 'sketch/pages/b.md', readableByAI: true },
    { id: 'c', path: 'design/styles/c.md', readableByAI: true },
  ];

  const result = resolveReferenceScopeSelection({
    mode: 'directory',
    currentFileIds: [],
    directoryPath: 'sketch/pages',
    allFiles: files,
  });

  assert.deepEqual(result, ['a', 'b']);
});
