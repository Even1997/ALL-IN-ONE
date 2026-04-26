import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellStorePath = path.resolve(__dirname, '../../src/modules/ai/claudian/claudianShellStore.ts');
const shellTypesPath = path.resolve(__dirname, '../../src/modules/ai/claudian/types.ts');

test('claudian shell store exposes mode selection for classic, config, claude, and codex', async () => {
  const storeSource = await readFile(shellStorePath, 'utf8');
  const typeSource = await readFile(shellTypesPath, 'utf8');
  assert.match(storeSource, /setMode/);
  assert.match(typeSource, /'classic'/);
  assert.match(typeSource, /'config'/);
  assert.match(typeSource, /'claude'/);
  assert.match(typeSource, /'codex'/);
});
