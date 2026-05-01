import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('app rebinds global projects-root vaults back to the current project directory', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /const normalizeProjectVaultComparablePath = \(/);
  assert.match(source, /const resolveProjectVaultPathForProjectDir = \(/);
  assert.match(
    source,
    /normalizeProjectVaultComparablePath\(vaultPath\)[\s\S]*normalizeProjectVaultComparablePath\(projectStorageSettings\?\.rootPath\)[\s\S]*normalizeProjectVaultComparablePath\(projectStorageSettings\?\.defaultPath\)/s
  );
  assert.match(source, /const nextVaultPath = resolveProjectVaultPathForProjectDir\(/);
  assert.match(source, /updateProject\(\{ vaultPath: nextVaultPath \}\);/);
});
