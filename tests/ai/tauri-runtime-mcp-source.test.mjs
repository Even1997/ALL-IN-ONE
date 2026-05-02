import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');
const mcpStorePath = path.resolve(__dirname, '../../src-tauri/src/agent_runtime/mcp_store.rs');

test('tauri exposes runtime mcp registration commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(handlerMatch?.groups?.commands);
  assert.match(handlerMatch.groups.commands, /\blist_runtime_mcp_servers\b/);
  assert.match(handlerMatch.groups.commands, /\bupsert_runtime_mcp_server\b/);
  assert.match(handlerMatch.groups.commands, /\blist_runtime_mcp_tool_calls\b/);
  assert.match(handlerMatch.groups.commands, /\binvoke_runtime_mcp_tool\b/);
});

test('runtime mcp backend references the default goodnight skills server and tool', async () => {
  const source = await readFile(mcpStorePath, 'utf8');

  assert.match(source, /goodnight-skills/);
  assert.match(source, /list-skills/);
});
