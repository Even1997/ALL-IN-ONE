import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('tauri shell exposes runtime sidecar lifecycle commands', async () => {
  const libSource = await readFile(path.join(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');
  const runtimeSidecarSource = await readFile(
    path.join(repoRoot, 'src-tauri/src/runtime_sidecar.rs'),
    'utf8',
  );
  const packageSource = await readFile(path.join(repoRoot, 'package.json'), 'utf8');

  assert.match(libSource, /RuntimeSidecarManager::default/);
  assert.match(libSource, /start_runtime_sidecar/);
  assert.match(libSource, /get_runtime_sidecar_status/);
  assert.match(libSource, /stop_runtime_sidecar/);
  assert.match(runtimeSidecarSource, /Runtime sidecar build artifact not found/);
  assert.match(runtimeSidecarSource, /GOODNIGHT_RUNTIME_PORT/);
  assert.match(runtimeSidecarSource, /wait_for_runtime_ready/);
  assert.match(packageSource, /"dev": "npm run runtime:build && vite"/);
  assert.match(packageSource, /"build": "npm run runtime:build && tsc && vite build"/);
});
