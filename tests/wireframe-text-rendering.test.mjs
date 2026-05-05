import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const canvasPath = path.resolve(__dirname, '../src/components/canvas/Canvas.tsx');
const wireframePath = path.resolve(__dirname, '../src/utils/wireframe.ts');

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

test('wireframe utilities normalize explicit module types and keep legacy content fallback', async () => {
  const {
    getWireframeModuleContentType,
    getWireframeModuleTypeLabel,
    getWireframeModuleVisualType,
  } = await importTsModule(wireframePath);

  assert.equal(getWireframeModuleContentType('type: text; state: default'), 'text');
  assert.equal(getWireframeModuleContentType('state: default'), null);
  assert.equal(getWireframeModuleContentType(undefined), null);
  assert.equal(getWireframeModuleTypeLabel('文字'), '文字');
  assert.equal(getWireframeModuleTypeLabel('text'), '文字');
  assert.equal(getWireframeModuleTypeLabel('wireframe'), '线框');
  assert.equal(getWireframeModuleVisualType('文字', 'state: default'), 'text');
  assert.equal(getWireframeModuleVisualType('线框', 'type: text; state: default'), 'wireframe');
  assert.equal(getWireframeModuleVisualType(undefined, 'type: text; state: default'), 'text');
});

test('canvas and sketch preview use text-specific rendering for text wireframe modules', async () => {
  const canvasSource = await readFile(canvasPath, 'utf8');
  const appSource = await readFile(appPath, 'utf8');

  assert.match(canvasSource, /getWireframeModuleVisualType/);
  assert.match(canvasSource, /const isTextModule = getModuleContentType\(element\) === 'text';/);
  assert.match(canvasSource, /height=\{isSelected \? 3 : 2\}/);
  assert.match(canvasSource, /fill="rgba\(255,255,255,0\.001\)"/);
  assert.match(appSource, /getWireframeModuleVisualType/);
  assert.match(appSource, /const isTextModule = getWireframeModuleVisualType\(element\.props\.moduleType, element\.props\.content\) === 'text';/);
});
