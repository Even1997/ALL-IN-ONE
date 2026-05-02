import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri exposes approval persistence commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(
    handlerMatch?.groups?.commands,
    'Expected tauri::generate_handler![...] block in src-tauri/src/lib.rs',
  );
  assert.match(handlerMatch.groups.commands, /\benqueue_agent_approval\b/);
  assert.match(handlerMatch.groups.commands, /\bresolve_agent_approval\b/);
  assert.match(handlerMatch.groups.commands, /\blist_agent_approvals\b/);
  assert.match(handlerMatch.groups.commands, /\bget_agent_sandbox_policy\b/);
  assert.match(handlerMatch.groups.commands, /\bset_agent_sandbox_policy\b/);
});
