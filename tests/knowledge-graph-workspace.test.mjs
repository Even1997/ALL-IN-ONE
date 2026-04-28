import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productWorkbenchPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const graphWorkspacePath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeGraphWorkspace.tsx');
const graphCanvasPath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx');
const globalGraphPath = path.resolve(__dirname, '../src/features/knowledge/model/globalKnowledgeGraph.ts');
const appCssPath = path.resolve(__dirname, '../src/App.css');

test('product workbench wires wiki lane to a global graph while keeping knowledge lane on the focused note graph', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /type SidebarTab = 'knowledge' \| 'wiki' \| 'page'/);
  assert.match(source, /import \{ KnowledgeGraphWorkspace \} from '\.\.\/\.\.\/features\/knowledge\/workspace\/KnowledgeGraphWorkspace';/);
  assert.match(source, /import \{ buildGlobalKnowledgeGraph \} from '\.\.\/\.\.\/features\/knowledge\/model\/globalKnowledgeGraph';/);
  assert.match(source, /const globalKnowledgeGraph = useMemo/);
  assert.match(source, /buildGlobalKnowledgeGraph\(serverNotes\)/);
  assert.match(source, /const renderKnowledgeGraphMain = \(\) => \(/);
  assert.match(source, /<KnowledgeGraphWorkspace/);
  assert.match(source, /graph=\{globalKnowledgeGraph\}/);
  assert.match(source, /mode="global"/);
  assert.match(source, /onSelectNote=\{openKnowledgeNote\}/);
  assert.match(source, /onBack=\{\(\) => setSidebarTab\('knowledge'\)\}/);
  assert.match(source, /sidebarTab === 'wiki' && renderKnowledgeGraphMain\(\)/);
  assert.doesNotMatch(source, /sidebarTab !== 'wiki' \|\| selectedKnowledgeNoteId \|\| serverNotes.length === 0/);
});

test('knowledge graph workspace renders a global inspector around a shared graph canvas', async () => {
  const source = await readFile(graphWorkspacePath, 'utf8');
  const canvasSource = await readFile(graphCanvasPath, 'utf8');
  const globalGraphSource = await readFile(globalGraphPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /type KnowledgeGraphWorkspaceProps =/);
  assert.match(source, /graph: KnowledgeNeighborhoodGraph \| null/);
  assert.match(source, /selectedNote: KnowledgeNote \| null/);
  assert.match(source, /mode\?: 'focused' \| 'global'/);
  assert.match(source, /<KnowledgeGraphCanvas/);
  assert.match(source, /mode=\{mode\}/);
  assert.match(source, /selectedNoteId=\{selectedNote\?\.id \|\| null\}/);
  assert.match(source, /onBack/);

  assert.match(canvasSource, /type KnowledgeGraphCanvasProps =/);
  assert.match(canvasSource, /mode\?: 'focused' \| 'global'/);
  assert.match(canvasSource, /const layoutedNodes = useMemo/);
  assert.match(canvasSource, /const positionedEdges = useMemo/);
  assert.match(canvasSource, /<svg className=\{`gn-graph-canvas/);
  assert.match(canvasSource, /role="button"/);
  assert.match(canvasSource, /onSelectNode\(node\.id\)/);

  assert.match(globalGraphSource, /export const buildGlobalKnowledgeGraph =/);
  assert.match(globalGraphSource, /sharedTagCount/);
  assert.match(globalGraphSource, /edgeType: 'shared-tag'/);
  assert.match(globalGraphSource, /edgeType: 'project-outline'/);

  assert.match(css, /\.gn-graph-shell\s*\{/);
  assert.match(css, /\.gn-graph-canvas\s*\{/);
  assert.match(css, /\.gn-graph-node\.is-center circle\s*\{/);
  assert.match(css, /\.gn-graph-canvas\.is-compact\s*\{/);
});
