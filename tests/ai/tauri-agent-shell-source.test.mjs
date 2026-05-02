import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');
const tauriModPath = path.resolve(__dirname, '../../src-tauri/src/agent_shell/mod.rs');

test('tauri exposes agent shell session and settings commands', async () => {
  const [libSource, modSource] = await Promise.all([
    readFile(tauriLibPath, 'utf8'),
    readFile(tauriModPath, 'utf8'),
  ]);
  const handlerMatch = libSource.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.match(libSource, /mod agent_shell;/);
  assert.ok(handlerMatch?.groups?.commands, 'Expected tauri::generate_handler![...] block in src-tauri/src/lib.rs');
  assert.match(modSource, /\bpub mod commands\b/);
  assert.match(modSource, /\bpub mod session_store\b/);
  assert.match(modSource, /\bpub mod settings_store\b/);
  assert.match(handlerMatch.groups.commands, /\bcreate_agent_shell_session\b/);
  assert.match(handlerMatch.groups.commands, /\blist_agent_shell_sessions\b/);
  assert.match(handlerMatch.groups.commands, /\bget_agent_shell_settings\b/);
  assert.match(handlerMatch.groups.commands, /\bupdate_agent_shell_settings\b/);
  assert.match(libSource, /"view\.agent"/);
});
