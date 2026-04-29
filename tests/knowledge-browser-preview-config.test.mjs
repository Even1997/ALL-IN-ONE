import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../src/features/knowledge/api/knowledgeBrowserPreviewConfig.ts');

const loadModule = async () => {
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

test('resolveBrowserPreviewKnowledgeServerConfig reads localhost token fallback config', async () => {
  const { resolveBrowserPreviewKnowledgeServerConfig } = await loadModule();

  assert.deepEqual(
    resolveBrowserPreviewKnowledgeServerConfig(
      'http://127.0.0.1:5173/?knowledgeToken=test-token&knowledgeBaseUrl=http%3A%2F%2F127.0.0.1%3A44380'
    ),
    {
      baseUrl: 'http://127.0.0.1:44380',
      authToken: 'test-token',
    }
  );
});

test('resolveBrowserPreviewKnowledgeServerConfig ignores non-local URLs or missing tokens', async () => {
  const { resolveBrowserPreviewKnowledgeServerConfig } = await loadModule();

  assert.equal(resolveBrowserPreviewKnowledgeServerConfig('https://example.com/?knowledgeToken=test-token'), null);
  assert.equal(resolveBrowserPreviewKnowledgeServerConfig('http://127.0.0.1:5173/'), null);
});
