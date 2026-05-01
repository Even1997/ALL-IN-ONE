import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const noteWorkspacePath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx');
const aiChatPath = path.resolve(__dirname, '../src/components/workspace/AIChat.tsx');

test('product workbench keeps temporary artifact previews in the knowledge workspace without the old AI promotion runtime', async () => {
  const productSource = await readFile(productPath, 'utf8');
  const noteSource = await readFile(noteWorkspacePath, 'utf8');
  const aiChatSource = await readFile(aiChatPath, 'utf8');

  assert.match(productSource, /useKnowledgeSessionArtifactsStore/);
  assert.match(productSource, /activeTemporaryArtifact/);
  assert.match(productSource, /addEventListener\('goodnight:focus-knowledge-pane'/);
  assert.match(productSource, /setSidebarTab\('knowledge'\)/);
  assert.match(productSource, /temporaryContentPreview=/);
  assert.match(noteSource, /temporaryContentPreview\?:/);
  assert.match(noteSource, /gn-note-temporary-preview/);
  assert.doesNotMatch(aiChatSource, /buildTemporaryArtifactPromotionProposal/);
  assert.doesNotMatch(aiChatSource, /findTemporaryArtifactForProposal/);
  assert.doesNotMatch(aiChatSource, /syncTemporaryArtifactCardStatuses/);
});
