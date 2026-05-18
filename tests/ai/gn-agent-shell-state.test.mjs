import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellStorePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/gnAgentShellStore.ts');
const shellTypesPath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/types.ts');

test('gnAgent shell store keeps UI modes separate without dedicated claude/codex config bindings', async () => {
  const storeSource = await readFile(shellStorePath, 'utf8');
  const typeSource = await readFile(shellTypesPath, 'utf8');
  assert.match(storeSource, /setMode/);
  assert.match(storeSource, /providerMode/);
  assert.doesNotMatch(storeSource, /claudeConfigId/);
  assert.doesNotMatch(storeSource, /codexConfigId/);
  assert.match(typeSource, /'classic'/);
  assert.match(typeSource, /'config'/);
  assert.match(typeSource, /'skills'/);
  assert.doesNotMatch(typeSource, /'claude'/);
  assert.doesNotMatch(typeSource, /'codex'/);
});
