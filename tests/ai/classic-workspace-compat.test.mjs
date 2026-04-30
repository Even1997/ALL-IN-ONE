import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const classicPath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClassicWorkspace.tsx');

test('classic workspace keeps AIChat as compatibility mode only', async () => {
  const source = await readFile(classicPath, 'utf8');
  assert.match(source, /GNAgentChatPage/);
  assert.match(source, /providerId="classic"/);
  assert.match(source, /classic/i);
});
