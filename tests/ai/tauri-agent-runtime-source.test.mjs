import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri exposes agent runtime thread and memory commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.match(source, /mod agent_runtime;/);
  assert.ok(handlerMatch?.groups?.commands, 'Expected tauri::generate_handler![...] block in src-tauri/src/lib.rs');
  assert.match(handlerMatch.groups.commands, /\bcreate_agent_thread\b/);
  assert.match(handlerMatch.groups.commands, /\blist_agent_threads\b/);
  assert.match(handlerMatch.groups.commands, /\bappend_agent_timeline_event\b/);
  assert.match(handlerMatch.groups.commands, /\bsave_project_memory_entry\b/);
  assert.match(handlerMatch.groups.commands, /\blist_project_memory_entries\b/);
});
