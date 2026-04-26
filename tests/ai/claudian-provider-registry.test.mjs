import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../../src/modules/ai/claudian/providers/index.ts');

test('provider registry registers claude and codex', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.match(source, /claude/);
  assert.match(source, /codex/);
  assert.match(source, /registerBuiltInProviders/);
});
