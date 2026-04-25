import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knowledgeTreePath = path.resolve(__dirname, '../src/modules/knowledge/knowledgeTree.ts');
const productWorkbenchPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const tauriLibPath = path.resolve(__dirname, '../src-tauri/src/lib.rs');

const importTsModule = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return import(moduleUrl);
};

test('knowledge tree model defines three fixed protected system groups', async () => {
  const source = await readFile(knowledgeTreePath, 'utf8');

  assert.match(source, /SYSTEM_KNOWLEDGE_GROUPS/);
  assert.match(source, /id:\s*'project'[\s\S]*label:\s*'项目'/);
  assert.match(source, /id:\s*'sketch'[\s\S]*label:\s*'草图'/);
  assert.match(source, /id:\s*'design'[\s\S]*label:\s*'设计'/);
  assert.match(source, /protected:\s*true/);
  assert.match(source, /buildKnowledgeTree/);
});

test('knowledge tree de-duplicates duplicate file records for the same path', async () => {
  const { buildKnowledgeTree } = await importTsModule(knowledgeTreePath);

  const entries = [
    {
      id: 'doc-1',
      title: '需求.md',
      summary: 'A',
      content: '# A',
      type: 'markdown',
      source: 'requirement',
      filePath: 'root/需求.md',
      updatedAt: '2026-04-25T00:00:00.000Z',
      status: 'ready',
      kind: 'note',
      tags: [],
      relatedIds: [],
    },
    {
      id: 'doc-2',
      title: '需求.md',
      summary: 'B',
      content: '# B',
      type: 'markdown',
      source: 'requirement',
      filePath: 'root/需求.md',
      updatedAt: '2026-04-24T00:00:00.000Z',
      status: 'ready',
      kind: 'note',
      tags: [],
      relatedIds: [],
    },
  ];
  const diskItems = [
    { path: 'root/需求.md', relativePath: '需求.md', type: 'file' },
  ];

  const tree = buildKnowledgeTree(entries, diskItems, 'root', {});
  const projectGroup = tree.find((node) => node.id === 'project');

  assert.ok(projectGroup);
  assert.equal(projectGroup.children.length, 1);
  assert.equal(projectGroup.children[0]?.id, 'file:project:需求.md');
});

test('knowledge tree groups sketch and design markdown by relative path prefix', async () => {
  const { buildKnowledgeTree } = await importTsModule(knowledgeTreePath);

  const entries = [
    {
      id: 'sketch-1',
      title: 'page-1-login.md',
      summary: 'Sketch doc',
      content: '## Login Page Modules',
      type: 'markdown',
      source: 'requirement',
      filePath: 'root/sketch/pages/page-1-login.md',
      updatedAt: '2026-04-25T00:00:00.000Z',
      status: 'ready',
      kind: 'note',
      tags: [],
      relatedIds: [],
    },
    {
      id: 'style-1',
      title: 'aurora-glass.md',
      summary: 'Style doc',
      content: '---\nname: Aurora Glass\n---',
      type: 'markdown',
      source: 'requirement',
      filePath: 'root/design/styles/aurora-glass.md',
      updatedAt: '2026-04-25T00:00:00.000Z',
      status: 'ready',
      kind: 'note',
      tags: [],
      relatedIds: [],
    },
  ];
  const diskItems = [
    { path: 'root/sketch', relativePath: 'sketch', type: 'folder' },
    { path: 'root/sketch/pages', relativePath: 'sketch/pages', type: 'folder' },
    { path: 'root/sketch/pages/page-1-login.md', relativePath: 'sketch/pages/page-1-login.md', type: 'file' },
    { path: 'root/design', relativePath: 'design', type: 'folder' },
    { path: 'root/design/styles', relativePath: 'design/styles', type: 'folder' },
    { path: 'root/design/styles/aurora-glass.md', relativePath: 'design/styles/aurora-glass.md', type: 'file' },
  ];

  const tree = buildKnowledgeTree(entries, diskItems, 'root', {});
  const sketchGroup = tree.find((node) => node.id === 'sketch');
  const designGroup = tree.find((node) => node.id === 'design');

  assert.ok(sketchGroup);
  assert.ok(designGroup);
  assert.match(JSON.stringify(sketchGroup), /file:sketch:sketch\/pages\/page-1-login\.md/);
  assert.match(JSON.stringify(designGroup), /file:design:design\/styles\/aurora-glass\.md/);
});

test('product workbench renders grouped knowledge tree with folder actions', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /buildKnowledgeTree/);
  assert.match(source, /handleCreateKnowledgeFolder/);
  assert.match(source, /handleDeleteKnowledgeNode/);
  assert.match(source, /selectedKnowledgeNode/);
  assert.match(source, /新建文件夹/);
  assert.match(source, /项目/);
  assert.match(source, /草图/);
  assert.match(source, /设计/);
});

test('product workbench infers sketch markdown kind from sketch path prefixes', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /item\.relativePath\.startsWith\('sketch\/'\)/);
  assert.match(source, /kind:\s*isSketchPath \? 'sketch' as const : 'note' as const/);
});

test('knowledge tree groups are not forced open so top-level folders can collapse', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const isExpanded = expandedKnowledgeNodeIds\.has\(node\.id\)/);
  assert.doesNotMatch(source, /const isExpanded = expandedKnowledgeNodeIds\.has\(node\.id\) \|\| node\.type === 'group'/);
  assert.doesNotMatch(source, /\(isExpanded \|\| node\.type === 'group'\) && node\.children\.length > 0/);
});

test('knowledge tree styling is text-first instead of card-like rows', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /\.pm-knowledge-tree/);
  assert.match(source, /\.pm-knowledge-tree-row/);
  assert.match(source, /\.pm-knowledge-tree-label/);
  assert.doesNotMatch(source, /\.pm-knowledge-tree-row\s*{[\s\S]*border-radius:\s*14px/);
});

test('tauri file tools expose mkdir for real knowledge folders', async () => {
  const source = await readFile(tauriLibPath, 'utf8');

  assert.match(source, /fn tool_mkdir/);
  assert.match(source, /fs::create_dir_all/);
  assert.match(source, /tool_mkdir,/);
});
