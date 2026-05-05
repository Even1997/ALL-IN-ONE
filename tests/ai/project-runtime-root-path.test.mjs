import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProjectRuntimeRootPath } from '../../src/utils/projectPersistence.ts';

test('runtime project root prefers the resolved project directory over a stale vault path', () => {
  assert.equal(
    resolveProjectRuntimeRootPath(
      {
        id: 'project-1',
        vaultPath: 'C:\\Users\\Even\\Documents\\Old-Vault',
      },
      'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
    ),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
  );
});

test('runtime project root still falls back to vault path when no project directory is available', () => {
  assert.equal(
    resolveProjectRuntimeRootPath(
      {
        id: 'project-1',
        vaultPath: 'C:\\Users\\Even\\Documents\\ALL-IN-ONE',
      },
      null
    ),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
  );
});

test('runtime project root strips windows extended-length prefixes before returning paths', () => {
  assert.equal(
    resolveProjectRuntimeRootPath(
      {
        id: 'project-1',
        vaultPath: '\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE',
      },
      null
    ),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
  );
  assert.equal(
    resolveProjectRuntimeRootPath(
      {
        id: 'project-1',
        vaultPath: 'C:\\Users\\Even\\Documents\\Old-Vault',
      },
      '\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE'
    ),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
  );
});
