import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, '../../scripts/test-builtin-ai-turns.cjs');

test('built-in turns smoke routes structured runtime prompts through completeMessages', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /Array\.isArray\(runtimePrompt\)/);
  assert.match(source, /aiService\.completeMessages\(\s*\{/);
  assert.match(source, /messages:\s*runtimePrompt/);
  assert.match(source, /aiService\.completeText\(\s*\{/);
  assert.match(source, /prompt:\s*runtimePrompt/);
});
