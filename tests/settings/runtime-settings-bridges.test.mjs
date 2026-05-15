import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentRuntimeClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeClient.ts');
const projectPersistencePath = path.resolve(__dirname, '../../src/utils/projectPersistence.ts');
const gnAgentShellStorePath = path.resolve(__dirname, '../../src/modules/ai/gn-agent/gnAgentShellStore.ts');
const agentShellPagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('phase 4 exposes runtime and storage bridge helpers needed by the settings panels', async () => {
  const [runtimeClientSource, projectPersistenceSource] = await Promise.all([
    readFile(agentRuntimeClientPath, 'utf8'),
    readFile(projectPersistencePath, 'utf8'),
  ]);

  assert.match(runtimeClientSource, /export const updateAgentRuntimeSettings = async/);
  assert.match(projectPersistenceSource, /export const getRequirementsDir = async/);
  assert.match(projectPersistenceSource, /export const openPathInShell = async/);
  assert.match(projectPersistenceSource, /PROJECT_STORAGE_SETTINGS_CHANGED_EVENT/);
});

test('phase 4 hydrates persisted shell provider settings into the app shell state', async () => {
  const [shellStoreSource, appSource, agentShellPageSource] = await Promise.all([
    readFile(gnAgentShellStorePath, 'utf8'),
    readFile(appPath, 'utf8'),
    readFile(agentShellPagePath, 'utf8'),
  ]);

  assert.match(shellStoreSource, /providerMode/);
  assert.match(shellStoreSource, /setProviderMode/);
  assert.match(shellStoreSource, /hydrateProviderSettings/);

  assert.match(appSource, /getAgentShellSettings/);
  assert.match(appSource, /hydrateProviderSettings/);

  assert.match(agentShellPageSource, /providerMode/);
  assert.match(agentShellPageSource, /providerId=\{providerMode\}/);
});
