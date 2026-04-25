import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_DESIGN_STYLE_PRESETS,
  buildDesignStyleMarkdown,
  getBuiltInStylePackFiles,
  parseDesignStyleMarkdown,
} from '../../src/modules/design/stylePack.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const productWorkbenchPath = path.resolve(__dirname, '../../src/components/product/ProductWorkbench.tsx');

test('builtin design style presets keep the existing preset names', () => {
  assert.deepEqual(
    BUILTIN_DESIGN_STYLE_PRESETS.map((preset) => preset.title),
    [
      'Aurora Glass',
      'Bento Spotlight',
      'Neo Brutal Pop',
      'Editorial Minimal',
      'Warm Commerce',
      'Midnight Terminal',
    ]
  );
});

test('style pack markdown builder emits v1 structure for built-in presets', () => {
  const preset = BUILTIN_DESIGN_STYLE_PRESETS[0];
  const markdown = buildDesignStyleMarkdown(preset, { sourceType: 'builtin' });

  assert.match(markdown, /^---\n/);
  assert.match(markdown, /id: aurora-glass/);
  assert.match(markdown, /name: "Aurora Glass"/);
  assert.match(markdown, /version: 1/);
  assert.match(markdown, /sourceType: builtin/);
  assert.match(markdown, /## Brand & Style/);
  assert.match(markdown, /## Colors/);
  assert.match(markdown, /## Typography/);
  assert.match(markdown, /## Do \/ Don't/);
});

test('style pack markdown parser can round-trip v1 markdown back to node fields', () => {
  const preset = BUILTIN_DESIGN_STYLE_PRESETS[1];
  const markdown = buildDesignStyleMarkdown(preset, { sourceType: 'builtin' });
  const parsed = parseDesignStyleMarkdown(markdown, {
    title: '',
    summary: '',
    keywords: [],
    palette: [],
    prompt: '',
  });

  assert.equal(parsed.title, preset.title);
  assert.equal(parsed.summary, preset.summary);
  assert.deepEqual(parsed.keywords, preset.keywords);
  assert.deepEqual(parsed.palette, preset.palette);
  assert.equal(parsed.prompt, preset.prompt);
});

test('built-in style pack files target design/styles markdown assets', () => {
  const files = getBuiltInStylePackFiles();

  assert.equal(files.length, 6);
  assert.ok(files.every((file) => file.path.startsWith('design/styles/')));
  assert.ok(files.every((file) => file.path.endsWith('.md')));
  assert.ok(files.every((file) => /^---\n/.test(file.content)));
});

test('app loads style presets from project style pack files instead of hardcoding them locally', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /loadProjectStylePackPresets/);
  assert.match(source, /setStylePresets/);
  assert.match(source, /styleFilePath/);
  assert.doesNotMatch(source, /title:\s*'Aurora Glass'/);
  assert.doesNotMatch(source, /title:\s*'Bento Spotlight'/);
});

test('product workbench ensures built-in style pack files exist before refreshing knowledge filesystem', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /ensureBuiltInStylePackFiles/);
  assert.match(source, /await ensureBuiltInStylePackFiles\(currentProject\.id\)/);
});

test('app writes selected style node edits back to project style pack files', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /saveProjectStylePackFile/);
  assert.match(source, /buildDesignStyleMarkdown\(selectedStyleNode/);
});

test('app design inspector surfaces sketch and style markdown file paths', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.match(source, /buildSketchReferencePath/);
  assert.match(source, /buildDesignStyleReferencePath/);
  assert.match(source, /当前草图文件/);
  assert.match(source, /当前样式包文件/);
});
