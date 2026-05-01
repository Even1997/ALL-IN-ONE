import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

test('obsidian shell build no longer references packaged knowledge backend crates or sidecars', async () => {
  const cargoRoot = await readFile(new URL('../Cargo.toml', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const tauriCargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const tauriConfig = await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8');
  const workbench = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');
  const aiChat = await readFile(new URL('../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');
  const knowledgeStore = await readFile(new URL('../src/features/knowledge/store/knowledgeStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(cargoRoot, /goodnight-core/);
  assert.doesNotMatch(cargoRoot, /goodnight-server/);
  assert.doesNotMatch(cargoRoot, /goodnight-mcp-bridge/);

  assert.doesNotMatch(packageJson, /build:server/);
  assert.doesNotMatch(tauriCargo, /goodnight-core/);
  assert.doesNotMatch(tauriConfig, /goodnight-server/);
  assert.doesNotMatch(tauriConfig, /goodnight-mcp-bridge/);
  assert.doesNotMatch(tauriConfig, /beforeDevCommand\":\s*\"npm run build:server/);
  assert.doesNotMatch(tauriConfig, /beforeBuildCommand\":\s*\"npm run build:server/);
  assert.doesNotMatch(workbench, /features\/knowledge\/api/);
  assert.doesNotMatch(workbench, /modules\/knowledge\/m-flow/);
  assert.doesNotMatch(aiChat, /modules\/knowledge\/m-flow/);
  assert.doesNotMatch(knowledgeStore, /\.\.\/api\/knowledgeClient/);

  await assert.rejects(access(new URL('../src/features/knowledge/api', import.meta.url)));
  await assert.rejects(access(new URL('../src/modules/knowledge/m-flow', import.meta.url)));
});
