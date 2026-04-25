import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sketchPageFilesPath = path.resolve(__dirname, '../src/modules/knowledge/sketchPageFiles.ts');
const appPath = path.resolve(__dirname, '../src/App.tsx');

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

test('sketch page parser uses file name without extension as page name', async () => {
  const { parseSketchPageFile } = await importTsModule(sketchPageFilesPath);

  const parsed = parseSketchPageFile(
    'sketch/pages/homelogin.md',
    '# Different Heading\n\n- route: /custom\n- goal: Sign in\n'
  );

  assert.equal(parsed.page.name, 'homelogin');
  assert.equal(parsed.page.metadata.title, 'homelogin');
  assert.equal(parsed.wireframe.pageName, 'homelogin');
});

test('sketch library tree displays page file names with markdown extension', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /name:\s*getSketchPageFileName\(node\.id\)/);
});
