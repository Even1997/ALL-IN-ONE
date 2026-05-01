import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('obsidian shell build no longer references packaged knowledge backend crates or sidecars', async () => {
  const cargoRoot = await readFile(new URL('../Cargo.toml', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const tauriCargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const tauriConfig = await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8');

  assert.doesNotMatch(cargoRoot, /goodnight-core/);
  assert.doesNotMatch(cargoRoot, /goodnight-server/);
  assert.doesNotMatch(cargoRoot, /goodnight-mcp-bridge/);

  assert.doesNotMatch(packageJson, /build:server/);
  assert.doesNotMatch(tauriCargo, /goodnight-core/);
  assert.doesNotMatch(tauriConfig, /goodnight-server/);
  assert.doesNotMatch(tauriConfig, /goodnight-mcp-bridge/);
  assert.doesNotMatch(tauriConfig, /beforeDevCommand\":\s*\"npm run build:server/);
  assert.doesNotMatch(tauriConfig, /beforeBuildCommand\":\s*\"npm run build:server/);
});
