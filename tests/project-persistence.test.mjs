import assert from 'node:assert/strict';
import test from 'node:test';

import {
  joinProjectRelativePath,
  mapGeneratedFilesForProjectOutput,
  mapSketchFilesForProjectOutput,
  sanitizeProjectRelativePath,
} from '../src/utils/projectPersistence.ts';
import { readFile } from 'node:fs/promises';

test('project output sync keeps only design prototypes and design-native files', () => {
  const result = mapGeneratedFilesForProjectOutput([
    {
      path: 'src/generated/prototypes/home.html',
      content: '<html>home</html>',
      language: 'html',
      category: 'frontend',
    },
    {
      path: 'src/generated/prototypes/manifest.json',
      content: '{"pages":[]}',
      language: 'json',
      category: 'design',
    },
    {
      path: 'src/generated/planning/features.md',
      content: '# features',
      language: 'md',
      category: 'design',
    },
    {
      path: 'src/generated/pages/home.tsx',
      content: 'export const Home = () => null;',
      language: 'tsx',
      category: 'frontend',
    },
    {
      path: 'design/styles/custom.md',
      content: '---\nname: Custom\n---',
      language: 'md',
      category: 'design',
    },
  ]);

  assert.deepEqual(result, [
    { path: 'design/prototypes/home.html', content: '<html>home</html>' },
    { path: 'design/prototypes/manifest.json', content: '{"pages":[]}' },
    { path: 'design/styles/custom.md', content: '---\nname: Custom\n---' },
  ]);
});

test('project persistence joins relative project paths segment-by-segment for Windows roots', () => {
  assert.equal(
    joinProjectRelativePath('\\\\?\\C:\\DevFlow\\projects\\demo', 'design/styles/custom.md'),
    '\\\\?\\C:\\DevFlow\\projects\\demo\\design\\styles\\custom.md'
  );
  assert.equal(
    joinProjectRelativePath('C:\\DevFlow\\projects\\demo', 'sketch/pages/home.md'),
    'C:\\DevFlow\\projects\\demo\\sketch\\pages\\home.md'
  );
});

test('project output sync maps sketch markdown into sketch/pages files', () => {
  const result = mapSketchFilesForProjectOutput([
    {
      id: 'page-1',
      name: 'Login Page',
      kind: 'page',
      description: 'Login entry',
      featureIds: [],
      metadata: {
        route: '/login',
        title: 'Login',
        goal: 'Sign in',
        template: 'custom',
        ownerRole: 'UI设计',
        notes: '',
        status: 'draft',
      },
      children: [],
    },
  ], {
    'page-1': {
      id: 'wf-1',
      pageId: 'page-1',
      pageName: 'Login Page',
      updatedAt: '2026-04-25T00:00:00.000Z',
      status: 'ready',
      elements: [],
    },
  });

  assert.deepEqual(result, [
    {
      path: 'sketch/pages/page-1-login-page.md',
      content: '# Login Page\n\n- route: /login\n- goal: Sign in\n- modules:\n  - name: 暂无模块\n    position: 0, 0\n    size: 80, 60\n    content: 无',
    },
  ]);
});

test('project persistence defines a project filesystem initializer for required folders', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /export const ensureProjectFilesystemStructure = async/);
  assert.match(source, /await ensureDirectory\(joinPath\(projectDir, 'project'\)\)/);
  assert.match(source, /await ensureDirectory\(joinPath\(projectDir, 'sketch', 'pages'\)\)/);
  assert.match(source, /await ensureDirectory\(joinPath\(projectDir, 'design', 'prototypes'\)\)/);
  assert.match(source, /await ensureBuiltInStylePackFiles\(projectId\)/);
});

test('project persistence detects missing Tauri runtime before using filesystem commands', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /export const isTauriRuntimeAvailable = \(\) =>/);
  assert.match(source, /if \(!isTauriRuntimeAvailable\(\)\) \{\s*return \[\];\s*\}/);
  assert.match(source, /if \(!isTauriRuntimeAvailable\(\)\) \{\s*return null;\s*\}/);
});

test('project persistence sanitizes Windows-invalid relative file paths before syncing to disk', () => {
  assert.equal(
    sanitizeProjectRelativePath('design/styles/登录:?*主流程 .md'),
    'design/styles/登录-主流程.md'
  );
  assert.equal(
    sanitizeProjectRelativePath('/design//prototypes/结算<>预览?.html'),
    'design/prototypes/结算-预览.html'
  );
});

test('project output sync sanitizes invalid design file names from persisted artifacts', () => {
  const result = mapGeneratedFilesForProjectOutput([
    {
      path: 'design/styles/登录:?*主流程.md',
      content: 'style',
      language: 'md',
      category: 'design',
    },
    {
      path: 'src/generated/prototypes/结算<>预览?.html',
      content: '<html />',
      language: 'html',
      category: 'frontend',
    },
  ]);

  assert.deepEqual(result, [
    { path: 'design/styles/登录-主流程.md', content: 'style' },
    { path: 'design/prototypes/结算-预览.html', content: '<html />' },
  ]);
});
