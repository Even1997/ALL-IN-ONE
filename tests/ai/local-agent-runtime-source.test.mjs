import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri exposes trusted local agent launch params and result shape', async () => {
  const source = await readFile(tauriLibPath, 'utf8');

  assert.match(source, /struct LocalAgentParams/);
  assert.match(source, /struct LocalAgentPromptParams/);
  assert.match(source, /struct LocalAgentResult/);
  assert.match(source, /pub agent: String/);
  assert.match(source, /pub project_root: String/);
  assert.doesNotMatch(source, /Command::new\(&params\.agent\)/);
});

test('native local agent interface launcher executes from project root', async () => {
  const source = await readFile(tauriLibPath, 'utf8');

  assert.match(source, /#\[tauri::command\]\s*fn open_local_agent_interface/);
  assert.match(source, /\.current_dir\(&project_root\)/);
  assert.match(source, /build_local_agent_interface_command/);
  assert.match(source, /Command::new\("cmd"\)/);
  assert.match(source, /"powershell"/);
});

test('tauri exposes a native local agent prompt runner', async () => {
  const source = await readFile(tauriLibPath, 'utf8');

  assert.match(source, /fn run_local_agent_prompt/);
  assert.match(source, /build_local_agent_prompt_command/);
  assert.match(source, /codex exec/);
  assert.match(source, /--output-last-message/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*run_local_agent_prompt/);
});
