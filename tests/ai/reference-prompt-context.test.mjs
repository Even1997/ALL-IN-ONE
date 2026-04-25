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
