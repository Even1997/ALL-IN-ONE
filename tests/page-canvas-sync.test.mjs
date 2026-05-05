import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const canvasPath = path.resolve(__dirname, '../src/components/canvas/Canvas.tsx');
const productWorkbenchPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

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
  const source = await readFile(productWorkbenchPath, 'utf8');
  const canvasTag = source.match(/<Canvas[\s\S]*?\/>/)?.[0] ?? '';

  assert.match(source, /<button className="doc-action-btn" type="button" onClick=\{handleAddModule\}>/);
  assert.ok(canvasTag.length > 0, 'expected Canvas tag in ProductWorkbench');
  assert.doesNotMatch(canvasTag, /onAddModule=\{handleAddModule\}/);
});

test('page workspace exposes a floating frame editor and syncs frame presets into the current wireframe', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /const \[isFrameEditorOpen, setIsFrameEditorOpen\] = useState\(false\);/);
  assert.match(source, /const selectedPageFrame = selectedPageWireframe\?\.frame \|\| [^;]+;/);
  assert.match(source, /const handleApplyFrameValue = useCallback\(\(nextFrame: string\) => \{/);
  assert.match(source, /updateWireframeFrame\(selectedPage, nextFrame\);/);
  assert.match(source, /onClick=\{\(\) => handleApplyFrameValue\('1280x800'\)\}/);
  assert.match(source, /onClick=\{\(\) => handleApplyFrameValue\('390x844'\)\}/);
  assert.match(source, /编辑 Frame/);
});

test('page canvas and sketch preview render text wireframe modules with dedicated text styling', async () => {
  const canvasSource = await readFile(canvasPath, 'utf8');
  const appSource = await readFile(appPath, 'utf8');
  const productWorkbenchSource = await readFile(productWorkbenchPath, 'utf8');

  assert.match(canvasSource, /getWireframeModuleVisualType/);
  assert.match(canvasSource, /const isTextModule = getModuleContentType\(element\) === 'text';/);
  assert.match(appSource, /getWireframeModuleVisualType/);
  assert.match(appSource, /const isTextModule = getWireframeModuleVisualType\(element\.props\.moduleType, element\.props\.content\) === 'text';/);
  assert.match(productWorkbenchSource, /<span>\{'模块类型'\}<\/span>/);
  assert.match(productWorkbenchSource, /<option value="线框">线框<\/option>/);
  assert.match(productWorkbenchSource, /<option value="文字">文字<\/option>/);
});
