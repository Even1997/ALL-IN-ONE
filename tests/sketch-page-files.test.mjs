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
const wireframePath = path.resolve(__dirname, '../src/utils/wireframe.ts');
const projectStorePath = path.resolve(__dirname, '../src/store/projectStore.ts');

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

test('sketch page files round-trip the editable frame field', async () => {
  const { buildSketchPageContent, parseSketchPageFile } = await importTsModule(sketchPageFilesPath);

  const page = {
    id: 'sketch/pages/home.md',
    name: 'home',
    description: 'Home page',
    metadata: {
      route: '/home',
      goal: 'Show the main dashboard',
    },
  };
  const wireframe = {
    id: 'wire-1',
    pageId: page.id,
    pageName: page.name,
    frame: '1440x900',
    elements: [],
    updatedAt: '2026-04-26T00:00:00.000Z',
    status: 'draft',
  };

  const content = buildSketchPageContent(page, wireframe);
  assert.match(content, /- frame: 1440x900/);

  const parsed = parseSketchPageFile('sketch/pages/home.md', content);
  assert.equal(parsed.wireframe.frame, '1440x900');
});

test('wireframe markdown utilities prefer explicit frame fields and parse them back', async () => {
  const {
    buildPageWireframeMarkdown,
    parseFrameFromWireframeMarkdown,
    resolveCanvasPresetFromFrame,
  } = await importTsModule(wireframePath);

  const markdown = buildPageWireframeMarkdown(
    {
      id: 'page-1',
      name: '首页',
      kind: 'page',
      description: 'Dashboard',
      featureIds: [],
      metadata: {
        route: '/home',
        title: '首页',
        goal: 'Show dashboard',
        template: 'custom',
      },
      children: [],
    },
    {
      id: 'wire-1',
      pageId: 'page-1',
      pageName: '首页',
      frame: '1440x900',
      elements: [],
      updatedAt: '2026-04-26T00:00:00.000Z',
      status: 'draft',
    },
    null,
    'web'
  );

  assert.match(markdown, /- frame: 1440x900/);
  assert.equal(parseFrameFromWireframeMarkdown(markdown), '1440x900');
  assert.deepEqual(resolveCanvasPresetFromFrame('393x852'), {
    label: '移动端线框',
    width: 393,
    height: 852,
    frameType: 'mobile',
  });
});

test('project store preserves wireframe frame values when hydrating persisted state', async () => {
  const source = await readFile(projectStorePath, 'utf8');

  assert.match(source, /frame:\s*typeof wireframe\?\.frame === 'string' \? wireframe\.frame : undefined/);
  assert.match(source, /frame:\s*current\?\.frame/);
});
