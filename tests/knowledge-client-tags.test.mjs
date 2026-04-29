import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knowledgeClientPath = path.resolve(__dirname, '../src/features/knowledge/api/knowledgeClient.ts');

const loadModule = async (relativePath) => {
  const modulePath = path.resolve(__dirname, `../src/${relativePath}`);
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('knowledge client builds atom payloads with resolved tag ids', async () => {
  const source = await readFile(knowledgeClientPath, 'utf8');
  const { buildAtomWritePayload } = await loadModule('features/knowledge/api/knowledgeAtomPayload.ts');

  const payload = buildAtomWritePayload(
    {
      title: 'Project overview.md',
      content: '# Overview',
      filePath: '',
      updatedAt: '2026-04-29T00:00:00.000Z',
      tags: ['kind/wiki', 'status/stale'],
    },
    ['tag-1', 'tag-2']
  );

  assert.deepEqual(payload, {
    content: '# Overview',
    source_url: null,
    published_at: null,
    tag_ids: ['tag-1', 'tag-2'],
  });
  assert.match(source, /ensureTagIds/);
  assert.match(source, /buildAtomWritePayload\(source,\s*tagIds\)/);
});
