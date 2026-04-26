import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');

test('claudian shell mounts dedicated provider workspaces instead of a single generic chat page', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /ClaudeWorkspace/);
  assert.match(source, /CodexWorkspace/);
  assert.match(source, /ClassicWorkspace/);
});
