import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReferencePromptContext } from '../../src/modules/ai/chat/referencePromptContext.ts';

test('buildReferencePromptContext emits index text and expanded content', () => {
  const result = buildReferencePromptContext({
    userInput: 'Organize the login page scheme',
    selectedFiles: [
      {
        id: 'a',
        path: 'sketch/pages/login.md',
        title: 'Login Sketch',
        content: '# Login Sketch\n\n## Modules\n- Hero',
        type: 'md',
        group: 'sketch',
        source: 'derived',
        updatedAt: '2026-04-25T00:00:00.000Z',
        readableByAI: true,
        summary: 'Login structure',
        relatedIds: [],
        tags: ['login'],
      },
    ],
    maxExpandedFiles: 1,
    maxExpandedChars: 400,
  });

  assert.match(result.indexSection, /sketch\/pages\/login\.md/);
  assert.match(result.expandedSection, /file: sketch\/pages\/login\.md/);
  assert.deepEqual(result.labels, ['已选文件 / 1']);
});

test('buildReferencePromptContext excludes hidden and upstream assistant context', () => {
  const result = buildReferencePromptContext({
    userInput: '整理需求',
    selectedFiles: [
      {
        id: 'hidden',
        path: '.superpowers/brainstorm/session/content.html',
        title: 'Hidden brainstorm',
        content: '<goodnight-m-flow>internal</goodnight-m-flow>',
        type: 'html',
        group: 'internal',
        source: 'derived',
        updatedAt: '2026-05-04T00:00:00.000Z',
        readableByAI: true,
        summary: 'hidden context',
        relatedIds: [],
        tags: [],
      },
      {
        id: 'upstream',
        path: 'docs/references/upstream/m-flow/README.md',
        title: 'Upstream reference',
        content: 'm-flow internals',
        type: 'md',
        group: 'internal',
        source: 'derived',
        updatedAt: '2026-05-04T00:00:00.000Z',
        readableByAI: true,
        summary: 'upstream context',
        relatedIds: [],
        tags: [],
      },
    ],
  });

  assert.equal(result.indexSection, '');
  assert.equal(result.expandedSection, '');
  assert.deepEqual(result.labels, []);
});
