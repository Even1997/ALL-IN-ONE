import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts');
const codexRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/codex/CodexRuntime.ts');

test('claude runtime exists as a dedicated sdk-backed runtime layer', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /class ClaudeRuntime/);
});

test('codex runtime exists as a dedicated runtime layer', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /class CodexRuntime/);
});
