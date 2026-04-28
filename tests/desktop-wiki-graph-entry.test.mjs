import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appNavigationPath = path.resolve(__dirname, '../src/appNavigation.ts');

test('desktop primary rail exposes a dedicated wiki graph entry', async () => {
  const appSource = await readFile(appPath, 'utf8');
  const navigationSource = await readFile(appNavigationPath, 'utf8');

  assert.match(navigationSource, /'wiki'/);
  assert.match(appSource, /wiki:\s*'gitBranch'/);
  assert.match(appSource, /\{ id: 'wiki', label: 'Wiki 图谱', summary: '关系与连接' \}/);
  assert.match(appSource, /const DESKTOP_PRIMARY_ROLES: RoleView\[] = \['knowledge', 'wiki', 'page', 'design'\]/);
  assert.match(appSource, /const renderProductView = \(entryTab: 'knowledge' \| 'wiki' \| 'page'\) =>/);
  assert.match(appSource, /currentRole === 'wiki'\s*\?\s*renderProductView\('wiki'\)/);
});
