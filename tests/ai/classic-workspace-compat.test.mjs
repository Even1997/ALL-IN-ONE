import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiWorkspacePath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.tsx');

test('built-in AI workspace now uses the unified embedded chat surface directly', async () => {
  const source = await readFile(aiWorkspacePath, 'utf8');
  assert.match(source, /AIChat variant="embedded"/);
  assert.doesNotMatch(source, /ClassicWorkspace/);
});
