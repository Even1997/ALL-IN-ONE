import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('desktop app bootstraps the node runtime sidecar', async () => {
  const appSource = await readFile(path.join(repoRoot, 'src/App.tsx'), 'utf8');
  const sidecarSource = await readFile(
    path.join(repoRoot, 'src/modules/runtime-sidecar/desktopRuntimeSidecar.ts'),
    'utf8',
  );

  assert.match(appSource, /ensureDesktopRuntimeSidecar/);
  assert.match(appSource, /void ensureDesktopRuntimeSidecar\(\)/);
  assert.match(sidecarSource, /start_runtime_sidecar/);
  assert.match(sidecarSource, /RuntimeSidecarClient/);
  assert.match(sidecarSource, /Tauri runtime unavailable/);
  assert.match(sidecarSource, /getDesktopRuntimeSidecarStatus/);
});
