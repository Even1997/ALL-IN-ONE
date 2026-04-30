import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentConfigPage.tsx');
const localConfigPath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/localConfig.ts');

test('gnAgent config page reads local agent config snapshot and current ai configs', async () => {
  const source = await readFile(configPagePath, 'utf8');
  assert.match(source, /getLocalAgentConfigSnapshot/);
  assert.match(source, /useGlobalAIStore/);
  assert.match(source, /Claude Settings/);
  assert.match(source, /Codex Skills/);
});

test('local config module exposes a tauri-backed snapshot loader', async () => {
  const source = await readFile(localConfigPath, 'utf8');
  assert.match(source, /get_local_agent_config_snapshot/);
  assert.match(source, /isTauriRuntimeAvailable/);
});

