import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const canvasPath = path.resolve(__dirname, '../src/components/canvas/Canvas.tsx');
const productWorkbenchPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

test('page canvas keeps 4px move precision, drops the floating toolbar, and grows downward with content', async () => {
  const source = await readFile(canvasPath, 'utf8');

  assert.match(source, /const GRID_SIZE = 4;/);
  assert.match(source, /const logicalBoardHeight = useMemo/);
  assert.match(source, /className=\{`design-board-scroll/);
  assert.doesNotMatch(source, /className="design-canvas-toolbar"/);
  assert.doesNotMatch(source, /const \[interactionMode, setInteractionMode\]/);
  assert.doesNotMatch(source, /width: snapToGrid\(nextWidth, GRID_SIZE\)/);
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
