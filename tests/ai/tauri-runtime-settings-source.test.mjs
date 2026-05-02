import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');
const tauriModPath = path.resolve(__dirname, '../../src-tauri/src/agent_runtime/mod.rs');
const runtimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');

test('tauri agent runtime exposes dedicated runtime settings store and commands', async () => {
  const [libSource, modSource, runtimeClientSource] = await Promise.all([
    readFile(tauriLibPath, 'utf8'),
    readFile(tauriModPath, 'utf8'),
    readFile(runtimeClientPath, 'utf8'),
  ]);
  const handlerMatch = libSource.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(handlerMatch?.groups?.commands);
  assert.match(modSource, /\bpub mod settings_store\b/);
  assert.match(handlerMatch.groups.commands, /\bget_agent_runtime_settings\b/);
  assert.match(handlerMatch.groups.commands, /\bupdate_agent_runtime_settings\b/);
  assert.match(runtimeClientSource, /\bgetAgentRuntimeSettings\b/);
  assert.match(runtimeClientSource, /\bupdateAgentRuntimeSettings\b/);
});
