import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri exposes runtime replay commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(handlerMatch?.groups?.commands);
  assert.match(handlerMatch.groups.commands, /\bappend_runtime_replay_event\b/);
  assert.match(handlerMatch.groups.commands, /\blist_runtime_replay_events\b/);
});
