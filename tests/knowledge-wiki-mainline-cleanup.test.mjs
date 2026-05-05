import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const knowledgeModelPath = path.resolve(__dirname, '../src/features/knowledge/model/knowledge.ts');
const globalKnowledgeGraphPath = path.resolve(
  __dirname,
  '../src/features/knowledge/model/globalKnowledgeGraph.ts'
);
const knowledgeGraphCanvasPath = path.resolve(
  __dirname,
  '../src/features/knowledge/workspace/KnowledgeGraphCanvas.tsx'
);
const knowledgeTagMetaPath = path.resolve(
  __dirname,
  '../src/features/knowledge/model/knowledgeTagMeta.ts'
);
const projectStorePath = path.resolve(__dirname, '../src/store/projectStore.ts');
const sharedTypesPath = path.resolve(__dirname, '../src/types/index.ts');

test('knowledge mainline cleanup removes embedded wiki-index semantics from core source files', async () => {
  const [
    knowledgeModelSource,
    globalKnowledgeGraphSource,
    knowledgeGraphCanvasSource,
    knowledgeTagMetaSource,
    projectStoreSource,
    sharedTypesSource,
  ] = await Promise.all([
    readFile(knowledgeModelPath, 'utf8'),
    readFile(globalKnowledgeGraphPath, 'utf8'),
    readFile(knowledgeGraphCanvasPath, 'utf8'),
    readFile(knowledgeTagMetaPath, 'utf8'),
    readFile(projectStorePath, 'utf8'),
    readFile(sharedTypesPath, 'utf8'),
  ]);

  assert.doesNotMatch(knowledgeModelSource, /wiki-index/);
  assert.doesNotMatch(globalKnowledgeGraphSource, /wiki-index/);
  assert.doesNotMatch(knowledgeGraphCanvasSource, /wiki-index/);
  assert.doesNotMatch(knowledgeTagMetaSource, /kind\/wiki/);
  assert.doesNotMatch(projectStoreSource, /wiki-index/);
  assert.doesNotMatch(sharedTypesSource, /wiki-index/);
});
