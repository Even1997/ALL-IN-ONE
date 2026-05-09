import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const designWorkbenchViewPath = path.resolve(__dirname, '../src/components/design/DesignWorkbenchView.tsx');
const canvasPath = path.resolve(__dirname, '../src/components/canvas/Canvas.tsx');
const productPageWorkspacePanePath = path.resolve(__dirname, '../src/components/product/ProductPageWorkspacePane.tsx');

test('page canvas keeps board height tied to the selected frame', async () => {
  const source = await readFile(canvasPath, 'utf8');

  assert.match(source, /const boardHeight = height;/);
  assert.doesNotMatch(source, /maxElementBottom = elements\.reduce/);
});

test('page canvas keeps modules inside the frame coordinate system while zooming', async () => {
  const source = await readFile(canvasPath, 'utf8');

  assert.doesNotMatch(source, /<\/Group>\s*<Group>\s*\{elements\.map\(\(element\) => \(/);
});

test('page workspace keeps add-module action in the header instead of the canvas chrome', async () => {
  const source = await readFile(productPageWorkspacePanePath, 'utf8');
  const canvasTag = source.match(/<Canvas[\s\S]*?\/>/)?.[0] ?? '';

  assert.match(source, /<button className="doc-action-btn" type="button" onClick=\{onAddModule\}>/);
  assert.ok(canvasTag.length > 0, 'expected Canvas tag in ProductPageWorkspacePane');
  assert.doesNotMatch(canvasTag, /onAddModule=\{onAddModule\}/);
});

test('page workspace exposes a floating frame editor and syncs frame presets into the current wireframe', async () => {
  const source = await readFile(productPageWorkspacePanePath, 'utf8');

  assert.match(source, /isFrameEditorOpen/);
  assert.match(source, /frameEditorDraft/);
  assert.match(source, /onApplyFrameValue/);
  assert.match(source, /onClick=\{\(\) => onApplyFrameValue\('1280x800'\)\}/);
  assert.match(source, /onClick=\{\(\) => onApplyFrameValue\('390x844'\)\}/);
  assert.match(source, /编辑 Frame/);
});

test('page canvas and sketch preview render text wireframe modules with dedicated text styling', async () => {
  const canvasSource = await readFile(canvasPath, 'utf8');
  const designWorkbenchViewSource = await readFile(designWorkbenchViewPath, 'utf8');
  const productPageWorkspacePaneSource = await readFile(productPageWorkspacePanePath, 'utf8');

  assert.match(canvasSource, /getWireframeModuleVisualType/);
  assert.match(canvasSource, /const isTextModule = getModuleContentType\(element\) === 'text';/);
  assert.match(designWorkbenchViewSource, /getWireframeModuleVisualType/);
  assert.match(designWorkbenchViewSource, /const isTextModule = getWireframeModuleVisualType\(element\.props\.moduleType, element\.props\.content\) === 'text';/);
  assert.match(productPageWorkspacePaneSource, /<span>模块类型<\/span>/);
  assert.match(productPageWorkspacePaneSource, /<option value="线框">线框<\/option>/);
  assert.match(productPageWorkspacePaneSource, /<option value="文字">文字<\/option>/);
});
