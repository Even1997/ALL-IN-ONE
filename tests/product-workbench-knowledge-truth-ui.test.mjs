import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const noteWorkspacePath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx');

test('product workbench reads active session artifacts and passes a temporary preview into the knowledge workspace', async () => {
  const productSource = await readFile(productPath, 'utf8');
  const noteSource = await readFile(noteWorkspacePath, 'utf8');

  assert.match(productSource, /useKnowledgeSessionArtifactsStore/);
  assert.match(productSource, /activeTemporaryArtifact/);
  assert.match(noteSource, /temporaryContentPreview\?:/);
  assert.match(noteSource, /gn-note-temporary-preview/);
});
