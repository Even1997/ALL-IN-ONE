import assert from 'node:assert/strict';
import test from 'node:test';

import { buildContextIndex } from '../../src/modules/ai/chat/contextIndex.ts';

test('buildContextIndex serializes readable files and preserves related ids', () => {
  const result = buildContextIndex([
    {
      id: 'sketch:login',
      path: 'sketch/pages/login.md',
      title: 'Login Sketch',
      content: '# Login Sketch',
      type: 'md',
      group: 'sketch',
      source: 'derived',
      updatedAt: '2026-04-25T00:00:00.000Z',
      readableByAI: true,
      summary: 'Login structure',
      relatedIds: ['design:login-html'],
      tags: ['login'],
    },
  ]);

  assert.equal(result.version, 1);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'sketch/pages/login.md');
  assert.deepEqual(result.files[0].relatedIds, ['design:login-html']);
  assert.equal(result.files[0].sizeHint, '# Login Sketch'.length);
});
