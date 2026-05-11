import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const aiChatStorePath = path.resolve(__dirname, '../../src/modules/ai/store/aiChatStore.ts');
const embeddedPiecesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const appNavigationPath = path.resolve(__dirname, '../../src/appNavigation.ts');
const directChatPromptPath = path.resolve(__dirname, '../../src/modules/ai/chat/directChatPrompt.ts');
const knowledgeOperationPolicyPath = path.resolve(__dirname, '../../src/modules/ai/knowledge/knowledgeOperationPolicy.ts');
const workflowWorkbenchPath = path.resolve(__dirname, '../../src/components/ai/AIWorkflowWorkbench.tsx');
const workflowWorkbenchCssPath = path.resolve(__dirname, '../../src/components/ai/AIWorkflowWorkbench.css');
const workflowStorePath = path.resolve(__dirname, '../../src/modules/ai/store/workflowStore.ts');
const aiWorkflowServicePath = path.resolve(__dirname, '../../src/modules/ai/workflow/AIWorkflowService.ts');
const runtimeWorkflowFlowPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeWorkflowFlow.ts'
);
const legacyAiPanelPath = path.resolve(__dirname, '../../src/components/ai/AIPanel.tsx');
const legacyAiPanelCssPath = path.resolve(__dirname, '../../src/components/ai/AIPanel.css');
const mainlineDocPath = path.resolve(
  __dirname,
  '../../docs/goodnight-obsidian-skills-adaptation.md'
);
const knowledgeProposalModelPath = path.resolve(
  __dirname,
  '../../src/features/knowledge/model/knowledgeProposal.ts'
);
const knowledgeProposalStorePath = path.resolve(
  __dirname,
  '../../src/features/knowledge/store/knowledgeProposalStore.ts'
);

test('legacy AI mainline cleanup removes obsolete proposal, workflow shell, and duplicate panel remnants', async () => {
  const [
    aiChatStoreSource,
    embeddedPiecesSource,
    appSource,
    appNavigationSource,
    directChatPromptSource,
    mainlineDocSource,
  ] = await Promise.all([
    readFile(aiChatStorePath, 'utf8'),
    readFile(embeddedPiecesPath, 'utf8'),
    readFile(appPath, 'utf8'),
    readFile(appNavigationPath, 'utf8'),
    readFile(directChatPromptPath, 'utf8'),
    readFile(mainlineDocPath, 'utf8'),
  ]);

  assert.doesNotMatch(aiChatStoreSource, /knowledgeProposal/);
  assert.doesNotMatch(embeddedPiecesSource, /renderKnowledgeProposal/);
  assert.doesNotMatch(appSource, /handleRunWorkflowAction/);
  assert.doesNotMatch(appSource, /currentRole === 'wiki'/);
  assert.doesNotMatch(appSource, /useAIWorkflowStore/);
  assert.doesNotMatch(appSource, /AIPanel/);
  assert.doesNotMatch(appNavigationSource, /\|\s*'wiki'/);
  assert.doesNotMatch(appNavigationSource, /roleShowsLegacyAiWorkspace/);
  assert.doesNotMatch(appNavigationSource, /label:\s*'Knowledge'/);
  assert.doesNotMatch(appNavigationSource, /label:\s*'Pages'/);
  assert.doesNotMatch(directChatPromptSource, /buildKnowledgeOperationPolicy/);
  assert.doesNotMatch(mainlineDocSource, /@整理/);
  assert.doesNotMatch(mainlineDocSource, /@索引/);
  assert.doesNotMatch(mainlineDocSource, /系统索引/);
  assert.doesNotMatch(mainlineDocSource, /Wiki 提案/);

  await assert.rejects(access(knowledgeProposalModelPath));
  await assert.rejects(access(knowledgeProposalStorePath));
  await assert.rejects(access(knowledgeOperationPolicyPath));
  await assert.rejects(access(workflowWorkbenchPath));
  await assert.rejects(access(workflowWorkbenchCssPath));
  await assert.rejects(access(workflowStorePath));
  await assert.rejects(access(aiWorkflowServicePath));
  await assert.rejects(access(runtimeWorkflowFlowPath));
  await assert.rejects(access(legacyAiPanelPath));
  await assert.rejects(access(legacyAiPanelCssPath));
});
