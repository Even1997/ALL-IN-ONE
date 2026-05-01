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
const temporaryKnowledgeFlowPath = path.resolve(__dirname, '../src/modules/ai/knowledge/temporaryKnowledgeFlow.ts');

test('product workbench reads active session artifacts and passes a temporary preview into the knowledge workspace', async () => {
  const productSource = await readFile(productPath, 'utf8');
  const noteSource = await readFile(noteWorkspacePath, 'utf8');
  const aiChatSource = await readFile(aiChatPath, 'utf8');
  const temporaryKnowledgeFlowSource = await readFile(temporaryKnowledgeFlowPath, 'utf8');
  const promoteStart = aiChatSource.indexOf('const promoteTemporaryArtifact = useCallback');
  const promoteEnd = aiChatSource.indexOf('const renderKnowledgeProposal = useCallback', promoteStart);
  const executeStart = aiChatSource.indexOf('const handleExecuteKnowledgeProposal = useCallback');
  const executeEnd = aiChatSource.indexOf('const handleApproveAllKnowledgeProposal = useCallback', executeStart);
  const promoteSource = aiChatSource.slice(promoteStart, promoteEnd);
  const executeSource = aiChatSource.slice(executeStart, executeEnd);

  assert.match(productSource, /useKnowledgeSessionArtifactsStore/);
  assert.match(productSource, /activeTemporaryArtifact/);
  assert.match(productSource, /addEventListener\('goodnight:focus-knowledge-pane'/);
  assert.match(productSource, /setSidebarTab\('knowledge'\)/);
  assert.match(noteSource, /temporaryContentPreview\?:/);
  assert.match(noteSource, /gn-note-temporary-preview/);
  assert.match(temporaryKnowledgeFlowSource, /authorRole: '产品'/);
  assert.match(aiChatSource, /const KNOWLEDGE_WORKSPACE_FOCUS_EVENT = 'goodnight:focus-knowledge-pane'/);
  assert.match(aiChatSource, /dispatchEvent\(new CustomEvent\(KNOWLEDGE_WORKSPACE_FOCUS_EVENT\)\)/);
  assert.match(temporaryKnowledgeFlowSource, /title: artifact\.title/);
  assert.doesNotMatch(temporaryKnowledgeFlowSource, /title:\s*`\$\{artifact\.title\}\.md`/);
  assert.match(aiChatSource, /buildTemporaryArtifactPromotionProposal/);
  assert.doesNotMatch(promoteSource, /setArtifactStatus\(/);
  assert.doesNotMatch(promoteSource, /setActiveArtifact\([^)]*null\)/);
  assert.match(executeSource, /findTemporaryArtifactForProposal/);
  assert.match(executeSource, /setArtifactStatus\(currentProject\.id,\s*activeSessionId,\s*matchedArtifact\.id,\s*'promoted'\)/);
  assert.match(aiChatSource, /syncTemporaryArtifactCardStatuses\(message\.structuredCards,\s*sessionArtifacts\)/);
});
