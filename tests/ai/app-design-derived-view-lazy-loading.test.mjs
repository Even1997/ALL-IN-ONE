import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app delegates design-only derived view state to the lazy design workbench module', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /const filteredSketchLibraryTree = useMemo\(/);
  assert.doesNotMatch(source, /const selectedSketchFilePath = useMemo\(/);
  assert.doesNotMatch(source, /const selectedDesignPageModuleMarkdown = useMemo\(/);
  assert.doesNotMatch(source, /const selectedStylePaletteEditor = useMemo\(/);
  assert.doesNotMatch(source, /const selectedStylePackFilePath = useMemo\(/);
  assert.doesNotMatch(source, /const selectedStylePackFileSourceLabel = useMemo\(/);
  assert.doesNotMatch(source, /const filterSketchLibraryTree = \(/);
  assert.doesNotMatch(source, /const buildSketchPreviewImage = \(/);
  assert.doesNotMatch(source, /const getDesignStyleNodeTheme = \(/);
  assert.doesNotMatch(source, /const getDesignStyleVariant = \(/);
  assert.doesNotMatch(source, /const getWireframeElementLabel = \(/);
  assert.doesNotMatch(source, /const buildDesignPageModuleMarkdown = \(/);
});
