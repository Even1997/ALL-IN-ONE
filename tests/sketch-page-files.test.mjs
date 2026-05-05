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

test('sketch page file helpers keep page name derived from file name', async () => {
  const source = await readFile(sketchPageFilesPath, 'utf8');

  assert.match(source, /const getSketchPageNameFromPath = \(value: string\) => stripMarkdownExtension\(basename\(value\)\);/);
  assert.match(source, /const name = getSketchPageNameFromPath\(relativePath\);/);
});

test('sketch library tree displays page file names with markdown extension', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /name:\s*getSketchPageFileName\(node\.id\)/);
});

test('sketch page files write frame and module type fields into markdown', async () => {
  const source = await readFile(sketchPageFilesPath, 'utf8');

  assert.match(source, /`- frame: \$\{wireframe\?\.frame \|\| getDefaultFrame\(appType\)\}`/);
  assert.match(source, /`    type: \$\{DEFAULT_WIREFRAME_MODULE_TYPE\}`/);
  assert.match(source, /`    type: \$\{getWireframeModuleTypeLabel\(module\.type\)\}`/);
  assert.match(source, /type: module\.type,/);
});

test('wireframe markdown utilities prefer explicit frame fields and parse module types back', async () => {
  const {
    buildPageWireframeMarkdown,
    getWireframeModuleContentType,
    getWireframeModuleTypeLabel,
    parseFrameFromWireframeMarkdown,
    parsePageWireframeMarkdown,
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
      elements: [
        {
          id: 'module-1',
          type: 'wireframe-block',
          x: 32,
          y: 48,
          width: 180,
          height: 28,
          props: {
            name: '商品标题',
            moduleType: '文字',
            content: '标题文案',
          },
          children: [],
        },
      ],
      updatedAt: '2026-04-26T00:00:00.000Z',
      status: 'draft',
    },
    null,
    'web'
  );

  assert.match(markdown, /- frame: 1440x900/);
  assert.match(markdown, /- name: 商品标题[\s\S]*?type: 文字[\s\S]*?content: 标题文案/);
  assert.equal(parseFrameFromWireframeMarkdown(markdown), '1440x900');
  assert.equal(getWireframeModuleContentType('type: text; state: default'), 'text');
  assert.equal(getWireframeModuleTypeLabel('text'), '文字');
  assert.equal(getWireframeModuleContentType('state: default'), null);
  const parsedElements = parsePageWireframeMarkdown(markdown, 'web');
  assert.equal(parsedElements[0]?.props?.moduleType, '文字');
  const preset = resolveCanvasPresetFromFrame('393x852');
  assert.equal(preset.width, 393);
  assert.equal(preset.height, 852);
  assert.equal(preset.frameType, 'mobile');
});

test('project store preserves wireframe frame values when hydrating persisted state', async () => {
  const source = await readFile(projectStorePath, 'utf8');

  assert.match(source, /frame:\s*typeof wireframe\?\.frame === 'string' \? wireframe\.frame : undefined/);
  assert.match(source, /frame:\s*current\?\.frame/);
});
